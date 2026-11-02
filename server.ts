import express, { type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken, type Auth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAppCheck } from 'firebase-admin/app-check';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import twilio from 'twilio';
import webpush from 'web-push';
import { checkHealth, defaultHealthCheckManager, type HealthStatus } from './src/utils/health';
import {
  calculateActiveOccasions,
  getLocalDateParts,
  isValidIanaTimezone,
  type OccasionItem
} from './src/utils/reminders';
import {
  normalizeCanonicalEmail,
  normalizeCanonicalPhone,
  validateEmailAddress,
  validateFullName,
  hashContact,
  extractCanonicalContacts,
  isContactStillUsedByRelationship,
  toCanonicalStage,
  verifyContactByQuery,
  type ContactReservationDoc,
  type PublicContactIndexDoc,
  type PublicStage,
  type VerifyContactResponse
} from './src/utils/contacts';
import { validateSocialAccounts } from './src/utils/social';
import type { SocialAccount } from './src/types';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
dotenv.config();

type RelationshipType = 'marriage' | 'engagement' | 'dating';
type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

interface PartnerData {
  fullName: string;
  fullNameEn?: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  email: string;
  phoneCountry: string;
  phoneNumber: string;
  phoneE164?: string;
  phoneVerified?: boolean;
  sameWhatsapp?: boolean;
  whatsappCountry?: string;
  whatsappNumber?: string;
  whatsappE164?: string;
  whatsappTrusted?: boolean;
  whatsappVerifiedAt?: string;
  socialHandle?: string;
  socialAccounts?: SocialAccount[];
}

interface CertificateSettings {
  showSocialHandles: boolean;
  showContactDetails: boolean;
  showQrMatrix: boolean;
  publicContactSearchP1?: boolean;
  publicContactSearchP2?: boolean;
}

interface RelationshipRecord {
  id: string;
  recordNumber: string;
  verificationRef: string;
  issuedDate: string;
  issuedDateAr: string;
  type: RelationshipType;
  startDate: string;
  startDateAr: string;
  startDateIso?: string;
  partner1: PartnerData;
  partner2: PartnerData;
  status: 'draft' | 'pending_partner' | 'active' | 'cancelled' | 'ended' | 'deleting';
  activeSinceDays: number;
  settings: CertificateSettings;
  inviteId?: string;
  createdAt: string;
  p1Uid: string;
  p2Uid?: string | null;
}

interface Invitation {
  id: string;
  recordId: string;
  inviterName: string;
  partner2Name: string;
  partner2Email?: string | null;
  partner2Phone?: string | null;
  partner2PhoneCountry?: string | null;
  partner2Whatsapp?: string | null;
  partner2WhatsappCountry?: string | null;
  relationshipType: RelationshipType;
  startDate: string;
  startDateAr: string;
  startDateIso?: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  reminderCount: number;
  p1Uid: string;
  p2Uid?: string | null;
}

export const CURRENT_LEGAL_VERSION = '2026-10-10';

const USERS_COL = 'users';
const RELATIONSHIPS_COL = 'relationships';
const INVITATIONS_COL = 'invitations';
const CERTIFICATES_COL = 'certificates';
const CHANGE_REQUESTS_COL = 'change_requests';
const CHANGE_REQUEST_LOCKS_COL = 'change_request_locks';
const NOTIFICATIONS_COL = 'notifications';
const CONTACT_RESERVATIONS_COL = 'contact_reservations';
const PUBLIC_CONTACT_INDEX_COL = 'public_contact_index';
export const ACCOUNT_DELETIONS_COL = 'account_deletions';
const RELATIONSHIP_DELETIONS_COL = 'relationship_deletions';
const INVITATION_BLOCKS_COL = 'invitation_blocks';
export const WHATSAPP_VERIFY_ATTEMPTS_COL = 'whatsapp_verify_attempts';
export const WHATSAPP_VERIFY_LIMITS_COL = 'whatsapp_verify_limits';
export const REMINDER_SETTINGS_COL = 'reminder_settings';
export const PUSH_SUBSCRIPTIONS_COL = 'push_subscriptions';
export const IN_APP_DISMISSALS_COL = 'in_app_dismissals';
export const REMINDER_DELIVERIES_COL = 'reminder_deliveries';

export interface ReminderSettingsDoc {
  userId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  timezone: string;
  language: 'ar' | 'en';
  updatedAt: string;
}

export interface PushSubscriptionDoc {
  id: string;
  userId: string;
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InAppDismissalDoc {
  id: string;
  userId: string;
  occasionType: string;
  localDate: string;
  recordId?: string;
  dismissedAt: string;
}

export const REMINDER_CLAIM_LEASE_MS = 5 * 60 * 1000; // 5 minutes bounded lease for crash recovery
export const REMINDER_MAX_ATTEMPTS = 3; // Maximum retry attempts per local occurrence
export const REMINDER_RETRY_BACKOFF_MS = 15 * 60 * 1000; // 15 minutes minimum backoff between retries

export interface ReminderDeliveryDoc {
  id: string;
  userId: string;
  channel: 'email' | 'push';
  localDate: string;
  occasions?: Array<{ type: string; recordId?: string }>;
  deliveredAt?: string;
  failedAt?: string;
  status: 'success' | 'failed' | 'claiming';
  claimId?: string;
  claimedAt?: string;
  claimedAtMs?: number;
  firstAttemptAtMs?: number;
  emailPayloadHash?: string;
  attempts?: number;
  lastAttemptAtMs?: number;
  error?: string | null;
  uncertain?: boolean;
  permanent?: boolean;
}

export interface WhatsAppVerificationAttempt {
  attemptId: string;
  uid: string;
  canonicalPhone: string;
  country?: string;
  sid: string;
  channel: 'whatsapp';
  state: 'pending' | 'provider_approved' | 'consumed';
  createdAt: string;
  createdAtMs: number;
  expiresAtMs: number;
  consumedAt?: string;
  providerApprovedAt?: string;
  updatedAt?: string;
}

interface ChangeRequestDoc {
  id: string;
  recordId: string;
  verificationRef?: string;
  requesterUid: string;
  requesterRole: 'p1' | 'p2';
  requesterName: string;
  approverUid: string;
  target: 'shared' | 'partner1_name' | 'partner2_name';
  field: 'type' | 'startDate' | 'partner1FullName' | 'partner2FullName';
  fieldLabelAr: string;
  fieldLabelEn: string;
  oldValue: string;
  oldValueDisplayAr?: string;
  oldValueDisplayEn?: string;
  proposedValue: string;
  proposedValueDisplayAr?: string;
  proposedValueDisplayEn?: string;
  status: 'pending' | 'approved' | 'declined';
  requestedAt: string;
  decidedAt?: string;
  decisionByUid?: string;
}

interface AppNotification {
  id: string;
  userId: string;
  type: 'relationship_ended' | 'change_request' | 'general';
  recordId?: string;
  senderName?: string;
  messageAr: string;
  messageEn: string;
  secondaryAr?: string;
  secondaryEn?: string;
  createdAt: string;
  read: boolean;
}

const rawProjectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
const projectId = (rawProjectId && rawProjectId !== 'projectId' && rawProjectId !== 'placeholder') ? rawProjectId : undefined;
let adminApp: ReturnType<typeof initializeApp> | null = null;
let adminAuth: ReturnType<typeof getAuth> = null as unknown as ReturnType<typeof getAuth>;
let adminDb: FirebaseFirestore.Firestore = null as unknown as FirebaseFirestore.Firestore;

try {
  adminApp = getApps().length
    ? getApps()[0]
    : (projectId ? initializeApp({ projectId }) : initializeApp());
  adminAuth = (adminApp ? getAuth(adminApp) : null) as any;
  adminDb = (adminApp ? getFirestore(adminApp, '(default)') : null) as any;
  if (adminDb) {
    adminDb.settings({ ignoreUndefinedProperties: true });
  }
} catch (initErr) {
  console.error('[Firebase Admin] Initialization failed with configuration error:', initErr instanceof Error ? initErr.message : String(initErr));
  adminApp = null;
  adminAuth = null as any;
  adminDb = null as any;
}

const isTestEnvironment =
  process.env.NODE_ENV === 'test' ||
  process.argv.includes('--test') ||
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  process.argv.some(arg => arg.includes('.test.'));

let testProjectIdOverride: string | undefined = undefined;

export function __setTestDeps(db: any, auth: any, testProjectId?: string): void {
  if (process.env.NODE_ENV !== 'test' && !isTestEnvironment) {
    throw new Error('__setTestDeps is only allowed in test environment');
  }
  adminDb = db;
  adminAuth = auth;
  if (testProjectId !== undefined) {
    testProjectIdOverride = testProjectId;
  }
}

let twilioClientOverride: any = null;

export function __setTwilioClient(mockClient: any): void {
  if (process.env.NODE_ENV !== 'test' && !isTestEnvironment) {
    throw new Error('__setTwilioClient is only allowed in test environment');
  }
  twilioClientOverride = mockClient;
}

let adminAppCheckOverride: any = null;

export function __setTestAppCheck(mockAppCheck: any): void {
  if (process.env.NODE_ENV !== 'test' && !isTestEnvironment) {
    throw new Error('__setTestAppCheck is only allowed in test environment');
  }
  adminAppCheckOverride = mockAppCheck;
}

let testEmailSenderOverride: ((toEmail: string, subject: string, textBody: string, idempotencyKey?: string) => Promise<{ success: boolean; mocked?: boolean; error?: string; uncertain?: boolean; permanent?: boolean }>) | null = null;
let testPushSenderOverride: ((subscription: any, payloadObj: any) => Promise<{ success: boolean; expired?: boolean; mocked?: boolean; error?: string; uncertain?: boolean }>) | null = null;

export function __setTestEmailSender(fn: typeof testEmailSenderOverride): void {
  if (process.env.NODE_ENV !== 'test' && !isTestEnvironment) {
    throw new Error('__setTestEmailSender is only allowed in test environment');
  }
  testEmailSenderOverride = fn;
}

export function __setTestPushSender(fn: typeof testPushSenderOverride): void {
  if (process.env.NODE_ENV !== 'test' && !isTestEnvironment) {
    throw new Error('__setTestPushSender is only allowed in test environment');
  }
  testPushSenderOverride = fn;
}

export async function sendReminderEmail(
  toEmail: string,
  subject: string,
  textBody: string,
  idempotencyKey?: string
): Promise<{ success: boolean; mocked?: boolean; error?: string; uncertain?: boolean; permanent?: boolean }> {
  if (testEmailSenderOverride) {
    return testEmailSenderOverride(toEmail, subject, textBody, idempotencyKey);
  }

  if (process.env.RESEND_API_KEY) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 10000);
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      };
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
      }
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'reminders@relationshipid.org',
          to: [toEmail],
          subject,
          text: textBody
        })
      });
      const response = await res.json().catch(() => null);
      if (res.ok) {
        return response && typeof response.id === 'string' && response.id.trim().length > 0
          ? { success: true }
          : { success: false, error: 'EMAIL_RESPONSE_UNCERTAIN', uncertain: true };
      }
      const isPermanent = res.status >= 400 && res.status < 500 && ![408, 409, 429].includes(res.status);
      return {
        success: false,
        error: `EMAIL_SEND_FAILED_${res.status}`,
        permanent: isPermanent,
        uncertain: res.status === 408 || res.status >= 500
      };
    } catch (e: any) {
      const isTimeout = controller.signal.aborted || e?.name === 'AbortError' || e?.code === 'ETIMEDOUT' || e?.cause?.code === 'ETIMEDOUT';
      return {
        success: false,
        error: isTimeout ? 'TIMEOUT_UNCERTAIN' : 'EMAIL_NETWORK_UNCERTAIN',
        uncertain: true
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  return { success: false, error: 'SERVICE_UNCONFIGURED', permanent: false };
}

export async function sendReminderPushNotification(
  subscription: webpush.PushSubscription,
  payloadObj: { title: string; body: string; data?: any }
): Promise<{ success: boolean; expired?: boolean; mocked?: boolean; error?: string; uncertain?: boolean }> {
  if (testPushSenderOverride) {
    return testPushSenderOverride(subscription, payloadObj);
  }

  if (!subscription || typeof subscription !== 'object' || !subscription.endpoint || typeof subscription.endpoint !== 'string') {
    return { success: false, expired: true, error: 'INVALID_SUBSCRIPTION' };
  }

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@relationshipid.org';

  if (!vapidPublicKey || !vapidPrivateKey) {
    return { success: false, error: 'SERVICE_UNCONFIGURED' };
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    // Use web-push's native timeout option to destroy the underlying request on socket timeout
    await webpush.sendNotification(subscription, JSON.stringify(payloadObj), {
      TTL: 86400,
      urgency: 'normal',
      timeout: 10000
    });
    return { success: true };
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      return { success: false, expired: true, error: 'SUBSCRIPTION_EXPIRED' };
    }
    const isTimeout =
      err?.name === 'TimeoutError' ||
      err?.code === 'ETIMEDOUT' ||
      err?.code === 'ESOCKETTIMEDOUT' ||
      err?.code === 'ECONNRESET' ||
      err?.message?.includes('timeout') ||
      err?.message === 'PUSH_TIMEOUT_UNCERTAIN';
    return {
      success: false,
      error: isTimeout ? 'TIMEOUT_UNCERTAIN' : (err?.message || 'PUSH_FAILED'),
      uncertain: isTimeout
    };
  }
}

export interface ClaimReminderDeliveryParams {
  db: FirebaseFirestore.Firestore;
  claimRef: FirebaseFirestore.DocumentReference;
  deliveryDocId: string;
  userId: string;
  channel: 'email' | 'push';
  localDate: string;
  leaseDurationMs?: number;
  maxAttempts?: number;
  retryBackoffMs?: number;
  nowMs?: number;
  emailPayloadHash?: string;
}

export interface ClaimReminderDeliveryResult {
  claimed: boolean;
  claimId?: string;
  attemptCount?: number;
  previousUncertain?: boolean;
  reason?: 'ALREADY_SUCCEEDED' | 'LEASE_ACTIVE' | 'MAX_ATTEMPTS_EXCEEDED' | 'BACKOFF_ACTIVE' | 'UNSAFE_RETRY';
}

export async function claimReminderDelivery(params: ClaimReminderDeliveryParams): Promise<ClaimReminderDeliveryResult> {
  const leaseMs = params.leaseDurationMs ?? REMINDER_CLAIM_LEASE_MS;
  const maxAttempts = params.maxAttempts ?? REMINDER_MAX_ATTEMPTS;
  const backoffMs = params.retryBackoffMs ?? REMINDER_RETRY_BACKOFF_MS;
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  return await params.db.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(params.claimRef);
    let previousUncertain = false;

    if (docSnap.exists) {
      const data = docSnap.data();
      previousUncertain = Boolean(data?.uncertain);

      // Success is permanent for this local calendar occurrence: never dispatch again
      if (data?.status === 'success') {
        return { claimed: false, reason: 'ALREADY_SUCCEEDED' };
      }

      // A stable key is safe only for an unchanged payload inside Resend's 24-hour retention.
      if (params.channel === 'email' && params.emailPayloadHash) {
        const firstAttempt = data?.firstAttemptAtMs;
        if (data?.emailPayloadHash !== params.emailPayloadHash ||
            typeof firstAttempt !== 'number' || !Number.isFinite(firstAttempt) ||
            nowMs < firstAttempt || nowMs - firstAttempt >= 23 * 60 * 60 * 1000) {
          return { claimed: false, reason: 'UNSAFE_RETRY' };
        }
      }
      // Push has no provider idempotency: leave uncertain outcomes visible for manual review.
      if (params.channel === 'push' && previousUncertain) {
        return { claimed: false, reason: 'UNSAFE_RETRY' };
      }

      // If currently claiming, check if the lease has expired (abandoned worker recovery)
      if (data?.status === 'claiming') {
        const claimStartMs = typeof data?.claimedAtMs === 'number'
          ? data.claimedAtMs
          : (data?.claimedAt ? new Date(data.claimedAt).getTime() : 0);
        const isLeaseExpired = nowMs - claimStartMs > leaseMs;
        if (!isLeaseExpired) {
          return { claimed: false, reason: 'LEASE_ACTIVE' };
        }
        if (params.channel === 'push') return { claimed: false, reason: 'UNSAFE_RETRY' };
        // Lease expired; recover claim if attempts not exhausted
        const attemptsSoFar = typeof data?.attempts === 'number' ? data.attempts : 1;
        if (attemptsSoFar >= maxAttempts) {
          return { claimed: false, reason: 'MAX_ATTEMPTS_EXCEEDED' };
        }
      }

      // If status === 'failed', check attempt limits, permanent rejection, and backoff
      if (data?.status === 'failed') {
        // Confirmed permanent failure (e.g. 4xx unrecoverable client rejection, invalid recipient) -> never retry
        if (data?.permanent) {
          return { claimed: false, reason: 'MAX_ATTEMPTS_EXCEEDED' };
        }
        const attemptsSoFar = typeof data?.attempts === 'number' ? data.attempts : 1;
        if (attemptsSoFar >= maxAttempts) {
          return { claimed: false, reason: 'MAX_ATTEMPTS_EXCEEDED' };
        }
        const lastAttemptMs = typeof data?.lastAttemptAtMs === 'number'
          ? data.lastAttemptAtMs
          : (data?.failedAt ? new Date(data.failedAt).getTime() : 0);
        if (nowMs - lastAttemptMs < backoffMs) {
          return { claimed: false, reason: 'BACKOFF_ACTIVE' };
        }
      }
    }

    const currentAttempts = docSnap.exists
      ? (typeof docSnap.data()?.attempts === 'number' ? docSnap.data()!.attempts : 1)
      : 0;
    const nextAttempt = currentAttempts + 1;
    const claimId = crypto.randomUUID();

    const claimDoc: Partial<ReminderDeliveryDoc> = {
      id: params.deliveryDocId,
      userId: params.userId,
      channel: params.channel,
      localDate: params.localDate,
      status: 'claiming',
      claimId,
      claimedAt: nowIso,
      claimedAtMs: nowMs,
      attempts: nextAttempt,
      lastAttemptAtMs: nowMs
    };

    if (params.emailPayloadHash) {
      claimDoc.emailPayloadHash = params.emailPayloadHash;
      claimDoc.firstAttemptAtMs = docSnap.exists ? docSnap.data()!.firstAttemptAtMs : nowMs;
    }
    transaction.set(params.claimRef, claimDoc, { merge: true });

    return { claimed: true, claimId, attemptCount: nextAttempt, previousUncertain };
  });
}

export async function ownsReminderClaim(
  db: FirebaseFirestore.Firestore,
  claimRef: FirebaseFirestore.DocumentReference,
  claimId: string,
  nowMs?: number
): Promise<boolean> {
  const snap = await claimRef.get();
  nowMs ??= Date.now();
  const data = snap.data();
  return Boolean(snap.exists && data?.status === 'claiming' && data.claimId === claimId &&
    typeof data.claimedAtMs === 'number' && nowMs >= data.claimedAtMs &&
    nowMs - data.claimedAtMs < REMINDER_CLAIM_LEASE_MS - 15000);
}

export interface RecordDeliveryOutcomeParams {
  db: FirebaseFirestore.Firestore;
  claimRef: FirebaseFirestore.DocumentReference;
  expectedClaimId: string;
  outcome: {
    status: 'success' | 'failed';
    occasions?: Array<{ type: string; recordId?: string }>;
    error?: string;
    uncertain?: boolean;
    permanent?: boolean;
    nowMs?: number;
  };
}

export async function recordReminderDeliveryOutcome(
  params: RecordDeliveryOutcomeParams
): Promise<{ recorded: boolean; superseded?: boolean }> {
  const nowMs = params.outcome.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  return await params.db.runTransaction(async (transaction) => {
    const snap = await transaction.get(params.claimRef);
    if (!snap.exists) {
      return { recorded: false, superseded: true };
    }
    const data = snap.data();
    if (data?.claimId !== params.expectedClaimId) {
      // Fencing check: claim was stolen by lease expiration or reclaimed by another worker
      return { recorded: false, superseded: true };
    }

    if (params.outcome.status === 'success') {
      transaction.set(
        params.claimRef,
        {
          status: 'success',
          deliveredAt: nowIso,
          occasions: params.outcome.occasions || [],
          error: null,
          uncertain: false,
          permanent: false
        },
        { merge: true }
      );
    } else {
      transaction.set(
        params.claimRef,
        {
          status: 'failed',
          failedAt: nowIso,
          lastAttemptAtMs: nowMs,
          occasions: params.outcome.occasions || [],
          error: params.outcome.error || 'FAILED',
          uncertain: Boolean(params.outcome.uncertain),
          permanent: Boolean(params.outcome.permanent)
        },
        { merge: true }
      );
    }
    return { recorded: true };
  });
}

export async function cleanUserRemindersInBatches(db: FirebaseFirestore.Firestore, uid: string): Promise<void> {
  await db.collection(REMINDER_SETTINGS_COL).doc(uid).delete();

  for (const collectionName of [PUSH_SUBSCRIPTIONS_COL, IN_APP_DISMISSALS_COL, REMINDER_DELIVERIES_COL]) {
    while (true) {
      const snap = await db.collection(collectionName).where('userId', '==', uid).limit(50).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  }
}

export const requireAppCheck = async (req: Request, res: Response, next: NextFunction) => {
  const rawUrl = req.originalUrl || req.url || req.path || '';
  const cleanUrl = rawUrl.split('?')[0];
  const cleanPath = (req.path || '').split('?')[0];

  const isExactHealth = req.method === 'GET' && (cleanUrl === '/api/health' || cleanPath === '/health');
  const isExactReminderProcessor =
    req.method === 'POST' &&
    (cleanUrl === '/api/reminders/process' || (req.baseUrl === '/api' && cleanPath === '/reminders/process'));

  if (isExactHealth || isExactReminderProcessor) {
    return next();
  }
  if ((process.env.NODE_ENV === 'test' || isTestEnvironment) && !adminAppCheckOverride) {
    return next();
  }

  const appCheckToken = req.header('X-Firebase-AppCheck') || req.header('x-firebase-appcheck');
  if (!appCheckToken) {
    return res.status(401).json({ error: 'app_check_failed' });
  }

  try {
    const appCheckService = adminAppCheckOverride || (adminApp ? getAppCheck(adminApp) : null);
    if (!appCheckService) {
      return res.status(500).json({ error: 'SERVER_FIREBASE_PROJECT_ID_MISSING' });
    }
    const appCheckResponse = await appCheckService.verifyToken(appCheckToken);
    res.locals.appCheck = appCheckResponse;
    return next();
  } catch (error) {
    console.error('App Check token verification failed');
    return res.status(401).json({ error: 'app_check_failed' });
  }
};

export function isWhatsappVerifyEnabled(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_VERIFY_SID
  );
}

function getTwilioClient(): any {
  if (twilioClientOverride) return twilioClientOverride;
  if (!isWhatsappVerifyEnabled()) return null;
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const emptyPartner = (): PartnerData => ({
  fullName: '',
  birthDay: '',
  birthMonth: '',
  birthYear: '',
  email: '',
  phoneCountry: 'SA +966',
  phoneNumber: '',
  whatsappCountry: 'SA +966',
  whatsappNumber: ''
});

export function sanitizePartnerInput(raw: any): PartnerData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyPartner();
  }

  const str = (v: any) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v).trim() : '');

  const fullName = str(raw.fullName);
  const fullNameEn = str(raw.fullNameEn);
  const birthDay = str(raw.birthDay);
  const birthMonth = str(raw.birthMonth);
  const birthYear = str(raw.birthYear);
  const email = str(raw.email);
  const phoneCountry = str(raw.phoneCountry) || 'SA +966';
  const phoneNumber = str(raw.phoneNumber);
  const phoneE164 = str(raw.phoneE164);
  const sameWhatsapp = typeof raw.sameWhatsapp === 'boolean' ? raw.sameWhatsapp : undefined;
  const whatsappCountry = str(raw.whatsappCountry) || 'SA +966';
  const whatsappNumber = str(raw.whatsappNumber);
  const whatsappE164 = str(raw.whatsappE164);
  const socialHandle = str(raw.socialHandle);

  let socialAccounts: SocialAccount[] | undefined = undefined;
  if (Array.isArray(raw.socialAccounts)) {
    socialAccounts = raw.socialAccounts;
  }

  return {
    fullName,
    fullNameEn,
    birthDay,
    birthMonth,
    birthYear,
    email,
    phoneCountry,
    phoneNumber,
    phoneE164: phoneE164 || undefined,
    sameWhatsapp,
    whatsappCountry,
    whatsappNumber,
    whatsappE164: whatsappE164 || undefined,
    socialHandle,
    socialAccounts
  };
}

const randomId = (prefix: string, bytes = 12) => `${prefix}_${crypto.randomBytes(bytes).toString('hex')}`;

const formatDate = (iso: string, locale: string) => {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
};

const safePublicRecord = (record: RelationshipRecord): RelationshipRecord => ({
  ...record,
  partner1: { ...emptyPartner(), fullName: record.partner1.fullName, fullNameEn: record.partner1.fullNameEn },
  partner2: { ...emptyPartner(), fullName: record.partner2.fullName, fullNameEn: record.partner2.fullNameEn },
  p1Uid: '',
  p2Uid: null
});

const userFromResponse = (res: Response): DecodedIdToken => res.locals.firebaseUser as DecodedIdToken;

const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (!adminAuth) {
    return res.status(500).json({ error: 'SERVER_FIREBASE_PROJECT_ID_MISSING' });
  }
  const header = req.header('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });

  try {
    res.locals.firebaseUser = await adminAuth.verifyIdToken(token, true);
    return next();
  } catch (error) {
    console.error('verifyIdToken failed', (error as { code?: string })?.code);
    return res.status(401).json({ error: 'INVALID_AUTH_TOKEN' });
  }
};

const getOwnedRecord = async (uid: string): Promise<RelationshipRecord | null> => {
  if (!adminDb) return null;
  const userDoc = await adminDb.collection(USERS_COL).doc(uid).get();
  const activeRecordId = userDoc.exists ? (userDoc.data()?.activeRecordId as string | undefined) : undefined;
  if (activeRecordId) {
    const recDoc = await adminDb.collection(RELATIONSHIPS_COL).doc(activeRecordId).get();
    if (recDoc.exists) {
      const rec = recDoc.data() as RelationshipRecord;
      if (rec.status !== 'ended' && rec.status !== 'cancelled') {
        return rec;
      }
    }
  }

  const p1Snap = await adminDb.collection(RELATIONSHIPS_COL)
    .where('p1Uid', '==', uid)
    .limit(10)
    .get();
  const p1Record = p1Snap.docs
    .map((d) => d.data() as RelationshipRecord)
    .find((r) => ['draft', 'pending_partner', 'active'].includes(r.status));
  if (p1Record) return p1Record;

  const p2Snap = await adminDb.collection(RELATIONSHIPS_COL)
    .where('p2Uid', '==', uid)
    .limit(10)
    .get();
  const p2Record = p2Snap.docs
    .map((d) => d.data() as RelationshipRecord)
    .find((r) => ['active', 'pending_partner'].includes(r.status));
  if (p2Record) return p2Record;

  return null;
};

interface ContactInput {
  number?: string | null;
  country?: string | null;
}

type ContactPhoneOrString = string | ContactInput | null | undefined;

export interface ContactsToCheck {
  emails?: (string | null | undefined)[];
  phones?: ContactPhoneOrString[];
  whatsapps?: ContactPhoneOrString[];
}

export const checkActiveContactConflict = async (
  db: FirebaseFirestore.Firestore,
  contacts: ContactsToCheck,
  excludeRecordId?: string | null,
  transaction?: FirebaseFirestore.Transaction
): Promise<boolean> => {
  const targetHashes = new Set<string>();

  (contacts.emails || []).forEach((e) => {
    const norm = normalizeCanonicalEmail(e);
    if (!norm.isValid) throw new Error('INVALID_CONTACT_FORMAT');
    if (norm.canonical) targetHashes.add(hashContact(norm.canonical));
  });

  (contacts.phones || []).forEach((p) => {
    if (!p) return;
    const raw = typeof p === 'string' ? p : p.number;
    const country = typeof p === 'string' ? undefined : p.country;
    const norm = normalizeCanonicalPhone(raw, country);
    if (!norm.isValid) throw new Error('INVALID_PHONE_NUMBER');
    if (norm.canonical) targetHashes.add(hashContact(norm.canonical));
  });

  (contacts.whatsapps || []).forEach((w) => {
    if (!w) return;
    const raw = typeof w === 'string' ? w : w.number;
    const country = typeof w === 'string' ? undefined : w.country;
    const norm = normalizeCanonicalPhone(raw, country);
    if (!norm.isValid) throw new Error('INVALID_PHONE_NUMBER');
    if (norm.canonical) targetHashes.add(hashContact(norm.canonical));
  });

  if (targetHashes.size === 0) return false;

  for (const h of targetHashes) {
    const ref = db.collection(CONTACT_RESERVATIONS_COL).doc(h);
    const doc = transaction ? await transaction.get(ref) : await ref.get();
    if (doc.exists) {
      const data = doc.data() as { recordId: string };
      if (!excludeRecordId || data.recordId !== excludeRecordId) {
        return true;
      }
    }
  }

  return false;
};

export const syncContactReservations = async (
  db: FirebaseFirestore.Firestore,
  record: RelationshipRecord,
  customTransaction?: FirebaseFirestore.Transaction
) => {
  const isActive = record.status === 'active';
  const { hashes } = extractCanonicalContacts(record.partner1, record.partner2);
  const nowIso = new Date().toISOString();

  if (customTransaction) {
    hashes.forEach((h) => {
      const resRef = db.collection(CONTACT_RESERVATIONS_COL).doc(h);
      if (isActive) {
        customTransaction.set(resRef, { recordId: record.id, contactHash: h, updatedAt: nowIso });
      }
    });
  } else {
    const batch = db.batch();
    hashes.forEach((h) => {
      const resRef = db.collection(CONTACT_RESERVATIONS_COL).doc(h);
      if (isActive) {
        batch.set(resRef, { recordId: record.id, contactHash: h, updatedAt: nowIso });
      }
    });
    await batch.commit();
  }
};

const syncRelationshipContactIndexAndReservations = async (
  db: FirebaseFirestore.Firestore,
  record: RelationshipRecord,
  customTransaction?: FirebaseFirestore.Transaction
) => {
  await syncContactReservations(db, record, customTransaction);
};

export { checkHealth, type HealthStatus } from './src/utils/health';
export {
  normalizeCanonicalEmail,
  normalizeCanonicalPhone,
  validateEmailAddress,
  validateFullName,
  hashContact,
  extractCanonicalContacts,
  isContactStillUsedByRelationship,
  toCanonicalStage,
  verifyContactByQuery,
  type PublicStage,
  type VerifyContactResponse
} from './src/utils/contacts';

const normalizeEmail = (val?: string | null): string => normalizeCanonicalEmail(val).canonical;
const normalizePhone = (val?: string | null, country?: string | null): string => normalizeCanonicalPhone(val, country).canonical;

