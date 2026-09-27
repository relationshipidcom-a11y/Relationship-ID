import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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
  socialHandle?: string;
}

interface CertificateSettings {
  showSocialHandles: boolean;
  showContactDetails: boolean;
  showQrMatrix: boolean;
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
  status: 'draft' | 'pending_partner' | 'active' | 'cancelled' | 'ended';
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

const USERS_COL = 'users';
const RELATIONSHIPS_COL = 'relationships';
const INVITATIONS_COL = 'invitations';
const CERTIFICATES_COL = 'certificates';
const CHANGE_REQUESTS_COL = 'change_requests';
const NOTIFICATIONS_COL = 'notifications';

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
const projectId = (rawProjectId && rawProjectId !== 'projectId' && rawProjectId !== 'placeholder') ? rawProjectId : 'relationship-id';
const adminApp = getApps().length
  ? getApps()[0]
  : initializeApp(projectId ? { projectId } : {});

const adminAuth = adminApp ? getAuth(adminApp) : null;
const adminDb = adminApp ? getFirestore(adminApp, '(default)') : null;

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
    console.error('verifyIdToken failed', error);
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

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      firebaseProjectConfigured: Boolean(projectId),
      firestoreConfigured: Boolean(adminDb),
      timestamp: new Date().toISOString()
    });
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
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post(['/api/relationship', '/api/record'], requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const { partner1, type, startDate } = req.body as {
        partner1?: PartnerData;
        type?: RelationshipType;
        startDate?: string;
      };

      if (!partner1 || !['dating', 'engagement', 'marriage'].includes(type || '')) {
        return res.status(400).json({ error: 'INVALID_RELATIONSHIP_DRAFT' });
      }
      if (!startDate || startDate > new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({ error: 'INVALID_START_DATE' });
      }
      if (!user.phone_number || !partner1.phoneE164 || user.phone_number !== partner1.phoneE164) {
        return res.status(400).json({ error: 'VERIFIED_PHONE_REQUIRED' });
      }

      const existingRecord = await getOwnedRecord(user.uid);
      const nowIso = new Date().toISOString();
      const batch = adminDb.batch();

      let targetRecord: RelationshipRecord;
      if (!existingRecord) {
        const recordId = randomId('rec', 10);
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
        batch.set(adminDb.collection(RELATIONSHIPS_COL).doc(recordId), targetRecord);
        batch.set(adminDb.collection(USERS_COL).doc(user.uid), {
          activeRecordId: recordId,
          phoneE164: partner1.phoneE164,
          updatedAt: nowIso
        }, { merge: true });
      } else {
        if (existingRecord.status === 'active') {
          return res.status(409).json({ error: 'ACTIVE_RELATIONSHIP_LOCKED' });
        }
        targetRecord = {
          ...existingRecord,
          partner1,
          type: type as RelationshipType,
          startDate: formatDate(startDate, 'en'),
          startDateAr: formatDate(startDate, 'ar'),
          startDateIso: startDate
        };
        batch.set(adminDb.collection(RELATIONSHIPS_COL).doc(existingRecord.id), targetRecord, { merge: true });
        batch.set(adminDb.collection(USERS_COL).doc(user.uid), {
          phoneE164: partner1.phoneE164,
          updatedAt: nowIso
        }, { merge: true });
      }
      await batch.commit();
      return res.json({ success: true, record: targetRecord });
    } catch (error) {
      console.error('Error saving relationship:', error);
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post(['/api/invitations', '/api/invite/create'], requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const record = await getOwnedRecord(user.uid);
      if (!record || record.p1Uid !== user.uid) return res.status(404).json({ error: 'RELATIONSHIP_DRAFT_NOT_FOUND' });
      if (record.status === 'active') return res.status(409).json({ error: 'ACTIVE_RELATIONSHIP_EXISTS' });

      const {
        partner2Name,
        partner2Email,
        partner2Phone,
        partner2PhoneCountry,
        partner2Whatsapp,
        partner2WhatsappCountry
      } = req.body as Partial<Invitation>;

      if (!partner2Name?.trim()) return res.status(400).json({ error: 'PARTNER_NAME_REQUIRED' });
      if (!partner2Email && !partner2Phone && !partner2Whatsapp) {
        return res.status(400).json({ error: 'PARTNER_CONTACT_REQUIRED' });
      }

      if (record.inviteId) {
        const oldInviteDoc = await adminDb.collection(INVITATIONS_COL).doc(record.inviteId).get();
        if (oldInviteDoc.exists) {
          const oldInvite = oldInviteDoc.data() as Invitation;
          if (oldInvite.status === 'pending' && new Date(oldInvite.expiresAt).getTime() > Date.now()) {
            return res.status(409).json({ error: 'PENDING_INVITATION_EXISTS', invitation: oldInvite });
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
        partner2Email: partner2Email?.trim().toLowerCase() || null,
        partner2Phone: partner2Phone || null,
        partner2PhoneCountry: partner2PhoneCountry || null,
        partner2Whatsapp: partner2Whatsapp || null,
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

      const batch = adminDb.batch();
      batch.set(adminDb.collection(INVITATIONS_COL).doc(inviteId), invitation);
      batch.set(adminDb.collection(RELATIONSHIPS_COL).doc(record.id), updatedRecord);
      await batch.commit();

      return res.json({ success: true, invitation, record: updatedRecord });
    } catch (error) {
      console.error('Error creating invitation:', error);
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get('/api/invitations/:inviteId', async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const inviteRef = adminDb.collection(INVITATIONS_COL).doc(req.params.inviteId);
      const inviteDoc = await inviteRef.get();
      if (!inviteDoc.exists) return res.status(404).json({ error: 'INVITATION_NOT_FOUND' });

      const invitation = inviteDoc.data() as Invitation;
      if (invitation.status === 'pending' && new Date(invitation.expiresAt).getTime() <= Date.now()) {
        invitation.status = 'expired';
        await inviteRef.update({ status: 'expired' });
      }

      const relDoc = await adminDb.collection(RELATIONSHIPS_COL).doc(invitation.recordId).get();
      const record = relDoc.exists ? (relDoc.data() as RelationshipRecord) : null;

      return res.json({
        invitation: {
          id: invitation.id,
          recordId: invitation.recordId,
          inviterName: invitation.inviterName,
          partner2Name: invitation.partner2Name,
          relationshipType: invitation.relationshipType,
          startDate: invitation.startDate,
          startDateAr: invitation.startDateAr,
          startDateIso: invitation.startDateIso,
          status: invitation.status,
          createdAt: invitation.createdAt,
          expiresAt: invitation.expiresAt,
          reminderCount: invitation.reminderCount
        },
        record: record ? safePublicRecord(record) : null
      });
    } catch (error) {
      console.error('Error getting invitation preview:', error);
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post('/api/invitations/:inviteId/accept', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const partner2 = (req.body as { partner2?: PartnerData }).partner2;
      if (!partner2) return res.status(400).json({ error: 'PARTNER2_PROFILE_REQUIRED' });
      if (!user.phone_number || !partner2.phoneE164 || user.phone_number !== partner2.phoneE164) {
        return res.status(400).json({ error: 'VERIFIED_PHONE_REQUIRED' });
      }

      const inviteRef = adminDb.collection(INVITATIONS_COL).doc(req.params.inviteId);
      const result = await adminDb.runTransaction(async (transaction) => {
        // All reads must occur before any writes
        const invDoc = await transaction.get(inviteRef);
        if (!invDoc.exists) throw new Error('INVITATION_NOT_FOUND');
        const invitation = invDoc.data() as Invitation;

        if (invitation.status !== 'pending') throw new Error(`INVITATION_${invitation.status.toUpperCase()}`);
        if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
          throw new Error('INVITATION_EXPIRED');
        }
        if (invitation.p1Uid === user.uid) throw new Error('SELF_RELATIONSHIP_NOT_ALLOWED');

        const emailMatches = Boolean(invitation.partner2Email && user.email && invitation.partner2Email.toLowerCase() === user.email.toLowerCase());
        const phoneMatches = Boolean(invitation.partner2Phone && user.phone_number && invitation.partner2Phone === user.phone_number);
        const hasAuthoritativeTarget = Boolean(invitation.partner2Email || invitation.partner2Phone);
        if (hasAuthoritativeTarget && !emailMatches && !phoneMatches) {
          throw new Error('INVITATION_IDENTITY_MISMATCH');
        }

        const relRef = adminDb.collection(RELATIONSHIPS_COL).doc(invitation.recordId);
        const relDoc = await transaction.get(relRef);
        if (!relDoc.exists) throw new Error('RELATIONSHIP_NOT_FOUND');
        const record = relDoc.data() as RelationshipRecord;
        if (record.status === 'active') throw new Error('RELATIONSHIP_ALREADY_ACTIVE');

        // Check if P2 is already bound to an active relationship
        const p2UserRef = adminDb.collection(USERS_COL).doc(user.uid);
        const p2UserDoc = await transaction.get(p2UserRef);
        if (p2UserDoc.exists && p2UserDoc.data()?.activeRecordId && p2UserDoc.data()?.activeRecordId !== record.id) {
          const existingRelDoc = await transaction.get(adminDb.collection(RELATIONSHIPS_COL).doc(p2UserDoc.data()?.activeRecordId));
          if (existingRelDoc.exists && (existingRelDoc.data() as RelationshipRecord).status === 'active') {
            throw new Error('P2_ALREADY_IN_ACTIVE_RELATIONSHIP');
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
          updatedAt: nowIso
        }, { merge: true });

        // 4. Update P1 user document
        transaction.set(adminDb.collection(USERS_COL).doc(invitation.p1Uid), {
          activeRecordId: record.id,
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
        SELF_RELATIONSHIP_NOT_ALLOWED: 400,
        INVITATION_IDENTITY_MISMATCH: 403,
        RELATIONSHIP_ALREADY_ACTIVE: 409,
        P2_ALREADY_IN_ACTIVE_RELATIONSHIP: 409
      };
      const statusCode = statusMap[msg] || (msg.startsWith('INVITATION_') ? 409 : 500);
      return res.status(statusCode).json({
        error: msg,
        details: msg
      });
    }
  });

  app.post('/api/invitations/:inviteId/decline', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const inviteRef = adminDb.collection(INVITATIONS_COL).doc(req.params.inviteId);
      const result = await adminDb.runTransaction(async (transaction) => {
        const invDoc = await transaction.get(inviteRef);
        if (!invDoc.exists) throw new Error('INVITATION_NOT_FOUND');
        const invitation = invDoc.data() as Invitation;
        if (invitation.status !== 'pending') throw new Error(`INVITATION_${invitation.status.toUpperCase()}`);
        if (invitation.p1Uid === user.uid) throw new Error('INVITER_CANNOT_DECLINE_AS_P2');

        const emailMatches = Boolean(invitation.partner2Email && user.email && invitation.partner2Email.toLowerCase() === user.email.toLowerCase());
        const phoneMatches = Boolean(invitation.partner2Phone && user.phone_number && invitation.partner2Phone === user.phone_number);
        if ((invitation.partner2Email || invitation.partner2Phone) && !emailMatches && !phoneMatches) {
          throw new Error('INVITATION_IDENTITY_MISMATCH');
        }

        transaction.update(inviteRef, {
          status: 'declined',
          p2Uid: user.uid
        });
        return { ...invitation, status: 'declined' as const, p2Uid: user.uid };
      });
      return res.json({ success: true, invitation: result });
    } catch (error) {
      console.error('Error declining invitation:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const statusCode = msg === 'INVITATION_NOT_FOUND' ? 404 : msg === 'INVITATION_IDENTITY_MISMATCH' ? 403 : msg === 'INVITER_CANNOT_DECLINE_AS_P2' ? 400 : 500;
      return res.status(statusCode).json({ error: msg });
    }
  });

  app.post('/api/invitations/:inviteId/cancel', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const inviteRef = adminDb.collection(INVITATIONS_COL).doc(req.params.inviteId);
      const result = await adminDb.runTransaction(async (transaction) => {
        const invDoc = await transaction.get(inviteRef);
        if (!invDoc.exists) throw new Error('INVITATION_NOT_FOUND');
        const invitation = invDoc.data() as Invitation;
        if (invitation.p1Uid !== user.uid) throw new Error('NOT_INVITATION_OWNER');
        if (invitation.status !== 'pending') throw new Error(`INVITATION_${invitation.status.toUpperCase()}`);

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
      const statusCode = msg === 'INVITATION_NOT_FOUND' ? 404 : msg === 'NOT_INVITATION_OWNER' ? 403 : 500;
      return res.status(statusCode).json({ error: msg });
    }
  });

  app.patch(['/api/record/settings', '/api/certificates/:recordId/settings'], requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const record = await getOwnedRecord(user.uid);
      if (!record) return res.status(404).json({ error: 'RELATIONSHIP_NOT_FOUND' });
      if (record.p1Uid !== user.uid && record.p2Uid !== user.uid) {
        return res.status(403).json({ error: 'NOT_RELATIONSHIP_PARTICIPANT' });
      }

      const { showSocialHandles, showContactDetails, showQrMatrix } = req.body as Partial<CertificateSettings>;
      const newSettings: CertificateSettings = {
        showSocialHandles: typeof showSocialHandles === 'boolean' ? showSocialHandles : record.settings.showSocialHandles,
        showContactDetails: typeof showContactDetails === 'boolean' ? showContactDetails : record.settings.showContactDetails,
        showQrMatrix: typeof showQrMatrix === 'boolean' ? showQrMatrix : record.settings.showQrMatrix
      };

      await adminDb.collection(RELATIONSHIPS_COL).doc(record.id).update({
        settings: newSettings
      });
      return res.json({ success: true, settings: newSettings });
    } catch (error) {
      console.error('Error updating settings:', error);
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get('/api/verify/:refCode', async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const cleanRef = req.params.refCode.trim().toUpperCase();
      const certRef = adminDb.collection(CERTIFICATES_COL).doc(cleanRef);
      const certDoc = await certRef.get();
      if (certDoc.exists) {
        const raw = certDoc.data() || {};
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
          status: raw.status || 'ended',
          issuedDate: raw.issuedDate,
          issuedDateAr: raw.issuedDateAr
        };
        return res.json({ found: true, record: safeRecord });
      }
      return res.status(404).json({ found: false, message: 'No record found' });
    } catch (error) {
      console.error('Error verifying record:', error);
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        details: error instanceof Error ? error.message : String(error)
      });
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
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post('/api/change-requests', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const record = await getOwnedRecord(user.uid);
      if (!record || record.status !== 'active') {
        return res.status(404).json({ error: 'ACTIVE_RELATIONSHIP_NOT_FOUND' });
      }

      const isP1 = record.p1Uid === user.uid;
      const isP2 = record.p2Uid === user.uid;
      if (!isP1 && !isP2) {
        return res.status(403).json({ error: 'NOT_RELATIONSHIP_PARTICIPANT' });
      }

      const requesterRole: 'p1' | 'p2' = isP1 ? 'p1' : 'p2';
      const requesterName = isP1 ? record.partner1.fullName : record.partner2.fullName;
      const approverUid = isP1 ? record.p2Uid : record.p1Uid;

      if (!approverUid) {
        return res.status(400).json({ error: 'NO_PARTNER_TO_APPROVE' });
      }

      const { field, proposedValue } = req.body as {
        field?: string;
        proposedValue?: string;
      };

      if (!field || typeof proposedValue !== 'string') {
        return res.status(400).json({ error: 'INVALID_REQUEST_PARAMETERS' });
      }

      const cleanProposed = proposedValue.trim();
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
          return res.status(400).json({ error: 'INVALID_RELATIONSHIP_TYPE' });
        }
        oldValue = record.type;
        if (cleanProposed === oldValue) {
          return res.status(400).json({ error: 'VALUE_UNCHANGED' });
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
          return res.status(400).json({ error: 'INVALID_START_DATE' });
        }
        oldValue = record.startDateIso || record.startDate;
        if (cleanProposed === record.startDateIso) {
          return res.status(400).json({ error: 'VALUE_UNCHANGED' });
        }
        fieldLabelAr = 'تاريخ البداية';
        fieldLabelEn = 'Start Date';
        oldValueDisplayAr = record.startDateAr;
        oldValueDisplayEn = record.startDate;
        proposedValueDisplayAr = formatDate(cleanProposed, 'ar');
        proposedValueDisplayEn = formatDate(cleanProposed, 'en');
      } else if (field === 'partner1FullName') {
        if (!isP1) {
          return res.status(403).json({ error: 'CANNOT_EDIT_PARTNER_INFO' });
        }
        if (!cleanProposed) {
          return res.status(400).json({ error: 'NAME_REQUIRED' });
        }
        oldValue = record.partner1.fullName;
        if (cleanProposed === oldValue) {
          return res.status(400).json({ error: 'VALUE_UNCHANGED' });
        }
        target = 'partner1_name';
        fieldLabelAr = 'اسم الشريك الأول (في الشهادة)';
        fieldLabelEn = 'Partner 1 Name (on Certificate)';
        oldValueDisplayAr = oldValue;
        oldValueDisplayEn = oldValue;
        proposedValueDisplayAr = cleanProposed;
        proposedValueDisplayEn = cleanProposed;
      } else if (field === 'partner2FullName') {
        if (!isP2) {
          return res.status(403).json({ error: 'CANNOT_EDIT_PARTNER_INFO' });
        }
        if (!cleanProposed) {
          return res.status(400).json({ error: 'NAME_REQUIRED' });
        }
        oldValue = record.partner2.fullName;
        if (cleanProposed === oldValue) {
          return res.status(400).json({ error: 'VALUE_UNCHANGED' });
        }
        target = 'partner2_name';
        fieldLabelAr = 'اسم الشريك الثاني (في الشهادة)';
        fieldLabelEn = 'Partner 2 Name (on Certificate)';
        oldValueDisplayAr = oldValue;
        oldValueDisplayEn = oldValue;
        proposedValueDisplayAr = cleanProposed;
        proposedValueDisplayEn = cleanProposed;
      } else {
        return res.status(400).json({ error: 'INVALID_CHANGE_FIELD' });
      }

      // Check if duplicate pending request exists
      const existingSnap = await adminDb
        .collection(CHANGE_REQUESTS_COL)
        .where('recordId', '==', record.id)
        .where('field', '==', field)
        .where('status', '==', 'pending')
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        return res.status(409).json({
          error: 'PENDING_REQUEST_EXISTS',
          changeRequest: existingSnap.docs[0].data()
        });
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

      await adminDb.collection(CHANGE_REQUESTS_COL).doc(requestId).set(newChangeRequest);

      return res.json({ success: true, changeRequest: newChangeRequest });
    } catch (error) {
      console.error('Error creating change request:', error);
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post('/api/change-requests/:requestId/approve', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const reqId = req.params.requestId;
      const crRef = adminDb.collection(CHANGE_REQUESTS_COL).doc(reqId);

      const result = await adminDb.runTransaction(async (transaction) => {
        const crDoc = await transaction.get(crRef);
        if (!crDoc.exists) throw new Error('REQUEST_NOT_FOUND');
        const cr = crDoc.data() as ChangeRequestDoc;

        if (cr.status !== 'pending') throw new Error(`REQUEST_${cr.status.toUpperCase()}`);
        if (cr.approverUid !== user.uid) throw new Error('UNAUTHORIZED_APPROVER');

        const relRef = adminDb.collection(RELATIONSHIPS_COL).doc(cr.recordId);
        const relDoc = await transaction.get(relRef);
        if (!relDoc.exists) throw new Error('RELATIONSHIP_NOT_FOUND');
        const record = relDoc.data() as RelationshipRecord;
        if (record.status !== 'active') throw new Error('RELATIONSHIP_NOT_ACTIVE');

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

        // Update change request
        const updatedCr: ChangeRequestDoc = {
          ...cr,
          status: 'approved',
          decidedAt: nowIso,
          decisionByUid: user.uid
        };
        transaction.set(crRef, updatedCr);

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
        RELATIONSHIP_NOT_ACTIVE: 409
      };
      const statusCode = statusMap[msg] || 500;
      return res.status(statusCode).json({ error: msg });
    }
  });

  app.post('/api/change-requests/:requestId/decline', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const reqId = req.params.requestId;
      const crRef = adminDb.collection(CHANGE_REQUESTS_COL).doc(reqId);

      const result = await adminDb.runTransaction(async (transaction) => {
        const crDoc = await transaction.get(crRef);
        if (!crDoc.exists) throw new Error('REQUEST_NOT_FOUND');
        const cr = crDoc.data() as ChangeRequestDoc;

        if (cr.status !== 'pending') throw new Error(`REQUEST_${cr.status.toUpperCase()}`);
        if (cr.approverUid !== user.uid) throw new Error('UNAUTHORIZED_APPROVER');

        const nowIso = new Date().toISOString();
        const updatedCr: ChangeRequestDoc = {
          ...cr,
          status: 'declined',
          decidedAt: nowIso,
          decisionByUid: user.uid
        };
        transaction.set(crRef, updatedCr);
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
        REQUEST_DECLINED: 409
      };
      const statusCode = statusMap[msg] || 500;
      return res.status(statusCode).json({ error: msg });
    }
  });

  app.patch('/api/profile/me', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const record = await getOwnedRecord(user.uid);
      if (!record || record.status !== 'active') {
        return res.status(404).json({ error: 'ACTIVE_RELATIONSHIP_NOT_FOUND' });
      }

      const isP1 = record.p1Uid === user.uid;
      const isP2 = record.p2Uid === user.uid;
      if (!isP1 && !isP2) {
        return res.status(403).json({ error: 'NOT_RELATIONSHIP_PARTICIPANT' });
      }

      // Check if body attempts to target partner fields directly
      const body = req.body as Record<string, unknown>;
      if (isP1 && (body.partner2 || body.partner2FullName || body.target === 'partner2')) {
        return res.status(403).json({ error: 'CANNOT_EDIT_PARTNER_INFO' });
      }
      if (isP2 && (body.partner1 || body.partner1FullName || body.target === 'partner1')) {
        return res.status(403).json({ error: 'CANNOT_EDIT_PARTNER_INFO' });
      }

      const { socialHandle, fullNameEn, whatsappNumber, whatsappCountry } = req.body as {
        socialHandle?: string;
        fullNameEn?: string;
        whatsappNumber?: string;
        whatsappCountry?: string;
      };

      const updatedRecord: RelationshipRecord = { ...record };

      if (isP1) {
        const p1 = { ...updatedRecord.partner1 };
        if (socialHandle !== undefined) {
          p1.socialHandle = socialHandle ? socialHandle.trim().replace(/^@/, '') : undefined;
        }
        if (fullNameEn !== undefined) {
          p1.fullNameEn = fullNameEn.trim() || undefined;
        }
        if (whatsappNumber !== undefined) {
          p1.whatsappNumber = whatsappNumber.trim();
        }
        if (whatsappCountry !== undefined) {
          p1.whatsappCountry = whatsappCountry.trim();
        }
        updatedRecord.partner1 = p1;
      } else {
        const p2 = { ...updatedRecord.partner2 };
        if (socialHandle !== undefined) {
          p2.socialHandle = socialHandle ? socialHandle.trim().replace(/^@/, '') : undefined;
        }
        if (fullNameEn !== undefined) {
          p2.fullNameEn = fullNameEn.trim() || undefined;
        }
        if (whatsappNumber !== undefined) {
          p2.whatsappNumber = whatsappNumber.trim();
        }
        if (whatsappCountry !== undefined) {
          p2.whatsappCountry = whatsappCountry.trim();
        }
        updatedRecord.partner2 = p2;
      }

      await adminDb.collection(RELATIONSHIPS_COL).doc(record.id).set(updatedRecord);

      // Update certificate projection for english display names if present
      if (record.verificationRef && fullNameEn !== undefined) {
        await adminDb.collection(CERTIFICATES_COL).doc(record.verificationRef).set({
          partner1En: updatedRecord.partner1.fullNameEn || null,
          partner2En: updatedRecord.partner2.fullNameEn || null
        }, { merge: true });
      }

      return res.json({ success: true, record: updatedRecord });
    } catch (error) {
      console.error('Error updating personal profile:', error);
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Shared trusted backend operation for relationship termination
  interface TerminateRelationshipResult {
    updatedRecord: RelationshipRecord;
    partnerUid: string | null;
    requesterName: string;
  }

  async function terminateActiveRelationship(
    db: FirebaseFirestore.Firestore,
    callerUid: string,
    record: RelationshipRecord,
    batch: FirebaseFirestore.WriteBatch,
    endReason: string = 'user_ended'
  ): Promise<TerminateRelationshipResult> {
    if (record.status !== 'active') {
      throw new Error('ACTIVE_RELATIONSHIP_NOT_FOUND');
    }

    if (record.p1Uid !== callerUid && record.p2Uid !== callerUid) {
      throw new Error('NOT_RELATIONSHIP_PARTICIPANT');
    }

    const nowIso = new Date().toISOString();
    const updatedRecord: RelationshipRecord = {
      ...record,
      status: 'ended'
    };

    const partnerUid = (record.p1Uid === callerUid ? record.p2Uid : record.p1Uid) || null;
    const requesterName = record.p1Uid === callerUid ? record.partner1.fullName : record.partner2.fullName;

    // 1. Authoritative relationship document status transition and audit trail
    batch.set(db.collection(RELATIONSHIPS_COL).doc(record.id), {
      status: 'ended',
      previousStatus: record.status,
      endedAt: nowIso,
      endedByUid: callerUid,
      endReason,
      actionType: endReason === 'account_deletion' ? 'end_relationship_and_delete_account' : 'end_relationship'
    }, { merge: true });

    // 2. Deactivate public certificate projection and QR verification
    if (record.verificationRef) {
      batch.set(db.collection(CERTIFICATES_COL).doc(record.verificationRef), {
        status: 'ended',
        endedAt: nowIso
      }, { merge: true });
    }

    // 3. Clear active relationship pointer from both partners (keeps user profile intact)
    if (record.p1Uid) {
      batch.set(db.collection(USERS_COL).doc(record.p1Uid), {
        activeRecordId: FieldValue.delete(),
        updatedAt: nowIso
      }, { merge: true });
    }
    if (record.p2Uid) {
      batch.set(db.collection(USERS_COL).doc(record.p2Uid), {
        activeRecordId: FieldValue.delete(),
        updatedAt: nowIso
      }, { merge: true });
    }

    // 4. Close/cancel all pending change requests for this relationship to prevent stale approvals
    const pendingSnap = await db.collection(CHANGE_REQUESTS_COL)
      .where('recordId', '==', record.id)
      .where('status', '==', 'pending')
      .get();

    pendingSnap.forEach((doc) => {
      batch.set(doc.ref, {
        status: 'declined',
        declinedReason: 'relationship_ended',
        decidedAt: nowIso,
        decisionByUid: callerUid
      }, { merge: true });
    });

    // 5. Send informational in-app notification to the other partner
    if (partnerUid) {
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      batch.set(db.collection(NOTIFICATIONS_COL).doc(notifId), {
        id: notifId,
        userId: partnerUid,
        type: 'relationship_ended',
        recordId: record.id,
        senderName: requesterName,
        messageAr: `قام ${requesterName} بإنهاء العلاقة.`,
        messageEn: `${requesterName} ended the relationship.`,
        secondaryAr: 'لم تعد شهادة العلاقة نشطة.',
        secondaryEn: 'The relationship certificate is no longer active.',
        createdAt: nowIso,
        read: false
      });
    }

    return {
      updatedRecord,
      partnerUid,
      requesterName
    };
  }

  app.post('/api/relationship/end', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const record = await getOwnedRecord(user.uid);
      if (!record || record.status !== 'active') {
        return res.status(404).json({ error: 'ACTIVE_RELATIONSHIP_NOT_FOUND' });
      }

      if (req.body?.relationshipId && req.body.relationshipId !== record.id) {
        return res.status(403).json({ error: 'RELATIONSHIP_MISMATCH' });
      }

      const batch = adminDb.batch();
      const { updatedRecord } = await terminateActiveRelationship(adminDb, user.uid, record, batch, 'unilateral_end');
      await batch.commit();

      return res.json({ success: true, record: updatedRecord });
    } catch (error) {
      console.error('Error ending relationship:', error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === 'NOT_RELATIONSHIP_PARTICIPANT') return res.status(403).json({ error: msg });
      if (msg === 'ACTIVE_RELATIONSHIP_NOT_FOUND') return res.status(404).json({ error: msg });
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        details: msg
      });
    }
  });

  app.post('/api/account/delete', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const record = await getOwnedRecord(user.uid);

      if (req.body?.relationshipId && record && req.body.relationshipId !== record.id) {
        return res.status(403).json({ error: 'RELATIONSHIP_MISMATCH' });
      }

      const batch = adminDb.batch();

      // If user has an active relationship, terminate it via the shared termination flow first
      if (record && record.status === 'active') {
        await terminateActiveRelationship(adminDb, user.uid, record, batch, 'account_deletion');
      }

      // Delete ONLY the requesting user's Firestore user document
      batch.delete(adminDb.collection(USERS_COL).doc(user.uid));
      await batch.commit();

      // Delete ONLY the requesting user from Firebase Auth
      if (adminAuth) {
        try {
          await adminAuth.deleteUser(user.uid);
        } catch (authErr) {
          console.error('Error deleting auth user in adminAuth:', authErr);
        }
      }

      return res.json({ success: true, message: 'ACCOUNT_DELETED' });
    } catch (error) {
      console.error('Error deleting account:', error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === 'NOT_RELATIONSHIP_PARTICIPANT') return res.status(403).json({ error: msg });
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        details: msg
      });
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
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post('/api/notifications/:id/dismiss', requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
      const user = userFromResponse(res);
      const notifRef = adminDb.collection(NOTIFICATIONS_COL).doc(req.params.id);
      const notifDoc = await notifRef.get();
      if (!notifDoc.exists) return res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND' });
      const notif = notifDoc.data() as AppNotification;
      if (notif.userId !== user.uid) return res.status(403).json({ error: 'UNAUTHORIZED' });

      await notifRef.update({ read: true });
      return res.json({ success: true });
    } catch (error) {
      console.error('Error dismissing notification:', error);
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

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
  });
}

startServer().catch((error) => {
  console.error('Relationship ID server failed to start', error);
  process.exitCode = 1;
});
