import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createApp,
  __setTestDeps,
  CURRENT_LEGAL_VERSION,
  verifyRecipientIdentity
} from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

const P1_PHONE = '+966500000001';
const P2_PHONE = '+966500000002';
const STRANGER_PHONE = '+966500000099';

function samplePartner1() {
  return {
    fullName: 'Partner One',
    fullNameEn: 'Partner One',
    birthDay: '10',
    birthMonth: '04',
    birthYear: '1992',
    email: 'p1@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '500000001',
    phoneE164: P1_PHONE,
    whatsappCountry: 'SA +966',
    whatsappNumber: '500000001',
    whatsappE164: P1_PHONE
  };
}

function samplePartner2() {
  return {
    fullName: 'Partner Two',
    fullNameEn: 'Partner Two',
    birthDay: '15',
    birthMonth: '08',
    birthYear: '1994',
    email: 'p2@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '500000002',
    phoneE164: P2_PHONE,
    whatsappCountry: 'SA +966',
    whatsappNumber: '500000002',
    whatsappE164: P2_PHONE
  };
}

test('P2 Protection & Recipient Binding Suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  let server: Server;
  let baseUrl: string;

  t.before(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const setupAuth = () => {
    mockAuth.reset();
    mockAuth.addUser('token_p1', {
      uid: 'uid_p1',
      email: 'p1@example.com',
      email_verified: true,
      phone_number: P1_PHONE
    });
    mockAuth.addUser('token_p2', {
      uid: 'uid_p2',
      email: 'p2@example.com',
      email_verified: true,
      phone_number: P2_PHONE
    });
    mockAuth.addUser('token_stranger', {
      uid: 'uid_stranger',
      email: 'stranger@example.com',
      email_verified: true,
      phone_number: STRANGER_PHONE
    });
  };

  const seedRelationshipAndInvite = async () => {
    mockDb.reset();
    setupAuth();

    const recordId = 'rec_test_123';
    const inviteId = 'inv_test_123';

    await mockDb.collection('users').doc('uid_p1').set({
      activeRecordId: recordId,
      phoneE164: P1_PHONE,
      legalConsentVersion: CURRENT_LEGAL_VERSION
    });

    await mockDb.collection('relationships').doc(recordId).set({
      id: recordId,
      status: 'pending_partner',
      type: 'dating',
      startDate: '2023-01-01',
      startDateAr: '1 يناير 2023',
      startDateIso: '2023-01-01',
      p1Uid: 'uid_p1',
      p2Uid: null,
      inviteId,
      partner1: samplePartner1(),
      partner2: {
        fullName: 'Partner Two',
        email: 'p2@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '500000002',
        phoneE164: P2_PHONE,
        birthDay: '',
        birthMonth: '',
        birthYear: ''
      },
      createdAt: new Date().toISOString()
    });

    await mockDb.collection('invitations').doc(inviteId).set({
      id: inviteId,
      recordId,
      inviterName: 'Partner One',
      partner2Name: 'Partner Two',
      partner2Email: 'p2@example.com',
      partner2Phone: P2_PHONE,
      partner2PhoneCountry: 'SA +966',
      relationshipType: 'dating',
      startDate: '2023-01-01',
      startDateAr: '1 يناير 2023',
      startDateIso: '2023-01-01',
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 3).toISOString(),
      reminderCount: 0,
      p1Uid: 'uid_p1',
      p2Uid: null
    });

    return { recordId, inviteId };
  };

  await t.test('1. Unauthenticated visitor opening GET /api/invitations/:id receives minimal preview without private record', async () => {
    const { inviteId } = await seedRelationshipAndInvite();
    const res = await fetch(`${baseUrl}/api/invitations/${inviteId}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.invitation.id, inviteId);
    assert.equal(data.invitation.inviterName, 'Partner One');
    assert.equal(data.record, null);
    assert.equal(data.authorization.authenticated, false);
    assert.equal(data.authorization.authorized, false);
    assert.equal(data.authorization.isP1, false);
  });

  await t.test('2. Signed-in P1 opening GET /api/invitations/:id receives authorization.isP1=true and record=null', async () => {
    const { inviteId } = await seedRelationshipAndInvite();
    const res = await fetch(`${baseUrl}/api/invitations/${inviteId}`, {
      headers: { Authorization: 'Bearer token_p1' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.authorization.authenticated, true);
    assert.equal(data.authorization.isP1, true);
    assert.equal(data.authorization.authorized, false);
    assert.equal(data.authorization.reason, 'CURRENTLY_SIGNED_IN_AS_INVITER');
    assert.equal(data.record, null);
  });

  await t.test('3. Unrelated authenticated account receives authorization.authorized=false and INVITATION_IDENTITY_MISMATCH', async () => {
    const { inviteId } = await seedRelationshipAndInvite();
    const res = await fetch(`${baseUrl}/api/invitations/${inviteId}`, {
      headers: { Authorization: 'Bearer token_stranger' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.authorization.authenticated, true);
    assert.equal(data.authorization.isP1, false);
    assert.equal(data.authorization.authorized, false);
    assert.equal(data.authorization.reason, 'INVITATION_IDENTITY_MISMATCH');
    assert.equal(data.record, null);
  });

  await t.test('4. Authorized P2 recipient receives authorization.authorized=true and full proposal record', async () => {
    const { inviteId } = await seedRelationshipAndInvite();
    const res = await fetch(`${baseUrl}/api/invitations/${inviteId}`, {
      headers: { Authorization: 'Bearer token_p2' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.authorization.authenticated, true);
    assert.equal(data.authorization.isP1, false);
    assert.equal(data.authorization.authorized, true);
    assert.ok(data.record);
    assert.equal(data.record.partner1Name, 'Partner One');
  });

  await t.test('5. P1 attempting to accept their own invitation is rejected with 400 CANNOT_ACCEPT_OWN_INVITATION', async () => {
    const { inviteId } = await seedRelationshipAndInvite();
    const p1AsP2 = {
      ...samplePartner2(),
      phoneE164: P1_PHONE,
      phoneNumber: '500000001'
    };
    const res = await fetch(`${baseUrl}/api/invitations/${inviteId}/accept`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner2: p1AsP2,
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'CANNOT_ACCEPT_OWN_INVITATION');
  });

  await t.test('6. P1 attempting to decline their own invitation is rejected with 400 INVITER_CANNOT_DECLINE_AS_P2', async () => {
    const { inviteId } = await seedRelationshipAndInvite();
    const res = await fetch(`${baseUrl}/api/invitations/${inviteId}/decline`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ block: false })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'INVITER_CANNOT_DECLINE_AS_P2');
  });

  await t.test('7. P1 attempting to create an invitation with their own email/phone is rejected with 400 SELF_INVITATION_NOT_ALLOWED', async () => {
    mockDb.reset();
    setupAuth();

    // Create draft relationship for P1
    const draftRes = await fetch(`${baseUrl}/api/record`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner1: samplePartner1(),
        type: 'dating',
        startDate: '2023-01-01',
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(draftRes.status, 200);

    // Attempt to invite with P1's own phone number
    const inviteRes = await fetch(`${baseUrl}/api/invitations`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner2Name: 'Fake Self Partner',
        partner2Phone: '500000001',
        partner2PhoneCountry: 'SA +966'
      })
    });
    assert.equal(inviteRes.status, 400);
    const inviteData = await inviteRes.json();
    assert.equal(inviteData.error, 'SELF_INVITATION_NOT_ALLOWED');
  });

  await t.test('8. P2 attempting to accept with same phone number as P1 is rejected with 400 SAME_PARTNER_CONTACT_NOT_ALLOWED', async () => {
    const { inviteId } = await seedRelationshipAndInvite();
    const samePhoneP2 = {
      ...samplePartner2(),
      phoneNumber: '500000001',
      phoneE164: P1_PHONE
    };

    const res = await fetch(`${baseUrl}/api/invitations/${inviteId}/accept`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p2',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner2: samePhoneP2,
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    // Rejects because user.phone_number does not match or same contact
    assert.ok(data.error === 'SAME_PARTNER_CONTACT_NOT_ALLOWED' || data.error === 'VERIFIED_PHONE_REQUIRED');
  });

  await t.test('9. Authorized P2 successfully accepts invitation and atomically generates active certificate', async () => {
    const { inviteId, recordId } = await seedRelationshipAndInvite();

    const res = await fetch(`${baseUrl}/api/invitations/${inviteId}/accept`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p2',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner2: samplePartner2(),
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.record.status, 'active');
    assert.equal(data.record.p1Uid, 'uid_p1');
    assert.equal(data.record.p2Uid, 'uid_p2');
    assert.ok(data.record.verificationRef);

    // Verify invitation status is updated to accepted
    const inviteDoc = await mockDb.collection('invitations').doc(inviteId).get();
    assert.equal(inviteDoc.data()?.status, 'accepted');
    assert.equal(inviteDoc.data()?.p2Uid, 'uid_p2');

    // Verify certificate document was created with minimal public fields
    const certRef = data.record.verificationRef;
    const certDoc = await mockDb.collection('certificates').doc(certRef).get();
    assert.ok(certDoc.exists);
    const certData = certDoc.data();
    assert.equal(certData?.partner1Name, 'Partner One');
    assert.equal(certData?.partner2Name, 'Partner Two');
    assert.equal(certData?.status, 'active');
    // Ensure internal IDs/tokens/contacts are not in public certificate doc
    assert.equal(certData?.p1Uid, undefined);
    assert.equal(certData?.p2Uid, undefined);
    assert.equal(certData?.recordId, undefined);
    assert.equal(certData?.partner1Email, undefined);
  });

  await t.test('10. Accepting an already accepted invitation is rejected with 409 INVITATION_ACCEPTED', async () => {
    const { inviteId } = await seedRelationshipAndInvite();

    // First acceptance
    await fetch(`${baseUrl}/api/invitations/${inviteId}/accept`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p2',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner2: samplePartner2(),
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });

    // Replay acceptance attempt
    const replayRes = await fetch(`${baseUrl}/api/invitations/${inviteId}/accept`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p2',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner2: samplePartner2(),
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(replayRes.status, 409);
    const data = await replayRes.json();
    assert.equal(data.error, 'INVITATION_ACCEPTED');
  });
});