export interface ContactValidationResult {
  valid: boolean;
  error?: {
    code: 'CONTACT_IN_ACTIVE_RELATIONSHIP';
    statusCode: 409;
    messageEn: string;
    messageAr: string;
  };
}

export const validateContactUniqueness = async (
  db: FirebaseFirestore.Firestore,
  contacts: ContactsToCheck,
  excludeRecordId?: string | null,
  transaction?: FirebaseFirestore.Transaction
): Promise<ContactValidationResult> => {
  const hasConflict = await checkActiveContactConflict(db, contacts, excludeRecordId, transaction);
  if (hasConflict) {
    return {
      valid: false,
      error: {
        code: 'CONTACT_IN_ACTIVE_RELATIONSHIP',
        statusCode: 409,
        messageEn: SERVER_LOCALIZED_ERRORS.CONTACT_IN_ACTIVE_RELATIONSHIP.en,
        messageAr: SERVER_LOCALIZED_ERRORS.CONTACT_IN_ACTIVE_RELATIONSHIP.ar
      }
    };
  }
  return { valid: true };
};

const checkUserActiveRelationshipConflict = async (
  db: FirebaseFirestore.Firestore,
  uid: string,
  excludeRecordId?: string | null,
  transaction?: FirebaseFirestore.Transaction
): Promise<boolean> => {
  const userRef = db.collection(USERS_COL).doc(uid);
  const userDoc = transaction ? await transaction.get(userRef) : await userRef.get();
  const activeRecordId = userDoc.exists ? (userDoc.data()?.activeRecordId as string | undefined) : undefined;
  if (activeRecordId && (!excludeRecordId || activeRecordId !== excludeRecordId)) {
    const relRef = db.collection(RELATIONSHIPS_COL).doc(activeRecordId);
    const relDoc = transaction ? await transaction.get(relRef) : await relRef.get();
    if (relDoc.exists && (relDoc.data() as RelationshipRecord).status === 'active') {
      return true;
    }
  }

  if (!transaction) {
    const p1Snap = await db.collection(RELATIONSHIPS_COL)
      .where('p1Uid', '==', uid)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    if (!p1Snap.empty && (!excludeRecordId || p1Snap.docs[0].id !== excludeRecordId)) return true;

    const p2Snap = await db.collection(RELATIONSHIPS_COL)
      .where('p2Uid', '==', uid)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    if (!p2Snap.empty && (!excludeRecordId || p2Snap.docs[0].id !== excludeRecordId)) return true;
  }

  return false;
};

const SERVER_LOCALIZED_ERRORS: Record<string, { en: string; ar: string }> = {
  VERIFIED_PHONE_REQUIRED: {
    en: 'Please verify your phone number via WhatsApp before continuing.',
    ar: 'يرجى التحقق من رقم جوالك عبر واتساب للمتابعة.'
  },
  CONTACT_IN_ACTIVE_RELATIONSHIP: {
    en: 'This contact is already associated with an active relationship.',
    ar: 'جهة الاتصال هذه مرتبطة بسجل علاقة نشط بالفعل.'
  },
  ACTIVE_RELATIONSHIP_LOCKED: {
    en: 'Active relationship is locked from direct edits.',
    ar: 'سجل العلاقة النشط مقفل ولا يمكن تعديله مباشرة.'
  },
  ACTIVE_RELATIONSHIP_EXISTS: {
    en: 'An active relationship already exists.',
    ar: 'يوجد سجل علاقة نشط بالفعل.'
  },
  P2_ALREADY_IN_ACTIVE_RELATIONSHIP: {
    en: 'This user is already associated with an active relationship.',
    ar: 'هذا المستخدم مرتبط بسجل علاقة نشط بالفعل.'
  },
  ALREADY_IN_ACTIVE_RELATIONSHIP: {
    en: 'You already have an active relationship record.',
    ar: 'لديك سجل علاقة نشط بالفعل.'
  },
  INVALID_PHONE_NUMBER: {
    en: 'Invalid phone number format.',
    ar: 'صيغة رقم الهاتف غير صالحة.'
  },
  INVALID_CONTACT_FORMAT: {
    en: 'Invalid contact format.',
    ar: 'صيغة جهة الاتصال غير صالحة.'
  },
  ACCOUNT_DELETION_PENDING: {
    en: 'Your account deletion is currently being processed.',
    ar: 'يجري حالياً معالجة حذف الحساب.'
  },
  RELATIONSHIP_DELETION_PENDING: {
    en: 'This relationship is currently being ended.',
    ar: 'يجري حالياً إنهاء هذه العلاقة.'
  },
  INVITATION_IDENTITY_MISMATCH: {
    en: 'You are not the intended recipient of this invitation.',
    ar: 'أنت لست المستلم المقصود لهذه الدعوة.'
  },
  VERIFICATION_REQUIRED: {
    en: 'Contact verification is required before accepting this invitation.',
    ar: 'مطلوب تأكيد جهة الاتصال قبل قبول هذه الدعوة.'
  },
  INVALID_INVITATION_CONTACTS: {
    en: 'This invitation has invalid contact details.',
    ar: 'بيانات التواصل في هذه الدعوة غير صالحة.'
  },
  INVITATION_NOT_ALLOWED: {
    en: "This invitation can't be sent.",
    ar: 'لا يمكن إرسال هذه الدعوة.'
  },
  SELF_INVITATION_NOT_ALLOWED: {
    en: 'You cannot send an invitation to yourself using your own contact info.',
    ar: 'لا يمكنك إرسال دعوة لنفسك باستخدام نفس بيانات الاتصال.'
  },
  SAME_PARTNER_CONTACT_NOT_ALLOWED: {
    en: 'Partner 2 contact details must be distinct from Partner 1.',
    ar: 'يجب أن تكون بيانات الاتصال الخاصة بالطرف الثاني مختلفة عن بيانات الطرف الأول.'
  },
  INVITATION_ACCEPTED: {
    en: 'This invitation has already been accepted.',
    ar: 'تم قبول هذه الدعوة بالفعل.'
  },
  INVITATION_ALREADY_ACCEPTED: {
    en: 'This invitation has already been accepted.',
    ar: 'تم قبول هذه الدعوة بالفعل.'
  },
  INVITATION_DECLINED: {
    en: 'This invitation has been declined.',
    ar: 'تم رفض هذه الدعوة.'
  },
  INVITATION_CANCELLED: {
    en: 'This invitation has been cancelled.',
    ar: 'تم إلغاء هذه الدعوة.'
  },
  INVITATION_EXPIRED: {
    en: 'This invitation has expired.',
    ar: 'انتهت صلاحية هذه الدعوة.'
  },
  CURRENTLY_SIGNED_IN_AS_INVITER: {
    en: 'You are signed in as the inviter. Please switch accounts to accept as Partner 2.',
    ar: 'أنت مسجل الدخول كمرسل الدعوة. يرجى تبديل الحساب لقبولها كشريك ثانٍ.'
  },
  CANNOT_ACCEPT_OWN_INVITATION: {
    en: 'You cannot accept your own invitation.',
    ar: 'لا يمكنك قبول دعوتك الخاصة.'
  },
  INVITER_CANNOT_DECLINE_AS_P2: {
    en: 'You cannot decline your own invitation.',
    ar: 'لا يمكنك رفض دعوتك الخاصة.'
  },
  NOT_INVITATION_RECIPIENT: {
    en: 'You are not authorized to respond to this invitation.',
    ar: 'غير مصرح لك بالرد على هذه الدعوة.'
  },
  NOT_INVITATION_OWNER: {
    en: 'Only the inviter can cancel this invitation.',
    ar: 'يمكن لمرسل الدعوة فقط إلغاء هذه الدعوة.'
  },
  AUTH_DELETION_FAILED: {
    en: 'Account authentication deletion failed. Please retry.',
    ar: 'فشل حذف مصادقة الحساب. يرجى إعادة المحاولة.'
  },
  ACCOUNT_DELETION_FAILED: {
    en: "We couldn't finish deleting your account right now. It will be completed automatically — you can also try again.",
    ar: 'تعذر إكمال حذف حسابك الآن. سيتم إكماله تلقائياً، ويمكنك أيضاً المحاولة مرة أخرى.'
  },
  DATABASE_ERROR: {
    en: 'A database error occurred. Please try again.',
    ar: 'حدث خطأ في قاعدة البيانات. يرجى المحاولة لاحقاً.'
  },
  INTERNAL_ERROR: {
    en: 'An internal error occurred. Please try again.',
    ar: 'حدث خطأ داخلي. يرجى المحاولة لاحقاً.'
  },
  AGE_REQUIREMENT_NOT_MET: {
    en: 'You must be at least 18 years old.',
    ar: 'يجب أن يكون العمر 18 سنة أو أكثر.'
  },
  FIELD_TOO_LONG: {
    en: 'One of the fields is too long.',
    ar: 'أحد الحقول أطول من المسموح.'
  },
  LEGAL_CONSENT_REQUIRED: {
    en: 'Please accept the Terms of Service and Privacy Policy to continue.',
    ar: 'يرجى الموافقة على شروط الاستخدام وسياسة الخصوصية للمتابعة.'
  },
  INVALID_INPUT: {
    en: 'Please check the information you entered.',
    ar: 'يرجى التحقق من المعلومات المدخلة.'
  },
  UNSAFE_INPUT: {
    en: 'Input contains unsafe or prohibited content.',
    ar: 'البيانات المدخلة تحتوي على محتوى غير آمن أو غير مسموح.'
  },
  INVALID_PLATFORM: {
    en: 'Selected social platform is not supported.',
    ar: 'منصة التواصل الاجتماعي المحددة غير مدعومة.'
  },
  WHATSAPP_VERIFY_UNAVAILABLE: {
    en: 'WhatsApp verification is currently unavailable.',
    ar: 'خدمة التحقق من واتساب غير متاحة حالياً.'
  },
  WHATSAPP_VERIFY_PROVIDER_ERROR: {
    en: 'WhatsApp verification provider service is temporarily unavailable. Please try again later.',
    ar: 'خدمة التحقق من واتساب غير متاحة مؤقتاً من مزود الخدمة. يرجى المحاولة لاحقاً.'
  },
  WHATSAPP_VERIFY_RATE_LIMITED: {
    en: 'Too many verification attempts. Please try again in an hour.',
    ar: 'محاولات تحقق كثيرة جداً. يرجى المحاولة بعد ساعة.'
  },
  INVALID_VERIFICATION_CODE: {
    en: 'Invalid or expired verification code.',
    ar: 'رمز التحقق غير صالح أو منتهي الصلاحية.'
  },
  INVALID_CODE: {
    en: 'Invalid or expired verification code.',
    ar: 'رمز التحقق غير صالح أو منتهي الصلاحية.'
  },
  RATE_LIMITED: {
    en: 'Too many requests. Please wait a minute and try again.',
    ar: 'طلبات كثيرة. يرجى الانتظار دقيقة ثم المحاولة مرة أخرى.'
  },
  RELATIONSHIP_NOT_PENDING: {
    en: 'This invitation is no longer available.',
    ar: 'هذه الدعوة لم تعد متاحة.'
  },
  NO_ACTIVE_VERIFICATION_ATTEMPT: {
    en: 'No active verification attempt found. Please request a new verification code.',
    ar: 'لا توجد محاولة تحقق نشطة. يرجى طلب رمز تحقق جديد.'
  },
  VERIFICATION_ATTEMPT_EXPIRED: {
    en: 'Verification code has expired. Please request a new verification code.',
    ar: 'انتهت صلاحية رمز التحقق. يرجى طلب رمز تحقق جديد.'
  },
  VERIFICATION_ATTEMPT_CONSUMED: {
    en: 'This verification code has already been used. Please request a new code.',
    ar: 'تم استخدام رمز التحقق هذا بالفعل. يرجى طلب رمز جديد.'
  },
  VERIFICATION_ATTEMPT_SUPERSEDED: {
    en: 'A newer verification code was requested. Please use the most recent code.',
    ar: 'تم طلب رمز تحقق أحدث. يرجى استخدام أحدث رمز تم إرساله.'
  },
  PHONE_NUMBER_MISMATCH: {
    en: 'Phone number does not match the active verification request.',
    ar: 'رقم الجوال لا يطابق طلب التحقق النشط.'
  },
  INVALID_VERIFICATION_ATTEMPT: {
    en: 'Invalid verification attempt. Please request a new code.',
    ar: 'محاولة تحقق غير صالحة. يرجى طلب رمز جديد.'
  },
  INVALID_VERIFICATION_CHANNEL: {
    en: 'Invalid verification channel.',
    ar: 'قناة التحقق غير صالحة.'
  },
  EMAIL_MUST_MATCH_ACCOUNT: {
    en: 'Your partner email must match your verified account email.',
    ar: 'يجب أن يطابق بريد الشريك البريد الإلكتروني المؤكد لحسابك.'
  },
  REAUTH_REQUIRED: {
    en: 'Recent login required for account deletion. Please re-authenticate and try again.',
    ar: 'يلزم تسجيل الدخول الحديث لحذف الحساب. يرجى إعادة المصادقة والمحاولة مرة أخرى.'
  },
  INVALID_START_DATE: {
    en: 'Please enter a valid start date (YYYY-MM-DD, 1900 to present).',
    ar: 'يرجى إدخال تاريخ بدء صحيح (YYYY-MM-DD، من 1900 إلى اليوم).'
  },
  PENDING_INVITATION_EXISTS: {
    en: 'A pending invitation already exists.',
    ar: 'توجد دعوة معلقة بالفعل.'
  },
  RELATIONSHIP_DRAFT_NOT_FOUND: {
    en: 'No relationship draft found.',
    ar: 'لم يتم العثور على مسودة علاقة.'
  },
  VALUE_UNCHANGED: {
    en: 'Proposed value is unchanged.',
    ar: 'القيمة المقترحة لم تتغير.'
  },
  PENDING_CHANGE_REQUEST_EXISTS: {
    en: 'A pending change request already exists for this field.',
    ar: 'يوجد طلب تغيير معلق بالفعل لهذا الحقل.'
  },
  INVALID_RELATIONSHIP_TYPE: {
    en: 'Invalid relationship type.',
    ar: 'نوع العلاقة غير صالح.'
  },
  NAME_REQUIRED: {
    en: 'Name is required.',
    ar: 'الاسم مطلوب.'
  },
  INVALID_CHANGE_FIELD: {
    en: 'Invalid field for change request.',
    ar: 'حقل غير صالح لطلب التغيير.'
  },
  PARTNER_NAME_REQUIRED: {
    en: 'Partner name is required.',
    ar: 'اسم الشريك مطلوب.'
  },
  PARTNER_CONTACT_REQUIRED: {
    en: 'Partner contact information is required.',
    ar: 'بيانات تواصل الشريك مطلوبة.'
  },
  RELATIONSHIP_NOT_FOUND: {
    en: 'Relationship record not found.',
    ar: 'لم يتم العثور على سجل العلاقة.'
  },
  REQUEST_NOT_FOUND: {
    en: 'Change request not found.',
    ar: 'لم يتم العثور على طلب التغيير.'
  },
  UNAUTHORIZED: {
    en: 'Unauthorized.',
    ar: 'غير مصرح.'
  },
  UNAUTHORIZED_APPROVER: {
    en: 'You are not authorized to approve this change request.',
    ar: 'غير مصرح لك بالموافقة على طلب التغيير هذا.'
  },
  NOT_RELATIONSHIP_PARTICIPANT: {
    en: 'You are not a participant in this relationship.',
    ar: 'أنت لست طرفاً في هذه العلاقة.'
  },
  CANNOT_EDIT_PARTNER_INFO: {
    en: 'You cannot edit your partner info directly.',
    ar: 'لا يمكنك تعديل بيانات الشريك مباشرة.'
  }
};

export const isAtLeast18 = (
  birthYear: string | number,
  birthMonth: string | number,
  birthDay: string | number,
  now: Date = new Date()
): boolean => {
  const y = typeof birthYear === 'number' ? birthYear : parseInt(String(birthYear).trim(), 10);
  const m = typeof birthMonth === 'number' ? birthMonth : parseInt(String(birthMonth).trim(), 10);
  const d = typeof birthDay === 'number' ? birthDay : parseInt(String(birthDay).trim(), 10);

  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return false;
  }
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }

  const birthDate = new Date(Date.UTC(y, m - 1, d));
  if (
    birthDate.getUTCFullYear() !== y ||
    birthDate.getUTCMonth() !== m - 1 ||
    birthDate.getUTCDate() !== d
  ) {
    return false;
  }

  const nowDate = new Date(now);
  if (Number.isNaN(nowDate.getTime())) return false;

  const nowY = nowDate.getUTCFullYear();
  const nowM = nowDate.getUTCMonth() + 1;
  const nowD = nowDate.getUTCDate();

  if (y > nowY || (y === nowY && m > nowM) || (y === nowY && m === nowM && d > nowD)) {
    return false;
  }

  let age = nowY - y;
  if (nowM < m || (nowM === m && nowD < d)) {
    age--;
  }

  return age >= 18;
};

export function isValidIsoDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year < 1900) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return false;
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  if (value > todayIso) return false;
  return true;
}

export const rateLimitMap = new Map<string, number[]>();

export const limiter = (
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): boolean => {
  if (rateLimitMap.size >= 10000) {
    for (const [k, timestamps] of rateLimitMap.entries()) {
      const active = timestamps.filter((t) => now - t < windowMs);
      if (active.length === 0) {
        rateLimitMap.delete(k);
      } else {
        rateLimitMap.set(k, active);
      }
    }
    if (rateLimitMap.size >= 10000) {
      const keysToDelete = Array.from(rateLimitMap.keys()).slice(0, 1000);
      for (const k of keysToDelete) {
        rateLimitMap.delete(k);
      }
    }
  }

  const timestamps = rateLimitMap.get(key) || [];
  const recentTimestamps = timestamps.filter((t) => now - t < windowMs);

  if (recentTimestamps.length >= limit) {
    rateLimitMap.set(key, recentTimestamps);
    return false;
  }

  recentTimestamps.push(now);
  rateLimitMap.set(key, recentTimestamps);
  return true;
};

export const getSecurityHeaders = (env: string = process.env.NODE_ENV || 'development'): Record<string, string> => {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };

  if (env === 'production') {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    headers['Content-Security-Policy'] = [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' https://apis.google.com https://www.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseapp.com https://www.google.com wss://*.firebaseio.com",
      "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://apis.google.com https://www.google.com"
    ].join('; ');
  }

  return headers;
};

export const securityHeadersMiddleware = (_req: Request, res: Response, next: NextFunction) => {
  const headers = getSecurityHeaders(process.env.NODE_ENV);
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  next();
};

