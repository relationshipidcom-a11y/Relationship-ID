import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, __setTestDeps, CURRENT_LEGAL_VERSION, verifyRecipientIdentity } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

const SAUDI_P1_PHONE = '+966500000001';
const SAUDI_P2_PHONE = '+966500000002';

function validPartner2() {
  return {
    fullName: 'Sara Al-Otaibi',
    fullNameEn: 'Sara Al-Otaibi',
    birthDay: '15',
    birthMonth: '05',
    birthYear: '1995',
    email: 'p2@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '0500000002',
    phoneE164: SAUDI_P2_PHONE,
    whatsappCountry: 'SA +966',
    whatsappNumber: '0500000002',
    whatsappE164: SAUDI_P2_PHONE
  };
}

function seedBaseline(mockDb: any) {
  mockDb.reset();

  const p1 = {
    fullName: 'Fahad Al-Harbi',
    fullNameEn: 'Fahad Al-Harbi',
    birthDay: '10',
    birthMonth: '04',
    birthYear: '1992',
    email: 'p1@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '0500000001',
    phoneE164: SAUDI_P1_PHONE,
    whatsappCountry: 'SA +966',
    whatsappNumber: '0500000001',
    whatsappE164: SAUDI_P1_PHONE
  };

  mockDb.seed('users', 'uid_p1', {
    uid: 'uid_p1',
    email: 'p1@example.com',
    phoneE164: SAUDI_P1_PHONE,
    profile: p1
  });

  mockDb.seed('users', 'uid_p2', {
    uid: 'uid_p2',
    email: 'p2@example.com',
    phoneE164: SAUDI_P2_PHONE
  });

  mockDb.seed('relationships', 'rel_1', {
    id: 'rel_1',
    recordNumber: '123456',
    type: 'marriage',
    status: 'pending_partner',
    p1Uid: 'uid_p1',
    p2Uid: null,
    partner1: p1,
    partner2: {
      fullName: '',
      birthDay: '',
      birthMonth: '',
      birthYear: '',
      email: '',
      phoneCountry: 'SA +966',
      phoneNumber: '',
      whatsappCountry: 'SA +966',
      whatsappNumber: ''
    },
    startDate: '2024-01-01',
    startDateAr: '1 يناير 2024',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    inviteId: 'inv_1'
  });

  mockDb.seed('invitations', 'inv_1', {
    id: 'inv_1',
    recordId: 'rel_1',
    p1Uid: 'uid_p1',
    p2Uid: null,
    inviterName: 'Fahad Al-Harbi',
    relationshipType: 'marriage',
    partner2Name: 'Sara Al-Otaibi',
    partner2Email: 'p2@example.com',
    partner2Phone: '0500000002',
    partner2PhoneCountry: 'SA +966',
    partner2Whatsapp: '0500000002',
    partner2WhatsappCountry: 'SA +966',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00Z',
    expiresAt: '2099-01-01T00:00:00Z'
  });
}

