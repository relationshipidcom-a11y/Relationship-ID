import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken, type Auth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAppCheck } from 'firebase-admin/app-check';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import twilio from 'twilio';
import { checkHealth, type HealthStatus } from './src/utils/health';
import {
  normalizeCanonicalEmail,
  normalizeCanonicalPhone,
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

export const CURRENT_LEGAL_VERSION = '2026-10-01';

const USERS_COL = 'users';
const RELATIONSHIPS_COL = 'relationships';
const INVITATIONS_COL = 'invitations';
const CERTIFICATES_COL = 'certificates';
const CHANGE_REQUESTS_COL = 'change_requests';
const NOTIFICATIONS_COL = 'notifications';
const CONTACT_RESERVATIONS_COL = 'contact_reservations';
const PUBLIC_CONTACT_INDEX_COL = 'public_contact_index';
const ACCOUNT_DELETIONS_COL = 'account_deletions';
const RELATIONSHIP_DELETIONS_COL = 'relationship_deletions';
const INVITATION_BLOCKS_COL = 'invitation_blocks';

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

export function __setTestDeps(db: any, auth: any): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setTestDeps is only allowed in test environment');
  }
  adminDb = db;
  adminAuth = auth;
}

let twilioClientOverride: any = null;

export function __setTwilioClient(mockClient: any): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setTwilioClient is only allowed in test environment');
  }
  twilioClientOverride = mockClient;
}

let adminAppCheckOverride: any = null;

export function __setTestAppCheck(mockAppCheck: any): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setTestAppCheck is only allowed in test environment');
  }
  adminAppCheckOverride = mockAppCheck;
}