export function parseTrustProxyHops(val?: string | number): number {
  if (typeof val === 'number') {
    return Number.isInteger(val) && val >= 0 ? val : 1;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = parseInt(trimmed, 10);
      if (Number.isInteger(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  }
  return 1;
}

export type FieldValidationResult = { valid: true } | { valid: false; error: 'FIELD_TOO_LONG' | 'INVALID_INPUT' };

export function validateFieldLength(
  value: unknown,
  field: 'fullName' | 'fullNameEn' | 'socialHandle' | 'email' | 'phone' | 'whatsapp' | 'changeRequestValue',
  required: boolean = false,
  maxLenOverride?: number
): FieldValidationResult {
  if (value === null || value === undefined) {
    if (required) return { valid: false, error: 'INVALID_INPUT' };
    return { valid: true };
  }
  if (typeof value !== 'string') {
    return { valid: false, error: 'INVALID_INPUT' };
  }
  const trimmed = value.trim();
  const rawLen = Array.from(value).length;
  const trimmedLen = Array.from(trimmed).length;

  if (required && trimmedLen === 0) {
    return { valid: false, error: 'INVALID_INPUT' };
  }

  let maxLen = 100;
  switch (field) {
    case 'fullName':
      maxLen = maxLenOverride !== undefined ? maxLenOverride : 60;
      if (trimmedLen === 0 && required) return { valid: false, error: 'INVALID_INPUT' };
      if (rawLen > maxLen) return { valid: false, error: 'FIELD_TOO_LONG' };
      if (trimmedLen > 0 && (trimmedLen < 2 || /[<>]/.test(trimmed))) return { valid: false, error: 'INVALID_INPUT' };
      break;
    case 'fullNameEn':
      maxLen = maxLenOverride !== undefined ? maxLenOverride : 100;
      if (rawLen > maxLen) return { valid: false, error: 'FIELD_TOO_LONG' };
      if (trimmedLen > 0 && (trimmedLen < 2 || /[<>]/.test(trimmed))) return { valid: false, error: 'INVALID_INPUT' };
      break;
    case 'socialHandle':
      maxLen = 50;
      if (rawLen > maxLen) return { valid: false, error: 'FIELD_TOO_LONG' };
      break;
    case 'email':
      maxLen = 254;
      if (rawLen > maxLen) return { valid: false, error: 'FIELD_TOO_LONG' };
      if (trimmedLen > 0 && !validateEmailAddress(trimmed)) return { valid: false, error: 'INVALID_INPUT' };
      break;
    case 'phone':
    case 'whatsapp':
      maxLen = 20;
      if (rawLen > maxLen) return { valid: false, error: 'FIELD_TOO_LONG' };
      break;
    case 'changeRequestValue':
      maxLen = 100;
      if (trimmedLen === 0 && required) return { valid: false, error: 'INVALID_INPUT' };
      if (rawLen > maxLen) return { valid: false, error: 'FIELD_TOO_LONG' };
      break;
  }
  return { valid: true };
}

export function isValidIdentifierParam(param: unknown, maxLen = 128): boolean {
  if (typeof param !== 'string') return false;
  if (param.length === 0 || param.length > maxLen) return false;
  return /^[A-Za-z0-9_-]+$/.test(param);
}

export function isValidRefCodeParam(param: unknown, maxLen = 64): boolean {
  if (typeof param !== 'string') return false;
  if (param.length === 0 || param.length > maxLen) return false;
  return /^[A-Za-z0-9-]+$/.test(param);
}

/**
 * Constant-time comparison of a supplied secret against a configured secret.
 * Both values are hashed with SHA-256 before comparison with crypto.timingSafeEqual
 * to avoid timing leaks, raw buffer length leaks, or dummy self-comparisons.
 */
export function verifySecret(suppliedSecret: unknown, configuredSecret?: unknown): boolean {
  if (typeof configuredSecret !== 'string' || configuredSecret.length < 32) {
    return false;
  }
  if (typeof suppliedSecret !== 'string' || suppliedSecret.length === 0) {
    return false;
  }
  const configuredHash = crypto.createHash('sha256').update(configuredSecret).digest();
  const suppliedHash = crypto.createHash('sha256').update(suppliedSecret).digest();
  return crypto.timingSafeEqual(configuredHash, suppliedHash);
}

export function verifyReconcileSecret(headerSecret: unknown, envSecret?: string): boolean {
  return verifySecret(headerSecret, envSecret);
}

export interface HeaderExtractResult {
  value?: string;
  error: 'NONE' | 'MISSING' | 'AMBIGUOUS' | 'DUPLICATE' | 'INVALID';
}

/**
 * Inspects request headers and rawHeaders to safely extract a single header value,
 * rejecting duplicate headers, case variations, conflicting aliases, and malformed values.
 */
export function extractValidatedHeader(
  req: Request,
  primaryName: string,
  aliasName?: string
): HeaderExtractResult {
  const primaryLower = primaryName.toLowerCase();
  const aliasLower = aliasName ? aliasName.toLowerCase() : null;

  const rawHeaders = req.rawHeaders || [];
  let primaryCount = 0;
  let aliasCount = 0;
  let primaryValue: string | undefined;
  let aliasValue: string | undefined;

  if (rawHeaders.length > 0) {
    for (let i = 0; i < rawHeaders.length; i += 2) {
      const name = (rawHeaders[i] || '').toLowerCase();
      const val = rawHeaders[i + 1];

      if (name === primaryLower) {
        primaryCount++;
        primaryValue = val;
      } else if (aliasLower && name === aliasLower) {
        aliasCount++;
        aliasValue = val;
      }
    }

    if (primaryCount > 0 && aliasCount > 0) {
      return { error: 'AMBIGUOUS' };
    }

    if (primaryCount > 1 || aliasCount > 1) {
      return { error: 'DUPLICATE' };
    }
  }

  const parsedPrimary = req.headers ? req.headers[primaryLower] : undefined;
  const parsedAlias = (req.headers && aliasLower) ? req.headers[aliasLower] : undefined;

  if (Array.isArray(parsedPrimary) || Array.isArray(parsedAlias)) {
    return { error: 'DUPLICATE' };
  }

  if (parsedPrimary !== undefined && parsedAlias !== undefined) {
    return { error: 'AMBIGUOUS' };
  }

  if (rawHeaders.length === 0) {
    if (parsedPrimary !== undefined) {
      if (typeof parsedPrimary !== 'string' || parsedPrimary.length === 0 || parsedPrimary.includes(',')) {
        return { error: 'INVALID' };
      }
      return { value: parsedPrimary, error: 'NONE' };
    }
    if (parsedAlias !== undefined) {
      if (typeof parsedAlias !== 'string' || parsedAlias.length === 0 || parsedAlias.includes(',')) {
        return { error: 'INVALID' };
      }
      return { value: parsedAlias, error: 'NONE' };
    }
    return { error: 'MISSING' };
  }

  if (primaryCount === 1) {
    if (typeof primaryValue !== 'string' || primaryValue.length === 0) {
      return { error: 'INVALID' };
    }
    return { value: primaryValue, error: 'NONE' };
  }

  if (aliasCount === 1) {
    if (typeof aliasValue !== 'string' || aliasValue.length === 0) {
      return { error: 'INVALID' };
    }
    return { value: aliasValue, error: 'NONE' };
  }

  return { error: 'MISSING' };
}

const respondWithError = (res: Response, statusCode: number, errorKey: string, retryAfterSeconds: number = 60) => {
  if (statusCode === 429) {
    res.setHeader('Retry-After', String(retryAfterSeconds));
  }
  const safeKey = SERVER_LOCALIZED_ERRORS[errorKey] ? errorKey : (statusCode >= 500 ? 'DATABASE_ERROR' : 'INVALID_REQUEST');
  const localized = SERVER_LOCALIZED_ERRORS[safeKey];
  return res.status(statusCode).json({
    error: safeKey,
    ...(localized ? { messageEn: localized.en, messageAr: localized.ar } : {})
  });
};

export interface RecipientIdentityCheckInput {
  invitation: Invitation;
  user: {
    uid: string;
    email?: string | null;
    email_verified?: boolean | null;
    phone_number?: string | null;
  };
  isAction?: 'view' | 'accept' | 'decline';
}

export function getInvitationContactRequirement(
  invitation: Pick<Invitation, 'partner2Email' | 'partner2Phone' | 'partner2PhoneCountry' | 'partner2Whatsapp' | 'partner2WhatsappCountry'>
): 'email' | 'mobile' | 'both' | null {
  const targetEmailNorm = normalizeCanonicalEmail(invitation.partner2Email);
  const targetPhoneNorm = normalizeCanonicalPhone(invitation.partner2Phone, invitation.partner2PhoneCountry);
  const targetWaNorm = normalizeCanonicalPhone(invitation.partner2Whatsapp, invitation.partner2WhatsappCountry || invitation.partner2PhoneCountry);

  const hasEmailTarget = Boolean(targetEmailNorm.isValid && targetEmailNorm.canonical);
  const hasPhoneTarget = Boolean((targetPhoneNorm.isValid && targetPhoneNorm.canonical) || (targetWaNorm.isValid && targetWaNorm.canonical));

  if (hasEmailTarget && hasPhoneTarget) return 'both';
  if (hasEmailTarget) return 'email';
  if (hasPhoneTarget) return 'mobile';
  return null;
}

export function verifyRecipientIdentity(input: RecipientIdentityCheckInput): {
  authorized: boolean;
  isP1: boolean;
  reason?: string;
} {
  const { invitation, user, isAction = 'view' } = input;
  const isP1 = user.uid === invitation.p1Uid;

  if (isP1) {
    if (isAction === 'accept') {
      return { authorized: false, isP1: true, reason: 'CANNOT_ACCEPT_OWN_INVITATION' };
    }
    if (isAction === 'decline') {
      return { authorized: false, isP1: true, reason: 'INVITER_CANNOT_DECLINE_AS_P2' };
    }
    return { authorized: true, isP1: true };
  }

  // Canonicalize invitation target contacts
  const targetEmailNorm = normalizeCanonicalEmail(invitation.partner2Email);
  const targetPhoneNorm = normalizeCanonicalPhone(invitation.partner2Phone, invitation.partner2PhoneCountry);
  const targetWaNorm = normalizeCanonicalPhone(invitation.partner2Whatsapp, invitation.partner2WhatsappCountry || invitation.partner2PhoneCountry);

  const hasEmailTarget = Boolean(targetEmailNorm.isValid && targetEmailNorm.canonical);
  const hasPhoneTarget = Boolean((targetPhoneNorm.isValid && targetPhoneNorm.canonical) || (targetWaNorm.isValid && targetWaNorm.canonical));

  // Reject invalid/missing target contacts safely with allowlisted error
  if (!hasEmailTarget && !hasPhoneTarget) {
    return { authorized: false, isP1: false, reason: 'INVALID_INVITATION_CONTACTS' };
  }

  const userEmailNorm = normalizeCanonicalEmail(user.email);
  const userPhoneNorm = normalizeCanonicalPhone(user.phone_number);

  const emailMatches = Boolean(
    hasEmailTarget &&
    user.email_verified === true &&
    userEmailNorm.isValid &&
    userEmailNorm.canonical === targetEmailNorm.canonical
  );

  const phoneMatches = Boolean(
    hasPhoneTarget &&
    userPhoneNorm.isValid &&
    userPhoneNorm.canonical &&
    (userPhoneNorm.canonical === targetPhoneNorm.canonical ||
      userPhoneNorm.canonical === targetWaNorm.canonical)
  );

  // Policy 1: Both email and mobile
  if (hasEmailTarget && hasPhoneTarget) {
    // Explicit mismatch if user has a valid contact that does not match the invited target
    if (
      userEmailNorm.isValid &&
      userEmailNorm.canonical &&
      targetEmailNorm.canonical &&
      userEmailNorm.canonical !== targetEmailNorm.canonical
    ) {
      return { authorized: false, isP1: false, reason: 'INVITATION_IDENTITY_MISMATCH' };
    }
    if (
      userPhoneNorm.isValid &&
      userPhoneNorm.canonical &&
      userPhoneNorm.canonical !== targetPhoneNorm.canonical &&
      userPhoneNorm.canonical !== targetWaNorm.canonical
    ) {
      return { authorized: false, isP1: false, reason: 'INVITATION_IDENTITY_MISMATCH' };
    }
    // Both must be present and verified
    if (!userEmailNorm.canonical || !user.email_verified) {
      return { authorized: false, isP1: false, reason: 'VERIFICATION_REQUIRED' };
    }
    if (!phoneMatches) {
      return { authorized: false, isP1: false, reason: 'VERIFICATION_REQUIRED' };
    }
    return { authorized: true, isP1: false };
  }

  // Policy 2: Email only
  if (hasEmailTarget) {
    if (emailMatches) {
      return { authorized: true, isP1: false };
    }
    if (userEmailNorm.isValid && userEmailNorm.canonical === targetEmailNorm.canonical && !user.email_verified) {
      return { authorized: false, isP1: false, reason: 'VERIFICATION_REQUIRED' };
    }
    return { authorized: false, isP1: false, reason: 'INVITATION_IDENTITY_MISMATCH' };
  }

  // Policy 3: Mobile only
  if (hasPhoneTarget) {
    if (phoneMatches) {
      return { authorized: true, isP1: false };
    }
    if (
      userPhoneNorm.isValid &&
      userPhoneNorm.canonical &&
      userPhoneNorm.canonical !== targetPhoneNorm.canonical &&
      userPhoneNorm.canonical !== targetWaNorm.canonical
    ) {
      return { authorized: false, isP1: false, reason: 'INVITATION_IDENTITY_MISMATCH' };
    }
    // Account email may differ because no recipient email was specified.
    // Unverified mobile requires verification, NOT a mismatch accusation.
    return { authorized: false, isP1: false, reason: 'VERIFICATION_REQUIRED' };
  }

  return { authorized: false, isP1: false, reason: 'INVALID_INVITATION_CONTACTS' };
}

// Shared trusted backend operation for relationship termination (permanent deletion with bounded batches)
export interface TerminateRelationshipResult {
  success: boolean;
  deleted: boolean;
  recordId: string;
}

export async function cleanRelatedDocsInBatches(
  db: FirebaseFirestore.Firestore,
  collectionName: string,
  recordId: string,
  batchSize: number = 50
): Promise<number> {
  let totalDeleted = 0;
  while (true) {
    const snap = await db.collection(collectionName)
      .where('recordId', '==', recordId)
      .limit(batchSize)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    totalDeleted += snap.size;

    if (snap.size < batchSize) break;
  }
  return totalDeleted;
}

export async function terminateActiveRelationship(
  db: FirebaseFirestore.Firestore,
  callerUid: string,
  recordId: string,
  _endReason: string = 'user_ended'
): Promise<TerminateRelationshipResult> {
  const nowIso = new Date().toISOString();
  const relRef = db.collection(RELATIONSHIPS_COL).doc(recordId);
  const progressRef = db.collection(RELATIONSHIP_DELETIONS_COL).doc(recordId);

  let originalStatus = '';
  let otherUid: string | null = null;

  // Phase 1: Atomic Lock & Immediate Public Deactivation
  await db.runTransaction(async (transaction) => {
    const relDoc = await transaction.get(relRef);
    if (!relDoc.exists) throw new Error('ACTIVE_RELATIONSHIP_NOT_FOUND');
    const record = relDoc.data() as RelationshipRecord;
    originalStatus = record.status;
    otherUid = record.p1Uid === callerUid ? (record.p2Uid || null) : (record.p2Uid === callerUid ? record.p1Uid : null);

    if (
      record.status !== 'active' &&
      record.status !== 'deleting' &&
      record.status !== 'pending_partner' &&
      record.status !== 'draft' &&
      record.status !== 'ended' &&
      record.status !== 'cancelled'
    ) {
      throw new Error('ACTIVE_RELATIONSHIP_NOT_FOUND');
    }

    if (record.p1Uid !== callerUid && record.p2Uid !== callerUid) {
      throw new Error('NOT_RELATIONSHIP_PARTICIPANT');
    }

    // Read user docs to verify pointers
    const p1UserRef = record.p1Uid ? db.collection(USERS_COL).doc(record.p1Uid) : null;
    const p2UserRef = record.p2Uid ? db.collection(USERS_COL).doc(record.p2Uid) : null;
    const p1UserDoc = p1UserRef ? await transaction.get(p1UserRef) : null;
    const p2UserDoc = p2UserRef ? await transaction.get(p2UserRef) : null;

    // Read all reservation docs and public index docs for P1 and P2
    const { hashes } = extractCanonicalContacts(record.partner1, record.partner2);
    const resDocs: { ref: FirebaseFirestore.DocumentReference; doc: FirebaseFirestore.DocumentSnapshot }[] = [];
    const indexDocs: { ref: FirebaseFirestore.DocumentReference; doc: FirebaseFirestore.DocumentSnapshot }[] = [];

    for (const h of hashes) {
      const resRef = db.collection(CONTACT_RESERVATIONS_COL).doc(h);
      const resDoc = await transaction.get(resRef);
      resDocs.push({ ref: resRef, doc: resDoc });

      const indexRef = db.collection(PUBLIC_CONTACT_INDEX_COL).doc(h);
      const indexDoc = await transaction.get(indexRef);
      indexDocs.push({ ref: indexRef, doc: indexDoc });
    }

    let certRef: FirebaseFirestore.DocumentReference | null = null;
    if (record.verificationRef) {
      certRef = db.collection(CERTIFICATES_COL).doc(record.verificationRef);
    }

    // WRITE PHASE 1:
    // 1. Mark status 'deleting' immediately to block concurrent edits
    transaction.set(relRef, { status: 'deleting', deletingAt: nowIso }, { merge: true });

    // 2. Delete public certificate projection immediately
    if (certRef) {
      transaction.delete(certRef);
    }

    // 3. Clear user activeRecordId ONLY if it points to this relationship
    if (p1UserRef && p1UserDoc?.exists && p1UserDoc.data()?.activeRecordId === record.id) {
      transaction.set(p1UserRef, {
        activeRecordId: FieldValue.delete(),
        updatedAt: nowIso
      }, { merge: true });
    }
    if (p2UserRef && p2UserDoc?.exists && p2UserDoc.data()?.activeRecordId === record.id) {
      transaction.set(p2UserRef, {
        activeRecordId: FieldValue.delete(),
        updatedAt: nowIso
      }, { merge: true });
    }

    // 4. Release contact reservations owned by this relationship
    for (const item of resDocs) {
      if (item.doc.exists && (item.doc.data() as { recordId: string }).recordId === record.id) {
        transaction.delete(item.ref);
      }
    }

    // 5. Release public contact index entries owned by this relationship
    for (const item of indexDocs) {
      if (item.doc.exists && (item.doc.data() as { recordId: string }).recordId === record.id) {
        transaction.delete(item.ref);
      }
    }

    // 6. Record minimal temporary deletion progress (zero PII)
    transaction.set(progressRef, {
      recordId,
      callerUid,
      stage: 'cleaning_batches',
      startedAt: nowIso
    });
  });

  // Phase 2: Bounded Batch Cleanup of related sub-documents
  await cleanRelatedDocsInBatches(db, INVITATIONS_COL, recordId, 50);
  await cleanRelatedDocsInBatches(db, CHANGE_REQUESTS_COL, recordId, 50);
  await cleanRelatedDocsInBatches(db, CHANGE_REQUEST_LOCKS_COL, recordId, 50);
  await cleanRelatedDocsInBatches(db, NOTIFICATIONS_COL, recordId, 50);

  // Phase 3: Final Record Deletion & Progress Cleanup
  const finalBatch = db.batch();
  finalBatch.delete(relRef);
  finalBatch.delete(progressRef);
  await finalBatch.commit();

  return {
    success: true,
    deleted: true,
    recordId
  };
}

// Trusted administrative reconciliation helper for interrupted relationship deletions
export async function reconcilePendingRelationshipDeletions(
  db: FirebaseFirestore.Firestore,
  targetRecordId?: string
): Promise<{ processed: number; completed: string[] }> {
  const completed: string[] = [];
  let query: FirebaseFirestore.Query = db.collection(RELATIONSHIP_DELETIONS_COL);
  if (targetRecordId) {
    query = query.where('recordId', '==', targetRecordId);
  }
  const snap = await query.limit(20).get();

  for (const doc of snap.docs) {
    const recId = (doc.data() as { recordId?: string })?.recordId || doc.id;
    try {
      const relRef = db.collection(RELATIONSHIPS_COL).doc(recId);
      const relDoc = await relRef.get();
      if (!relDoc.exists) {
        await cleanRelatedDocsInBatches(db, INVITATIONS_COL, recId, 50);
        await cleanRelatedDocsInBatches(db, CHANGE_REQUESTS_COL, recId, 50);
        await cleanRelatedDocsInBatches(db, CHANGE_REQUEST_LOCKS_COL, recId, 50);
        await cleanRelatedDocsInBatches(db, NOTIFICATIONS_COL, recId, 50);
        await doc.ref.delete();
        completed.push(recId);
      } else {
        const record = relDoc.data() as RelationshipRecord;
        if (record.status === 'active') {
          await doc.ref.delete();
          completed.push(recId);
        } else {
          await terminateActiveRelationship(db, record.p1Uid || record.p2Uid || '', recId, 'reconcile');
          completed.push(recId);
        }
      }
    } catch (err: any) {
      console.error('Reconciliation error for relationship deletion:', err?.code || err?.message || String(err));
    }
  }
  return { processed: snap.size, completed };
}

async function cleanUserInvitationsInBatches(db: FirebaseFirestore.Firestore, uid: string, batchSize: number = 50): Promise<void> {
  while (true) {
    const snap = await db.collection(INVITATIONS_COL)
      .where('p2Uid', '==', uid)
      .limit(batchSize)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }

  while (true) {
    const snap = await db.collection(INVITATIONS_COL)
      .where('p1Uid', '==', uid)
      .limit(batchSize)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

async function cleanUserBlocksInBatches(db: FirebaseFirestore.Firestore, uid: string, batchSize: number = 50): Promise<void> {
  while (true) {
    const snap = await db.collection(INVITATION_BLOCKS_COL)
      .where('p2Uid', '==', uid)
      .limit(batchSize)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }

  while (true) {
    const snap = await db.collection(INVITATION_BLOCKS_COL)
      .where('p1Uid', '==', uid)
      .limit(batchSize)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

// Trusted administrative reconciliation helper for interrupted account deletions
export async function reconcilePendingAccountDeletions(
  db: FirebaseFirestore.Firestore,
  authService: Auth,
  targetUid?: string
): Promise<{ processed: number; completed: string[]; failed: string[] }> {
  if (!authService) {
    throw new Error('AUTH_SERVICE_REQUIRED_FOR_ACCOUNT_RECONCILIATION');
  }
  const completed: string[] = [];
  const failed: string[] = [];
  let query: FirebaseFirestore.Query = db.collection(ACCOUNT_DELETIONS_COL);
  if (targetUid) {
    query = query.where('uid', '==', targetUid);
  }
  const snap = await query.limit(20).get();

  for (const doc of snap.docs) {
    const data = doc.data() as { uid: string };
    const uid = data.uid;
    try {
      // 1. Clean up any leftover relationships owned or participated by this user
      while (true) {
        const p1Snap = await db.collection(RELATIONSHIPS_COL)
          .where('p1Uid', '==', uid)
          .limit(50)
          .get();
        if (p1Snap.empty) break;
        for (const relDoc of p1Snap.docs) {
          await terminateActiveRelationship(db, uid, relDoc.id, 'account_reconciliation');
        }
      }

      while (true) {
        const p2Snap = await db.collection(RELATIONSHIPS_COL)
          .where('p2Uid', '==', uid)
          .limit(50)
          .get();
        if (p2Snap.empty) break;
        for (const relDoc of p2Snap.docs) {
          await terminateActiveRelationship(db, uid, relDoc.id, 'account_reconciliation');
        }
      }

      // 2. Delete user from Firebase Auth
      try {
        await authService.deleteUser(uid);
      } catch (err: any) {
        if (err?.code !== 'auth/user-not-found') {
          try {
            await authService.getUser(uid);
            failed.push(uid);
            continue;
          } catch (getErr: any) {
            if (getErr?.code !== 'auth/user-not-found') {
              failed.push(uid);
              continue;
            }
          }
        }
      }

      // 3. Delete Firestore profile doc and progress doc
      await cleanUserInvitationsInBatches(db, uid);
      await cleanUserBlocksInBatches(db, uid);
      await cleanUserRemindersInBatches(db, uid);
      await db.collection(WHATSAPP_VERIFY_ATTEMPTS_COL).doc(uid).delete();
      await db.collection(WHATSAPP_VERIFY_LIMITS_COL).doc(uid).delete();
      await db.collection(USERS_COL).doc(uid).delete();
      await doc.ref.delete();
      completed.push(uid);
    } catch (err) {
      console.error(`Reconciliation failed for user ${uid}:`, err);
      failed.push(uid);
    }
  }
  return { processed: snap.size, completed, failed };
}

let reconciliationRunning = false;

export async function runDeletionReconciliation(): Promise<{ relationships: number; accounts: number; skipped?: boolean }> {
  if (reconciliationRunning) {
    return { relationships: 0, accounts: 0, skipped: true };
  }
  if (!adminDb) {
    return { relationships: 0, accounts: 0 };
  }

  reconciliationRunning = true;
  try {
    const relResult = await reconcilePendingRelationshipDeletions(adminDb);
    let accCompleted = 0;
    if (adminAuth) {
      const accResult = await reconcilePendingAccountDeletions(adminDb, adminAuth);
      accCompleted = accResult.completed.length;
    }
    return {
      relationships: relResult.completed.length,
      accounts: accCompleted
    };
  } finally {
    reconciliationRunning = false;
  }
}

export async function isUserDeletionPending(
  db: FirebaseFirestore.Firestore,
  uid: string,
  transaction?: FirebaseFirestore.Transaction
): Promise<boolean> {
  const ref = db.collection(ACCOUNT_DELETIONS_COL).doc(uid);
  const doc = transaction ? await transaction.get(ref) : await ref.get();
  return doc.exists;
}

export async function isRelationshipDeletionPending(
  db: FirebaseFirestore.Firestore,
  recordId: string,
  transaction?: FirebaseFirestore.Transaction
): Promise<boolean> {
  const ref = db.collection(RELATIONSHIP_DELETIONS_COL).doc(recordId);
  const doc = transaction ? await transaction.get(ref) : await ref.get();
  return doc.exists;
}

export interface CreateAppOptions {
  staticDir?: string;
  isDev?: boolean;
}

export const getPublicStaticDir = (): string => {
  const clientDir = path.join(process.cwd(), 'dist', 'client');
  if (fs.existsSync(clientDir)) return clientDir;
  return path.join(process.cwd(), 'dist');
};

export function canonicalApexRedirectMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  // Only redirect GET and HEAD methods for public page/asset visits
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  // Never redirect API endpoints, authentication helpers, internal reconciliation, or health checks
  const rawPath = req.path || '';
  if (
    rawPath === '/api' ||
    rawPath.startsWith('/api/') ||
    rawPath === '/internal' ||
    rawPath.startsWith('/internal/') ||
    rawPath === '/__' ||
    rawPath.startsWith('/__/')
  ) {
    return next();
  }

  // Determine request hostname without port.
  // Express req.hostname utilizes trust-proxy settings safely and strips any port.
  // Fall back to Host header only if req.hostname is unavailable.
  let host = '';
  if (typeof req.hostname === 'string' && req.hostname) {
    host = req.hostname.toLowerCase().trim();
  } else if (typeof req.headers.host === 'string') {
    const rawHost = req.headers.host;
    const colonIdx = rawHost.lastIndexOf(':');
    const bracketIdx = rawHost.lastIndexOf(']');
    host = (colonIdx > bracketIdx ? rawHost.slice(0, colonIdx) : rawHost).toLowerCase().trim();
  }

  // Strictly target only the exact apex domain relationshipid.org
  // Subdomains like www.relationshipid.org, localhost, preview domains, and Cloud Run run.app domains are never matched.
  if (host !== 'relationshipid.org') {
    return next();
  }

  // Construct destination URL: permanently redirect to fixed canonical origin https://www.relationshipid.org
  // Never construct the target host or protocol from client headers or request properties.
  const rawUrl = req.originalUrl || req.url || '/';
  let cleanUrl = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  // Prevent protocol-relative URL bypass (e.g. //attacker.com)
  if (cleanUrl.startsWith('//')) {
    cleanUrl = '/' + cleanUrl.replace(/^\/+/, '');
  }
  const sanitizedPath = cleanUrl.replace(/[\r\n]/g, '');

  return res.redirect(301, `https://www.relationshipid.org${sanitizedPath}`);
}

export function mountProductionStatic(app: express.Express, staticDir: string): void {
  // Public static asset serving
  app.use(
    express.static(staticDir, {
      dotfiles: 'ignore',
      index: false,
      setHeaders: (res, filePath) => {
        const rel = path.relative(staticDir, filePath).replace(/\\/g, '/');
        if (rel === 'assets' || rel.startsWith('assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    })
  );

  // SPA fallback for HTML page routing
  app.get('*', (req, res) => {
    let decoded = '';
    try {
      decoded = decodeURIComponent(req.path || '');
    } catch {
      return res.status(400).end();
    }
    const normalized = path.posix.normalize(decoded);
    const lower = normalized.toLowerCase();
    const baseName = path.posix.basename(normalized);

    // Missing assets, sourcemaps, auth helper paths, or non-html file extensions must return 404, never index.html
    if (
      lower.startsWith('/assets/') ||
      lower.startsWith('/brand/') ||
      lower.startsWith('/__/') ||
      lower === '/__/auth' ||
      lower === '/__/firebase' ||
      (baseName.includes('.') && !baseName.endsWith('.html'))
    ) {
      return res.status(404).end();
    }

    const indexPath = path.join(staticDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      const cleanPath = lower.endsWith('/') && lower.length > 1 ? lower.slice(0, -1) : lower;
      const isPublicInformational = cleanPath === '' || cleanPath === '/' || cleanPath === '/about' || cleanPath === '/privacy' || cleanPath === '/terms';
      if (!isPublicInformational) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      }
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(indexPath);
    }
    return res.status(404).end();
  });
}

export function createApp(options?: CreateAppOptions): express.Express {
  const isDevServing = Boolean(options?.isDev) && process.env.NODE_ENV !== 'production';
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', parseTrustProxyHops(process.env.TRUST_PROXY_HOPS));
  app.use(compression());
  app.use(securityHeadersMiddleware);

  // SECURITY: Prevent direct access to server build artifacts, sourcemaps, environment files, backups, and dotfiles
  app.use((req, res, next) => {
    let decodedPath = req.path || '';
    try {
      let prev = '';
      let iterations = 0;
      while (decodedPath !== prev && iterations < 3) {
        prev = decodedPath;
        decodedPath = decodeURIComponent(decodedPath);
        iterations++;
      }
    } catch {
      return res.status(400).end();
    }

    const normalized = path.posix.normalize(decodedPath);
    const lower = normalized.toLowerCase();

    // Development serving only: permit the exact Vite client environment bootstrap module to reach Vite middleware
    const isViteClientEnvModule =
      isDevServing &&
      normalized === '/node_modules/vite/dist/client/env.mjs';

    if (
      !isViteClientEnvModule &&
      (
        lower.startsWith('/.env') ||
        lower.startsWith('/.git') ||
        lower.endsWith('.cjs') ||
        lower.endsWith('.mjs') ||
        lower === '/server.ts' ||
        lower.endsWith('/server.ts') ||
        ((process.env.NODE_ENV === 'production' || !lower.startsWith('/src/')) && (lower.endsWith('.ts') || lower.endsWith('.tsx'))) ||
        lower.endsWith('.map') ||
        lower.endsWith('.zip') ||
        lower.endsWith('.tar') ||
        lower.endsWith('.gz') ||
        lower.endsWith('.bak') ||
        lower.endsWith('.sql') ||
        lower === '/server.cjs' ||
        lower === '/server.cjs.map' ||
        lower === '/package.json' ||
        lower === '/package-lock.json' ||
        lower === '/bun.lock' ||
        lower === '/tsconfig.json' ||
        lower === '/relationship-id.zip' ||
        normalized.includes('/../server.cjs') ||
        normalized.endsWith('/server.cjs') ||
        normalized.endsWith('/server.cjs.map')
      )
    ) {
      return res.status(404).end();
    }
    next();
  });

  app.use(express.json({ limit: '256kb' }));
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'INVALID_REQUEST' });
    }
    next(err);
  });

  // SECURITY: The server must NEVER accept whatsappTrusted or whatsappVerifiedAt from any client request body, on any endpoint. Strip/ignore them.
  app.use((req, _res, next) => {
    if (req.body && typeof req.body === 'object') {
      const stripSecurityFields = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        delete obj.whatsappTrusted;
        delete obj.whatsappVerifiedAt;
        for (const key of Object.keys(obj)) {
          if (obj[key] && typeof obj[key] === 'object') {
            stripSecurityFields(obj[key]);
          }
        }
      };
      stripSecurityFields(req.body);
    }
    next();
  });

  app.get('/api/health', async (_req, res) => {
    const effectiveProjectId = (process.env.NODE_ENV === 'test' && testProjectIdOverride !== undefined)
      ? testProjectIdOverride
      : (projectId || process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID);
    const health = await defaultHealthCheckManager.getHealth(adminDb, effectiveProjectId, 5000);
    return res.status(health.statusCode).json(health.body);
  });

  // Enforce Firebase App Check on every /api/* route before requireAuth
  app.use('/api', requireAppCheck);

  // Client-side error reporting endpoint (App Check protected, rate limited)
  app.post('/api/error-report', async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      if (!limiter(`error_report_${clientIp}`, 10, 60000)) {
        return res.status(429).json({ error: 'RATE_LIMITED' });
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const errorCategory = typeof body.errorCategory === 'string' ? body.errorCategory.trim().slice(0, 32) : 'unknown';
      const pageCategory = typeof body.pageCategory === 'string' ? body.pageCategory.trim().slice(0, 32) : 'unknown';
      const eventId = typeof body.eventId === 'string' ? body.eventId.trim().slice(0, 64) : 'unknown';
      const appVersion = typeof body.appVersion === 'string' ? body.appVersion.trim().slice(0, 32) : undefined;

      if (errorCategory !== 'render_error') {
        return res.status(400).json({ error: 'INVALID_INPUT' });
      }

      // Structured logging for Google Cloud Logging alert
      console.log(JSON.stringify({
        severity: 'ERROR',
        event: 'CLIENT_RENDER_ERROR',
        errorCategory,
        pageCategory,
        eventId,
        appVersion,
        timestamp: new Date().toISOString()
      }));

      return res.json({ success: true });
    } catch {
      return res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  // ----------------------------------------------------
  // WhatsApp Verification via Twilio Verify (SMS)
  // ----------------------------------------------------
  app.get('/api/whatsapp/verify/status', requireAuth, (_req, res) => {
    return res.json({ enabled: isWhatsappVerifyEnabled() });
  });

  app.post('/api/whatsapp/verify/start', requireAuth, async (req, res) => {
    try {
      if (!isWhatsappVerifyEnabled()) {
        return respondWithError(res, 503, 'WHATSAPP_VERIFY_UNAVAILABLE');
      }

      const user = userFromResponse(res);
      const { country, number } = (req.body || {}) as { country?: string; number?: string };

      const norm = normalizeCanonicalPhone(number, country);
      if (!norm.isValid || !norm.canonical) {
        return respondWithError(res, 400, 'INVALID_PHONE_NUMBER');
      }

      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });

      // Max 5 starts per user per hour (counter in Firestore) -> 429 when exceeded
      // Enforced atomically in a Firestore transaction to prevent concurrent race conditions
      const limitRef = adminDb.collection(WHATSAPP_VERIFY_LIMITS_COL).doc(user.uid);
      const nowMs = Date.now();
      const ONE_HOUR_MS = 60 * 60 * 1000;

      let quotaReserved = false;
      let rateLimitRetryAfter = 0;

      await adminDb.runTransaction(async (transaction) => {
        const limitDoc = await transaction.get(limitRef);
        let currentCount = 0;
        let windowStartMs = nowMs;

        if (limitDoc.exists) {
          const data = limitDoc.data() || {};
          const savedWindowStart = typeof data.windowStartMs === 'number' ? data.windowStartMs : 0;
          if (nowMs - savedWindowStart < ONE_HOUR_MS) {
            currentCount = typeof data.count === 'number' ? data.count : 0;
            windowStartMs = savedWindowStart;
          }
        }

        if (currentCount >= 5) {
          rateLimitRetryAfter = Math.max(1, Math.ceil((windowStartMs + ONE_HOUR_MS - nowMs) / 1000));
          return;
        }

        transaction.set(limitRef, {
          count: currentCount + 1,
          windowStartMs,
          updatedAt: new Date(nowMs).toISOString()
        }, { merge: true });
        quotaReserved = true;
      });

      if (!quotaReserved) {
        return respondWithError(res, 429, 'WHATSAPP_VERIFY_RATE_LIMITED', rateLimitRetryAfter);
      }

      const client = getTwilioClient();
      if (!client) {
        // Rollback quota reservation if provider is unavailable
        await adminDb.runTransaction(async (transaction) => {
          const limitDoc = await transaction.get(limitRef);
          if (limitDoc.exists) {
            const data = limitDoc.data() || {};
            const count = Math.max(0, (typeof data.count === 'number' ? data.count : 1) - 1);
            transaction.update(limitRef, { count, updatedAt: new Date().toISOString() });
          }
        }).catch((e) => console.error('[whatsapp] quota rollback failed', e));
        return respondWithError(res, 503, 'WHATSAPP_VERIFY_UNAVAILABLE');
      }

      const verifyServiceSid = process.env.TWILIO_VERIFY_SID!;
      let verification: any;
      try {
        verification = await client.verify.v2.services(verifyServiceSid).verifications.create({
          to: norm.canonical,
          channel: 'whatsapp'
        });
      } catch (twilioErr) {
        // Rollback quota reservation on provider error
        await adminDb.runTransaction(async (transaction) => {
          const limitDoc = await transaction.get(limitRef);
          if (limitDoc.exists) {
            const data = limitDoc.data() || {};
            const count = Math.max(0, (typeof data.count === 'number' ? data.count : 1) - 1);
            transaction.update(limitRef, { count, updatedAt: new Date().toISOString() });
          }
        }).catch((e) => console.error('[whatsapp] quota rollback failed', e));
        throw twilioErr;
      }

      const attemptId = crypto.randomUUID();
      const now = Date.now();
      const newAttempt: WhatsAppVerificationAttempt = {
        attemptId,
        uid: user.uid,
        canonicalPhone: norm.canonical,
        country: country || 'SA +966',
        sid: (verification as any)?.sid || attemptId,
        channel: 'whatsapp',
        state: 'pending',
        createdAt: new Date(now).toISOString(),
        createdAtMs: now,
        expiresAtMs: now + (10 * 60 * 1000), // 10 minutes expiry
        updatedAt: new Date(now).toISOString()
      };

      const attemptRef = adminDb.collection(WHATSAPP_VERIFY_ATTEMPTS_COL).doc(user.uid);
      await attemptRef.set(newAttempt);

      return res.json({ success: true });
    } catch (err: any) {
      console.error('[whatsapp] start failed', {
        operation: 'start',
        code: err?.code || err?.status || err?.name,
        status: err?.status || 502
      });
      const code = err?.message || '';
      if (code === 'WHATSAPP_VERIFY_UNAVAILABLE') {
        return respondWithError(res, 503, 'WHATSAPP_VERIFY_UNAVAILABLE');
      }
      if (code === 'INVALID_PHONE_NUMBER') {
        return respondWithError(res, 400, 'INVALID_PHONE_NUMBER');
      }
      return respondWithError(res, 502, 'WHATSAPP_VERIFY_PROVIDER_ERROR');
    }
  });

  app.post('/api/whatsapp/verify/check', requireAuth, async (req, res) => {
    try {
      if (!isWhatsappVerifyEnabled()) {
        return respondWithError(res, 503, 'WHATSAPP_VERIFY_UNAVAILABLE');
      }

      const user = userFromResponse(res);
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!limiter(`whatsapp_check:${user.uid}`, 10, 60000) || !limiter(`whatsapp_check_ip:${ip}`, 20, 60000)) {
        return respondWithError(res, 429, 'WHATSAPP_VERIFY_RATE_LIMITED');
      }

      const { country, number, code } = (req.body || {}) as { country?: string; number?: string; code?: string };

      if (!code || typeof code !== 'string' || !code.trim()) {
        return respondWithError(res, 400, 'INVALID_INPUT');
      }

      const norm = normalizeCanonicalPhone(number, country);
      if (!norm.isValid || !norm.canonical) {
        return respondWithError(res, 400, 'INVALID_PHONE_NUMBER');
      }

      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });

      // Read server-owned attempt before calling Twilio
      const attemptRef = adminDb.collection(WHATSAPP_VERIFY_ATTEMPTS_COL).doc(user.uid);
      const attemptDoc = await attemptRef.get();

      if (!attemptDoc.exists) {
        return respondWithError(res, 400, 'NO_ACTIVE_VERIFICATION_ATTEMPT');
      }

      const attempt = attemptDoc.data() as WhatsAppVerificationAttempt;
      if (!attempt || attempt.uid !== user.uid) {
        return respondWithError(res, 400, 'INVALID_VERIFICATION_ATTEMPT');
      }

      // Check persistent verification attempt check counter in Firestore (Issue 6)
      const checkAttempts = typeof (attempt as any).checkAttempts === 'number' ? (attempt as any).checkAttempts : 0;
      if (checkAttempts >= 10) {
        return respondWithError(res, 429, 'WHATSAPP_VERIFY_RATE_LIMITED');
      }

      // Record verification check attempt persistently in Firestore
      try {
        await attemptRef.update({
          checkAttempts: checkAttempts + 1,
          updatedAt: new Date().toISOString()
        });
      } catch (updateErr) {
        console.error('[whatsapp] checkAttempts write failed', updateErr);
        return respondWithError(res, 503, 'WHATSAPP_VERIFY_UNAVAILABLE');
      }

      if (attempt.canonicalPhone !== norm.canonical) {
        return respondWithError(res, 400, 'PHONE_NUMBER_MISMATCH');
      }

      if (attempt.channel !== 'whatsapp') {
        return respondWithError(res, 400, 'INVALID_VERIFICATION_CHANNEL');
      }

      if (attempt.state === 'consumed') {
        return respondWithError(res, 400, 'VERIFICATION_ATTEMPT_CONSUMED');
      }

      const nowMs = Date.now();
      if (attempt.expiresAtMs && nowMs > attempt.expiresAtMs) {
        return respondWithError(res, 400, 'VERIFICATION_ATTEMPT_EXPIRED');
      }

      if (attempt.state !== 'pending' && attempt.state !== 'provider_approved') {
        return respondWithError(res, 400, 'INVALID_VERIFICATION_ATTEMPT');
      }

      const client = getTwilioClient();
      if (!client) {
        return respondWithError(res, 503, 'WHATSAPP_VERIFY_UNAVAILABLE');
      }

      const verifyServiceSid = process.env.TWILIO_VERIFY_SID!;

      // Call Twilio Verify only if not already verified at provider (safe retry)
      if (attempt.state !== 'provider_approved') {
        let verificationCheck: any;
        try {
          verificationCheck = await client.verify.v2.services(verifyServiceSid).verificationChecks.create({
            to: attempt.canonicalPhone,
            code: code.trim()
          });
        } catch (checkErr: any) {
          console.warn('Twilio verification check error:', checkErr?.message);
          return respondWithError(res, 400, 'INVALID_VERIFICATION_CODE');
        }

        if (!verificationCheck || verificationCheck.status !== 'approved') {
          return respondWithError(res, 400, 'INVALID_VERIFICATION_CODE');
        }

        if (verificationCheck.channel && verificationCheck.channel !== 'whatsapp') {
          return respondWithError(res, 400, 'INVALID_VERIFICATION_CHANNEL');
        }

        // Persist provider_approved state on attempt before transaction to support safe retry if DB has a transient failure
        try {
          await attemptRef.update({
            state: 'provider_approved',
            providerApprovedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        } catch (updateErr) {
          console.warn('Failed to record provider_approved state on attempt:', updateErr);
        }
      }

      const nowIso = new Date().toISOString();
      const preliminaryOwned = await getOwnedRecord(user.uid);

      await adminDb.runTransaction(async (transaction) => {
        if (await isUserDeletionPending(adminDb, user.uid, transaction)) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        // Recheck attempt doc inside the transaction!
        const txAttemptDoc = await transaction.get(attemptRef);
        if (!txAttemptDoc.exists) {
          throw new Error('NO_ACTIVE_VERIFICATION_ATTEMPT');
        }
        const txAttempt = txAttemptDoc.data() as WhatsAppVerificationAttempt;

        // Verify attemptId matches the attempt we validated (guards against superseded attempts / concurrent resend)
        if (txAttempt.attemptId !== attempt.attemptId) {
          throw new Error('VERIFICATION_ATTEMPT_SUPERSEDED');
        }

        // Verify state is not already consumed by a concurrent request
        if (txAttempt.state === 'consumed') {
          throw new Error('VERIFICATION_ATTEMPT_CONSUMED');
        }

        // Verify user and phone match
        if (txAttempt.uid !== user.uid || txAttempt.canonicalPhone !== norm.canonical) {
          throw new Error('INVALID_VERIFICATION_ATTEMPT');
        }

        // Verify expiry
        if (txAttempt.expiresAtMs && Date.now() > txAttempt.expiresAtMs) {
          throw new Error('VERIFICATION_ATTEMPT_EXPIRED');
        }

        const userRef = adminDb.collection(USERS_COL).doc(user.uid);
        const userDoc = await transaction.get(userRef);
        const activeRecordId = (userDoc.exists ? (userDoc.data()?.activeRecordId as string | undefined) : undefined) || preliminaryOwned?.id;

        let owned: RelationshipRecord | null = null;
        let ownedRef: FirebaseFirestore.DocumentReference | null = null;

        if (activeRecordId) {
          if (await isRelationshipDeletionPending(adminDb, activeRecordId, transaction)) {
            throw new Error('RELATIONSHIP_DELETION_PENDING');
          }

          ownedRef = adminDb.collection(RELATIONSHIPS_COL).doc(activeRecordId);
          const ownedDoc = await transaction.get(ownedRef);
          if (ownedDoc.exists) {
            const rec = ownedDoc.data() as RelationshipRecord;
            if (rec.status !== 'ended' && rec.status !== 'cancelled') {
              owned = rec;
            }
          }
        }

        if (owned) {
          if (owned.status === 'deleting') {
            throw new Error('RELATIONSHIP_DELETION_PENDING');
          }

          if (owned.status === 'active') {
            const isP1 = owned.p1Uid === user.uid;
            const isP2 = owned.p2Uid === user.uid;
            const currentParticipantPhone = isP1 ? owned.partner1.phoneE164 : (isP2 ? owned.partner2.phoneE164 : null);
            if (currentParticipantPhone && currentParticipantPhone !== norm.canonical) {
              throw new Error('ACTIVE_RELATIONSHIP_LOCKED');
            }
          }
        }

        const contactCheck = await validateContactUniqueness(
          adminDb,
          { phones: [norm.canonical], whatsapps: [norm.canonical] },
          owned?.id || null,
          transaction
        );
        if (!contactCheck.valid) {
          throw new Error(contactCheck.error?.code || 'CONTACT_IN_ACTIVE_RELATIONSHIP');
        }

        // Atomically consume the attempt
        transaction.set(attemptRef, {
          ...txAttempt,
          state: 'consumed',
          consumedAt: nowIso,
          updatedAt: nowIso
        }, { merge: true });

        transaction.set(userRef, {
          whatsappE164: norm.canonical,
          whatsappTrusted: true,
          whatsappVerifiedAt: nowIso,
          phoneE164: norm.canonical,
          phoneVerified: true,
          phoneVerificationMethod: 'twilio_whatsapp',
          updatedAt: nowIso
        }, { merge: true });

        if (owned && ownedRef) {
          const isP1 = owned.p1Uid === user.uid;
          const isP2 = owned.p2Uid === user.uid;
          if (isP1) {
            owned.partner1.whatsappE164 = norm.canonical;
            owned.partner1.whatsappTrusted = true;
            owned.partner1.whatsappVerifiedAt = nowIso;
            owned.partner1.phoneE164 = norm.canonical;
            owned.partner1.phoneVerified = true;
          } else if (isP2) {
            owned.partner2.whatsappE164 = norm.canonical;
            owned.partner2.whatsappTrusted = true;
            owned.partner2.whatsappVerifiedAt = nowIso;
            owned.partner2.phoneE164 = norm.canonical;
            owned.partner2.phoneVerified = true;
          }
          transaction.set(ownedRef, owned, { merge: true });
        }
      });

      return res.json({
        success: true,
        whatsappE164: norm.canonical,
        whatsappTrusted: true,
        whatsappVerifiedAt: nowIso,
        phoneE164: norm.canonical,
        phoneVerified: true
      });
    } catch (err: any) {
      console.error('Error checking WhatsApp verification:', err);
      const code = err?.message || '';
      if (code === 'WHATSAPP_VERIFY_UNAVAILABLE') {
        return respondWithError(res, 503, 'WHATSAPP_VERIFY_UNAVAILABLE');
      }
      if (code === 'INVALID_PHONE_NUMBER') {
        return respondWithError(res, 400, 'INVALID_PHONE_NUMBER');
      }
      if (
        code === 'INVALID_INPUT' ||
        code === 'INVALID_VERIFICATION_CODE' ||
        code === 'NO_ACTIVE_VERIFICATION_ATTEMPT' ||
        code === 'VERIFICATION_ATTEMPT_EXPIRED' ||
        code === 'VERIFICATION_ATTEMPT_CONSUMED' ||
        code === 'VERIFICATION_ATTEMPT_SUPERSEDED' ||
        code === 'PHONE_NUMBER_MISMATCH' ||
        code === 'INVALID_VERIFICATION_ATTEMPT' ||
        code === 'INVALID_VERIFICATION_CHANNEL'
      ) {
        return respondWithError(res, 400, code);
      }
      if (
        code === 'ACCOUNT_DELETION_PENDING' ||
        code === 'RELATIONSHIP_DELETION_PENDING' ||
        code === 'ACTIVE_RELATIONSHIP_LOCKED' ||
        code === 'CONTACT_IN_ACTIVE_RELATIONSHIP'
      ) {
        return respondWithError(res, 409, code);
      }
      if (code === 'DATABASE_ERROR') {
        return respondWithError(res, 500, 'DATABASE_ERROR');
      }
      return respondWithError(res, 502, 'WHATSAPP_VERIFY_PROVIDER_ERROR');
    }
  });

  app.get(['/api/relationship', '/api/record'], requireAuth, async (_req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const userDoc = await adminDb.collection(USERS_COL).doc(user.uid).get();
      const userData = userDoc.exists ? userDoc.data() : null;
      let userProfile = (userData?.profile as PartnerData | undefined) || null;
      if (userProfile) {
        const isTwilioVerified = Boolean(
          userData?.whatsappTrusted &&
          userData?.whatsappE164 &&
          (!userProfile.phoneE164 || userProfile.phoneE164 === userData.whatsappE164)
        );
        const isLegacyVerified = Boolean(
          user.phone_number &&
          (!userProfile.phoneE164 || userProfile.phoneE164 === user.phone_number)
        );
        const isPhoneVerified = isTwilioVerified || isLegacyVerified;
        userProfile.phoneVerified = isPhoneVerified;
        if (user.phone_number) {
          userProfile.phoneE164 = user.phone_number;
        } else if (isTwilioVerified && userData?.whatsappE164) {
          userProfile.phoneE164 = userData.whatsappE164;
        }
        if (isTwilioVerified) {
          userProfile.whatsappTrusted = true;
          userProfile.whatsappE164 = userData?.whatsappE164;
          userProfile.whatsappVerifiedAt = userData?.whatsappVerifiedAt;
        } else {
          userProfile.whatsappTrusted = false;
          userProfile.whatsappVerifiedAt = undefined;
        }
      }
      const record = await getOwnedRecord(user.uid);
      let invitation: Invitation | null = null;
      if (record?.inviteId && record.inviteId !== 'current') {
        const invDoc = await adminDb.collection(INVITATIONS_COL).doc(record.inviteId).get();
        if (invDoc.exists) {
          invitation = invDoc.data() as Invitation;
        }
      }
      return res.json({
        record: record || null,
        invitation: invitation || null,
        userProfile: userProfile || null
      });
    } catch (error) {
      console.error('Error fetching relationship:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.post(['/api/relationship', '/api/record'], requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`save_relationship:${user.uid}`, 5, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      const rawPartner1 = (req.body as any)?.partner1;
      const type = (req.body as any)?.type as RelationshipType | undefined;
      const startDate = (req.body as any)?.startDate as string | undefined;

      if (!rawPartner1 || !['dating', 'engagement', 'marriage'].includes(type || '')) {
        return res.status(400).json({ error: 'INVALID_RELATIONSHIP_DRAFT' });
      }

      const partner1 = sanitizePartnerInput(rawPartner1);

      // Bind partner email to verified account identity
      const submittedP1EmailNorm = normalizeCanonicalEmail(partner1.email);
      const tokenEmailNorm = normalizeCanonicalEmail(user.email);

      if (submittedP1EmailNorm.canonical !== '') {
        if (!tokenEmailNorm.canonical || submittedP1EmailNorm.canonical !== tokenEmailNorm.canonical) {
          return respondWithError(res, 400, 'EMAIL_MUST_MATCH_ACCOUNT');
        }
      }

      if (tokenEmailNorm.canonical && user.email_verified === true) {
        partner1.email = tokenEmailNorm.canonical;
      } else {
        partner1.email = '';
      }

      const nameCheck = validateFieldLength(partner1.fullName, 'fullName', true, 100);
      if (!nameCheck.valid) return respondWithError(res, 400, nameCheck.error);
      const nameEnCheck = validateFieldLength(partner1.fullNameEn, 'fullNameEn', false, 100);
      if (!nameEnCheck.valid) return respondWithError(res, 400, nameEnCheck.error);
      const socialCheck = validateFieldLength(partner1.socialHandle, 'socialHandle', false);
      if (!socialCheck.valid) return respondWithError(res, 400, socialCheck.error);
      if (partner1.socialAccounts !== undefined) {
        const socialAccCheck = validateSocialAccounts(partner1.socialAccounts);
        if (!socialAccCheck.valid) return respondWithError(res, 400, socialAccCheck.error);
        partner1.socialAccounts = socialAccCheck.sanitized;
      }
      const emailCheck = validateFieldLength(partner1.email, 'email', false);
      if (!emailCheck.valid) return respondWithError(res, 400, emailCheck.error);
      const phoneCheck = validateFieldLength(partner1.phoneNumber || partner1.phoneE164, 'phone', false);
      if (!phoneCheck.valid) return respondWithError(res, 400, phoneCheck.error);
      const waCheck = validateFieldLength(partner1.whatsappNumber || partner1.whatsappE164, 'whatsapp', false);
      if (!waCheck.valid) return respondWithError(res, 400, waCheck.error);

      if (req.body?.acceptedLegalVersion !== CURRENT_LEGAL_VERSION) {
        return respondWithError(res, 400, 'LEGAL_CONSENT_REQUIRED');
      }

      if (!isAtLeast18(partner1.birthYear, partner1.birthMonth, partner1.birthDay)) {
        return respondWithError(res, 400, 'AGE_REQUIREMENT_NOT_MET');
      }
      if (!isValidIsoDate(startDate)) {
        return respondWithError(res, 400, 'INVALID_START_DATE');
      }
      const p1PrePhone = normalizeCanonicalPhone(partner1.phoneE164 || partner1.phoneNumber, partner1.phoneCountry);
      if (!p1PrePhone.isValid || !p1PrePhone.canonical) {
        return respondWithError(res, 400, 'INVALID_PHONE_NUMBER');
      }

      const result = await adminDb.runTransaction(async (transaction) => {
        // Check if acting user account deletion is pending
        const userDelRef = adminDb.collection(ACCOUNT_DELETIONS_COL).doc(user.uid);
        const userDelDoc = await transaction.get(userDelRef);
        if (userDelDoc.exists) throw new Error('ACCOUNT_DELETION_PENDING');

        const userRef = adminDb.collection(USERS_COL).doc(user.uid);
        const userDoc = await transaction.get(userRef);
        const activeRecordId = userDoc.exists ? (userDoc.data()?.activeRecordId as string | undefined) : undefined;

        let existingRecord: RelationshipRecord | null = null;
        let existingRecordRef: FirebaseFirestore.DocumentReference | null = null;

        if (activeRecordId) {
          const relDelRef = adminDb.collection(RELATIONSHIP_DELETIONS_COL).doc(activeRecordId);
          const relDelDoc = await transaction.get(relDelRef);
          if (relDelDoc.exists) throw new Error('RELATIONSHIP_DELETION_PENDING');

          existingRecordRef = adminDb.collection(RELATIONSHIPS_COL).doc(activeRecordId);
          const recDoc = await transaction.get(existingRecordRef);
          if (recDoc.exists) {
            const rec = recDoc.data() as RelationshipRecord;
            if (rec.status !== 'ended' && rec.status !== 'cancelled') {
              existingRecord = rec;
            }
          }
        }

        if (!existingRecord) {
          const owned = await getOwnedRecord(user.uid);
          if (owned) {
            existingRecord = owned;
            existingRecordRef = adminDb.collection(RELATIONSHIPS_COL).doc(owned.id);
          }
        }

        if (existingRecord && (existingRecord.status === 'active' || existingRecord.status === 'deleting')) {
          throw new Error('ACTIVE_RELATIONSHIP_LOCKED');
        }

        // Enforce: User cannot create or edit draft if they are already in an active relationship
        const userHasActiveConflict = await checkUserActiveRelationshipConflict(adminDb, user.uid, existingRecord?.id, transaction);
        if (userHasActiveConflict) {
          throw new Error('ACTIVE_RELATIONSHIP_LOCKED');
        }

        // Validate and normalize P1's contacts
        const nowIso = new Date().toISOString();
        const p1EmailNorm = normalizeCanonicalEmail(partner1.email);
        if (!p1EmailNorm.isValid) throw new Error('INVALID_CONTACT_FORMAT');

        const p1PhoneNorm = normalizeCanonicalPhone(partner1.phoneE164 || partner1.phoneNumber, partner1.phoneCountry);
        if (!p1PhoneNorm.isValid) throw new Error('INVALID_PHONE_NUMBER');

        const p1WaNorm = normalizeCanonicalPhone(partner1.whatsappE164 || partner1.whatsappNumber, partner1.whatsappCountry || partner1.phoneCountry);
        if (!p1WaNorm.isValid) throw new Error('INVALID_PHONE_NUMBER');

        delete (partner1 as any).whatsappTrusted;
        delete (partner1 as any).whatsappVerifiedAt;
        delete (partner1 as any).phoneVerified;

        partner1.email = p1EmailNorm.canonical;
        partner1.phoneE164 = p1PhoneNorm.canonical;
        partner1.whatsappE164 = p1WaNorm.canonical || partner1.phoneE164;

        const isP1PhoneTwilioVerified = Boolean(
          p1PhoneNorm.canonical &&
          userDoc.exists &&
          userDoc.data()?.whatsappTrusted === true &&
          userDoc.data()?.whatsappE164 === p1PhoneNorm.canonical
        );
        const isP1PhoneLegacyVerified = Boolean(
          user.phone_number &&
          p1PhoneNorm.canonical &&
          user.phone_number === p1PhoneNorm.canonical
        );
        const isP1WaTwilioVerified = Boolean(
          p1WaNorm.canonical &&
          userDoc.exists &&
          userDoc.data()?.whatsappTrusted === true &&
          userDoc.data()?.whatsappE164 === p1WaNorm.canonical
        );

        const isP1MobileVerified = isP1PhoneTwilioVerified || isP1PhoneLegacyVerified;
        if (!isP1MobileVerified) {
          throw new Error('VERIFIED_PHONE_REQUIRED');
        }

        partner1.phoneVerified = true;
        const isSameAsMobile = Boolean(partner1.whatsappE164 && partner1.phoneE164 && partner1.whatsappE164 === partner1.phoneE164);
        if (isSameAsMobile) {
          partner1.whatsappTrusted = isP1PhoneTwilioVerified;
          partner1.whatsappVerifiedAt = isP1PhoneTwilioVerified ? (userDoc.data()?.whatsappVerifiedAt || nowIso) : undefined;
        } else {
          partner1.whatsappTrusted = isP1WaTwilioVerified;
          partner1.whatsappVerifiedAt = isP1WaTwilioVerified ? (userDoc.data()?.whatsappVerifiedAt || nowIso) : undefined;
        }

        // Enforce: P1's email, phone, or WhatsApp cannot belong to another active relationship
        const contactCheck = await validateContactUniqueness(
          adminDb,
          {
            emails: [partner1.email],
            phones: [partner1.phoneE164],
            whatsapps: [partner1.whatsappE164]
          },
          existingRecord?.id,
          transaction
        );
        if (!contactCheck.valid) {
          throw new Error(contactCheck.error?.code || 'CONTACT_IN_ACTIVE_RELATIONSHIP');
        }

        let targetRecord: RelationshipRecord;

        if (!existingRecord) {
          const recordId = randomId('rec', 10);
          const relRef = adminDb.collection(RELATIONSHIPS_COL).doc(recordId);
          targetRecord = {
            id: recordId,
            recordNumber: '',
            verificationRef: '',
            issuedDate: '',
            issuedDateAr: '',
            type: type as RelationshipType,
            startDate: formatDate(startDate!, 'en'),
            startDateAr: formatDate(startDate!, 'ar'),
            startDateIso: startDate,
            partner1,
            partner2: emptyPartner(),
            status: 'draft',
            activeSinceDays: 0,
            settings: { showSocialHandles: true, showContactDetails: false, showQrMatrix: true },
            createdAt: nowIso,
            p1Uid: user.uid,
            p2Uid: null
          };
          transaction.set(relRef, targetRecord);
          transaction.set(userRef, {
            activeRecordId: recordId,
            profile: partner1,
            phoneE164: partner1.phoneE164,
            legalConsentVersion: CURRENT_LEGAL_VERSION,
            legalConsentAt: nowIso,
            whatsappE164: partner1.whatsappE164 || null,
            whatsappTrusted: partner1.whatsappTrusted,
            whatsappVerifiedAt: partner1.whatsappVerifiedAt || (partner1.whatsappTrusted ? nowIso : null),
            updatedAt: nowIso
          }, { merge: true });
        } else {
          const mergedPartner1 = { ...partner1 };
          if (mergedPartner1.socialAccounts === undefined && existingRecord.partner1?.socialAccounts) {
            mergedPartner1.socialAccounts = existingRecord.partner1.socialAccounts;
          }
          if (mergedPartner1.socialHandle === undefined && existingRecord.partner1?.socialHandle) {
            mergedPartner1.socialHandle = existingRecord.partner1.socialHandle;
          }
          targetRecord = {
            ...existingRecord,
            partner1: mergedPartner1,
            type: type as RelationshipType,
            startDate: formatDate(startDate!, 'en'),
            startDateAr: formatDate(startDate!, 'ar'),
            startDateIso: startDate
          };
          transaction.set(existingRecordRef!, targetRecord, { merge: true });
          transaction.set(userRef, {
            profile: mergedPartner1,
            phoneE164: partner1.phoneE164,
            legalConsentVersion: CURRENT_LEGAL_VERSION,
            legalConsentAt: nowIso,
            whatsappE164: partner1.whatsappE164 || null,
            whatsappTrusted: partner1.whatsappTrusted,
            whatsappVerifiedAt: partner1.whatsappVerifiedAt || (partner1.whatsappTrusted ? nowIso : null),
            updatedAt: nowIso
          }, { merge: true });
        }

        return targetRecord;
      });

      return res.json({ success: true, record: result });
    } catch (error) {
      console.error('Error saving relationship:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const statusMap: Record<string, number> = {
        ACTIVE_RELATIONSHIP_LOCKED: 409,
        CONTACT_IN_ACTIVE_RELATIONSHIP: 409,
        INVALID_RELATIONSHIP_DRAFT: 400,
        INVALID_START_DATE: 400,
        VERIFIED_PHONE_REQUIRED: 400
      };
      const statusCode = statusMap[msg] || 500;
      return respondWithError(res, statusCode, msg);
    }
  });

  app.post(['/api/invitations', '/api/invite/create'], requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`create_invite:${user.uid}`, 5, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      const {
        partner2Name,
        partner2Email,
        partner2Phone,
        partner2PhoneCountry,
        partner2Whatsapp,
        partner2WhatsappCountry
      } = req.body as Partial<Invitation>;

      if (!partner2Name?.trim()) return res.status(400).json({ error: 'PARTNER_NAME_REQUIRED' });
      const p2NameCheck = validateFieldLength(partner2Name, 'fullName', true, 100);
      if (!p2NameCheck.valid) return respondWithError(res, 400, p2NameCheck.error);
      if (partner2Email) {
        const p2EmailCheck = validateFieldLength(partner2Email, 'email', false);
        if (!p2EmailCheck.valid) return respondWithError(res, 400, p2EmailCheck.error);
      }
      if (partner2Phone) {
        const p2PhoneCheck = validateFieldLength(partner2Phone, 'phone', false);
        if (!p2PhoneCheck.valid) return respondWithError(res, 400, p2PhoneCheck.error);
      }
      if (partner2Whatsapp) {
        const p2WaCheck = validateFieldLength(partner2Whatsapp, 'whatsapp', false);
        if (!p2WaCheck.valid) return respondWithError(res, 400, p2WaCheck.error);
      }

      if (!partner2Email && !partner2Phone && !partner2Whatsapp) {
        return res.status(400).json({ error: 'PARTNER_CONTACT_REQUIRED' });
      }

      const p2EmailNorm = normalizeCanonicalEmail(partner2Email);
      if (!p2EmailNorm.isValid) return res.status(400).json({ error: 'INVALID_CONTACT_FORMAT' });

      const p2PhoneNorm = normalizeCanonicalPhone(partner2Phone, partner2PhoneCountry);
      if (!p2PhoneNorm.isValid) return res.status(400).json({ error: 'INVALID_PHONE_NUMBER' });

      const p2WaNorm = normalizeCanonicalPhone(partner2Whatsapp, partner2WhatsappCountry);
      if (!p2WaNorm.isValid) return res.status(400).json({ error: 'INVALID_PHONE_NUMBER' });

      const targetHashes: string[] = [];
      if (p2EmailNorm.canonical) targetHashes.push(hashContact(p2EmailNorm.canonical));
      if (p2PhoneNorm.canonical) targetHashes.push(hashContact(p2PhoneNorm.canonical));
      if (p2WaNorm.canonical) targetHashes.push(hashContact(p2WaNorm.canonical));

      const result = await adminDb.runTransaction(async (transaction) => {
        if (targetHashes.length > 0) {
          const [blocksOnUserSnap, userBlocksSnap] = await Promise.all([
            transaction.get(adminDb.collection(INVITATION_BLOCKS_COL)
              .where('p1Uid', '==', user.uid)
              .where('blocked', '==', true)),
            transaction.get(adminDb.collection(INVITATION_BLOCKS_COL)
              .where('p2Uid', '==', user.uid)
              .where('blocked', '==', true))
          ]);

          for (const bDoc of [...blocksOnUserSnap.docs, ...userBlocksSnap.docs]) {
            const bData = bDoc.data();
            const hashes: string[] = Array.isArray(bData?.contactHashes) ? bData.contactHashes : [];
            if (targetHashes.some((h) => hashes.includes(h))) throw new Error('INVITATION_NOT_ALLOWED');
            // Symmetric matching: Resolve opposite participant's current canonical contacts regardless of who is user.uid
            const oppositeUid = bData?.p1Uid === user.uid ? bData?.p2Uid : bData?.p2Uid === user.uid ? bData?.p1Uid : null;
            if (typeof oppositeUid === 'string' && oppositeUid.length > 0) {
              const oppositeUserDoc = await transaction.get(adminDb.collection(USERS_COL).doc(oppositeUid));
              if (oppositeUserDoc.exists) {
                const profile = oppositeUserDoc.data();
                const contacts = [
                  normalizeCanonicalEmail(profile?.email || '').canonical,
                  normalizeCanonicalPhone(profile?.phoneE164 || '').canonical,
                  normalizeCanonicalPhone(profile?.whatsappE164 || '').canonical
                ].filter((value): value is string => Boolean(value));
                if (contacts.some(value => targetHashes.includes(hashContact(value)))) {
                  throw new Error('INVITATION_NOT_ALLOWED');
                }
              }
            }
          }
        }


        if (await isUserDeletionPending(adminDb, user.uid, transaction)) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        const userRef = adminDb.collection(USERS_COL).doc(user.uid);
        const userDoc = await transaction.get(userRef);
        const activeRecordId = userDoc.exists ? (userDoc.data()?.activeRecordId as string | undefined) : undefined;

        if (activeRecordId && (await isRelationshipDeletionPending(adminDb, activeRecordId, transaction))) {
          throw new Error('RELATIONSHIP_DELETION_PENDING');
        }

        let record: RelationshipRecord | null = null;
        let recordRef: FirebaseFirestore.DocumentReference | null = null;

        if (activeRecordId) {
          recordRef = adminDb.collection(RELATIONSHIPS_COL).doc(activeRecordId);
          const recDoc = await transaction.get(recordRef);
          if (recDoc.exists) {
            record = recDoc.data() as RelationshipRecord;
          }
        }

        if (!record) {
          const owned = await getOwnedRecord(user.uid);
          if (owned) {
            record = owned;
            recordRef = adminDb.collection(RELATIONSHIPS_COL).doc(owned.id);
          }
        }

        if (!record || record.p1Uid !== user.uid) throw new Error('RELATIONSHIP_DRAFT_NOT_FOUND');
        if (record.status === 'active') throw new Error('ACTIVE_RELATIONSHIP_EXISTS');

        // Enforce: P1 cannot invite themselves using their own contact info
        const p1EmailNorm = normalizeCanonicalEmail(record.partner1.email);
        const p1PhoneNorm = normalizeCanonicalPhone(record.partner1.phoneE164 || record.partner1.phoneNumber, record.partner1.phoneCountry);
        const p1WaNorm = normalizeCanonicalPhone(record.partner1.whatsappE164 || record.partner1.whatsappNumber, record.partner1.whatsappCountry || record.partner1.phoneCountry);

        if (p2EmailNorm.canonical && p1EmailNorm.canonical && p2EmailNorm.canonical === p1EmailNorm.canonical) {
          throw new Error('SELF_INVITATION_NOT_ALLOWED');
        }
        if (p2PhoneNorm.canonical && p1PhoneNorm.canonical && p2PhoneNorm.canonical === p1PhoneNorm.canonical) {
          throw new Error('SELF_INVITATION_NOT_ALLOWED');
        }
        if (p2WaNorm.canonical && p1WaNorm.canonical && p2WaNorm.canonical === p1WaNorm.canonical) {
          throw new Error('SELF_INVITATION_NOT_ALLOWED');
        }

        // Check if user already in active relationship
        const userConflict = await checkUserActiveRelationshipConflict(adminDb, user.uid, record.id, transaction);
        if (userConflict) throw new Error('ACTIVE_RELATIONSHIP_EXISTS');


        if (record.inviteId) {
          const oldInviteRef = adminDb.collection(INVITATIONS_COL).doc(record.inviteId);
          const oldInviteDoc = await transaction.get(oldInviteRef);
          if (oldInviteDoc.exists) {
            const oldInvite = oldInviteDoc.data() as Invitation;
            if (oldInvite.status === 'pending' && new Date(oldInvite.expiresAt).getTime() > Date.now()) {
              throw new Error('PENDING_INVITATION_EXISTS');
            }
          }
        }

        const inviteId = randomId('inv', 18);
        const nowIso = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

        const invitation: Invitation = {
          id: inviteId,
          recordId: record.id,
          inviterName: record.partner1.fullName,
          partner2Name: partner2Name.trim(),
          partner2Email: p2EmailNorm.canonical || null,
          partner2Phone: p2PhoneNorm.canonical || null,
          partner2PhoneCountry: partner2PhoneCountry || null,
          partner2Whatsapp: p2WaNorm.canonical || null,
          partner2WhatsappCountry: partner2WhatsappCountry || null,
          relationshipType: record.type,
          startDate: record.startDate,
          startDateAr: record.startDateAr,
          startDateIso: record.startDateIso,
          status: 'pending',
          createdAt: nowIso,
          expiresAt,
          reminderCount: 0,
          p1Uid: user.uid,
          p2Uid: null
        };

        const updatedRecord: RelationshipRecord = {
          ...record,
          inviteId,
          status: 'pending_partner',
          partner2: {
            ...emptyPartner(),
            fullName: invitation.partner2Name,
            email: invitation.partner2Email || '',
            phoneNumber: invitation.partner2Phone || '',
            phoneCountry: invitation.partner2PhoneCountry || 'SA +966',
            whatsappNumber: invitation.partner2Whatsapp || '',
            whatsappCountry: invitation.partner2WhatsappCountry || 'SA +966'
          }
        };

        transaction.set(adminDb.collection(INVITATIONS_COL).doc(inviteId), invitation);
        transaction.set(recordRef!, updatedRecord);

        return { invitation, record: updatedRecord };
      });

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error creating invitation:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const statusMap: Record<string, number> = {
        RELATIONSHIP_DRAFT_NOT_FOUND: 404,
        ACTIVE_RELATIONSHIP_EXISTS: 409,
        CONTACT_IN_ACTIVE_RELATIONSHIP: 409,
        PENDING_INVITATION_EXISTS: 409,
        PARTNER_NAME_REQUIRED: 400,
        PARTNER_CONTACT_REQUIRED: 400,
        SELF_INVITATION_NOT_ALLOWED: 400,
        INVITATION_NOT_ALLOWED: 403
      };
      const statusCode = statusMap[msg] || 500;
      return respondWithError(res, statusCode, msg);
    }
  });

  app.get('/api/invitations/:inviteId', async (req, res) => {
    try {
      const inviteIdParam = req.params.inviteId;
      if (!isValidIdentifierParam(inviteIdParam)) {
        return res.status(404).json({ error: 'INVITATION_NOT_FOUND' });
      }
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!limiter(`get_invite:${ip}`, 30, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const inviteRef = adminDb.collection(INVITATIONS_COL).doc(inviteIdParam);
      const inviteDoc = await inviteRef.get();
      if (!inviteDoc.exists) return res.status(404).json({ error: 'INVITATION_NOT_FOUND' });

      const invitation = inviteDoc.data() as Invitation;
      if (invitation.status === 'pending' && new Date(invitation.expiresAt).getTime() <= Date.now()) {
        invitation.status = 'expired';
        await inviteRef.update({ status: 'expired' });
      }

      // Expired, cancelled, accepted, or declined invitations must not continue exposing personal preview information
      if (invitation.status !== 'pending') {
        return res.json({
          invitation: {
            id: invitation.id,
            status: invitation.status
          },
          record: null
        });
      }

      // Read authoritative relationship record
      const relDoc = await adminDb.collection(RELATIONSHIPS_COL).doc(invitation.recordId).get();
      const record = relDoc.exists ? (relDoc.data() as RelationshipRecord) : null;

      // Check optional authenticated caller identity for authorized participant review
      let authenticatedUser: { uid: string; email?: string; email_verified?: boolean; phone_number?: string } | null = null;
      let tokenVerificationFailed = false;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ') && adminAuth) {
        const token = authHeader.split('Bearer ')[1]?.trim();
        if (token) {
          let decoded: any = null;
          try {
            decoded = await adminAuth.verifyIdToken(token, true);
          } catch {
            tokenVerificationFailed = true;
          }

          if (decoded) {
            let effectivePhone = decoded.phone_number;
            if (!effectivePhone && adminDb) {
              try {
                const uDoc = await adminDb.collection(USERS_COL).doc(decoded.uid).get();
                if (uDoc.exists && uDoc.data()?.whatsappTrusted && uDoc.data()?.whatsappE164) {
                  effectivePhone = uDoc.data()?.whatsappE164;
                }
              } catch (dbErr) {
                console.error('Error fetching user profile for invitation preview:', dbErr);
                return respondWithError(res, 500, 'DATABASE_ERROR');
              }
            }
            authenticatedUser = {
              uid: decoded.uid,
              email: decoded.email,
              email_verified: Boolean(decoded.email_verified),
              phone_number: effectivePhone
            };
          }
        }
      }

      const contactRequirement = getInvitationContactRequirement(invitation);
      let isAuthorizedRecipient = false;
      let isP1 = false;
      let authReason: string | undefined = tokenVerificationFailed ? 'AUTH_REQUIRED' : (authHeader ? 'AUTH_REQUIRED' : undefined);
      const isAuthenticated = Boolean(authenticatedUser);

      if (authenticatedUser) {
        const recipientCheck = verifyRecipientIdentity({
          invitation,
          user: authenticatedUser,
          isAction: 'view'
        });
        isP1 = recipientCheck.isP1;
        isAuthorizedRecipient = !isP1 && recipientCheck.authorized;
        authReason = isP1 ? 'CURRENTLY_SIGNED_IN_AS_INVITER' : (!recipientCheck.authorized ? recipientCheck.reason : undefined);
      }

      if (isAuthorizedRecipient) {
        // Return full proposal data needed by authorized participant
        return res.json({
          invitation: {
            id: invitation.id,
            recordId: invitation.recordId,
            inviterName: invitation.inviterName,
            partner2Name: invitation.partner2Name,
            partner2Email: invitation.partner2Email,
            partner2Phone: invitation.partner2Phone,
            relationshipType: invitation.relationshipType,
            startDate: invitation.startDate,
            startDateAr: invitation.startDateAr,
            startDateIso: invitation.startDateIso,
            status: invitation.status,
            createdAt: invitation.createdAt,
            expiresAt: invitation.expiresAt,
            reminderCount: invitation.reminderCount,
            contactRequirement
          },
          record: record ? {
            type: record.type,
            startDate: record.startDate,
            startDateAr: record.startDateAr,
            startDateIso: record.startDateIso || null,
            partner1Name: record.partner1.fullName,
            partner1En: record.partner1.fullNameEn || null,
            status: record.status
          } : null,
          authorization: {
            authenticated: true,
            isP1: false,
            authorized: true,
            inviteId: invitation.id,
            authorizedUid: authenticatedUser?.uid
          }
        });
      }

      // Public preview allowlist: Strictly minimal public preview fields
      return res.json({
        invitation: {
          id: invitation.id,
          inviterName: invitation.inviterName,
          relationshipType: invitation.relationshipType,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          contactRequirement
        },
        record: null,
        authorization: {
          authenticated: isAuthenticated,
          isP1,
          authorized: false,
          reason: authReason,
          inviteId: invitation.id,
          authorizedUid: authenticatedUser?.uid
        }
      });
    } catch (error) {
      console.error('Error getting invitation preview:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  async function notifyP1OfInvitationDecision(params: {
    inviteId: string;
    p1Uid: string;
    p1Email?: string;
    notification: {
      id: string;
      userId: string;
      type: 'invitation_accepted' | 'invitation_declined';
      recordId?: string;
      senderName?: string;
      createdAt: string;
      read: boolean;
      messageAr: string;
      messageEn: string;
      secondaryAr?: string;
      secondaryEn?: string;
    };
  }): Promise<void> {
    if (!adminDb) return;
    const { inviteId, p1Uid, p1Email, notification } = params;

    try {
      await Promise.allSettled([
        // Email delivery
        (async () => {
          try {
            const normalized = normalizeCanonicalEmail(p1Email);
            if (!normalized.isValid || !normalized.canonical) {
              console.warn('P1_DECISION_EMAIL_SKIPPED', inviteId);
              return;
            }
            const subject = notification.type === 'invitation_accepted'
              ? 'Relationship ID — تم قبول دعوتك | Your invitation was accepted'
              : 'Relationship ID — تم رفض دعوتك | Your invitation was declined';

            const arParts = [notification.messageAr];
            if (notification.secondaryAr) arParts.push(notification.secondaryAr);
            arParts.push('https://www.relationshipid.org');

            const enParts = [notification.messageEn];
            if (notification.secondaryEn) enParts.push(notification.secondaryEn);
            enParts.push('https://www.relationshipid.org');

            const textBody = `${arParts.join('\n')}\n\n${enParts.join('\n')}`;

            const result = await sendReminderEmail(normalized.canonical, subject, textBody, notification.id);
            if (!result.success) {
              console.error('P1_DECISION_EMAIL_FAILED', inviteId, result.error);
            }
          } catch (emailErr) {
            console.error('P1_DECISION_EMAIL_FAILED', inviteId, emailErr instanceof Error ? emailErr.message : String(emailErr));
          }
        })(),

        // Phone push delivery
        (async () => {
          try {
            const pushSnap = await adminDb.collection(PUSH_SUBSCRIPTIONS_COL).where('userId', '==', p1Uid).get();
            if (pushSnap.empty) {
              console.info('P1_DECISION_PUSH_NO_SUBSCRIPTION', inviteId);
              return;
            }
            const payload = {
              title: 'Relationship ID',
              body: 'لديك تحديث على دعوتك. افتح التطبيق للاطلاع عليه.\nYour invitation has an update. Open the app to view it.',
              data: { url: '/' }
            };
            for (const doc of pushSnap.docs) {
              const subData = doc.data();
              const docId = doc.id;
              try {
                const pushResult = await sendReminderPushNotification(subData.subscription as any, payload);
                if (pushResult.expired) {
                  try {
                    await adminDb.collection(PUSH_SUBSCRIPTIONS_COL).doc(docId).delete();
                  } catch (delErr) {
                    console.error('P1_DECISION_PUSH_SUB_DELETE_FAILED', docId);
                  }
                } else if (!pushResult.success) {
                  console.error('P1_DECISION_PUSH_FAILED', inviteId, pushResult.error);
                }
              } catch (singlePushErr) {
                console.error('P1_DECISION_PUSH_FAILED', inviteId, singlePushErr instanceof Error ? singlePushErr.message : String(singlePushErr));
              }
            }
          } catch (pushErr) {
            console.error('P1_DECISION_PUSH_FAILED', inviteId, pushErr instanceof Error ? pushErr.message : String(pushErr));
          }
        })()
      ]);
    } catch {
      // Helper never throws
    }
  }

  app.post('/api/invitations/:inviteId/accept', requireAuth, async (req, res) => {
    try {
      if (!isValidIdentifierParam(req.params.inviteId)) {
        return respondWithError(res, 404, 'INVITATION_NOT_FOUND');
      }
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`invitation_action:${user.uid}`, 10, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }

      const preInviteSnap = await adminDb.collection(INVITATIONS_COL)
        .doc(req.params.inviteId).get();
      if (preInviteSnap.exists && preInviteSnap.data()?.p1Uid === user.uid) {
        return respondWithError(res, 400, 'CANNOT_ACCEPT_OWN_INVITATION');
      }

      const rawPartner2 = (req.body as { partner2?: unknown }).partner2;
      if (!rawPartner2) return res.status(400).json({ error: 'PARTNER2_PROFILE_REQUIRED' });

      const partner2 = sanitizePartnerInput(rawPartner2);

      // Bind partner email to verified account identity
      const submittedP2EmailNorm = normalizeCanonicalEmail(partner2.email);
      const tokenEmailNorm = normalizeCanonicalEmail(user.email);

      if (submittedP2EmailNorm.canonical !== '') {
        if (!tokenEmailNorm.canonical || submittedP2EmailNorm.canonical !== tokenEmailNorm.canonical) {
          return respondWithError(res, 400, 'EMAIL_MUST_MATCH_ACCOUNT');
        }
      }

      if (tokenEmailNorm.canonical && user.email_verified === true) {
        partner2.email = tokenEmailNorm.canonical;
      } else {
        partner2.email = '';
      }

      const nameCheck = validateFieldLength(partner2.fullName, 'fullName', true, 100);
      if (!nameCheck.valid) return respondWithError(res, 400, nameCheck.error);
      const nameEnCheck = validateFieldLength(partner2.fullNameEn, 'fullNameEn', false, 100);
      if (!nameEnCheck.valid) return respondWithError(res, 400, nameEnCheck.error);
      const socialCheck = validateFieldLength(partner2.socialHandle, 'socialHandle', false);
      if (!socialCheck.valid) return respondWithError(res, 400, socialCheck.error);
      if (partner2.socialAccounts !== undefined) {
        const socialAccCheck = validateSocialAccounts(partner2.socialAccounts);
        if (!socialAccCheck.valid) return respondWithError(res, 400, socialAccCheck.error);
        partner2.socialAccounts = socialAccCheck.sanitized;
      }
      const emailCheck = validateFieldLength(partner2.email, 'email', false);
      if (!emailCheck.valid) return respondWithError(res, 400, emailCheck.error);
      const phoneCheck = validateFieldLength(partner2.phoneNumber || partner2.phoneE164, 'phone', false);
      if (!phoneCheck.valid) return respondWithError(res, 400, phoneCheck.error);
      const waCheck = validateFieldLength(partner2.whatsappNumber || partner2.whatsappE164, 'whatsapp', false);
      if (!waCheck.valid) return respondWithError(res, 400, waCheck.error);

      if (req.body?.acceptedLegalVersion !== CURRENT_LEGAL_VERSION) {
        return respondWithError(res, 400, 'LEGAL_CONSENT_REQUIRED');
      }

      if (!isAtLeast18(partner2.birthYear, partner2.birthMonth, partner2.birthDay)) {
        return respondWithError(res, 400, 'AGE_REQUIREMENT_NOT_MET');
      }
      const p2PhoneNormPre = normalizeCanonicalPhone(partner2.phoneE164 || partner2.phoneNumber, partner2.phoneCountry);
      if (!p2PhoneNormPre.isValid || !p2PhoneNormPre.canonical) {
        return respondWithError(res, 400, 'INVALID_PHONE_NUMBER');
      }

      const inviteRef = adminDb.collection(INVITATIONS_COL).doc(req.params.inviteId);
      const result = await adminDb.runTransaction(async (transaction) => {
        if (await isUserDeletionPending(adminDb, user.uid, transaction)) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        // All reads must occur before any writes
        const invDoc = await transaction.get(inviteRef);
        if (!invDoc.exists) throw new Error('INVITATION_NOT_FOUND');
        const invitation = invDoc.data() as Invitation;

        if (await isUserDeletionPending(adminDb, invitation.p1Uid, transaction)) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        if (invitation.status !== 'pending') throw new Error(`INVITATION_${invitation.status.toUpperCase()}`);
        if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
          throw new Error('INVITATION_EXPIRED');
        }

        if (await isRelationshipDeletionPending(adminDb, invitation.recordId, transaction)) {
          throw new Error('RELATIONSHIP_DELETION_PENDING');
        }

        const p2UserRef = adminDb.collection(USERS_COL).doc(user.uid);
        const p2UserDoc = await transaction.get(p2UserRef);

        const p2EffectivePhone = user.phone_number || (p2UserDoc.exists && p2UserDoc.data()?.whatsappTrusted ? p2UserDoc.data()?.whatsappE164 : undefined);
        const recipientCheck = verifyRecipientIdentity({
          invitation,
          user: {
            uid: user.uid,
            email: user.email,
            email_verified: Boolean(user.email_verified),
            phone_number: p2EffectivePhone
          },
          isAction: 'accept'
        });
        if (!recipientCheck.authorized) {
          throw new Error(recipientCheck.reason || 'INVITATION_IDENTITY_MISMATCH');
        }

        const relRef = adminDb.collection(RELATIONSHIPS_COL).doc(invitation.recordId);
        const relDoc = await transaction.get(relRef);
        if (!relDoc.exists) throw new Error('RELATIONSHIP_NOT_FOUND');
        const record = relDoc.data() as RelationshipRecord;
        if (record.status === 'active') throw new Error('RELATIONSHIP_ALREADY_ACTIVE');

        if (record.status !== 'pending_partner' || record.p1Uid !== invitation.p1Uid) {
          throw new Error('RELATIONSHIP_NOT_PENDING');
        }

        // Check if there is an active pair block between inviter and recipient in either direction
        const blockId1 = `${user.uid}_${invitation.p1Uid}`;
        const blockId2 = `${invitation.p1Uid}_${user.uid}`;
        const [blockDoc1, blockDoc2] = await Promise.all([
          transaction.get(adminDb.collection(INVITATION_BLOCKS_COL).doc(blockId1)),
          transaction.get(adminDb.collection(INVITATION_BLOCKS_COL).doc(blockId2))
        ]);
        if ((blockDoc1.exists && blockDoc1.data()?.blocked) || (blockDoc2.exists && blockDoc2.data()?.blocked)) {
          throw new Error('INVITATION_NOT_ALLOWED');
        }

        // Check if P1 is already bound to an active relationship
        const p1UserRef = adminDb.collection(USERS_COL).doc(invitation.p1Uid);
        const p1UserDoc = await transaction.get(p1UserRef);
        if (p1UserDoc.exists && p1UserDoc.data()?.activeRecordId && p1UserDoc.data()?.activeRecordId !== record.id) {
          const p1RelDoc = await transaction.get(adminDb.collection(RELATIONSHIPS_COL).doc(p1UserDoc.data()?.activeRecordId));
          if (p1RelDoc.exists && (p1RelDoc.data() as RelationshipRecord).status === 'active') {
            throw new Error('ALREADY_IN_ACTIVE_RELATIONSHIP');
          }
        }

        // Check if P2 is already bound to an active relationship
        if (p2UserDoc.exists && p2UserDoc.data()?.activeRecordId && p2UserDoc.data()?.activeRecordId !== record.id) {
          const existingRelDoc = await transaction.get(adminDb.collection(RELATIONSHIPS_COL).doc(p2UserDoc.data()?.activeRecordId));
          if (existingRelDoc.exists && (existingRelDoc.data() as RelationshipRecord).status === 'active') {
            throw new Error('P2_ALREADY_IN_ACTIVE_RELATIONSHIP');
          }
        }

        // Check if P1 or P2 contacts are bound to any other active relationship
        const now = new Date();
        const nowIso = now.toISOString();
        const p2EmailNorm = normalizeCanonicalEmail(partner2.email);
        if (!p2EmailNorm.isValid) throw new Error('INVALID_CONTACT_FORMAT');

        const p2PhoneNorm = normalizeCanonicalPhone(partner2.phoneE164 || partner2.phoneNumber, partner2.phoneCountry);
        if (!p2PhoneNorm.isValid) throw new Error('INVALID_PHONE_NUMBER');

        const p2WaNorm = normalizeCanonicalPhone(partner2.whatsappE164 || partner2.whatsappNumber, partner2.whatsappCountry || partner2.phoneCountry);
        if (!p2WaNorm.isValid) throw new Error('INVALID_PHONE_NUMBER');

        // Enforce: Both partners must not share the same phone or email
        if (p2PhoneNorm.canonical && record.partner1.phoneE164 && p2PhoneNorm.canonical === record.partner1.phoneE164) {
          throw new Error('SAME_PARTNER_CONTACT_NOT_ALLOWED');
        }
        if (p2EmailNorm.canonical && record.partner1.email && p2EmailNorm.canonical === record.partner1.email) {
          throw new Error('SAME_PARTNER_CONTACT_NOT_ALLOWED');
        }

        delete (partner2 as any).whatsappTrusted;
        delete (partner2 as any).whatsappVerifiedAt;
        delete (partner2 as any).phoneVerified;

        partner2.email = p2EmailNorm.canonical;
        partner2.phoneE164 = p2PhoneNorm.canonical;
        partner2.whatsappE164 = p2WaNorm.canonical || partner2.phoneE164;

        const isP2PhoneTwilioVerified = Boolean(
          p2PhoneNorm.canonical &&
          p2UserDoc.exists &&
          p2UserDoc.data()?.whatsappTrusted === true &&
          p2UserDoc.data()?.whatsappE164 === p2PhoneNorm.canonical
        );
        const isP2PhoneLegacyVerified = Boolean(
          user.phone_number &&
          p2PhoneNorm.canonical &&
          user.phone_number === p2PhoneNorm.canonical
        );
        const isP2WaTwilioVerified = Boolean(
          p2WaNorm.canonical &&
          p2UserDoc.exists &&
          p2UserDoc.data()?.whatsappTrusted === true &&
          p2UserDoc.data()?.whatsappE164 === p2WaNorm.canonical
        );

        const isP2MobileVerified = isP2PhoneTwilioVerified || isP2PhoneLegacyVerified;
        if (!isP2MobileVerified) {
          throw new Error('VERIFIED_PHONE_REQUIRED');
        }

        partner2.phoneVerified = true;
        const p2IsSameAsMobile = Boolean(partner2.whatsappE164 && partner2.phoneE164 && partner2.whatsappE164 === partner2.phoneE164);
        if (p2IsSameAsMobile) {
          partner2.whatsappTrusted = isP2PhoneTwilioVerified;
          partner2.whatsappVerifiedAt = isP2PhoneTwilioVerified ? (p2UserDoc.data()?.whatsappVerifiedAt || nowIso) : undefined;
        } else {
          partner2.whatsappTrusted = isP2WaTwilioVerified;
          partner2.whatsappVerifiedAt = isP2WaTwilioVerified ? (p2UserDoc.data()?.whatsappVerifiedAt || nowIso) : undefined;
        }

        const p1EmailNorm = normalizeCanonicalEmail(record.partner1.email);
        if (!p1EmailNorm.isValid) throw new Error('INVALID_CONTACT_FORMAT');

        const p1PhoneNorm = normalizeCanonicalPhone(record.partner1.phoneE164 || record.partner1.phoneNumber, record.partner1.phoneCountry);
        if (!p1PhoneNorm.isValid) throw new Error('INVALID_PHONE_NUMBER');

        const p1WaNorm = normalizeCanonicalPhone(record.partner1.whatsappE164 || record.partner1.whatsappNumber, record.partner1.whatsappCountry || record.partner1.phoneCountry);
        if (!p1WaNorm.isValid) throw new Error('INVALID_PHONE_NUMBER');

        record.partner1.email = p1EmailNorm.canonical;
        record.partner1.phoneE164 = p1PhoneNorm.canonical;
        const p1EffectiveWa = p1WaNorm.canonical || record.partner1.phoneE164;
        record.partner1.whatsappE164 = p1EffectiveWa;
        const p1IsSameAsMobile = Boolean(record.partner1.phoneE164 && p1EffectiveWa === record.partner1.phoneE164);

        const isP1PhoneTwilioVerified = Boolean(
          record.partner1.phoneE164 &&
          p1UserDoc.exists &&
          p1UserDoc.data()?.whatsappTrusted === true &&
          p1UserDoc.data()?.whatsappE164 === record.partner1.phoneE164
        );
        const isP1WaTwilioVerified = Boolean(
          p1EffectiveWa &&
          p1UserDoc.exists &&
          p1UserDoc.data()?.whatsappTrusted === true &&
          p1UserDoc.data()?.whatsappE164 === p1EffectiveWa
        );

        if (p1IsSameAsMobile) {
          record.partner1.whatsappTrusted = isP1PhoneTwilioVerified;
          record.partner1.whatsappVerifiedAt = isP1PhoneTwilioVerified
            ? (p1UserDoc.data()?.whatsappVerifiedAt || record.partner1.whatsappVerifiedAt || nowIso)
            : undefined;
        } else {
          // Different WhatsApp number: MUST be specifically verified for that exact WhatsApp number!
          // Verified mobile A must NEVER mark a different WhatsApp B as trusted!
          record.partner1.whatsappTrusted = isP1WaTwilioVerified;
          record.partner1.whatsappVerifiedAt = isP1WaTwilioVerified
            ? (p1UserDoc.data()?.whatsappVerifiedAt || nowIso)
            : undefined;
        }

        const { hashes, invalidContacts } = extractCanonicalContacts(record.partner1, partner2);
        if (invalidContacts.length > 0) throw new Error('INVALID_CONTACT_FORMAT');

        // All reads must precede writes in Firestore transactions
        for (const h of hashes) {
          const resRef = adminDb.collection(CONTACT_RESERVATIONS_COL).doc(h);
          const resDoc = await transaction.get(resRef);
          if (resDoc.exists) {
            const data = resDoc.data() as { recordId: string };
            if (data.recordId !== record.id) {
              throw new Error('CONTACT_IN_ACTIVE_RELATIONSHIP');
            }
          }
        }

        const recordNumber = crypto.randomInt(100000, 999999).toString();
        const verificationRef = `RID-${now.getUTCFullYear()}-${recordNumber}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const issuedDate = new Intl.DateTimeFormat('en', { day: '2-digit', month: 'long', year: 'numeric' }).format(now);
        const issuedDateAr = new Intl.DateTimeFormat('ar', { day: '2-digit', month: 'long', year: 'numeric' }).format(now);
        const start = new Date(record.createdAt).getTime();
        const activeSinceDays = Math.max(0, Math.floor((Date.now() - start) / 86400000));

        // 1. Update invitation
        transaction.update(inviteRef, {
          status: 'accepted',
          p2Uid: user.uid
        });

        // 2. Activate relationship
        const updatedRecord: RelationshipRecord = {
          ...record,
          partner2,
          p2Uid: user.uid,
          status: 'active',
          recordNumber,
          verificationRef,
          issuedDate,
          issuedDateAr,
          activeSinceDays
        };
        transaction.set(relRef, updatedRecord);

        // 3. Update P2 user document
        transaction.set(adminDb.collection(USERS_COL).doc(user.uid), {
          activeRecordId: record.id,
          phoneE164: partner2.phoneE164,
          legalConsentVersion: CURRENT_LEGAL_VERSION,
          legalConsentAt: nowIso,
          whatsappE164: partner2.whatsappE164 || null,
          whatsappTrusted: partner2.whatsappTrusted,
          whatsappVerifiedAt: partner2.whatsappVerifiedAt || (partner2.whatsappTrusted ? nowIso : null),
          updatedAt: nowIso
        }, { merge: true });

        // 4. Update P1 user document
        transaction.set(adminDb.collection(USERS_COL).doc(invitation.p1Uid), {
          activeRecordId: record.id,
          whatsappE164: record.partner1.whatsappE164 || null,
          whatsappTrusted: record.partner1.whatsappTrusted,
          whatsappVerifiedAt: record.partner1.whatsappVerifiedAt || (record.partner1.whatsappTrusted ? nowIso : null),
          updatedAt: nowIso
        }, { merge: true });

        // 5. Create public-safe certificate projection (strictly NO internal recordId)
        const certRef = adminDb.collection(CERTIFICATES_COL).doc(verificationRef);
        const certData = {
          verificationRef,
          recordNumber,
          partner1Name: record.partner1.fullName,
          partner2Name: partner2.fullName,
          partner1En: record.partner1.fullNameEn || null,
          partner2En: partner2.fullNameEn || null,
          type: record.type,
          startDate: record.startDate,
          startDateAr: record.startDateAr,
          startDateIso: record.startDateIso || null,
          status: 'active',
          issuedDate,
          issuedDateAr
        };
        transaction.set(certRef, certData);

        // 6. Atomically write contact reservations inside the exact same transaction
        for (const h of hashes) {
          const resRef = adminDb.collection(CONTACT_RESERVATIONS_COL).doc(h);
          transaction.set(resRef, {
            recordId: record.id,
            contactHash: h,
            updatedAt: nowIso
          });
        }

        // 7. Atomically create in-app notification for P1
        const notifId = `${req.params.inviteId}_accepted`;
        const notifRef = adminDb.collection(NOTIFICATIONS_COL).doc(notifId);
        const notification = {
          id: notifId,
          userId: invitation.p1Uid!,
          type: 'invitation_accepted' as const,
          recordId: invitation.recordId,
          senderName: invitation.partner2Name,
          createdAt: nowIso,
          read: false,
          messageAr: `تم قبول دعوتك من ${invitation.partner2Name}`,
          messageEn: `${invitation.partner2Name} accepted your invitation`,
          secondaryAr: 'يمكنك الآن مراجعة سجل الارتباط.',
          secondaryEn: 'You can now review your relationship record.'
        };
        transaction.set(notifRef, notification);

        const p1Email = p1UserDoc.exists ? p1UserDoc.data()?.email : undefined;

        return {
          invitation: { ...invitation, status: 'accepted' as const, p2Uid: user.uid },
          record: updatedRecord,
          p1Email,
          p1Uid: invitation.p1Uid!,
          notification
        };
      });

      await notifyP1OfInvitationDecision({
        inviteId: req.params.inviteId,
        p1Uid: result.p1Uid,
        p1Email: result.p1Email,
        notification: result.notification
      });

      return res.json({ success: true, invitation: result.invitation, record: result.record });
    } catch (error) {
      console.error('Error accepting invitation:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const statusMap: Record<string, number> = {
        INVITATION_NOT_FOUND: 404,
        RELATIONSHIP_NOT_FOUND: 404,
        INVITATION_EXPIRED: 410,
        CANNOT_ACCEPT_OWN_INVITATION: 400,
        SELF_RELATIONSHIP_NOT_ALLOWED: 400,
        INVITATION_NOT_ALLOWED: 403,
        INVITATION_IDENTITY_MISMATCH: 403,
        VERIFICATION_REQUIRED: 403,
        RELATIONSHIP_ALREADY_ACTIVE: 409,
        RELATIONSHIP_NOT_PENDING: 409,
        P2_ALREADY_IN_ACTIVE_RELATIONSHIP: 409,
        ALREADY_IN_ACTIVE_RELATIONSHIP: 409,
        CONTACT_IN_ACTIVE_RELATIONSHIP: 409,
        ACCOUNT_DELETION_PENDING: 409,
        RELATIONSHIP_DELETION_PENDING: 409,
        SAME_PARTNER_CONTACT_NOT_ALLOWED: 400,
        SELF_INVITATION_NOT_ALLOWED: 400,
        CURRENTLY_SIGNED_IN_AS_INVITER: 403,
        P2_AUTH_REQUIRED: 401,
        VERIFIED_PHONE_REQUIRED: 400,
        INVALID_PHONE_NUMBER: 400,
        INVALID_CONTACT_FORMAT: 400,
        INVALID_INVITATION_CONTACTS: 400
      };
      const statusCode = statusMap[msg] || (msg.startsWith('INVITATION_') ? 409 : 500);
      return respondWithError(res, statusCode, msg);
    }
  });

  app.post('/api/invitations/:inviteId/decline', requireAuth, async (req, res) => {
    try {
      if (!isValidIdentifierParam(req.params.inviteId)) {
        return respondWithError(res, 404, 'INVITATION_NOT_FOUND');
      }
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`invitation_action:${user.uid}`, 10, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      const inviteRef = adminDb.collection(INVITATIONS_COL).doc(req.params.inviteId);
      const result = await adminDb.runTransaction(async (transaction) => {
        if (await isUserDeletionPending(adminDb, user.uid, transaction)) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        const invDoc = await transaction.get(inviteRef);
        if (!invDoc.exists) throw new Error('INVITATION_NOT_FOUND');
        const invitation = invDoc.data() as Invitation;

        if (await isUserDeletionPending(adminDb, invitation.p1Uid, transaction)) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        if (invitation.status !== 'pending') throw new Error(`INVITATION_${invitation.status.toUpperCase()}`);

        if (await isRelationshipDeletionPending(adminDb, invitation.recordId, transaction)) {
          throw new Error('RELATIONSHIP_DELETION_PENDING');
        }

        const declinerDoc = await transaction.get(adminDb.collection(USERS_COL).doc(user.uid));
        const declinerPhone = user.phone_number || (declinerDoc.exists && declinerDoc.data()?.whatsappTrusted ? declinerDoc.data()?.whatsappE164 : undefined);

        const recipientCheck = verifyRecipientIdentity({
          invitation,
          user: {
            uid: user.uid,
            email: user.email,
            email_verified: Boolean(user.email_verified),
            phone_number: declinerPhone
          },
          isAction: 'decline'
        });
        if (!recipientCheck.authorized) {
          throw new Error(recipientCheck.reason || 'INVITATION_IDENTITY_MISMATCH');
        }

        const blockDocId = `${user.uid}_${invitation.p1Uid}`;
        const blockRef = adminDb.collection(INVITATION_BLOCKS_COL).doc(blockDocId);
        const blockDoc = await transaction.get(blockRef);
        const existingBlock = blockDoc.exists ? blockDoc.data() : null;
        const declineCount = (existingBlock?.declineCount || 0) + 1;
        const nowIso = new Date().toISOString();

        const p2Hashes: string[] = [];
        if (user.email) {
          const c = normalizeCanonicalEmail(user.email).canonical;
          if (c) p2Hashes.push(hashContact(c));
        }
        if (declinerPhone) {
          const c = normalizeCanonicalPhone(declinerPhone).canonical;
          if (c) p2Hashes.push(hashContact(c));
        }
        if (invitation.partner2Email) {
          const c = normalizeCanonicalEmail(invitation.partner2Email).canonical;
          if (c) p2Hashes.push(hashContact(c));
        }
        if (invitation.partner2Phone) {
          const c = normalizeCanonicalPhone(invitation.partner2Phone, invitation.partner2PhoneCountry).canonical;
          if (c) p2Hashes.push(hashContact(c));
        }
        if (invitation.partner2Whatsapp) {
          const c = normalizeCanonicalPhone(invitation.partner2Whatsapp, invitation.partner2WhatsappCountry).canonical;
          if (c) p2Hashes.push(hashContact(c));
        }

        const p1UserDoc = await transaction.get(adminDb.collection(USERS_COL).doc(invitation.p1Uid));
        if (p1UserDoc.exists) {
          const p1Data = p1UserDoc.data();
          if (p1Data?.email) {
            const c = normalizeCanonicalEmail(p1Data.email).canonical;
            if (c) p2Hashes.push(hashContact(c));
          }
          if (p1Data?.phoneE164) {
            const c = normalizeCanonicalPhone(p1Data.phoneE164).canonical;
            if (c) p2Hashes.push(hashContact(c));
          }
          if (p1Data?.whatsappE164) {
            const c = normalizeCanonicalPhone(p1Data.whatsappE164).canonical;
            if (c) p2Hashes.push(hashContact(c));
          }
        }

        const combinedHashes = Array.from(new Set([...(existingBlock?.contactHashes || []), ...p2Hashes].filter(Boolean)));

        const shouldBlock = declineCount >= 3 || Boolean(req.body?.block);
        const isBlocked = Boolean(existingBlock?.blocked || shouldBlock);
        const blockedAt = isBlocked ? (existingBlock?.blockedAt || nowIso) : null;

        transaction.set(blockRef, {
          p2Uid: user.uid,
          p1Uid: invitation.p1Uid,
          p1DisplayName: invitation.inviterName || 'Partner',
          declineCount,
          blocked: isBlocked,
          blockedAt,
          contactHashes: combinedHashes,
          updatedAt: nowIso
        });

        const notifId = `${req.params.inviteId}_declined`;
        const notifRef = adminDb.collection(NOTIFICATIONS_COL).doc(notifId);
        const notification = {
          id: notifId,
          userId: invitation.p1Uid!,
          type: 'invitation_declined' as const,
          recordId: invitation.recordId,
          senderName: invitation.partner2Name,
          createdAt: nowIso,
          read: false,
          messageAr: `تم رفض دعوتك من ${invitation.partner2Name}`,
          messageEn: `${invitation.partner2Name} declined your invitation`
        };
        transaction.set(notifRef, notification);

        const p1Email = p1UserDoc.exists ? p1UserDoc.data()?.email : undefined;

        transaction.update(inviteRef, {
          status: 'declined',
          p2Uid: user.uid
        });
        return {
          invitation: { ...invitation, status: 'declined' as const, p2Uid: user.uid },
          blocked: isBlocked,
          p1Email,
          p1Uid: invitation.p1Uid!,
          notification
        };
      });

      await notifyP1OfInvitationDecision({
        inviteId: req.params.inviteId,
        p1Uid: result.p1Uid,
        p1Email: result.p1Email,
        notification: result.notification
      });

      return res.json({ success: true, invitation: result.invitation, blocked: result.blocked });
    } catch (error) {
      console.error('Error declining invitation:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const statusMap: Record<string, number> = {
        INVITATION_NOT_FOUND: 404,
        INVITATION_IDENTITY_MISMATCH: 403,
        VERIFICATION_REQUIRED: 403,
        INVALID_INVITATION_CONTACTS: 400,
        INVITER_CANNOT_DECLINE_AS_P2: 400,
        ACCOUNT_DELETION_PENDING: 409,
        RELATIONSHIP_DELETION_PENDING: 409
      };
      const statusCode = statusMap[msg] || 500;
      return respondWithError(res, statusCode, msg);
    }
  });

  app.post('/api/invitations/:inviteId/cancel', requireAuth, async (req, res) => {
    try {
      if (!isValidIdentifierParam(req.params.inviteId)) {
        return respondWithError(res, 404, 'INVITATION_NOT_FOUND');
      }
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`invitation_action:${user.uid}`, 10, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      const inviteRef = adminDb.collection(INVITATIONS_COL).doc(req.params.inviteId);
      const result = await adminDb.runTransaction(async (transaction) => {
        if (await isUserDeletionPending(adminDb, user.uid, transaction)) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        const invDoc = await transaction.get(inviteRef);
        if (!invDoc.exists) throw new Error('INVITATION_NOT_FOUND');
        const invitation = invDoc.data() as Invitation;
        if (invitation.p1Uid !== user.uid) throw new Error('NOT_INVITATION_OWNER');
        if (invitation.status !== 'pending') throw new Error(`INVITATION_${invitation.status.toUpperCase()}`);

        if (await isRelationshipDeletionPending(adminDb, invitation.recordId, transaction)) {
          throw new Error('RELATIONSHIP_DELETION_PENDING');
        }

        const relRef = adminDb.collection(RELATIONSHIPS_COL).doc(invitation.recordId);
        const relDoc = await transaction.get(relRef);
        let updatedRecord: RelationshipRecord | null = null;
        if (relDoc.exists) {
          const rec = relDoc.data() as RelationshipRecord;
          updatedRecord = {
            ...rec,
            status: 'draft',
            inviteId: undefined
          };
        }

        // WRITE PHASE: all reads and validations above must complete before writes
        transaction.update(inviteRef, { status: 'cancelled' });
        if (relDoc.exists) {
          transaction.update(relRef, {
            status: 'draft',
            inviteId: FieldValue.delete()
          });
        }
        return {
          invitation: { ...invitation, status: 'cancelled' as const },
          record: updatedRecord
        };
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const statusMap: Record<string, number> = {
        INVITATION_NOT_FOUND: 404,
        NOT_INVITATION_OWNER: 403,
        ACCOUNT_DELETION_PENDING: 409,
        RELATIONSHIP_DELETION_PENDING: 409
      };
      const statusCode = statusMap[msg] || (msg.startsWith('INVITATION_') ? 409 : 500);
      return respondWithError(res, statusCode, msg);
    }
  });

  app.patch(['/api/record/settings', '/api/certificates/:recordId/settings'], requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`record_settings:${user.uid}`, 20, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      const owned = await getOwnedRecord(user.uid);
      if (!owned) return res.status(404).json({ error: 'RELATIONSHIP_NOT_FOUND' });

      const { showSocialHandles, showContactDetails, showQrMatrix, publicContactSearchP1, publicContactSearchP2 } = req.body as Partial<CertificateSettings & { publicContactSearchP1?: boolean; publicContactSearchP2?: boolean }>;

      const relRef = adminDb.collection(RELATIONSHIPS_COL).doc(owned.id);

      const updatedSettings = await adminDb.runTransaction(async (transaction) => {
        if (await isUserDeletionPending(adminDb, user.uid, transaction)) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        if (await isRelationshipDeletionPending(adminDb, owned.id, transaction)) {
          throw new Error('RELATIONSHIP_DELETION_PENDING');
        }

        // Read phase
        const relDoc = await transaction.get(relRef);
        if (!relDoc.exists) throw new Error('RELATIONSHIP_NOT_FOUND');
        const currentRecord = relDoc.data() as RelationshipRecord;

        const isP1 = currentRecord.p1Uid === user.uid;
        const isP2 = currentRecord.p2Uid === user.uid;
        if (!isP1 && !isP2) throw new Error('NOT_RELATIONSHIP_PARTICIPANT');

        // Only the corresponding partner may change their own consent; preserve other partner's latest consent
        const newSettings = {
          showSocialHandles: typeof showSocialHandles === 'boolean' ? showSocialHandles : (currentRecord.settings?.showSocialHandles ?? true),
          showContactDetails: typeof showContactDetails === 'boolean' ? showContactDetails : (currentRecord.settings?.showContactDetails ?? true),
          showQrMatrix: typeof showQrMatrix === 'boolean' ? showQrMatrix : (currentRecord.settings?.showQrMatrix ?? true),
          publicContactSearchP1: currentRecord.settings?.publicContactSearchP1 ?? false,
          publicContactSearchP2: currentRecord.settings?.publicContactSearchP2 ?? false
        };

        if (isP1 && typeof publicContactSearchP1 === 'boolean') {
          newSettings.publicContactSearchP1 = publicContactSearchP1;
        }
        if (isP2 && typeof publicContactSearchP2 === 'boolean') {
          newSettings.publicContactSearchP2 = publicContactSearchP2;
        }

        const { hashes } = extractCanonicalContacts(currentRecord.partner1, currentRecord.partner2);
        const indexDocs: { ref: FirebaseFirestore.DocumentReference; doc: FirebaseFirestore.DocumentSnapshot; hash: string }[] = [];
        for (const h of hashes) {
          const indexRef = adminDb.collection(PUBLIC_CONTACT_INDEX_COL).doc(h);
          const indexDoc = await transaction.get(indexRef);
          indexDocs.push({ ref: indexRef, doc: indexDoc, hash: h });
        }

        // Write phase
        transaction.set(relRef, { settings: newSettings }, { merge: true });

        const bothConsented = Boolean(newSettings.publicContactSearchP1 && newSettings.publicContactSearchP2);
        const shouldPublish = currentRecord.status === 'active' && bothConsented;
        const stage = toCanonicalStage(currentRecord.type);
        const nowIso = new Date().toISOString();

        for (const item of indexDocs) {
          if (shouldPublish && stage) {
            // Write or update only if not owned by another relationship
            if (!item.doc.exists || (item.doc.data() as PublicContactIndexDoc).recordId === currentRecord.id) {
              transaction.set(item.ref, {
                recordId: currentRecord.id,
                contactHash: item.hash,
                stage,
                updatedAt: nowIso
              });
            }
          } else {
            // Remove old entry only if owned by this relationship
            if (item.doc.exists && (item.doc.data() as PublicContactIndexDoc).recordId === currentRecord.id) {
              transaction.delete(item.ref);
            }
          }
        }

        return newSettings;
      });

      return res.json({ success: true, settings: updatedSettings });
    } catch (error) {
      console.error('Error updating settings:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const status = msg === 'RELATIONSHIP_NOT_FOUND' ? 404 : msg === 'NOT_RELATIONSHIP_PARTICIPANT' ? 403 : 500;
      return respondWithError(res, status, msg);
    }
  });

  app.post('/api/verify/contact', async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!limiter(`verify_contact:${ip}`, 20, 60000)) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ found: false, stage: null });
      }
      if (!adminDb) {
        return res.status(503).json({ found: false, stage: null });
      }

      const { query } = req.body as { query?: string };
      const result = await verifyContactByQuery(adminDb, query);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Error verifying by contact:', error);
      return res.status(503).json({ found: false, stage: null });
    }
  });

  app.get('/api/verify/:refCode', async (req, res) => {
    try {
      if (!isValidRefCodeParam(req.params.refCode)) {
        return res.status(404).json({ found: false, message: 'No record found' });
      }
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!limiter(`verify_ref:${ip}`, 30, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const cleanRef = req.params.refCode.trim().toUpperCase();
      const certRef = adminDb.collection(CERTIFICATES_COL).doc(cleanRef);
      const certDoc = await certRef.get();
      if (certDoc.exists) {
        const raw = certDoc.data() || {};
        if (raw.status === 'active') {
          // Explicitly project only safe public verification fields (zero PII, zero internal UIDs)
          const safeRecord = {
            verificationRef: raw.verificationRef || cleanRef,
            recordNumber: raw.recordNumber || '',
            partner1Name: raw.partner1Name || '',
            partner2Name: raw.partner2Name || '',
            partner1En: raw.partner1En || null,
            partner2En: raw.partner2En || null,
            type: raw.type,
            startDate: raw.startDate,
            startDateAr: raw.startDateAr,
            status: 'active',
            issuedDate: raw.issuedDate,
            issuedDateAr: raw.issuedDateAr
          };
          return res.json({ found: true, record: safeRecord });
        }
      }
      return res.status(404).json({ found: false, message: 'No record found' });
    } catch (error) {
      console.error('Error verifying record:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.get('/api/change-requests', requireAuth, async (_req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const record = await getOwnedRecord(user.uid);
      if (!record || record.status !== 'active') {
        return res.json({ changeRequests: [] });
      }

      const snap = await adminDb
        .collection(CHANGE_REQUESTS_COL)
        .where('recordId', '==', record.id)
        .get();

      const changeRequests: ChangeRequestDoc[] = [];
      snap.forEach((doc) => {
        changeRequests.push(doc.data() as ChangeRequestDoc);
      });

      // Sort descending by requestedAt
      changeRequests.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());

      return res.json({ changeRequests });
    } catch (error) {
      console.error('Error fetching change requests:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.post('/api/change-requests', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`change_requests:${user.uid}`, 10, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }

      const { field, proposedValue } = req.body as {
        field?: string;
        proposedValue?: string;
      };

      if (!field || typeof proposedValue !== 'string') {
        return res.status(400).json({ error: 'INVALID_REQUEST_PARAMETERS' });
      }

      const changeValCheck = validateFieldLength(proposedValue, 'changeRequestValue', true);
      if (!changeValCheck.valid) return respondWithError(res, 400, changeValCheck.error);

      const cleanProposed = proposedValue.trim();

      const result = await adminDb.runTransaction(async (transaction) => {
        if (await isUserDeletionPending(adminDb, user.uid, transaction)) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        const userRef = adminDb.collection(USERS_COL).doc(user.uid);
        const userDoc = await transaction.get(userRef);
        const activeRecordId = userDoc.exists ? (userDoc.data()?.activeRecordId as string | undefined) : undefined;
        if (!activeRecordId) throw new Error('ACTIVE_RELATIONSHIP_NOT_FOUND');

        if (await isRelationshipDeletionPending(adminDb, activeRecordId, transaction)) {
          throw new Error('RELATIONSHIP_DELETION_PENDING');
        }

        const relRef = adminDb.collection(RELATIONSHIPS_COL).doc(activeRecordId);
        const relDoc = await transaction.get(relRef);
        if (!relDoc.exists) throw new Error('ACTIVE_RELATIONSHIP_NOT_FOUND');
        const record = relDoc.data() as RelationshipRecord;
        if (record.status !== 'active') throw new Error('ACTIVE_RELATIONSHIP_NOT_FOUND');

        const isP1 = record.p1Uid === user.uid;
        const isP2 = record.p2Uid === user.uid;
        if (!isP1 && !isP2) throw new Error('NOT_RELATIONSHIP_PARTICIPANT');

        const requesterRole: 'p1' | 'p2' = isP1 ? 'p1' : 'p2';
        const requesterName = isP1 ? record.partner1.fullName : record.partner2.fullName;
        const approverUid = isP1 ? record.p2Uid : record.p1Uid;

        if (!approverUid) throw new Error('NO_PARTNER_TO_APPROVE');

        let target: 'shared' | 'partner1_name' | 'partner2_name' = 'shared';
        let fieldLabelAr = '';
        let fieldLabelEn = '';
        let oldValue = '';
        let oldValueDisplayAr: string | undefined;
        let oldValueDisplayEn: string | undefined;
        let proposedValueDisplayAr: string | undefined;
        let proposedValueDisplayEn: string | undefined;

        if (field === 'type') {
          if (!['marriage', 'engagement', 'dating'].includes(cleanProposed)) {
            throw new Error('INVALID_RELATIONSHIP_TYPE');
          }
          oldValue = record.type;
          if (cleanProposed === oldValue) {
            throw new Error('VALUE_UNCHANGED');
          }
          fieldLabelAr = 'مرحلة العلاقة';
          fieldLabelEn = 'Relationship Stage';
          const typeNamesAr: Record<string, string> = { marriage: 'زواج', engagement: 'خطوبة', dating: 'تعارف' };
          const typeNamesEn: Record<string, string> = { marriage: 'Marriage', engagement: 'Engagement', dating: 'Dating' };
          oldValueDisplayAr = typeNamesAr[oldValue] || oldValue;
          oldValueDisplayEn = typeNamesEn[oldValue] || oldValue;
          proposedValueDisplayAr = typeNamesAr[cleanProposed] || cleanProposed;
          proposedValueDisplayEn = typeNamesEn[cleanProposed] || cleanProposed;
        } else if (field === 'startDate') {
          const todayIso = new Date().toISOString().slice(0, 10);
          if (!cleanProposed || cleanProposed > todayIso) {
            throw new Error('INVALID_START_DATE');
          }
          oldValue = record.startDateIso || record.startDate;
          if (cleanProposed === record.startDateIso) {
            throw new Error('VALUE_UNCHANGED');
          }
          fieldLabelAr = 'تاريخ البداية';
          fieldLabelEn = 'Start Date';
          oldValueDisplayAr = record.startDateAr;
          oldValueDisplayEn = record.startDate;
          proposedValueDisplayAr = formatDate(cleanProposed, 'ar');
          proposedValueDisplayEn = formatDate(cleanProposed, 'en');
        } else if (field === 'partner1FullName') {
          if (!isP1) throw new Error('CANNOT_EDIT_PARTNER_INFO');
          if (!cleanProposed) throw new Error('NAME_REQUIRED');
          oldValue = record.partner1.fullName;
          if (cleanProposed === oldValue) throw new Error('VALUE_UNCHANGED');
          target = 'partner1_name';
          fieldLabelAr = 'اسم الشريك الأول (في الشهادة)';
          fieldLabelEn = 'Partner 1 Name (on Certificate)';
          oldValueDisplayAr = oldValue;
          oldValueDisplayEn = oldValue;
          proposedValueDisplayAr = cleanProposed;
          proposedValueDisplayEn = cleanProposed;
        } else if (field === 'partner2FullName') {
          if (!isP2) throw new Error('CANNOT_EDIT_PARTNER_INFO');
          if (!cleanProposed) throw new Error('NAME_REQUIRED');
          oldValue = record.partner2.fullName;
          if (cleanProposed === oldValue) throw new Error('VALUE_UNCHANGED');
          target = 'partner2_name';
          fieldLabelAr = 'اسم الشريك الثاني (في الشهادة)';
          fieldLabelEn = 'Partner 2 Name (on Certificate)';
          oldValueDisplayAr = oldValue;
          oldValueDisplayEn = oldValue;
          proposedValueDisplayAr = cleanProposed;
          proposedValueDisplayEn = cleanProposed;
        } else {
          throw new Error('INVALID_CHANGE_FIELD');
        }

        const pendingLockRef = adminDb.collection(CHANGE_REQUESTS_COL).doc(`${record.id}_${field}_pending`);
        const pendingLockDoc = await transaction.get(pendingLockRef);
        if (pendingLockDoc.exists && pendingLockDoc.data()?.status === 'pending') {
          throw new Error('PENDING_CHANGE_REQUEST_EXISTS');
        }

        const requestId = randomId('cr', 12);
        const nowIso = new Date().toISOString();

        const newChangeRequest: ChangeRequestDoc = {
          id: requestId,
          recordId: record.id,
          verificationRef: record.verificationRef,
          requesterUid: user.uid,
          requesterRole,
          requesterName,
          approverUid,
          target,
          field: field as ChangeRequestDoc['field'],
          fieldLabelAr,
          fieldLabelEn,
          oldValue,
          oldValueDisplayAr,
          oldValueDisplayEn,
          proposedValue: cleanProposed,
          proposedValueDisplayAr,
          proposedValueDisplayEn,
          status: 'pending',
          requestedAt: nowIso
        };

        transaction.set(adminDb.collection(CHANGE_REQUESTS_COL).doc(requestId), newChangeRequest);
        transaction.set(pendingLockRef, {
          requestId,
          recordId: record.id,
          field,
          status: 'pending',
          updatedAt: nowIso
        });

        return newChangeRequest;
      });

      return res.json({ success: true, changeRequest: result });
    } catch (error) {
      console.error('Error creating change request:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const statusMap: Record<string, number> = {
        ACTIVE_RELATIONSHIP_NOT_FOUND: 404,
        NOT_RELATIONSHIP_PARTICIPANT: 403,
        NO_PARTNER_TO_APPROVE: 400,
        INVALID_REQUEST_PARAMETERS: 400,
        INVALID_RELATIONSHIP_TYPE: 400,
        INVALID_START_DATE: 400,
        VALUE_UNCHANGED: 400,
        CANNOT_EDIT_PARTNER_INFO: 403,
        NAME_REQUIRED: 400,
        INVALID_CHANGE_FIELD: 400,
        PENDING_CHANGE_REQUEST_EXISTS: 409,
        PENDING_REQUEST_EXISTS: 409,
        ACCOUNT_DELETION_PENDING: 409,
        RELATIONSHIP_DELETION_PENDING: 409
      };
      const statusCode = statusMap[msg] || 500;
      return respondWithError(res, statusCode, msg);
    }
  });

  app.post('/api/change-requests/:requestId/approve', requireAuth, async (req, res) => {
    try {
      if (!isValidIdentifierParam(req.params.requestId)) {
        return respondWithError(res, 404, 'REQUEST_NOT_FOUND');
      }
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`change_requests:${user.uid}`, 10, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      const reqId = req.params.requestId;
      const crRef = adminDb.collection(CHANGE_REQUESTS_COL).doc(reqId);

      const result = await adminDb.runTransaction(async (transaction) => {
        if (await isUserDeletionPending(adminDb, user.uid, transaction)) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        const crDoc = await transaction.get(crRef);
        if (!crDoc.exists) throw new Error('REQUEST_NOT_FOUND');
        const cr = crDoc.data() as ChangeRequestDoc;

        if (cr.status !== 'pending') throw new Error(`REQUEST_${cr.status.toUpperCase()}`);
        if (cr.approverUid !== user.uid) throw new Error('UNAUTHORIZED_APPROVER');

        if (await isRelationshipDeletionPending(adminDb, cr.recordId, transaction)) {
          throw new Error('RELATIONSHIP_DELETION_PENDING');
        }

        const relRef = adminDb.collection(RELATIONSHIPS_COL).doc(cr.recordId);
        const relDoc = await transaction.get(relRef);
        if (!relDoc.exists) throw new Error('RELATIONSHIP_NOT_FOUND');
        const record = relDoc.data() as RelationshipRecord;
        if (record.status !== 'active') throw new Error('RELATIONSHIP_NOT_ACTIVE');

        const { hashes } = extractCanonicalContacts(record.partner1, record.partner2);
        const indexDocs: { ref: FirebaseFirestore.DocumentReference; doc: FirebaseFirestore.DocumentSnapshot }[] = [];
        if (cr.field === 'type') {
          for (const h of hashes) {
            const indexRef = adminDb.collection(PUBLIC_CONTACT_INDEX_COL).doc(h);
            const indexDoc = await transaction.get(indexRef);
            indexDocs.push({ ref: indexRef, doc: indexDoc });
          }
        }

        const nowIso = new Date().toISOString();
        const updatedRecord: RelationshipRecord = { ...record };

        if (cr.field === 'type') {
          updatedRecord.type = cr.proposedValue as RelationshipType;
        } else if (cr.field === 'startDate') {
          updatedRecord.startDateIso = cr.proposedValue;
          updatedRecord.startDate = formatDate(cr.proposedValue, 'en');
          updatedRecord.startDateAr = formatDate(cr.proposedValue, 'ar');
        } else if (cr.field === 'partner1FullName') {
          updatedRecord.partner1 = { ...updatedRecord.partner1, fullName: cr.proposedValue };
        } else if (cr.field === 'partner2FullName') {
          updatedRecord.partner2 = { ...updatedRecord.partner2, fullName: cr.proposedValue };
        }

        transaction.set(relRef, updatedRecord);

        // Update public contact index if stage changed and both partners consented
        if (cr.field === 'type') {
          const bothConsented = Boolean(updatedRecord.settings?.publicContactSearchP1 && updatedRecord.settings?.publicContactSearchP2);
          const newStage = toCanonicalStage(updatedRecord.type);
          if (bothConsented && newStage) {
            for (const item of indexDocs) {
              if (item.doc.exists && (item.doc.data() as PublicContactIndexDoc).recordId === record.id) {
                transaction.set(item.ref, { stage: newStage, updatedAt: nowIso }, { merge: true });
              }
            }
          }
        }

        // Update public certificate projection
        if (record.verificationRef) {
          const certRef = adminDb.collection(CERTIFICATES_COL).doc(record.verificationRef);
          transaction.set(certRef, {
            type: updatedRecord.type,
            startDate: updatedRecord.startDate,
            startDateAr: updatedRecord.startDateAr,
            startDateIso: updatedRecord.startDateIso || null,
            partner1Name: updatedRecord.partner1.fullName,
            partner2Name: updatedRecord.partner2.fullName
          }, { merge: true });
        }

        // Update change request and release pending lock
        const updatedCr: ChangeRequestDoc = {
          ...cr,
          status: 'approved',
          decidedAt: nowIso,
          decisionByUid: user.uid
        };
        transaction.set(crRef, updatedCr);
        transaction.delete(adminDb.collection(CHANGE_REQUESTS_COL).doc(`${cr.recordId}_${cr.field}_pending`));

        return { record: updatedRecord, changeRequest: updatedCr };
      });

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error approving change request:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const statusMap: Record<string, number> = {
        REQUEST_NOT_FOUND: 404,
        RELATIONSHIP_NOT_FOUND: 404,
        UNAUTHORIZED_APPROVER: 403,
        REQUEST_APPROVED: 409,
        REQUEST_DECLINED: 409,
        RELATIONSHIP_NOT_ACTIVE: 409,
        ACCOUNT_DELETION_PENDING: 409,
        RELATIONSHIP_DELETION_PENDING: 409
      };
      const statusCode = statusMap[msg] || 500;
      return respondWithError(res, statusCode, msg);
    }
  });

  app.post('/api/change-requests/:requestId/decline', requireAuth, async (req, res) => {
    try {
      if (!isValidIdentifierParam(req.params.requestId)) {
        return respondWithError(res, 404, 'REQUEST_NOT_FOUND');
      }
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`change_requests:${user.uid}`, 10, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      const reqId = req.params.requestId;
      const crRef = adminDb.collection(CHANGE_REQUESTS_COL).doc(reqId);

      const result = await adminDb.runTransaction(async (transaction) => {
        if (await isUserDeletionPending(adminDb, user.uid, transaction)) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        const crDoc = await transaction.get(crRef);
        if (!crDoc.exists) throw new Error('REQUEST_NOT_FOUND');
        const cr = crDoc.data() as ChangeRequestDoc;

        if (cr.status !== 'pending') throw new Error(`REQUEST_${cr.status.toUpperCase()}`);
        if (cr.approverUid !== user.uid) throw new Error('UNAUTHORIZED_APPROVER');

        if (await isRelationshipDeletionPending(adminDb, cr.recordId, transaction)) {
          throw new Error('RELATIONSHIP_DELETION_PENDING');
        }

        const nowIso = new Date().toISOString();
        const updatedCr: ChangeRequestDoc = {
          ...cr,
          status: 'declined',
          decidedAt: nowIso,
          decisionByUid: user.uid
        };
        transaction.set(crRef, updatedCr);
        transaction.delete(adminDb.collection(CHANGE_REQUESTS_COL).doc(`${cr.recordId}_${cr.field}_pending`));

        return { changeRequest: updatedCr };
      });

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error declining change request:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const statusMap: Record<string, number> = {
        REQUEST_NOT_FOUND: 404,
        UNAUTHORIZED_APPROVER: 403,
        REQUEST_APPROVED: 409,
        REQUEST_DECLINED: 409,
        ACCOUNT_DELETION_PENDING: 409,
        RELATIONSHIP_DELETION_PENDING: 409
      };
      const statusCode = statusMap[msg] || 500;
      return respondWithError(res, statusCode, msg);
    }
  });

  app.get(['/api/profile', '/api/profile/me'], requireAuth, async (_req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const userDoc = await adminDb.collection(USERS_COL).doc(user.uid).get();
      const userData = userDoc.exists ? userDoc.data() : null;
      let profile = (userData?.profile as PartnerData | undefined) || null;

      const phoneFromAuth = user.phone_number || null;
      const phoneE164FromDoc = (userData?.phoneE164 as string | undefined) || null;
      const waE164FromDoc = (userData?.whatsappE164 as string | undefined) || null;
      const waTrustedFromDoc = Boolean(userData?.whatsappTrusted);

      const targetProfileWa = profile
        ? (profile.sameWhatsapp !== false ? (profile.phoneE164 || phoneFromAuth || waE164FromDoc) : (profile.whatsappE164 || profile.phoneE164))
        : null;
      const isWaVerified = Boolean(
        waTrustedFromDoc &&
        waE164FromDoc &&
        (!targetProfileWa || targetProfileWa === waE164FromDoc)
      );
      const isLegacyPhoneVerified = Boolean(phoneFromAuth && (!profile?.phoneE164 || profile.phoneE164 === phoneFromAuth));
      const isPhoneVerified = isLegacyPhoneVerified || isWaVerified;
      const effectivePhone = phoneFromAuth || (isWaVerified ? waE164FromDoc : null) || phoneE164FromDoc || profile?.phoneE164 || null;

      if (profile) {
        profile = {
          ...profile,
          email: profile.email || user.email || '',
          phoneVerified: isPhoneVerified,
          phoneE164: effectivePhone || undefined,
          whatsappTrusted: isWaVerified,
          whatsappVerifiedAt: isWaVerified ? (userData?.whatsappVerifiedAt as string | undefined) : undefined
        };
      } else if (user.email || phoneFromAuth || (waTrustedFromDoc && waE164FromDoc)) {
        const defaultPhone = phoneFromAuth || (isWaVerified ? waE164FromDoc : '') || '';
        profile = {
          fullName: user.name || '',
          birthDay: '',
          birthMonth: '',
          birthYear: '',
          email: user.email || '',
          phoneCountry: 'SA +966',
          phoneNumber: defaultPhone,
          phoneE164: defaultPhone || undefined,
          phoneVerified: isPhoneVerified,
          sameWhatsapp: true,
          whatsappCountry: 'SA +966',
          whatsappNumber: defaultPhone,
          whatsappTrusted: isWaVerified,
          whatsappE164: isWaVerified ? (waE164FromDoc || undefined) : undefined,
          whatsappVerifiedAt: isWaVerified ? (userData?.whatsappVerifiedAt as string | undefined) : undefined
        };
      }

      return res.json({
        success: true,
        profile,
        verification: {
          phoneVerified: isPhoneVerified,
          phoneE164: effectivePhone,
          emailVerified: Boolean(user.email_verified),
          email: user.email || null,
          whatsappTrusted: Boolean(isWaVerified || profile?.whatsappTrusted),
          whatsappE164: (isWaVerified && waE164FromDoc) || profile?.whatsappE164 || null
        }
      });
    } catch (err) {
      console.error('Error fetching user profile:', err);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.post(['/api/profile', '/api/profile/me'], requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`profile_save:${user.uid}`, 20, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }

      const body = req.body as Record<string, unknown>;
      const rawPartner = (body.partner || body.partner1 || body.profile || body) as Record<string, any>;

      if (rawPartner.fullName !== undefined) {
        const check = validateFieldLength(rawPartner.fullName, 'fullName', false, 100);
        if (!check.valid) return respondWithError(res, 400, check.error);
      }
      if (rawPartner.fullNameEn !== undefined) {
        const check = validateFieldLength(rawPartner.fullNameEn, 'fullNameEn', false, 100);
        if (!check.valid) return respondWithError(res, 400, check.error);
      }
      if (rawPartner.socialHandle !== undefined) {
        const check = validateFieldLength(rawPartner.socialHandle, 'socialHandle', false);
        if (!check.valid) return respondWithError(res, 400, check.error);
      }
      if (rawPartner.socialAccounts !== undefined) {
        const check = validateSocialAccounts(rawPartner.socialAccounts);
        if (!check.valid) return respondWithError(res, 400, check.error);
        rawPartner.socialAccounts = check.sanitized;
      }
      if (rawPartner.email !== undefined) {
        const check = validateFieldLength(rawPartner.email, 'email', false);
        if (!check.valid) return respondWithError(res, 400, check.error);
      }
      if (rawPartner.phoneNumber !== undefined || rawPartner.phoneE164 !== undefined) {
        const check = validateFieldLength(rawPartner.phoneNumber || rawPartner.phoneE164, 'phone', false);
        if (!check.valid) return respondWithError(res, 400, check.error);
      }
      if (rawPartner.whatsappNumber !== undefined || rawPartner.whatsappE164 !== undefined) {
        const check = validateFieldLength(rawPartner.whatsappNumber || rawPartner.whatsappE164, 'whatsapp', false);
        if (!check.valid) return respondWithError(res, 400, check.error);
      }

      const phoneCandidate = rawPartner.phoneE164 || rawPartner.phoneNumber;
      const phoneNorm = phoneCandidate ? normalizeCanonicalPhone(phoneCandidate, rawPartner.phoneCountry) : { isValid: false, canonical: null };
      const canonicalPhone = phoneNorm.canonical;

      // Authoritative verification: phone is verified ONLY if matching user.phone_number in auth token
      const isPhoneVerified = Boolean(canonicalPhone && user.phone_number && canonicalPhone === user.phone_number);

      const explicitSameWa = typeof rawPartner.sameWhatsapp === 'boolean' ? rawPartner.sameWhatsapp : undefined;
      const sameWa = explicitSameWa !== undefined
        ? explicitSameWa
        : Boolean(!rawPartner.whatsappNumber || rawPartner.whatsappNumber === rawPartner.phoneNumber);

      const waCandidate = sameWa ? canonicalPhone : (rawPartner.whatsappE164 || rawPartner.whatsappNumber);
      const waNorm = waCandidate ? normalizeCanonicalPhone(waCandidate, rawPartner.whatsappCountry || rawPartner.phoneCountry) : { isValid: false, canonical: null };
      const canonicalWa = waNorm.canonical;

      const userRef = adminDb.collection(USERS_COL).doc(user.uid);
      const owned = await getOwnedRecord(user.uid);

      const result = await adminDb.runTransaction(async (transaction) => {
        // Read 1: Account deletion guard
        const userDelRef = adminDb.collection(ACCOUNT_DELETIONS_COL).doc(user.uid);
        const userDelDoc = await transaction.get(userDelRef);
        if (userDelDoc.exists) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        // Read 2: User profile document
        const userDoc = await transaction.get(userRef);
        const userData = userDoc.exists ? userDoc.data() : null;

        // Read 3: Owned relationship and deletion guard
        let relRef: FirebaseFirestore.DocumentReference | null = null;
        let currentRel: RelationshipRecord | null = null;

        if (owned) {
          relRef = adminDb.collection(RELATIONSHIPS_COL).doc(owned.id);
          const relDoc = await transaction.get(relRef);
          if (relDoc.exists) {
            currentRel = relDoc.data() as RelationshipRecord;
            if (currentRel.status === 'active') {
              const isP1 = currentRel.p1Uid === user.uid;
              const currentPartner = isP1 ? currentRel.partner1 : currentRel.partner2;
              if (rawPartner.fullName && rawPartner.fullName !== currentPartner.fullName) {
                throw new Error('ACTIVE_RELATIONSHIP_LOCKED');
              }
              if (rawPartner.birthYear && rawPartner.birthYear !== currentPartner.birthYear) {
                throw new Error('ACTIVE_RELATIONSHIP_LOCKED');
              }
            } else if (currentRel.status === 'draft') {
              const relDelRef = adminDb.collection(RELATIONSHIP_DELETIONS_COL).doc(owned.id);
              const relDelDoc = await transaction.get(relDelRef);
              if (relDelDoc.exists) {
                throw new Error('RELATIONSHIP_DELETION_PENDING');
              }
            }
          }
        }

        // All reads complete. Compute WhatsApp and phone trust state based on transaction data:
        const isTwilioPhoneVerified = Boolean(
          canonicalPhone &&
          userData?.whatsappTrusted &&
          userData?.whatsappE164 === canonicalPhone
        );
        const isLegacyPhoneVerified = Boolean(
          canonicalPhone &&
          user.phone_number &&
          canonicalPhone === user.phone_number
        );
        const effectivePhoneVerified = isTwilioPhoneVerified || isLegacyPhoneVerified;

        // Label a number "Verified via WhatsApp" ONLY when server-authoritative evidence shows that exact number passed a WhatsApp check.
        // A legacy Firebase SMS verification (isLegacyPhoneVerified) must NEVER set whatsappTrusted: true, even if sameWa is true.
        // And verified mobile A must never mark a different WhatsApp B as trusted.
        const targetWa = sameWa ? canonicalPhone : canonicalWa;
        const isWaTrusted = Boolean(
          targetWa &&
          userData?.whatsappTrusted === true &&
          userData?.whatsappE164 === targetWa
        );
        const waVerifiedAt = isWaTrusted ? (userData?.whatsappVerifiedAt as string | undefined) : undefined;

        const existingProf = (userData?.profile as PartnerData | undefined) || (currentRel ? (currentRel.p1Uid === user.uid ? currentRel.partner1 : currentRel.partner2) : null);

        const fnVal = rawPartner.fullName !== undefined ? String(rawPartner.fullName).trim() : (existingProf?.fullName || '');
        const fnEnVal = rawPartner.fullNameEn !== undefined ? (rawPartner.fullNameEn ? String(rawPartner.fullNameEn).trim() : undefined) : existingProf?.fullNameEn;
        const bdVal = rawPartner.birthDay !== undefined ? String(rawPartner.birthDay).trim() : (existingProf?.birthDay || '');
        const bmVal = rawPartner.birthMonth !== undefined ? String(rawPartner.birthMonth).trim() : (existingProf?.birthMonth || '');
        const byVal = rawPartner.birthYear !== undefined ? String(rawPartner.birthYear).trim() : (existingProf?.birthYear || '');
        const emailVal = rawPartner.email !== undefined ? String(rawPartner.email).trim() : (existingProf?.email || user.email || '');
        const pcVal = rawPartner.phoneCountry !== undefined ? String(rawPartner.phoneCountry) : (existingProf?.phoneCountry || 'SA +966');
        const pnVal = rawPartner.phoneNumber !== undefined ? String(rawPartner.phoneNumber).trim() : (existingProf?.phoneNumber || '');
        const shVal = rawPartner.socialHandle !== undefined ? (rawPartner.socialHandle ? String(rawPartner.socialHandle).trim().replace(/^@/, '') : undefined) : existingProf?.socialHandle;
        const saVal = rawPartner.socialAccounts !== undefined ? (Array.isArray(rawPartner.socialAccounts) ? rawPartner.socialAccounts : undefined) : existingProf?.socialAccounts;
        const wcVal = rawPartner.whatsappCountry !== undefined ? (rawPartner.whatsappCountry ? String(rawPartner.whatsappCountry) : undefined) : existingProf?.whatsappCountry;
        const wnVal = rawPartner.whatsappNumber !== undefined ? (rawPartner.whatsappNumber ? String(rawPartner.whatsappNumber).trim() : undefined) : existingProf?.whatsappNumber;

        const nowIso = new Date().toISOString();
        const cleanProfile: PartnerData = {
          fullName: fnVal,
          fullNameEn: fnEnVal,
          birthDay: bdVal,
          birthMonth: bmVal,
          birthYear: byVal,
          email: emailVal,
          phoneCountry: pcVal,
          phoneNumber: pnVal,
          phoneE164: canonicalPhone || existingProf?.phoneE164,
          phoneVerified: effectivePhoneVerified,
          sameWhatsapp: sameWa,
          whatsappCountry: wcVal,
          whatsappNumber: wnVal,
          whatsappE164: canonicalWa || existingProf?.whatsappE164,
          whatsappTrusted: isWaTrusted,
          whatsappVerifiedAt: waVerifiedAt,
          socialAccounts: saVal,
          socialHandle: shVal
        };

        // Write phase:
        transaction.set(userRef, {
          profile: cleanProfile,
          phoneE164: effectivePhoneVerified ? canonicalPhone : (userData?.phoneE164 || null),
          whatsappE164: isWaTrusted ? canonicalWa : (userData?.whatsappE164 || null),
          whatsappTrusted: isWaTrusted,
          updatedAt: nowIso
        }, { merge: true });

        if (currentRel && currentRel.status === 'draft' && relRef) {
          const isP1 = currentRel.p1Uid === user.uid;
          if (isP1) {
            transaction.set(relRef, { partner1: { ...currentRel.partner1, ...cleanProfile }, updatedAt: nowIso }, { merge: true });
          } else {
            transaction.set(relRef, { partner2: { ...currentRel.partner2, ...cleanProfile }, updatedAt: nowIso }, { merge: true });
          }
        }

        return { cleanProfile, isPhoneVerified: effectivePhoneVerified, canonicalPhone, isWaTrusted, canonicalWa };
      });

      return res.json({
        success: true,
        profile: result.cleanProfile,
        verification: {
          phoneVerified: result.isPhoneVerified,
          phoneE164: result.canonicalPhone || null,
          whatsappTrusted: result.isWaTrusted,
          whatsappE164: result.canonicalWa || null
        }
      });
    } catch (err) {
      console.error('Error saving personal profile:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'ACCOUNT_DELETION_PENDING' || msg === 'RELATIONSHIP_DELETION_PENDING') {
        return respondWithError(res, 409, msg);
      }
      if (msg === 'ACTIVE_RELATIONSHIP_LOCKED') {
        return respondWithError(res, 403, msg);
      }
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.post('/api/profile/sync-verification', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const userRef = adminDb.collection(USERS_COL).doc(user.uid);
      const userDelRef = adminDb.collection(ACCOUNT_DELETIONS_COL).doc(user.uid);

      await adminDb.runTransaction(async (transaction) => {
        // Read 1: Check account deletion guard before any write
        const userDelDoc = await transaction.get(userDelRef);
        if (userDelDoc.exists) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        // Read 2: User document
        const userDoc = await transaction.get(userRef);
        const userData = userDoc.exists ? userDoc.data() : null;
        const nowIso = new Date().toISOString();

        const updateData: Record<string, any> = { updatedAt: nowIso };

        const effectiveSyncPhone = user.phone_number || (userData?.whatsappTrusted ? userData?.whatsappE164 : null);

        if (effectiveSyncPhone) {
          updateData.phoneE164 = effectiveSyncPhone;
          updateData.phoneVerified = true;
          updateData.phoneVerifiedAt = nowIso;
        }

        if (userData?.profile) {
          const existingProfile = { ...userData.profile };
          if (effectiveSyncPhone) {
            existingProfile.phoneE164 = effectiveSyncPhone;
            existingProfile.phoneVerified = true;
            const targetWa = existingProfile.sameWhatsapp !== false
              ? effectiveSyncPhone
              : (existingProfile.whatsappE164 || effectiveSyncPhone);
            const isWaGenuinelyTrusted = Boolean(
              userData?.whatsappTrusted === true &&
              userData?.whatsappE164 &&
              userData.whatsappE164 === targetWa
            );
            if (isWaGenuinelyTrusted) {
              existingProfile.whatsappE164 = userData?.whatsappE164;
              existingProfile.whatsappTrusted = true;
            } else {
              existingProfile.whatsappTrusted = false;
              delete existingProfile.whatsappVerifiedAt;
            }
          }
          updateData.profile = existingProfile;
        }

        transaction.set(userRef, updateData, { merge: true });
      });

      return res.json({
        success: true,
        phone_number: user.phone_number || null,
        email_verified: Boolean(user.email_verified)
      });
    } catch (err: any) {
      console.error('Error syncing verification:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'ACCOUNT_DELETION_PENDING') {
        return respondWithError(res, 409, 'ACCOUNT_DELETION_PENDING');
      }
      return respondWithError(res, 500, 'INTERNAL_ERROR');
    }
  });

  app.patch(['/api/profile/me', '/api/account/personal-info'], requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`profile_update:${user.uid}`, 20, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      const owned = await getOwnedRecord(user.uid);
      if (!owned || owned.status !== 'active') {
        return res.status(404).json({ error: 'ACTIVE_RELATIONSHIP_NOT_FOUND' });
      }

      const isP1 = owned.p1Uid === user.uid;
      const isP2 = owned.p2Uid === user.uid;
      if (!isP1 && !isP2) {
        return res.status(403).json({ error: 'NOT_RELATIONSHIP_PARTICIPANT' });
      }

      // Check if body attempts to target partner fields directly
      const body = req.body as Record<string, unknown>;
      delete (body as any).whatsappTrusted;
      delete (body as any).whatsappVerifiedAt;
      if (isP1 && (body.partner2 || body.partner2FullName || body.target === 'partner2')) {
        return res.status(403).json({ error: 'CANNOT_EDIT_PARTNER_INFO' });
      }
      if (isP2 && (body.partner1 || body.partner1FullName || body.target === 'partner1')) {
        return res.status(403).json({ error: 'CANNOT_EDIT_PARTNER_INFO' });
      }

      const { socialHandle, socialAccounts, fullNameEn, whatsappNumber, whatsappCountry } = req.body as {
        socialHandle?: string;
        socialAccounts?: unknown;
        fullNameEn?: string;
        whatsappNumber?: string;
        whatsappCountry?: string;
      };

      if (socialHandle !== undefined) {
        const check = validateFieldLength(socialHandle, 'socialHandle', false);
        if (!check.valid) return respondWithError(res, 400, check.error);
      }
      if (socialAccounts !== undefined) {
        const check = validateSocialAccounts(socialAccounts);
        if (!check.valid) return respondWithError(res, 400, check.error);
      }
      if (fullNameEn !== undefined) {
        const check = validateFieldLength(fullNameEn, 'fullNameEn', false, 100);
        if (!check.valid) return respondWithError(res, 400, check.error);
      }
      if (whatsappNumber !== undefined) {
        const check = validateFieldLength(whatsappNumber, 'whatsapp', false);
        if (!check.valid) return respondWithError(res, 400, check.error);
      }

      const relRef = adminDb.collection(RELATIONSHIPS_COL).doc(owned.id);

      const result = await adminDb.runTransaction(async (transaction) => {
        if (await isUserDeletionPending(adminDb, user.uid, transaction)) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        if (await isRelationshipDeletionPending(adminDb, owned.id, transaction)) {
          throw new Error('RELATIONSHIP_DELETION_PENDING');
        }

        const relDoc = await transaction.get(relRef);
        if (!relDoc.exists) throw new Error('ACTIVE_RELATIONSHIP_NOT_FOUND');
        const record = relDoc.data() as RelationshipRecord;
        if (record.status !== 'active') throw new Error('ACTIVE_RELATIONSHIP_NOT_FOUND');

        const currentPartner = isP1 ? record.partner1 : record.partner2;
        const targetCountry = whatsappCountry !== undefined ? whatsappCountry : currentPartner.whatsappCountry;

        let waNorm: { canonical: string; isValid: boolean } | null = null;
        let newHash: string | null = null;
        let newResRef: FirebaseFirestore.DocumentReference | null = null;

        if (whatsappNumber !== undefined) {
          if (whatsappNumber.trim() === '') {
            waNorm = { canonical: '', isValid: true };
          } else {
            waNorm = normalizeCanonicalPhone(whatsappNumber, targetCountry);
            if (!waNorm.isValid) throw new Error('INVALID_PHONE_NUMBER');
            newHash = hashContact(waNorm.canonical);
            newResRef = adminDb.collection(CONTACT_RESERVATIONS_COL).doc(newHash);
            const newResDoc = await transaction.get(newResRef);
            if (newResDoc.exists) {
              const data = newResDoc.data() as { recordId: string };
              if (data.recordId !== record.id) {
                throw new Error('CONTACT_IN_ACTIVE_RELATIONSHIP');
              }
            }
          }
        }

        // Old WhatsApp reservation check
        const oldWaCanonical = currentPartner.whatsappE164 || (currentPartner.whatsappNumber ? normalizeCanonicalPhone(currentPartner.whatsappNumber, currentPartner.whatsappCountry).canonical : '');
        const oldHash = oldWaCanonical ? hashContact(oldWaCanonical) : null;
        let oldResDoc: FirebaseFirestore.DocumentSnapshot | null = null;
        if (oldHash && oldHash !== newHash) {
          const oldResRef = adminDb.collection(CONTACT_RESERVATIONS_COL).doc(oldHash);
          oldResDoc = await transaction.get(oldResRef);
        }

        // Read public contact index entries before writes
        let newIndexDoc: FirebaseFirestore.DocumentSnapshot | null = null;
        let newIndexRef: FirebaseFirestore.DocumentReference | null = null;
        if (newHash) {
          newIndexRef = adminDb.collection(PUBLIC_CONTACT_INDEX_COL).doc(newHash);
          newIndexDoc = await transaction.get(newIndexRef);
        }

        let oldIndexDoc: FirebaseFirestore.DocumentSnapshot | null = null;
        let oldIndexRef: FirebaseFirestore.DocumentReference | null = null;
        if (oldHash && oldHash !== newHash) {
          oldIndexRef = adminDb.collection(PUBLIC_CONTACT_INDEX_COL).doc(oldHash);
          oldIndexDoc = await transaction.get(oldIndexRef);
        }

        const userRef = adminDb.collection(USERS_COL).doc(user.uid);
        const userDoc = await transaction.get(userRef);

        // READ PHASE IS FINISHED. NOW WRITE PHASE:
        const nowIso = new Date().toISOString();
        const updatedRecord: RelationshipRecord = { ...record };
        const updatedPartner = isP1 ? { ...updatedRecord.partner1 } : { ...updatedRecord.partner2 };

        if (socialAccounts !== undefined) {
          const check = validateSocialAccounts(socialAccounts);
          updatedPartner.socialAccounts = check.sanitized;
          if (check.sanitized && check.sanitized.length > 0) {
            updatedPartner.socialHandle = check.sanitized[0].handle.replace(/^@/, '');
          } else if (Array.isArray(socialAccounts) && socialAccounts.length === 0) {
            updatedPartner.socialHandle = undefined;
          }
        } else if (socialHandle !== undefined) {
          updatedPartner.socialHandle = socialHandle ? socialHandle.trim().replace(/^@/, '') : undefined;
        }
        if (fullNameEn !== undefined) {
          updatedPartner.fullNameEn = fullNameEn.trim() || undefined;
        }
        if (whatsappNumber !== undefined) {
          updatedPartner.whatsappNumber = whatsappNumber.trim();
          if (whatsappCountry !== undefined) {
            updatedPartner.whatsappCountry = whatsappCountry.trim();
          }
          if (waNorm?.canonical) {
            updatedPartner.whatsappE164 = waNorm.canonical;
            const isTwilioVerified = Boolean(
              userDoc.exists &&
              userDoc.data()?.whatsappE164 === waNorm.canonical &&
              userDoc.data()?.whatsappTrusted === true
            );
            if (isTwilioVerified) {
              updatedPartner.whatsappTrusted = true;
              updatedPartner.whatsappVerifiedAt = userDoc.data()?.whatsappVerifiedAt;
            } else {
              updatedPartner.whatsappTrusted = false;
              updatedPartner.whatsappVerifiedAt = undefined;
              transaction.set(userRef, { whatsappTrusted: false, updatedAt: nowIso }, { merge: true });
            }
          } else {
            updatedPartner.whatsappE164 = undefined;
            updatedPartner.whatsappTrusted = false;
            updatedPartner.whatsappVerifiedAt = undefined;
            transaction.set(userRef, { whatsappTrusted: false, updatedAt: nowIso }, { merge: true });
          }
        }

        if (isP1) {
          updatedRecord.partner1 = updatedPartner;
        } else {
          updatedRecord.partner2 = updatedPartner;
        }

        transaction.set(relRef, updatedRecord);

        // If new WhatsApp has a canonical reservation, write it
        if (newResRef && newHash) {
          transaction.set(newResRef, {
            recordId: record.id,
            contactHash: newHash,
            updatedAt: nowIso
          });
        }

        // Maintain public contact index
        const bothConsented = Boolean(record.settings?.publicContactSearchP1 && record.settings?.publicContactSearchP2);
        const stage = toCanonicalStage(record.type);

        if (bothConsented && stage && newIndexRef && newHash) {
          if (!newIndexDoc?.exists || newIndexDoc.data()?.recordId === record.id) {
            transaction.set(newIndexRef, {
              recordId: record.id,
              contactHash: newHash,
              stage,
              updatedAt: nowIso
            });
          }
        }

        // If old WhatsApp was replaced/removed, release it only if not still used by the relationship
        if (oldHash && oldResDoc && oldResDoc.exists && oldResDoc.data()?.recordId === record.id) {
          const stillUsed = isContactStillUsedByRelationship(oldWaCanonical, updatedRecord.partner1, updatedRecord.partner2);
          if (!stillUsed) {
            transaction.delete(adminDb.collection(CONTACT_RESERVATIONS_COL).doc(oldHash));
            if (oldIndexRef && oldIndexDoc && oldIndexDoc.exists && oldIndexDoc.data()?.recordId === record.id) {
              transaction.delete(oldIndexRef);
            }
          }
        }

        if (record.verificationRef && fullNameEn !== undefined) {
          const certRef = adminDb.collection(CERTIFICATES_COL).doc(record.verificationRef);
          transaction.set(certRef, {
            partner1En: updatedRecord.partner1.fullNameEn || null,
            partner2En: updatedRecord.partner2.fullNameEn || null
          }, { merge: true });
        }

        return updatedRecord;
      });

      return res.json({ success: true, record: result });
    } catch (error) {
      console.error('Error updating personal profile:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const statusMap: Record<string, number> = {
        ACTIVE_RELATIONSHIP_NOT_FOUND: 404,
        NOT_RELATIONSHIP_PARTICIPANT: 403,
        CANNOT_EDIT_PARTNER_INFO: 403,
        CONTACT_IN_ACTIVE_RELATIONSHIP: 409,
        ACCOUNT_DELETION_PENDING: 409,
        RELATIONSHIP_DELETION_PENDING: 409,
        INVALID_PHONE_NUMBER: 400
      };
      const statusCode = statusMap[msg] || 500;
      return respondWithError(res, statusCode, msg);
    }
  });

  app.post('/api/relationship/end', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`end_relationship:${user.uid}`, 3, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      const requestedId = typeof req.body?.relationshipId === 'string' && req.body.relationshipId.trim()
        ? req.body.relationshipId.trim()
        : null;

      let record: RelationshipRecord | null = null;

      if (requestedId) {
        const relDoc = await adminDb.collection(RELATIONSHIPS_COL).doc(requestedId).get();
        if (relDoc.exists) {
          record = relDoc.data() as RelationshipRecord;
        } else {
          return res.status(404).json({ error: 'ACTIVE_RELATIONSHIP_NOT_FOUND' });
        }
      } else {
        record = await getOwnedRecord(user.uid);
        if (!record || (record.status !== 'active' && record.status !== 'deleting')) {
          const p1Deleting = await adminDb.collection(RELATIONSHIPS_COL)
            .where('p1Uid', '==', user.uid)
            .where('status', '==', 'deleting')
            .limit(1)
            .get();
          if (!p1Deleting.empty) {
            record = p1Deleting.docs[0].data() as RelationshipRecord;
          } else {
            const p2Deleting = await adminDb.collection(RELATIONSHIPS_COL)
              .where('p2Uid', '==', user.uid)
              .where('status', '==', 'deleting')
              .limit(1)
              .get();
            if (!p2Deleting.empty) {
              record = p2Deleting.docs[0].data() as RelationshipRecord;
            }
          }
        }
      }

      if (!record || (record.status !== 'active' && record.status !== 'deleting')) {
        return res.status(404).json({ error: 'ACTIVE_RELATIONSHIP_NOT_FOUND' });
      }

      if (record.p1Uid !== user.uid && record.p2Uid !== user.uid) {
        return res.status(403).json({ error: 'NOT_RELATIONSHIP_PARTICIPANT' });
      }

      if (requestedId && record.id !== requestedId) {
        return res.status(403).json({ error: 'RELATIONSHIP_MISMATCH' });
      }

      const result = await terminateActiveRelationship(
        adminDb,
        user.uid,
        record.id,
        'unilateral_end'
      );

      return res.json({ success: true, deleted: true, recordId: result.recordId });
    } catch (error) {
      console.error('Error ending relationship:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const statusMap: Record<string, number> = {
        NOT_RELATIONSHIP_PARTICIPANT: 403,
        ACTIVE_RELATIONSHIP_NOT_FOUND: 404,
        RELATIONSHIP_MISMATCH: 403
      };
      const statusCode = statusMap[msg] || 500;
      return respondWithError(res, statusCode, msg);
    }
  });

  app.get('/api/account/export', requireAuth, async (_req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`export_data:${user.uid}`, 3, 3600000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }

      // 1. Profile: users/{user.uid}
      const userDocSnap = await adminDb.collection(USERS_COL).doc(user.uid).get();
      let profile: Record<string, any> | null = null;
      if (userDocSnap.exists) {
        const raw = userDocSnap.data() || {};
        profile = Object.fromEntries(
          Object.entries(raw).filter(([k]) => !k.endsWith('Hash') && !k.endsWith('Hashes'))
        );
      }

      // 2. Relationships: p1Uid == uid (limit 100) and p2Uid == uid (limit 100)
      const [p1RelSnap, p2RelSnap] = await Promise.all([
        adminDb.collection(RELATIONSHIPS_COL).where('p1Uid', '==', user.uid).limit(100).get(),
        adminDb.collection(RELATIONSHIPS_COL).where('p2Uid', '==', user.uid).limit(100).get()
      ]);
      const relMap = new Map<string, any>();
      for (const doc of p1RelSnap.docs) {
        relMap.set(doc.id, { id: doc.id, ...doc.data() });
      }
      for (const doc of p2RelSnap.docs) {
        relMap.set(doc.id, { id: doc.id, ...doc.data() });
      }

      const relationships = Array.from(relMap.values()).map((record) => {
        const isP1 = record.p1Uid === user.uid;
        const ownRole: 'p1' | 'p2' = isP1 ? 'p1' : 'p2';
        const ownProfile = isP1 ? record.partner1 : record.partner2;
        const otherRaw = isP1 ? record.partner2 : record.partner1;
        const otherPartner = {
          fullName: otherRaw?.fullName || '',
          fullNameEn: otherRaw?.fullNameEn || ''
        };
        return {
          id: record.id,
          recordNumber: record.recordNumber || '',
          verificationRef: record.verificationRef || '',
          type: record.type,
          startDate: record.startDate || '',
          startDateAr: record.startDateAr || '',
          startDateIso: record.startDateIso || '',
          issuedDate: record.issuedDate || '',
          issuedDateAr: record.issuedDateAr || '',
          status: record.status,
          createdAt: record.createdAt || '',
          settings: record.settings || {},
          ownRole,
          ownProfile,
          otherPartner
        };
      });

      // 3. Invitations: p1Uid == uid (limit 200) and p2Uid == uid (limit 200)
      const [p1InvSnap, p2InvSnap] = await Promise.all([
        adminDb.collection(INVITATIONS_COL).where('p1Uid', '==', user.uid).limit(200).get(),
        adminDb.collection(INVITATIONS_COL).where('p2Uid', '==', user.uid).limit(200).get()
      ]);
      const invMap = new Map<string, any>();
      for (const doc of p1InvSnap.docs) {
        invMap.set(doc.id, { id: doc.id, ...doc.data() });
      }
      for (const doc of p2InvSnap.docs) {
        invMap.set(doc.id, { id: doc.id, ...doc.data() });
      }
      const invitations = Array.from(invMap.values()).map((raw) => {
        const invitedMe = Boolean(raw.p2Uid === user.uid);
        const cleaned: Record<string, any> = {
          invitedMe
        };
        for (const [k, v] of Object.entries(raw)) {
          if (k === 'p1Uid' || k === 'p2Uid' || k.endsWith('Hash') || k.endsWith('Hashes')) {
            continue;
          }
          if (!invitedMe && (
            k === 'partner2Email' ||
            k === 'partner2Phone' ||
            k === 'partner2PhoneCountry' ||
            k === 'partner2Whatsapp' ||
            k === 'partner2WhatsappCountry'
          )) {
            continue;
          }
          cleaned[k] = v;
        }
        return cleaned;
      });

      // 4. Change Requests: recordId == <id> (limit 100), once per relationship id, up to first 20
      const relIds = Array.from(relMap.keys()).slice(0, 20);
      const crMap = new Map<string, any>();
      if (relIds.length > 0) {
        const crSnaps = await Promise.all(
          relIds.map((relId) =>
            adminDb.collection(CHANGE_REQUESTS_COL).where('recordId', '==', relId).limit(100).get()
          )
        );
        for (const snap of crSnaps) {
          for (const doc of snap.docs) {
            crMap.set(doc.id, { id: doc.id, ...doc.data() });
          }
        }
      }
      const changeRequests = Array.from(crMap.values()).map((cr) => ({
        id: cr.id,
        recordId: cr.recordId,
        field: cr.field,
        fieldLabelEn: cr.fieldLabelEn || '',
        fieldLabelAr: cr.fieldLabelAr || '',
        oldValue: cr.oldValue,
        proposedValue: cr.proposedValue,
        status: cr.status,
        requestedAt: cr.requestedAt || '',
        decidedAt: cr.decidedAt || null,
        requestedByMe: cr.requesterUid === user.uid
      }));

      // 5. Notifications: userId == uid (limit 500)
      const notifSnap = await adminDb.collection(NOTIFICATIONS_COL)
        .where('userId', '==', user.uid)
        .limit(500)
        .get();
      const notifications = notifSnap.docs.map((doc) => {
        const n = doc.data();
        return {
          id: doc.id,
          type: n.type,
          recordId: n.recordId || null,
          messageEn: n.messageEn || '',
          messageAr: n.messageAr || '',
          secondaryEn: n.secondaryEn || null,
          secondaryAr: n.secondaryAr || null,
          createdAt: n.createdAt || '',
          read: Boolean(n.read)
        };
      });

      // 6. Invitation Blocks: p2Uid == uid, blocked == true
      const blocksSnap = await adminDb.collection(INVITATION_BLOCKS_COL)
        .where('p2Uid', '==', user.uid)
        .where('blocked', '==', true)
        .get();
      const invitationBlocks = blocksSnap.docs.map((doc) => {
        const d = doc.data();
        return {
          p1Uid: d.p1Uid,
          p1DisplayName: d.p1DisplayName || '',
          blockedAt: d.blockedAt || null
        };
      });

      return res.json({
        success: true,
        exportedAt: new Date().toISOString(),
        legalVersionAtExport: CURRENT_LEGAL_VERSION,
        data: {
          profile,
          relationships,
          invitations,
          changeRequests,
          notifications,
          invitationBlocks
        }
      });
    } catch (error) {
      console.error('Error exporting account data:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.post('/api/account/delete', requireAuth, async (req, res) => {
    let authDeleted = false;
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);

      const authTimeSec = typeof user.auth_time === 'number' ? user.auth_time : 0;
      const nowSec = Math.floor(Date.now() / 1000);
      const diffSec = nowSec - authTimeSec;
      if (!authTimeSec || diffSec < 0 || diffSec > 300) {
        return respondWithError(res, 401, 'REAUTH_REQUIRED');
      }

      if (!limiter(`delete_account:${user.uid}`, 3, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      const record = await getOwnedRecord(user.uid);

      if (req.body?.relationshipId && record && req.body.relationshipId !== record.id) {
        return res.status(403).json({ error: 'RELATIONSHIP_MISMATCH' });
      }

      // 1. Persist minimal durable deletion progress BEFORE discovery and cleanup (zero PII)
      const delRef = adminDb.collection(ACCOUNT_DELETIONS_COL).doc(user.uid);
      const nowIso = new Date().toISOString();
      await delRef.set({
        uid: user.uid,
        status: 'pending_cleanup',
        createdAt: nowIso,
        updatedAt: nowIso
      });

      // 2. Discover and permanently terminate/clean all relationships owned or participated by the user
      while (true) {
        const p1Snap = await adminDb.collection(RELATIONSHIPS_COL)
          .where('p1Uid', '==', user.uid)
          .limit(50)
          .get();
        if (p1Snap.empty) break;
        for (const relDoc of p1Snap.docs) {
          await terminateActiveRelationship(adminDb, user.uid, relDoc.id, 'account_deletion');
        }
      }

      while (true) {
        const p2Snap = await adminDb.collection(RELATIONSHIPS_COL)
          .where('p2Uid', '==', user.uid)
          .limit(50)
          .get();
        if (p2Snap.empty) break;
        for (const relDoc of p2Snap.docs) {
          await terminateActiveRelationship(adminDb, user.uid, relDoc.id, 'account_deletion');
        }
      }

      // 3. Advance progress state before Auth deletion
      await delRef.update({
        status: 'pending_auth_deletion',
        updatedAt: new Date().toISOString()
      });

      // 4. Delete the requesting user from Firebase Auth
      if (adminAuth) {
        try {
          await adminAuth.deleteUser(user.uid);
          authDeleted = true;
        } catch (authErr: any) {
          if (authErr?.code === 'auth/user-not-found') {
            // User already missing from Auth - proceed safely
            authDeleted = true;
          } else {
            // Check if user still exists in Auth (handles timeouts/disconnects where deletion succeeded)
            try {
              await adminAuth.getUser(user.uid);
              // User still exists in Auth - deletion did not complete
              console.error('Auth user deletion failed during account delete');
              return respondWithError(res, 500, 'ACCOUNT_DELETION_FAILED');
            } catch (getErr: any) {
              if (getErr?.code === 'auth/user-not-found') {
                // User was actually deleted in Auth
                authDeleted = true;
              } else {
                console.error('Auth user verification failed after timeout');
                return respondWithError(res, 500, 'ACCOUNT_DELETION_FAILED');
              }
            }
          }
        }
      }

      // 5. Advance progress state to Firestore cleanup
      await delRef.update({
        status: 'pending_firestore_cleanup',
        updatedAt: new Date().toISOString()
      });

      // 6. Delete ONLY the requesting user's Firestore document & invitation blocks & invitations
      await cleanUserInvitationsInBatches(adminDb, user.uid);
      await cleanUserBlocksInBatches(adminDb, user.uid);
      await cleanUserRemindersInBatches(adminDb, user.uid);
      await adminDb.collection(USERS_COL).doc(user.uid).delete();
      await adminDb.collection(WHATSAPP_VERIFY_ATTEMPTS_COL).doc(user.uid).delete();
      await adminDb.collection(WHATSAPP_VERIFY_LIMITS_COL).doc(user.uid).delete();

      // 7. Delete temporary progress document after successful completion
      await delRef.delete();

      return res.json({ success: true, message: 'ACCOUNT_DELETED' });
    } catch (error) {
      console.error('Error deleting account:', error);
      if (authDeleted) {
        return res.status(202).json({
          success: true,
          status: 'DELETION_PENDING',
          messageEn: 'Your account was deleted. Remaining data will be removed automatically.',
          messageAr: 'تم حذف حسابك. سيتم حذف البيانات المتبقية تلقائياً.'
        });
      }
      return respondWithError(res, 500, 'ACCOUNT_DELETION_FAILED');
    }
  });

  app.get('/api/notifications', requireAuth, async (_req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const snap = await adminDb.collection(NOTIFICATIONS_COL)
        .where('userId', '==', user.uid)
        .where('read', '==', false)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      const notifications: AppNotification[] = [];
      snap.forEach((doc) => {
        notifications.push(doc.data() as AppNotification);
      });
      return res.json({ notifications });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.post('/api/notifications/:id/dismiss', requireAuth, async (req, res) => {
    try {
      if (!isValidIdentifierParam(req.params.id)) {
        return respondWithError(res, 404, 'NOTIFICATION_NOT_FOUND');
      }
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`dismiss_notification:${user.uid}`, 60, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      const notifRef = adminDb.collection(NOTIFICATIONS_COL).doc(req.params.id);
      const notifDoc = await notifRef.get();
      if (!notifDoc.exists) return res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND' });
      const notif = notifDoc.data() as AppNotification;
      if (notif.userId !== user.uid) return res.status(403).json({ error: 'UNAUTHORIZED' });

      await notifRef.update({ read: true });
      return res.json({ success: true });
    } catch (error) {
      console.error('Error dismissing notification:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.get('/api/blocks', requireAuth, async (_req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const snap = await adminDb.collection(INVITATION_BLOCKS_COL)
        .where('p2Uid', '==', user.uid)
        .where('blocked', '==', true)
        .get();
      const blocks = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          p1Uid: d.p1Uid,
          p1DisplayName: d.p1DisplayName || '',
          blockedAt: d.blockedAt || null
        };
      });
      return res.json({ blocks });
    } catch (error) {
      console.error('Error fetching blocks:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.delete('/api/blocks/:p1Uid', requireAuth, async (req, res) => {
    try {
      if (!isValidIdentifierParam(req.params.p1Uid)) {
        return respondWithError(res, 404, 'BLOCK_NOT_FOUND');
      }
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`delete_block:${user.uid}`, 10, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      const targetP1Uid = req.params.p1Uid;
      const docId = `${user.uid}_${targetP1Uid}`;
      const docRef = adminDb.collection(INVITATION_BLOCKS_COL).doc(docId);
      const docSnap = await docRef.get();
      if (!docSnap.exists || docSnap.data()?.p2Uid !== user.uid) {
        return res.status(404).json({ error: 'BLOCK_NOT_FOUND' });
      }
      await docRef.delete();
      return res.json({ success: true });
    } catch (error) {
      console.error('Error deleting block:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  // --- REMINDER API ENDPOINTS ---

  app.get('/api/reminders/settings', requireAuth, async (_req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const docRef = adminDb.collection(REMINDER_SETTINGS_COL).doc(user.uid);
      const docSnap = await docRef.get();

      const serverEmailConfigured = Boolean(process.env.RESEND_API_KEY);
      const serverPushConfigured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
      const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';

      const settings = docSnap.exists
        ? (docSnap.data() as ReminderSettingsDoc)
        : {
            userId: user.uid,
            inAppEnabled: false,
            emailEnabled: false,
            pushEnabled: false,
            timezone: 'UTC',
            language: 'en',
            updatedAt: new Date().toISOString()
          };

      return res.json({
        settings,
        serverEmailConfigured,
        serverPushConfigured,
        vapidPublicKey
      });
    } catch (error) {
      console.error('Error fetching reminder settings:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.put('/api/reminders/settings', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`put_reminder_settings:${user.uid}`, 20, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }

      const { inAppEnabled, emailEnabled, pushEnabled, timezone, language } = req.body || {};

      const safeTimezone = (typeof timezone === 'string' && isValidIanaTimezone(timezone)) ? timezone : 'UTC';
      const safeLanguage = language === 'ar' ? 'ar' : 'en';

      const newSettings: ReminderSettingsDoc = {
        userId: user.uid,
        inAppEnabled: Boolean(inAppEnabled),
        emailEnabled: Boolean(emailEnabled),
        pushEnabled: Boolean(pushEnabled),
        timezone: safeTimezone,
        language: safeLanguage,
        updatedAt: new Date().toISOString()
      };

      await adminDb.collection(REMINDER_SETTINGS_COL).doc(user.uid).set(newSettings, { merge: true });

      return res.json({ success: true, settings: newSettings });
    } catch (error) {
      console.error('Error updating reminder settings:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.post('/api/reminders/push-subscription', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`post_push_sub:${user.uid}`, 20, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }

      const { subscription } = req.body || {};
      if (!subscription || typeof subscription !== 'object' || !subscription.endpoint || !subscription.keys) {
        return respondWithError(res, 400, 'INVALID_REQUEST_PARAMETERS');
      }

      const endpoint = String(subscription.endpoint).trim();
      if (!endpoint.startsWith('https://') && !endpoint.startsWith('http://localhost')) {
        return respondWithError(res, 400, 'INVALID_REQUEST_PARAMETERS');
      }

      const subHash = crypto.createHash('sha256').update(`${user.uid}:${endpoint}`).digest('hex');
      const subDocId = `${user.uid}_${subHash.slice(0, 32)}`;

      const docData: PushSubscriptionDoc = {
        id: subDocId,
        userId: user.uid,
        subscription: {
          endpoint,
          keys: {
            p256dh: String(subscription.keys.p256dh || ''),
            auth: String(subscription.keys.auth || '')
          }
        },
        userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 200) : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await adminDb.collection(PUSH_SUBSCRIPTIONS_COL).doc(subDocId).set(docData, { merge: true });

      return res.json({ success: true, id: subDocId });
    } catch (error) {
      console.error('Error saving push subscription:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.delete('/api/reminders/push-subscription', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const { endpoint } = req.body || {};

      if (endpoint && typeof endpoint === 'string') {
        const subHash = crypto.createHash('sha256').update(`${user.uid}:${endpoint.trim()}`).digest('hex');
        const subDocId = `${user.uid}_${subHash.slice(0, 32)}`;
        await adminDb.collection(PUSH_SUBSCRIPTIONS_COL).doc(subDocId).delete().catch(() => {});
      } else {
        const snap = await adminDb.collection(PUSH_SUBSCRIPTIONS_COL).where('userId', '==', user.uid).get();
        const batch = adminDb.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit().catch(() => {});
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Error deleting push subscription:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.get('/api/reminders/active', requireAuth, async (_req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);

      const settingsDoc = await adminDb.collection(REMINDER_SETTINGS_COL).doc(user.uid).get();
      const settings = settingsDoc.exists ? (settingsDoc.data() as ReminderSettingsDoc) : null;

      if (!settings || !settings.inAppEnabled) {
        return res.json({ occasions: [] });
      }

      const timeZone = settings.timezone || 'UTC';

      const userDoc = await adminDb.collection(USERS_COL).doc(user.uid).get();
      const userData = userDoc.exists ? userDoc.data() : null;

      const record = await getOwnedRecord(user.uid);
      let hasActiveRecord = Boolean(record && record.status === 'active');

      if (hasActiveRecord && record?.id) {
        if (await isRelationshipDeletionPending(adminDb, record.id)) {
          hasActiveRecord = false;
        }
      }

      const isP1 = Boolean(record && record.p1Uid === user.uid);
      const isP2 = Boolean(record && record.p2Uid === user.uid);
      const otherUid = isP1 ? record?.p2Uid : isP2 ? record?.p1Uid : null;

      if (hasActiveRecord && otherUid) {
        if (await isUserDeletionPending(adminDb, otherUid)) {
          hasActiveRecord = false;
        }
      }

      if (hasActiveRecord && otherUid) {
        const blockId1 = `${user.uid}_${otherUid}`;
        const blockId2 = `${otherUid}_${user.uid}`;
        try {
          const [b1Snap, b2Snap] = await Promise.all([
            adminDb.collection(INVITATION_BLOCKS_COL).doc(blockId1).get(),
            adminDb.collection(INVITATION_BLOCKS_COL).doc(blockId2).get()
          ]);
          if ((b1Snap.exists && b1Snap.data()?.blocked) || (b2Snap.exists && b2Snap.data()?.blocked)) {
            hasActiveRecord = false;
          }
        } catch (blockErr) {
          console.error('Error checking blocks for in-app reminders:', blockErr);
          hasActiveRecord = false;
        }
      }

      const userPartner = isP1 ? record?.partner1 : isP2 ? record?.partner2 : null;
      const partnerData = isP1 ? record?.partner2 : isP2 ? record?.partner1 : null;

      const userBirthDay = userPartner?.birthDay || userData?.birthDay;
      const userBirthMonth = userPartner?.birthMonth || userData?.birthMonth;
      const userBirthYear = userPartner?.birthYear || userData?.birthYear;

      const partnerBirthDay = partnerData?.birthDay;
      const partnerBirthMonth = partnerData?.birthMonth;
      const partnerBirthYear = partnerData?.birthYear;

      const occasions = calculateActiveOccasions({
        userBirthDay,
        userBirthMonth,
        userBirthYear,
        partnerBirthDay,
        partnerBirthMonth,
        partnerBirthYear,
        relationshipStartDateIso: record?.startDateIso,
        relationshipStatus: hasActiveRecord ? 'active' : 'inactive',
        relationshipRecordId: record?.id,
        timeZone
      });

      if (occasions.length === 0) {
        return res.json({ occasions: [] });
      }

      const localDate = getLocalDateParts(timeZone).isoDate;
      const activeOccasions: OccasionItem[] = [];

      for (const occ of occasions) {
        const dismissDocId = `${user.uid}_${occ.type}_${localDate}_${occ.recordId || 'self'}`;
        const dismissSnap = await adminDb.collection(IN_APP_DISMISSALS_COL).doc(dismissDocId).get();
        if (!dismissSnap.exists) {
          activeOccasions.push(occ);
        }
      }

      return res.json({ occasions: activeOccasions });
    } catch (error) {
      console.error('Error fetching active reminders:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.post('/api/reminders/dismiss', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const { occasionType, localDate, recordId } = req.body || {};

      if (!occasionType || typeof occasionType !== 'string' || !localDate || typeof localDate !== 'string') {
        return respondWithError(res, 400, 'INVALID_REQUEST_PARAMETERS');
      }

      const dismissDocId = `${user.uid}_${occasionType.trim()}_${localDate.trim()}_${recordId ? String(recordId).trim() : 'self'}`;

      const dismissalDoc: InAppDismissalDoc = {
        id: dismissDocId,
        userId: user.uid,
        occasionType: occasionType.trim(),
        localDate: localDate.trim(),
        recordId: recordId ? String(recordId).trim() : undefined,
        dismissedAt: new Date().toISOString()
      };

      await adminDb.collection(IN_APP_DISMISSALS_COL).doc(dismissDocId).set(dismissalDoc, { merge: true });

      return res.json({ success: true, id: dismissDocId });
    } catch (error) {
      console.error('Error dismissing reminder:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  async function resolveActiveOccasions(userId: string, timeZone: string, referenceDate?: Date) {
    const record = await getOwnedRecord(userId);
    let hasActiveRecord = Boolean(record && record.status === 'active');

    if (hasActiveRecord && record?.id) {
      if (await isRelationshipDeletionPending(adminDb, record.id)) {
        hasActiveRecord = false;
      }
    }

    const isP1 = Boolean(record && record.p1Uid === userId);
    const isP2 = Boolean(record && record.p2Uid === userId);
    const otherUid = isP1 ? record?.p2Uid : isP2 ? record?.p1Uid : null;

    if (hasActiveRecord && otherUid) {
      if (await isUserDeletionPending(adminDb, otherUid)) {
        hasActiveRecord = false;
      }
    }

    if (hasActiveRecord && otherUid) {
      const blockId1 = `${userId}_${otherUid}`;
      const blockId2 = `${otherUid}_${userId}`;
      try {
        const [b1Snap, b2Snap] = await Promise.all([
          adminDb.collection(INVITATION_BLOCKS_COL).doc(blockId1).get(),
          adminDb.collection(INVITATION_BLOCKS_COL).doc(blockId2).get()
        ]);
        if ((b1Snap.exists && b1Snap.data()?.blocked) || (b2Snap.exists && b2Snap.data()?.blocked)) {
          hasActiveRecord = false;
        }
      } catch (blockErr) {
        console.error('Reminder partner eligibility check unavailable');
        hasActiveRecord = false;
      }
    }

    const userPartner = isP1 ? record?.partner1 : isP2 ? record?.partner2 : null;
    const partnerData = isP1 ? record?.partner2 : isP2 ? record?.partner1 : null;

    const userDoc = await adminDb.collection(USERS_COL).doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : null;

    const userBirthDay = userPartner?.birthDay || userData?.birthDay;
    const userBirthMonth = userPartner?.birthMonth || userData?.birthMonth;
    const userBirthYear = userPartner?.birthYear || userData?.birthYear;

    const partnerBirthDay = partnerData?.birthDay;
    const partnerBirthMonth = partnerData?.birthMonth;
    const partnerBirthYear = partnerData?.birthYear;

    return calculateActiveOccasions({
      userBirthDay,
      userBirthMonth,
      userBirthYear,
      partnerBirthDay,
      partnerBirthMonth,
      partnerBirthYear,
      relationshipStartDateIso: record?.startDateIso,
      relationshipStatus: hasActiveRecord ? 'active' : 'inactive',
      relationshipRecordId: record?.id,
      timeZone,
      referenceDate
    });
  }

  async function resolveReminderDispatch(
    userId: string,
    channel: 'email' | 'push',
    referenceDate?: Date,
    ignoreTimeWindow = false
  ) {
    const settingsDoc = await adminDb.collection(REMINDER_SETTINGS_COL).doc(userId).get();
    const settings = settingsDoc.exists ? settingsDoc.data() as ReminderSettingsDoc : null;
    if (!settings || !(channel === 'email' ? settings.emailEnabled : settings.pushEnabled)) return null;
    if (await isUserDeletionPending(adminDb, userId)) return null;

    let userAuthRecord;
    try {
      userAuthRecord = await adminAuth.getUser(userId);
    } catch {
      return null;
    }
    if (!userAuthRecord || userAuthRecord.disabled) return null;
    if (channel === 'email' && (!userAuthRecord.emailVerified || !userAuthRecord.email || !validateEmailAddress(userAuthRecord.email))) return null;

    const timeZone = isValidIanaTimezone(settings.timezone) ? settings.timezone : 'UTC';
    // Calendar overrides are test-only; lease and outcome helpers always use their live clock.
    const calendarDate = referenceDate || new Date();
    const local = getLocalDateParts(timeZone, calendarDate);
    if (local.hour !== 9 && !ignoreTimeWindow) return null;
    const occasions = await resolveActiveOccasions(userId, timeZone, calendarDate);
    if (occasions.length === 0) return null;
    return { settings, userAuthRecord, localDate: local.isoDate, occasions };
  }

  app.post('/api/reminders/process', async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });

      const extracted = extractValidatedHeader(req, 'x-reminder-scheduler-secret', 'x-scheduler-secret');
      if (extracted.error !== 'NONE' || !extracted.value) {
        return respondWithError(res, 403, 'UNAUTHORIZED');
      }

      const schedulerSecret = process.env.REMINDER_SCHEDULER_SECRET;
      if (!verifySecret(extracted.value, schedulerSecret)) {
        return respondWithError(res, 403, 'UNAUTHORIZED');
      }

      const settingsSnap = await adminDb.collection(REMINDER_SETTINGS_COL).get();
      let processedCount = 0;
      let emailsSent = 0;
      let pushSent = 0;

      for (const doc of settingsSnap.docs) {
        try {
          const userId = doc.id;
          const settings = doc.data() as ReminderSettingsDoc;
          const isTestEnv = process.env.NODE_ENV === 'test' || isTestEnvironment;
          const ignoreTimeWindow = isTestEnv && req.query.ignoreTimeWindow === 'true';
          let referenceDate: Date | undefined;
          if (isTestEnv && typeof req.query.referenceDate === 'string') {
            const parsed = new Date(req.query.referenceDate);
            if (!isNaN(parsed.getTime())) referenceDate = parsed;
          }

          const timeZone = isValidIanaTimezone(settings.timezone) ? settings.timezone : 'UTC';
          const calendarDate = referenceDate || new Date();
          const local = getLocalDateParts(timeZone, calendarDate);
          if (local.hour !== 9 && !ignoreTimeWindow) {
            processedCount++;
            continue;
          }

          const emailDispatch = await resolveReminderDispatch(userId, 'email', referenceDate, ignoreTimeWindow);
          if (emailDispatch?.userAuthRecord.email) {
            const { settings, userAuthRecord, localDate, occasions: emailOccasions } = emailDispatch;
            const emailDeliveryDocId = `${settings.userId}_email_${localDate}`;
            const emailClaimRef = adminDb.collection(REMINDER_DELIVERIES_COL).doc(emailDeliveryDocId);

            const isAr = settings.language === 'ar';
            const subject = isAr ? 'تذكيرك من Relationship ID' : 'Your Relationship ID reminder';
            const bodyText = isAr
              ? `مرحباً،\n\nلديك تذكير بمناسبة قادمة اليوم في حسابك لدى Relationship ID.\n\nيرجى تسجيل الدخول إلى التطبيق للاطلاع على التفاصيل:\nhttps://www.relationshipid.org\n\nشكراً لك.`
              : `Hello,\n\nYou have an upcoming occasion reminder today on Relationship ID.\n\nPlease sign in to your account to view details:\nhttps://www.relationshipid.org\n\nThank you.`;

            const emailPayloadHash = crypto.createHash('sha256').update(JSON.stringify({
              from: process.env.EMAIL_FROM || 'reminders@relationshipid.org',
              to: [userAuthRecord.email], subject, text: bodyText
            })).digest('hex');

            const claimResult = await claimReminderDelivery({
              db: adminDb,
              claimRef: emailClaimRef,
              deliveryDocId: emailDeliveryDocId,
              userId: settings.userId,
              channel: 'email',
              emailPayloadHash,
              localDate
            });

            if (claimResult.claimed && claimResult.claimId) {

              // Stable idempotency key across all attempts and recoveries for this calendar occurrence
              const idempotencyKey = emailDeliveryDocId;
              if (await ownsReminderClaim(adminDb, emailClaimRef, claimResult.claimId)) {
                const result = await sendReminderEmail(emailDispatch.userAuthRecord.email, subject, bodyText, idempotencyKey);

                if (result.success) {
                  const outcome = await recordReminderDeliveryOutcome({
                    db: adminDb,
                    claimRef: emailClaimRef,
                    expectedClaimId: claimResult.claimId,
                    outcome: {
                      status: 'success',
                      occasions: emailOccasions.map(o => ({ type: o.type, recordId: o.recordId }))
                    }
                  });
                  if (outcome.recorded) {
                    emailsSent++;
                  }
                } else {
                  await recordReminderDeliveryOutcome({
                    db: adminDb,
                    claimRef: emailClaimRef,
                    expectedClaimId: claimResult.claimId,
                    outcome: {
                      status: 'failed',
                      occasions: emailOccasions.map(o => ({ type: o.type, recordId: o.recordId })),
                      error: result.error || 'FAILED',
                      uncertain: Boolean(result.uncertain),
                      permanent: Boolean(result.permanent)
                    }
                  });
                }
              }
            }

          }

          const pushDispatch = await resolveReminderDispatch(userId, 'push', referenceDate, ignoreTimeWindow);
          if (pushDispatch) {
            const { settings, localDate, occasions: pushOccasions } = pushDispatch;
            const pushDeliveryDocId = `${settings.userId}_push_${localDate}`;
            const pushClaimRef = adminDb.collection(REMINDER_DELIVERIES_COL).doc(pushDeliveryDocId);

            const claimResult = await claimReminderDelivery({
              db: adminDb,
              claimRef: pushClaimRef,
              deliveryDocId: pushDeliveryDocId,
              userId: settings.userId,
              channel: 'push',
              localDate
            });

            if (claimResult.claimed && claimResult.claimId) {
              const pushSubsSnap = await adminDb.collection(PUSH_SUBSCRIPTIONS_COL).where('userId', '==', settings.userId).get();

              if (!pushSubsSnap.empty) {
                const isAr = settings.language === 'ar';
                const payload = {
                  title: 'Relationship ID',
                  body: isAr ? 'لديك تذكير. افتح التطبيق للاطلاع عليه.' : 'You have a reminder. Open the app to view it.',
                  data: { url: '/' }
                };

                let sentAny = false;
                let anyUncertain = false;
                let lastError = 'NO_PUSH_DELIVERED';
                const pushStartTime = Date.now();
                const MAX_PUSH_DISPATCH_TIME_MS = REMINDER_CLAIM_LEASE_MS - 30000;

                for (const subDoc of pushSubsSnap.docs) {
                  // Bound multi-subscription loop so total dispatch cannot outlive the claim lease
                  if (Date.now() - pushStartTime > MAX_PUSH_DISPATCH_TIME_MS) {
                    anyUncertain = true;
                    lastError = 'TIMEOUT_UNCERTAIN';
                    break;
                  }

                  if (!await ownsReminderClaim(adminDb, pushClaimRef, claimResult.claimId)) {
                    anyUncertain = true;
                    lastError = 'CLAIM_OWNERSHIP_UNCERTAIN';
                    break;
                  }
                  const subData = subDoc.data() as PushSubscriptionDoc;
                  const pushResult = await sendReminderPushNotification(subData.subscription as any, payload);

                  if (pushResult.success) {
                    sentAny = true;
                  } else {
                    if (pushResult.uncertain) {
                      anyUncertain = true;
                    }
                    lastError = pushResult.error || 'PUSH_FAILED';
                    if (pushResult.expired) {
                      await subDoc.ref.delete().catch(() => {});
                    }
                  }
                }

                if (sentAny) {
                  const outcome = await recordReminderDeliveryOutcome({
                    db: adminDb,
                    claimRef: pushClaimRef,
                    expectedClaimId: claimResult.claimId,
                    outcome: {
                      status: 'success',
                      occasions: pushOccasions.map(o => ({ type: o.type, recordId: o.recordId }))
                    }
                  });
                  if (outcome.recorded) {
                    pushSent++;
                  }
                } else {
                  await recordReminderDeliveryOutcome({
                    db: adminDb,
                    claimRef: pushClaimRef,
                    expectedClaimId: claimResult.claimId,
                    outcome: {
                      status: 'failed',
                      occasions: pushOccasions.map(o => ({ type: o.type, recordId: o.recordId })),
                      error: anyUncertain ? 'TIMEOUT_UNCERTAIN' : lastError,
                      uncertain: anyUncertain
                    }
                  });
                }
              } else {
                await recordReminderDeliveryOutcome({
                  db: adminDb,
                  claimRef: pushClaimRef,
                  expectedClaimId: claimResult.claimId,
                  outcome: {
                    status: 'failed',
                    occasions: pushOccasions.map(o => ({ type: o.type, recordId: o.recordId })),
                    error: 'NO_SUBSCRIPTIONS'
                  }
                });
              }
            }
          }

          processedCount++;
        } catch {
          console.error('[reminders] User processing failed; skipping user');
        }
      }

      return res.json({
        success: true,
        processedCount,
        emailsSent,
        pushSent
      });
    } catch (error) {
      console.error('Error processing background reminders:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  app.post('/internal/reconcile', async (req, res) => {
    try {
      const extracted = extractValidatedHeader(req, 'x-reconcile-secret');
      if (extracted.error !== 'NONE' || !extracted.value) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }

      const envSecret = process.env.RECONCILE_SECRET;
      if (!verifySecret(extracted.value, envSecret)) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }

      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!limiter(`internal_reconcile:${ip}`, 6, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }

      const result = await runDeletionReconciliation();
      return res.status(200).json({
        relationships: result.relationships ?? 0,
        accounts: result.accounts ?? 0,
        skipped: result.skipped ? 1 : 0
      });
    } catch (error) {
      console.error('Error in internal reconcile:', error);
      return respondWithError(res, 500, 'DATABASE_ERROR');
    }
  });

  // Unsupported app-host Firebase auth helper routes must return 404 rather than proxying or serving SPA
  app.all(['/__/auth', '/__/auth/*', '/__/firebase', '/__/firebase/*'], (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });

  // Canonical apex domain redirect: redirect public page visits from relationshipid.org to https://www.relationshipid.org permanently
  app.use(canonicalApexRedirectMiddleware);

  if (options?.staticDir) {
    mountProductionStatic(app, options.staticDir);
  }

  // Global safe error handler: never leak stack traces, private data, or internal credentials
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled server error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  return app;
}