test('Step 6 accept & decline suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  mockAuth.addUser('token_p1', {
    uid: 'uid_p1',
    email: 'p1@example.com',
    email_verified: true,
    phone_number: SAUDI_P1_PHONE
  });

  mockAuth.addUser('token_p2', {
    uid: 'uid_p2',
    email: 'p2@example.com',
    email_verified: true,
    phone_number: SAUDI_P2_PHONE
  });

  mockAuth.addUser('token_p2_unverified', {
    uid: 'uid_p2_unverified',
    email: 'p2@example.com',
    email_verified: false,
    phone_number: '+966500000099'
  });

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Happy path: verified P2, pending_partner record, adult birth date -> 200
    await t.test('1. Happy path: verified P2 -> 200, active relationship, certificate & contact reservations exist', async () => {
      seedBaseline(mockDb);

      const res = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        },
        body: JSON.stringify({ partner2: validPartner2(), acceptedLegalVersion: CURRENT_LEGAL_VERSION })
      });

      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);
      assert.equal(data.invitation.status, 'accepted');
      assert.equal(data.record.status, 'active');

      const rel = mockDb.getDoc('relationships', 'rel_1');
      assert.equal(rel?.status, 'active');
      assert.equal(rel?.p2Uid, 'uid_p2');

      const certs = mockDb.store.get('certificates');
      assert.ok(certs && certs.size > 0, 'Certificate document was written');

      const reservations = mockDb.store.get('contact_reservations');
      assert.ok(reservations && reservations.size > 0, 'Contact reservation documents were written');
    });

    // 2. P1 accepts own invitation -> 400 CANNOT_ACCEPT_OWN_INVITATION
    await t.test('2. P1 accepts own invitation -> 400 CANNOT_ACCEPT_OWN_INVITATION', async () => {
      seedBaseline(mockDb);

      const p1AsPartner2 = { ...validPartner2(), phoneE164: SAUDI_P1_PHONE, phoneNumber: '0500000001' };
      const res = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({ partner2: p1AsPartner2, acceptedLegalVersion: CURRENT_LEGAL_VERSION })
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as any;
      assert.equal(data.error, 'CANNOT_ACCEPT_OWN_INVITATION');
    });

    // 3. Matching email but email_verified false and no phone match -> 403 INVITATION_IDENTITY_MISMATCH
    await t.test('3. Matching email but email_verified false and no phone match -> 403 INVITATION_IDENTITY_MISMATCH', async () => {
      seedBaseline(mockDb);

      const unverifiedP2Data = { ...validPartner2(), phoneE164: '+966500000099', phoneNumber: '0500000099' };
      const res = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2_unverified'
        },
        body: JSON.stringify({ partner2: unverifiedP2Data, acceptedLegalVersion: CURRENT_LEGAL_VERSION })
      });

      assert.equal(res.status, 403);
      const data = (await res.json()) as any;
      assert.equal(data.error, 'INVITATION_IDENTITY_MISMATCH');
    });

    // 4. P1 has an account_deletions/{p1Uid} doc -> 409 ACCOUNT_DELETION_PENDING, NO cert or reservations written
    await t.test('4. P1 has account_deletions/{p1Uid} -> 409 ACCOUNT_DELETION_PENDING, no writes', async () => {
      seedBaseline(mockDb);
      mockDb.seed('account_deletions', 'uid_p1', {
        uid: 'uid_p1',
        status: 'pending',
        requestedAt: new Date().toISOString()
      });

      const res = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        },
        body: JSON.stringify({ partner2: validPartner2(), acceptedLegalVersion: CURRENT_LEGAL_VERSION })
      });

      assert.equal(res.status, 409);
      const data = (await res.json()) as any;
      assert.equal(data.error, 'ACCOUNT_DELETION_PENDING');

      const certs = mockDb.store.get('certificates');
      assert.equal(certs?.size || 0, 0, 'No certificate documents were written');

      const reservations = mockDb.store.get('contact_reservations');
      assert.equal(reservations?.size || 0, 0, 'No contact reservation documents were written');
    });

    // 5. Relationship status 'draft' -> 409 RELATIONSHIP_NOT_PENDING. Status 'deleting' -> 409
    await t.test('5. Relationship status draft or deleting -> 409', async () => {
      // 5a. Draft
      seedBaseline(mockDb);
      const relDraft = mockDb.getDoc('relationships', 'rel_1');
      relDraft.status = 'draft';
      mockDb.seed('relationships', 'rel_1', relDraft);

      const resDraft = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        },
        body: JSON.stringify({ partner2: validPartner2(), acceptedLegalVersion: CURRENT_LEGAL_VERSION })
      });
      assert.equal(resDraft.status, 409);
      const draftData = (await resDraft.json()) as any;
      assert.equal(draftData.error, 'RELATIONSHIP_NOT_PENDING');

      // 5b. Deleting
      seedBaseline(mockDb);
      const relDeleting = mockDb.getDoc('relationships', 'rel_1');
      relDeleting.status = 'deleting';
      mockDb.seed('relationships', 'rel_1', relDeleting);

      const resDeleting = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        },
        body: JSON.stringify({ partner2: validPartner2(), acceptedLegalVersion: CURRENT_LEGAL_VERSION })
      });
      assert.equal(resDeleting.status, 409);
      const deletingData = (await resDeleting.json()) as any;
      assert.ok(
        ['RELATIONSHIP_NOT_PENDING', 'RELATIONSHIP_DELETION_PENDING'].includes(deletingData.error),
        `Unexpected error: ${deletingData.error}`
      );
    });

    // 6. Under-18 partner2 -> 400 AGE_REQUIREMENT_NOT_MET
    await t.test('6. Under-18 partner2 -> 400 AGE_REQUIREMENT_NOT_MET', async () => {
      seedBaseline(mockDb);

      const underAgePartner2 = {
        ...validPartner2(),
        birthYear: (new Date().getFullYear() - 16).toString()
      };

      const res = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        },
        body: JSON.stringify({ partner2: underAgePartner2, acceptedLegalVersion: CURRENT_LEGAL_VERSION })
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as any;
      assert.equal(data.error, 'AGE_REQUIREMENT_NOT_MET');
    });

    // 7. Decline while P1 deletion pending -> 409
    await t.test('7. Decline while P1 deletion pending -> 409', async () => {
      seedBaseline(mockDb);
      mockDb.seed('account_deletions', 'uid_p1', {
        uid: 'uid_p1',
        status: 'pending',
        requestedAt: new Date().toISOString()
      });

      const res = await fetch(`${baseUrl}/api/invitations/inv_1/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        }
      });

      assert.equal(res.status, 409);
      const data = (await res.json()) as any;
      assert.equal(data.error, 'ACCOUNT_DELETION_PENDING');
    });

    // 8. WhatsApp-only invite test cases
    await t.test('8. WhatsApp-only invite: matching phone -> accepted, different phone -> mismatch, no phone -> mismatch', async () => {
      seedBaseline(mockDb);
      const invWa: any = {
        id: 'inv_wa',
        recordId: 'rel_1',
        p1Uid: 'uid_p1',
        p2Uid: null,
        inviterName: 'Fahad Al-Harbi',
        relationshipType: 'marriage',
        partner2Name: 'Sara Al-Otaibi',
        partner2Whatsapp: '0500000002',
        partner2WhatsappCountry: 'SA +966',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
        expiresAt: '2099-01-01T00:00:00Z'
      };
      mockDb.seed('invitations', 'inv_wa', invWa);

      // 8a. WhatsApp-only invite + user signed in with that same phone number -> accepted
      const resAccepted = await fetch(`${baseUrl}/api/invitations/inv_wa/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        },
        body: JSON.stringify({ partner2: validPartner2(), acceptedLegalVersion: CURRENT_LEGAL_VERSION })
      });
      assert.equal(resAccepted.status, 200);
      const dataAccepted = (await resAccepted.json()) as any;
      assert.equal(dataAccepted.success, true);
      assert.equal(dataAccepted.invitation.status, 'accepted');

      const directResMatch = verifyRecipientIdentity({
        invitation: invWa,
        user: { uid: 'uid_p2', phone_number: SAUDI_P2_PHONE },
        isAction: 'accept'
      });
      assert.equal(directResMatch.authorized, true);

      // 8b. WhatsApp-only invite + user with a different phone -> INVITATION_IDENTITY_MISMATCH
      seedBaseline(mockDb);
      mockDb.seed('invitations', 'inv_wa', invWa);

      mockAuth.addUser('token_p2_diff', {
        uid: 'uid_p2_diff',
        email: 'p2diff@example.com',
        email_verified: true,
        phone_number: '+966500000099'
      });

      const resDiff = await fetch(`${baseUrl}/api/invitations/inv_wa/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2_diff'
        },
        body: JSON.stringify({
          partner2: { ...validPartner2(), phoneE164: '+966500000099', phoneNumber: '0500000099' },
          acceptedLegalVersion: CURRENT_LEGAL_VERSION
        })
      });
      assert.equal(resDiff.status, 403);
      const dataDiff = (await resDiff.json()) as any;
      assert.equal(dataDiff.error, 'INVITATION_IDENTITY_MISMATCH');

      const directResDiff = verifyRecipientIdentity({
        invitation: invWa,
        user: { uid: 'uid_p2_diff', phone_number: '+966500000099' },
        isAction: 'accept'
      });
      assert.equal(directResDiff.authorized, false);
      assert.equal(directResDiff.reason, 'INVITATION_IDENTITY_MISMATCH');

      // 8c. WhatsApp-only invite + user with no phone -> INVITATION_IDENTITY_MISMATCH
      const directResNoPhone = verifyRecipientIdentity({
        invitation: invWa,
        user: { uid: 'uid_p2_no_phone', email: 'nophone@example.com', email_verified: true, phone_number: null },
        isAction: 'accept'
      });
      assert.equal(directResNoPhone.authorized, false);
      assert.equal(directResNoPhone.reason, 'INVITATION_IDENTITY_MISMATCH');
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