export const requireAppCheck = async (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health' || req.originalUrl === '/api/health') {
    return next();
  }
  if (process.env.NODE_ENV === 'test' && !adminAppCheckOverride) {
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
    res.locals.firebaseUser = await adminAuth.verifyIdToken(token);
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
    .where('status', 'in', ['draft', 'pending_partner', 'active'])
    .limit(1)
    .get();
  if (!p1Snap.empty) return p1Snap.docs[0].data() as RelationshipRecord;

  const p2Snap = await adminDb.collection(RELATIONSHIPS_COL)
    .where('p2Uid', '==', uid)
    .where('status', 'in', ['active', 'pending_partner'])
    .limit(1)
    .get();
  if (!p2Snap.empty) return p2Snap.docs[0].data() as RelationshipRecord;

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
  required: boolean = false
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
      maxLen = 100;
      if (trimmedLen === 0 && required) return { valid: false, error: 'INVALID_INPUT' };
      if (rawLen > maxLen) return { valid: false, error: 'FIELD_TOO_LONG' };
      break;
    case 'fullNameEn':
      maxLen = 100;
      if (rawLen > maxLen) return { valid: false, error: 'FIELD_TOO_LONG' };
      break;
    case 'socialHandle':
      maxLen = 50;
      if (rawLen > maxLen) return { valid: false, error: 'FIELD_TOO_LONG' };
      break;
    case 'email':
      maxLen = 254;
      if (rawLen > maxLen) return { valid: false, error: 'FIELD_TOO_LONG' };
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

export function verifyReconcileSecret(headerSecret: unknown, envSecret?: string): boolean {
  if (!envSecret || typeof envSecret !== 'string' || envSecret.length < 32) {
    return false;
  }
  if (!headerSecret || typeof headerSecret !== 'string') {
    return false;
  }
  const envBuf = Buffer.from(envSecret, 'utf-8');
  const headerBuf = Buffer.from(headerSecret, 'utf-8');
  if (envBuf.length !== headerBuf.length) {
    crypto.timingSafeEqual(envBuf, envBuf);
    return false;
  }
  return crypto.timingSafeEqual(envBuf, headerBuf);
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

  if (hasEmailTarget && hasPhoneTarget) {
    if (emailMatches || phoneMatches) return { authorized: true, isP1: false };
    return { authorized: false, isP1: false, reason: 'INVITATION_IDENTITY_MISMATCH' };
  }

  if (hasEmailTarget) {
    if (emailMatches) return { authorized: true, isP1: false };
    return { authorized: false, isP1: false, reason: 'INVITATION_IDENTITY_MISMATCH' };
  }

  if (hasPhoneTarget) {
    if (phoneMatches) return { authorized: true, isP1: false };
    return { authorized: false, isP1: false, reason: 'INVITATION_IDENTITY_MISMATCH' };
  }

  return { authorized: false, isP1: false, reason: 'INVITATION_IDENTITY_MISMATCH' };
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

  // Phase 1: Atomic Lock & Immediate Public Deactivation
  await db.runTransaction(async (transaction) => {
    const relDoc = await transaction.get(relRef);
    if (!relDoc.exists) throw new Error('ACTIVE_RELATIONSHIP_NOT_FOUND');
    const record = relDoc.data() as RelationshipRecord;
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
      await cleanUserBlocksInBatches(db, uid);
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

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', parseTrustProxyHops(process.env.TRUST_PROXY_HOPS));
  app.use(securityHeadersMiddleware);
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
    const health = await checkHealth(adminDb, projectId, 5000);
    return res.status(health.statusCode).json(health.body);
  });

  // Enforce Firebase App Check on every /api/* route before requireAuth
  app.use('/api', requireAppCheck);

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
      const limitRef = adminDb.collection('whatsapp_verify_limits').doc(user.uid);
      const limitDoc = await limitRef.get();
      const nowMs = Date.now();
      const ONE_HOUR_MS = 60 * 60 * 1000;
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
        const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + ONE_HOUR_MS - nowMs) / 1000));
        return respondWithError(res, 429, 'WHATSAPP_VERIFY_RATE_LIMITED', retryAfterSeconds);
      }

      const client = getTwilioClient();
      if (!client) {
        return respondWithError(res, 503, 'WHATSAPP_VERIFY_UNAVAILABLE');
      }

      const verifyServiceSid = process.env.TWILIO_VERIFY_SID!;
      await client.verify.v2.services(verifyServiceSid).verifications.create({
        to: norm.canonical,
        channel: 'sms'
      });

      // Increment Firestore counter
      await limitRef.set({
        count: currentCount + 1,
        windowStartMs,
        updatedAt: new Date().toISOString()
      });

      return res.json({ success: true });
    } catch (err: any) {
      console.error('Error starting WhatsApp verification:', err);
      const statusMap: Record<string, number> = {
        WHATSAPP_VERIFY_UNAVAILABLE: 503,
        INVALID_PHONE_NUMBER: 400
      };
      const code = err?.message || 'INTERNAL_ERROR';
      return respondWithError(res, statusMap[code] || 500, code);
    }
  });

  app.post('/api/whatsapp/verify/check', requireAuth, async (req, res) => {
    try {
      if (!isWhatsappVerifyEnabled()) {
        return respondWithError(res, 503, 'WHATSAPP_VERIFY_UNAVAILABLE');
      }

      const user = userFromResponse(res);
      const { country, number, code } = (req.body || {}) as { country?: string; number?: string; code?: string };

      if (!code || typeof code !== 'string' || !code.trim()) {
        return respondWithError(res, 400, 'INVALID_INPUT');
      }

      const norm = normalizeCanonicalPhone(number, country);
      if (!norm.isValid || !norm.canonical) {
        return respondWithError(res, 400, 'INVALID_PHONE_NUMBER');
      }

      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });

      const client = getTwilioClient();
      if (!client) {
        return respondWithError(res, 503, 'WHATSAPP_VERIFY_UNAVAILABLE');
      }

      const verifyServiceSid = process.env.TWILIO_VERIFY_SID!;
      let verificationCheck: any;
      try {
        verificationCheck = await client.verify.v2.services(verifyServiceSid).verificationChecks.create({
          to: norm.canonical,
          code: code.trim()
        });
      } catch (checkErr: any) {
        console.warn('Twilio verification check error:', checkErr?.message);
        return respondWithError(res, 400, 'INVALID_VERIFICATION_CODE');
      }

      if (!verificationCheck || verificationCheck.status !== 'approved') {
        return respondWithError(res, 400, 'INVALID_VERIFICATION_CODE');
      }

      const nowIso = new Date().toISOString();

      // Update caller's OWN partner record:
      // 1. In users/{uid}
      const userRef = adminDb.collection(USERS_COL).doc(user.uid);
      await userRef.set({
        whatsappE164: norm.canonical,
        whatsappTrusted: true,
        whatsappVerifiedAt: nowIso,
        updatedAt: nowIso
      }, { merge: true });

      // 2. In active or draft relationship record if caller is P1 or P2
      const owned = await getOwnedRecord(user.uid);
      if (owned) {
        const isP1 = owned.p1Uid === user.uid;
        const isP2 = owned.p2Uid === user.uid;
        if (isP1) {
          owned.partner1.whatsappE164 = norm.canonical;
          owned.partner1.whatsappTrusted = true;
          owned.partner1.whatsappVerifiedAt = nowIso;
        } else if (isP2) {
          owned.partner2.whatsappE164 = norm.canonical;
          owned.partner2.whatsappTrusted = true;
          owned.partner2.whatsappVerifiedAt = nowIso;
        }
        await adminDb.collection(RELATIONSHIPS_COL).doc(owned.id).set(owned, { merge: true });
      }

      return res.json({
        success: true,
        whatsappE164: norm.canonical,
        whatsappTrusted: true,
        whatsappVerifiedAt: nowIso
      });
    } catch (err: any) {
      console.error('Error checking WhatsApp verification:', err);
      return respondWithError(res, 500, 'INTERNAL_ERROR');
    }
  });

  app.get(['/api/relationship', '/api/record'], requireAuth, async (_req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const userDoc = await adminDb.collection(USERS_COL).doc(user.uid).get();
      const userProfile = userDoc.exists ? (userDoc.data()?.profile as PartnerData | undefined) : null;
      const record = await getOwnedRecord(user.uid);
      let invitation: Invitation | null = null;
      if (record?.inviteId) {
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
      return res.status(500).json({ error: 'DATABASE_ERROR' });
    }
  });

  app.post(['/api/relationship', '/api/record'], requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      if (!limiter(`save_relationship:${user.uid}`, 5, 60000)) {
        return respondWithError(res, 429, 'RATE_LIMITED');
      }
      const { partner1, type, startDate } = req.body as {
        partner1?: PartnerData;
        type?: RelationshipType;
        startDate?: string;
      };

      if (!partner1 || !['dating', 'engagement', 'marriage'].includes(type || '')) {
        return res.status(400).json({ error: 'INVALID_RELATIONSHIP_DRAFT' });
      }

      const nameCheck = validateFieldLength(partner1.fullName, 'fullName', true);
      if (!nameCheck.valid) return respondWithError(res, 400, nameCheck.error);
      const nameEnCheck = validateFieldLength(partner1.fullNameEn, 'fullNameEn', false);
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
      if (!startDate || startDate > new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({ error: 'INVALID_START_DATE' });
      }
      if (!user.phone_number || !partner1.phoneE164 || user.phone_number !== partner1.phoneE164) {
        return res.status(400).json({ error: 'VERIFIED_PHONE_REQUIRED' });
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
        const p1EmailNorm = normalizeCanonicalEmail(partner1.email);
        if (!p1EmailNorm.isValid) throw new Error('INVALID_CONTACT_FORMAT');

        const p1PhoneNorm = normalizeCanonicalPhone(partner1.phoneE164 || partner1.phoneNumber, partner1.phoneCountry);
        if (!p1PhoneNorm.isValid) throw new Error('INVALID_PHONE_NUMBER');

        const p1WaNorm = normalizeCanonicalPhone(partner1.whatsappE164 || partner1.whatsappNumber, partner1.whatsappCountry || partner1.phoneCountry);
        if (!p1WaNorm.isValid) throw new Error('INVALID_PHONE_NUMBER');

        delete (partner1 as any).whatsappTrusted;
        delete (partner1 as any).whatsappVerifiedAt;

        partner1.email = p1EmailNorm.canonical;
        partner1.phoneE164 = p1PhoneNorm.canonical;
        partner1.whatsappE164 = p1WaNorm.canonical || undefined;
        const isSameAsMobile = Boolean(p1WaNorm.canonical && partner1.phoneE164 && p1WaNorm.canonical === partner1.phoneE164);
        const isTwilioVerified = Boolean(
          p1WaNorm.canonical &&
          userDoc.exists &&
          userDoc.data()?.whatsappE164 === p1WaNorm.canonical &&
          userDoc.data()?.whatsappTrusted === true
        );
        partner1.whatsappTrusted = isSameAsMobile || isTwilioVerified;
        if (isTwilioVerified && !isSameAsMobile) {
          partner1.whatsappVerifiedAt = userDoc.data()?.whatsappVerifiedAt;
        } else if (!isSameAsMobile) {
          partner1.whatsappVerifiedAt = undefined;
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

        const nowIso = new Date().toISOString();
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
            startDate: formatDate(startDate, 'en'),
            startDateAr: formatDate(startDate, 'ar'),
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
            startDate: formatDate(startDate, 'en'),
            startDateAr: formatDate(startDate, 'ar'),
            startDateIso: startDate
          };
          transaction.set(existingRecordRef!, targetRecord, { merge: true });
          transaction.set(userRef, {
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
      const p2NameCheck = validateFieldLength(partner2Name, 'fullName', true);
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

      if (targetHashes.length > 0) {
        const blocksSnap = await adminDb.collection(INVITATION_BLOCKS_COL)
          .where('p1Uid', '==', user.uid)
          .where('blocked', '==', true)
          .get();

        for (const bDoc of blocksSnap.docs) {
          const bData = bDoc.data();
          const hashes: string[] = Array.isArray(bData?.contactHashes) ? bData.contactHashes : [];
          if (targetHashes.some((h) => hashes.includes(h))) {
            return respondWithError(res, 403, 'INVITATION_NOT_ALLOWED');
          }
        }
      }

      const result = await adminDb.runTransaction(async (transaction) => {
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

        // Enforce: Proposed P2 contact cannot belong to an active relationship
        const contactCheck = await validateContactUniqueness(
          adminDb,
          {
            emails: [p2EmailNorm.canonical],
            phones: [p2PhoneNorm.canonical],
            whatsapps: [p2WaNorm.canonical]
          },
          record.id,
          transaction
        );
        if (!contactCheck.valid) {
          throw new Error(contactCheck.error?.code || 'CONTACT_IN_ACTIVE_RELATIONSHIP');
        }

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
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ') && adminAuth) {
        const token = authHeader.split('Bearer ')[1]?.trim();
        if (token) {
          try {
            const decoded = await adminAuth.verifyIdToken(token);
            authenticatedUser = {
              uid: decoded.uid,
              email: decoded.email,
              email_verified: Boolean(decoded.email_verified),
              phone_number: decoded.phone_number
            };
          } catch {
            // Unauthenticated or invalid token - fall through to public preview
          }
        }
      }

      let isAuthorizedRecipient = false;
      let isP1 = false;
      let authReason: string | undefined = 'AUTH_REQUIRED';
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
            reminderCount: invitation.reminderCount
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
          expiresAt: invitation.expiresAt
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
      return res.status(500).json({ error: 'DATABASE_ERROR' });
    }
  });

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

      const partner2 = (req.body as { partner2?: PartnerData }).partner2;
      if (!partner2) return res.status(400).json({ error: 'PARTNER2_PROFILE_REQUIRED' });

      const nameCheck = validateFieldLength(partner2.fullName, 'fullName', true);
      if (!nameCheck.valid) return respondWithError(res, 400, nameCheck.error);
      const nameEnCheck = validateFieldLength(partner2.fullNameEn, 'fullNameEn', false);
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
      if (!user.phone_number || !partner2.phoneE164 || user.phone_number !== partner2.phoneE164) {
        return res.status(400).json({ error: 'VERIFIED_PHONE_REQUIRED' });
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

        const recipientCheck = verifyRecipientIdentity({
          invitation,
          user: {
            uid: user.uid,
            email: user.email,
            email_verified: Boolean(user.email_verified),
            phone_number: user.phone_number
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
        const p2UserRef = adminDb.collection(USERS_COL).doc(user.uid);
        const p2UserDoc = await transaction.get(p2UserRef);
        if (p2UserDoc.exists && p2UserDoc.data()?.activeRecordId && p2UserDoc.data()?.activeRecordId !== record.id) {
          const existingRelDoc = await transaction.get(adminDb.collection(RELATIONSHIPS_COL).doc(p2UserDoc.data()?.activeRecordId));
          if (existingRelDoc.exists && (existingRelDoc.data() as RelationshipRecord).status === 'active') {
            throw new Error('P2_ALREADY_IN_ACTIVE_RELATIONSHIP');
          }
        }

        // Check if P1 or P2 contacts are bound to any other active relationship
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

        partner2.email = p2EmailNorm.canonical;
        partner2.phoneE164 = p2PhoneNorm.canonical;
        partner2.whatsappE164 = p2WaNorm.canonical || undefined;
        const p2IsSameAsMobile = Boolean(p2WaNorm.canonical && partner2.phoneE164 && p2WaNorm.canonical === partner2.phoneE164);
        const p2IsTwilioVerified = Boolean(
          p2WaNorm.canonical &&
          p2UserDoc.exists &&
          p2UserDoc.data()?.whatsappE164 === p2WaNorm.canonical &&
          p2UserDoc.data()?.whatsappTrusted === true
        );
        partner2.whatsappTrusted = p2IsSameAsMobile || p2IsTwilioVerified;
        if (p2IsTwilioVerified && !p2IsSameAsMobile) {
          partner2.whatsappVerifiedAt = p2UserDoc.data()?.whatsappVerifiedAt;
        } else if (!p2IsSameAsMobile) {
          partner2.whatsappVerifiedAt = undefined;
        }

        const p1EmailNorm = normalizeCanonicalEmail(record.partner1.email);
        if (!p1EmailNorm.isValid) throw new Error('INVALID_CONTACT_FORMAT');

        const p1PhoneNorm = normalizeCanonicalPhone(record.partner1.phoneE164 || record.partner1.phoneNumber, record.partner1.phoneCountry);
        if (!p1PhoneNorm.isValid) throw new Error('INVALID_PHONE_NUMBER');

        const p1WaNorm = normalizeCanonicalPhone(record.partner1.whatsappE164 || record.partner1.whatsappNumber, record.partner1.whatsappCountry || record.partner1.phoneCountry);
        if (!p1WaNorm.isValid) throw new Error('INVALID_PHONE_NUMBER');

        record.partner1.email = p1EmailNorm.canonical;
        record.partner1.phoneE164 = p1PhoneNorm.canonical;
        record.partner1.whatsappE164 = p1WaNorm.canonical || undefined;
        const p1IsSameAsMobile = Boolean(p1WaNorm.canonical && record.partner1.phoneE164 && p1WaNorm.canonical === record.partner1.phoneE164);
        const p1IsTwilioVerified = Boolean(
          p1WaNorm.canonical &&
          p1UserDoc.exists &&
          p1UserDoc.data()?.whatsappE164 === p1WaNorm.canonical &&
          p1UserDoc.data()?.whatsappTrusted === true
        );
        record.partner1.whatsappTrusted = p1IsSameAsMobile || p1IsTwilioVerified;
        if (p1IsTwilioVerified && !p1IsSameAsMobile) {
          record.partner1.whatsappVerifiedAt = p1UserDoc.data()?.whatsappVerifiedAt;
        } else if (!p1IsSameAsMobile) {
          record.partner1.whatsappVerifiedAt = undefined;
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

        const now = new Date();
        const nowIso = now.toISOString();
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

        return {
          invitation: { ...invitation, status: 'accepted' as const, p2Uid: user.uid },
          record: updatedRecord
        };
      });

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error accepting invitation:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const statusMap: Record<string, number> = {
        INVITATION_NOT_FOUND: 404,
        RELATIONSHIP_NOT_FOUND: 404,
        INVITATION_EXPIRED: 410,
        CANNOT_ACCEPT_OWN_INVITATION: 400,
        SELF_RELATIONSHIP_NOT_ALLOWED: 400,
        INVITATION_IDENTITY_MISMATCH: 403,
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
        INVALID_PHONE_NUMBER: 400,
        INVALID_CONTACT_FORMAT: 400
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

        const recipientCheck = verifyRecipientIdentity({
          invitation,
          user: {
            uid: user.uid,
            email: user.email,
            email_verified: Boolean(user.email_verified),
            phone_number: user.phone_number
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
        if (user.phone_number) {
          const c = normalizeCanonicalPhone(user.phone_number).canonical;
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

        transaction.update(inviteRef, {
          status: 'declined',
          p2Uid: user.uid
        });
        return {
          invitation: { ...invitation, status: 'declined' as const, p2Uid: user.uid },
          blocked: isBlocked
        };
      });
      return res.json({ success: true, invitation: result.invitation, blocked: result.blocked });
    } catch (error) {
      console.error('Error declining invitation:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const statusMap: Record<string, number> = {
        INVITATION_NOT_FOUND: 404,
        INVITATION_IDENTITY_MISMATCH: 403,
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

        transaction.update(inviteRef, { status: 'cancelled' });
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
      const statusCode = statusMap[msg] || 500;
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
      return res.status(status).json({ error: msg === 'RELATIONSHIP_NOT_FOUND' || msg === 'NOT_RELATIONSHIP_PARTICIPANT' ? msg : 'DATABASE_ERROR' });
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
      return res.status(500).json({ error: 'DATABASE_ERROR' });
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
      return res.status(500).json({ error: 'DATABASE_ERROR' });
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
        const check = validateFieldLength(fullNameEn, 'fullNameEn', false);
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
            const isSameAsMobile = Boolean(currentPartner.phoneE164 && waNorm.canonical === currentPartner.phoneE164);
            const isTwilioVerified = Boolean(
              userDoc.exists &&
              userDoc.data()?.whatsappE164 === waNorm.canonical &&
              userDoc.data()?.whatsappTrusted === true
            );
            if (isSameAsMobile) {
              updatedPartner.whatsappTrusted = true;
            } else if (isTwilioVerified) {
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
      return res.status(500).json({ error: 'DATABASE_ERROR' });
    }
  });

  app.post('/api/account/delete', requireAuth, async (req, res) => {
    let authDeleted = false;
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
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

      // 6. Delete ONLY the requesting user's Firestore document & invitation blocks
      await cleanUserBlocksInBatches(adminDb, user.uid);
      await adminDb.collection(USERS_COL).doc(user.uid).delete();

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
      return res.status(500).json({ error: 'DATABASE_ERROR' });
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
      return res.status(500).json({ error: 'DATABASE_ERROR' });
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
      return res.status(500).json({ error: 'DATABASE_ERROR' });
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
      return res.status(500).json({ error: 'DATABASE_ERROR' });
    }
  });

  app.post('/internal/reconcile', async (req, res) => {
    try {
      const envSecret = process.env.RECONCILE_SECRET;
      const headerSecret = req.headers['x-reconcile-secret'];
      if (!verifyReconcileSecret(headerSecret, envSecret)) {
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
      return res.status(500).json({ error: 'DATABASE_ERROR' });
    }
  });

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
  if (process.env.NODE_ENV !== 'test') {
    if (!process.env.CONTACT_HASH_SECRET || process.env.CONTACT_HASH_SECRET.length < 32) {
      throw new Error('CONTACT_HASH_SECRET environment variable is missing or shorter than 32 characters');
    }
  }
  const app = createApp();
  const PORT = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
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
  });
}

const isTestEnvironment =
  process.env.NODE_ENV === 'test' ||
  process.argv.includes('--test');

if (!isTestEnvironment) {
  startServer().catch((error) => {
    console.error('Relationship ID server failed to start', error);
    process.exitCode = 1;
  });
}