async function startServer() {
  if (process.env.K_SERVICE && !process.env.K_SERVICE.startsWith('ais-dev-') && process.env.NODE_ENV !== 'production') {
    console.warn('[Server] K_SERVICE is set but NODE_ENV is not production. Treating server as production.');
    process.env.NODE_ENV = 'production';
  }

  const isProd = process.env.NODE_ENV === 'production';

  if (process.env.NODE_ENV !== 'test') {
    if (!process.env.CONTACT_HASH_SECRET || process.env.CONTACT_HASH_SECRET.length < 32) {
      throw new Error('CONTACT_HASH_SECRET environment variable is missing or shorter than 32 characters');
    }
    if (isProd) {
      const missingProdVars: string[] = [];
      if (!process.env.FIREBASE_PROJECT_ID) missingProdVars.push('FIREBASE_PROJECT_ID');
      if (!process.env.RECONCILE_SECRET) missingProdVars.push('RECONCILE_SECRET');
      if (missingProdVars.length > 0) {
        console.warn(`[Server] Missing production configuration variables: ${missingProdVars.join(', ')}`);
      }
    }
  }

  const app = createApp(isProd ? { staticDir: getPublicStaticDir() } : { isDev: true });
  const PORT = Number(process.env.PORT || 3000);

  let vite: Awaited<ReturnType<typeof createViteServer>> | null = null;
  if (!isProd) {
    vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      server.off('error', reject);
      console.log(`Relationship ID server running on http://localhost:${PORT}`);
      runDeletionReconciliation().catch((err: any) => {
        console.error('Initial deletion reconciliation failed:', err?.code || err?.message || String(err));
      });
      const timer = setInterval(() => {
        runDeletionReconciliation().catch((err: any) => {
          console.error('Scheduled deletion reconciliation failed:', err?.code || err?.message || String(err));
        });
      }, 10 * 60 * 1000);
      timer.unref();
      resolve();
    });

    server.on('error', async (err: any) => {
      server.off('error', reject);
      if (vite) {
        try {
          await vite.close();
        } catch (closeErr) {
          // ignore
        }
      }
      reject(err);
    });
  });
}

if (!isTestEnvironment) {
  startServer().catch((error) => {
    console.error('Relationship ID server failed to start', error);
    process.exitCode = 1;
  });
}

