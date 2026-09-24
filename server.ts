import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env', override: true });
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
    if (recDoc.exists) return recDoc.data() as RelationshipRecord;
  }

  const p1Snap = await adminDb.collection(RELATIONSHIPS_COL).where('p1Uid', '==', uid).limit(1).get();
  if (!p1Snap.empty) return p1Snap.docs[0].data() as RelationshipRecord;

  const p2Snap = await adminDb.collection(RELATIONSHIPS_COL).where('p2Uid', '==', uid).limit(1).get();
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
      const record = await getOwnedRecord(user.uid);
      let invitation: Invitation | null = null;
      if (record?.inviteId) {
        const invDoc = await adminDb.collection(INVITATIONS_COL).doc(record.inviteId).get();
        if (invDoc.exists) {
          invitation = invDoc.data() as Invitation;
        }
      }
      return res.json({ record: record || null, invitation: invitation || null });
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
        return res.json({ found: true, record: certDoc.data() });
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
