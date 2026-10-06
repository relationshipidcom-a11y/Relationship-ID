process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  evaluateP2Authorization,
  shouldRenderP2RegistrationScreen,
  evaluateP2AuthNavigation
} from '../src/utils/relationshipState';
import {
  createApp,
  __setTestDeps,
  CURRENT_LEGAL_VERSION
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

test('P2 Invitation Authorization & Fail-Closed Protection Suite', async (t) => {
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
    server.closeAllConnections?.();
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

    const recordId = 'rec_test_auth_456';
    const inviteId = 'inv_test_auth_456';

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

  // 1. P1 regression tests
  await t.test('1. P1 attempting to view P2 details form fails closed: returns p1_rejected and never renders registration form', () => {
    const decision = evaluateP2Authorization({
      authInitialized: true,
      currentUserId: 'uid_p1',
      targetInviteId: 'inv_123',
      invitationAuth: {
        authenticated: true,
        isP1: true,
        authorized: false,
        reason: 'CURRENTLY_SIGNED_IN_AS_INVITER',
        inviteId: 'inv_123',
        authorizedUid: 'uid_p1'
      },
      invitation: { id: 'inv_123', p1Uid: 'uid_p1' },
      record: { status: 'pending_partner' },
      invitationLoading: false
    });

    assert.equal(decision.state, 'p1_rejected');
    assert.equal(decision.reason, 'CANNOT_ACCEPT_OWN_INVITATION');
    assert.equal(shouldRenderP2RegistrationScreen(decision), false);
  });

  await t.test('2. P1 in handleP2Authenticated fails closed: blocked from navigating to p2_details', () => {
    const navDecision = evaluateP2AuthNavigation({
      currentUserId: 'uid_p1',
      targetInviteId: 'inv_123',
      loadedData: {
        invitation: { id: 'inv_123', p1Uid: 'uid_p1' },
        authorization: {
          authenticated: true,
          isP1: true,
          authorized: false,
          reason: 'CURRENTLY_SIGNED_IN_AS_INVITER',
          inviteId: 'inv_123',
          authorizedUid: 'uid_p1'
        }
      },
      existingInvitation: { id: 'inv_123', p1Uid: 'uid_p1' }
    });

    assert.equal(navDecision.canNavigateToDetails, false);
    assert.equal(navDecision.error, 'CANNOT_ACCEPT_OWN_INVITATION');
    assert.equal(navDecision.redirectScreen, 'p2_landing');
  });

  // 2. Wrong account / stranger regression tests
  await t.test('3. Unrelated / wrong account attempting to access P2 details form fails closed: returns unauthorized and never renders form', () => {
    const decision = evaluateP2Authorization({
      authInitialized: true,
      currentUserId: 'uid_stranger',
      targetInviteId: 'inv_123',
      invitationAuth: {
        authenticated: true,
        isP1: false,
        authorized: false,
        reason: 'INVITATION_IDENTITY_MISMATCH',
        inviteId: 'inv_123',
        authorizedUid: 'uid_stranger'
      },
      invitation: { id: 'inv_123', p1Uid: 'uid_p1' },
      record: { status: 'pending_partner' },
      invitationLoading: false
    });

    assert.equal(decision.state, 'unauthorized');
    assert.equal(decision.reason, 'INVITATION_IDENTITY_MISMATCH');
    assert.equal(shouldRenderP2RegistrationScreen(decision), false);
  });

  await t.test('4. Wrong account in handleP2Authenticated fails closed: blocked from navigating to p2_details', () => {
    const navDecision = evaluateP2AuthNavigation({
      currentUserId: 'uid_stranger',
      targetInviteId: 'inv_123',
      loadedData: {
        invitation: { id: 'inv_123', p1Uid: 'uid_p1' },
        authorization: {
          authenticated: true,
          isP1: false,
          authorized: false,
          reason: 'INVITATION_IDENTITY_MISMATCH',
          inviteId: 'inv_123',
          authorizedUid: 'uid_stranger'
        }
      },
      existingInvitation: { id: 'inv_123', p1Uid: 'uid_p1' }
    });

    assert.equal(navDecision.canNavigateToDetails, false);
    assert.equal(navDecision.error, 'INVITATION_IDENTITY_MISMATCH');
    assert.equal(navDecision.redirectScreen, 'p2_landing');
  });

  // 3. Valid P2 regression tests
  await t.test('5. Valid P2 with confirmed authorization for current UID and exact inviteId renders registration screen', () => {
    const decision = evaluateP2Authorization({
      authInitialized: true,
      currentUserId: 'uid_p2',
      targetInviteId: 'inv_123',
      invitationAuth: {
        authenticated: true,
        isP1: false,
        authorized: true,
        inviteId: 'inv_123',
        authorizedUid: 'uid_p2'
      },
      invitation: { id: 'inv_123', p1Uid: 'uid_p1' },
      record: { status: 'pending_partner' },
      invitationLoading: false
    });

    assert.equal(decision.state, 'authorized');
    assert.equal(shouldRenderP2RegistrationScreen(decision), true);
  });

  await t.test('6. Valid P2 in handleP2Authenticated navigates to p2_details', () => {
    const navDecision = evaluateP2AuthNavigation({
      currentUserId: 'uid_p2',
      targetInviteId: 'inv_123',
      loadedData: {
        invitation: { id: 'inv_123', p1Uid: 'uid_p1' },
        authorization: {
          authenticated: true,
          isP1: false,
          authorized: true,
          inviteId: 'inv_123',
          authorizedUid: 'uid_p2'
        }
      },
      existingInvitation: { id: 'inv_123', p1Uid: 'uid_p1' }
    });

    assert.equal(navDecision.canNavigateToDetails, true);
    assert.equal(navDecision.redirectScreen, 'p2_details');
  });

  // 4. Failed invitation loading regression tests
  await t.test('7. Failed invitation loading in evaluateP2Authorization fails closed when invitationAuth is null', () => {
    // When invitationAuth is null after an error
    const decision = evaluateP2Authorization({
      authInitialized: true,
      currentUserId: 'uid_p2',
      targetInviteId: 'inv_123',
      invitationAuth: null,
      invitation: null,
      record: { status: 'pending_partner' },
      invitationLoading: false,
      hasAppError: true
    });

    assert.equal(decision.state, 'unauthorized');
    assert.equal(decision.reason, 'INVITATION_NOT_LOADED');
    assert.equal(shouldRenderP2RegistrationScreen(decision), false);
  });

  await t.test('8. Failed invitation loading in handleP2Authenticated fails closed when loadedData is null or throws', () => {
    // Simulated failed network request or rejection
    const navDecision = evaluateP2AuthNavigation({
      currentUserId: 'uid_p2',
      targetInviteId: 'inv_123',
      loadedData: null,
      existingInvitation: null
    });

    assert.equal(navDecision.canNavigateToDetails, false);
    assert.equal(navDecision.error, 'INVITATION_NOT_LOADED');
    assert.equal(navDecision.redirectScreen, 'p2_landing');
  });

  await t.test('9. Missing targetInviteId in handleP2Authenticated fails closed with INVITATION_NOT_FOUND', () => {
    const navDecision = evaluateP2AuthNavigation({
      currentUserId: 'uid_p2',
      targetInviteId: '',
      loadedData: null,
      existingInvitation: null
    });

    assert.equal(navDecision.canNavigateToDetails, false);
    assert.equal(navDecision.error, 'INVITATION_NOT_FOUND');
    assert.equal(navDecision.redirectScreen, 'p2_landing');
  });

  // 5. Pending authorization loading states
  await t.test('10. Pending auth initialization returns loading state and never renders registration form', () => {
    const decision = evaluateP2Authorization({
      authInitialized: false,
      currentUserId: null,
      targetInviteId: 'inv_123',
      invitationAuth: null,
      invitation: null,
      record: null,
      invitationLoading: false
    });

    assert.equal(decision.state, 'loading');
    if (decision.state === 'loading') {
      assert.equal(decision.messageKey, 'auth_verifying');
    }
    assert.equal(shouldRenderP2RegistrationScreen(decision), false);
  });

  await t.test('11. In-flight invitation loading returns loading state and never renders registration form', () => {
    const decision = evaluateP2Authorization({
      authInitialized: true,
      currentUserId: 'uid_p2',
      targetInviteId: 'inv_123',
      invitationAuth: null,
      invitation: null,
      record: null,
      invitationLoading: true
    });

    assert.equal(decision.state, 'loading');
    if (decision.state === 'loading') {
      assert.equal(decision.messageKey, 'invitation_verifying');
    }
    assert.equal(shouldRenderP2RegistrationScreen(decision), false);
  });

  // 6. UID and invitation ID mismatch tamper resistance
  await t.test('12. Authorization token UID mismatch fails closed (stale or stolen authorization object)', () => {
    const decision = evaluateP2Authorization({
      authInitialized: true,
      currentUserId: 'uid_different_user',
      targetInviteId: 'inv_123',
      invitationAuth: {
        authenticated: true,
        isP1: false,
        authorized: true,
        inviteId: 'inv_123',
        authorizedUid: 'uid_original_p2' // mismatch
      },
      invitation: { id: 'inv_123', p1Uid: 'uid_p1' },
      record: null,
      invitationLoading: false
    });

    assert.equal(decision.state, 'unauthorized');
    assert.equal(decision.reason, 'INVITATION_IDENTITY_MISMATCH');
    assert.equal(shouldRenderP2RegistrationScreen(decision), false);
  });

  await t.test('13. Invitation ID mismatch fails closed (authorization for different invite)', () => {
    const decision = evaluateP2Authorization({
      authInitialized: true,
      currentUserId: 'uid_p2',
      targetInviteId: 'inv_target_999',
      invitationAuth: {
        authenticated: true,
        isP1: false,
        authorized: true,
        inviteId: 'inv_other_111', // mismatch
        authorizedUid: 'uid_p2'
      },
      invitation: { id: 'inv_target_999', p1Uid: 'uid_p1' },
      record: null,
      invitationLoading: false
    });

    assert.equal(decision.state, 'unauthorized');
    assert.equal(decision.reason, 'INVITATION_IDENTITY_MISMATCH');
    assert.equal(shouldRenderP2RegistrationScreen(decision), false);
  });

  // 7. Active relationship P2 view preserved
  await t.test('14. Confirmed P2 in active relationship renders details screen', () => {
    const decision = evaluateP2Authorization({
      authInitialized: true,
      currentUserId: 'uid_p2',
      targetInviteId: undefined,
      invitationAuth: null,
      invitation: null,
      record: {
        status: 'active',
        p2Uid: 'uid_p2'
      },
      invitationLoading: false
    });

    assert.equal(decision.state, 'active_p2');
    assert.equal(shouldRenderP2RegistrationScreen(decision), true);
  });

  // 8. Integration test with real server endpoint confirming inviteId and authorizedUid binding
  await t.test('15. Server GET /api/invitations/:id returns explicit inviteId and authorizedUid confirmation', async () => {
    const { inviteId } = await seedRelationshipAndInvite();

    // Request as authorized P2
    const resP2 = await fetch(`${baseUrl}/api/invitations/${inviteId}`, {
      headers: { Authorization: 'Bearer token_p2' }
    });
    assert.equal(resP2.status, 200);
    const dataP2 = await resP2.json();
    assert.equal(dataP2.authorization.authenticated, true);
    assert.equal(dataP2.authorization.isP1, false);
    assert.equal(dataP2.authorization.authorized, true);
    assert.equal(dataP2.authorization.inviteId, inviteId);
    assert.equal(dataP2.authorization.authorizedUid, 'uid_p2');

    // Request as P1
    const resP1 = await fetch(`${baseUrl}/api/invitations/${inviteId}`, {
      headers: { Authorization: 'Bearer token_p1' }
    });
    assert.equal(resP1.status, 200);
    const dataP1 = await resP1.json();
    assert.equal(dataP1.authorization.isP1, true);
    assert.equal(dataP1.authorization.authorized, false);
    assert.equal(dataP1.authorization.inviteId, inviteId);
    assert.equal(dataP1.authorization.authorizedUid, 'uid_p1');

    // Request as stranger
    const resStranger = await fetch(`${baseUrl}/api/invitations/${inviteId}`, {
      headers: { Authorization: 'Bearer token_stranger' }
    });
    assert.equal(resStranger.status, 200);
    const dataStranger = await resStranger.json();
    assert.equal(dataStranger.authorization.isP1, false);
    assert.equal(dataStranger.authorization.authorized, false);
    assert.equal(dataStranger.authorization.reason, 'INVITATION_IDENTITY_MISMATCH');
    assert.equal(dataStranger.authorization.inviteId, inviteId);
    assert.equal(dataStranger.authorization.authorizedUid, 'uid_stranger');
  });

  // 9. Endpoint tests proving inviter UID (p1Uid) does not appear in response
  await t.test('16. Inviter UID does not appear in invitation response for unauthenticated viewer, wrong signed-in account, inviter, or authorized P2', async () => {
    const { inviteId } = await seedRelationshipAndInvite();
    const inviterUid = 'uid_p1';

    // A. Unauthenticated viewer
    const resUnauth = await fetch(`${baseUrl}/api/invitations/${inviteId}`);
    assert.equal(resUnauth.status, 200);
    const dataUnauth = await resUnauth.json();
    assert.equal(dataUnauth.authorization.authenticated, false);
    assert.equal(dataUnauth.authorization.isP1, false);
    assert.equal(dataUnauth.authorization.authorized, false);
    assert.equal('p1Uid' in dataUnauth.invitation, false);
    assert.equal(dataUnauth.invitation.p1Uid, undefined);
    assert.equal('p1Uid' in dataUnauth, false);
    assert.equal(JSON.stringify(dataUnauth).includes(inviterUid), false);

    // B. Wrong signed-in account (stranger)
    const resStranger = await fetch(`${baseUrl}/api/invitations/${inviteId}`, {
      headers: { Authorization: 'Bearer token_stranger' }
    });
    assert.equal(resStranger.status, 200);
    const dataStranger = await resStranger.json();
    assert.equal(dataStranger.authorization.authenticated, true);
    assert.equal(dataStranger.authorization.isP1, false);
    assert.equal(dataStranger.authorization.authorized, false);
    assert.equal('p1Uid' in dataStranger.invitation, false);
    assert.equal(dataStranger.invitation.p1Uid, undefined);
    assert.equal('p1Uid' in dataStranger, false);
    assert.equal(JSON.stringify(dataStranger).includes(inviterUid), false);

    // C. Authorized P2
    const resP2 = await fetch(`${baseUrl}/api/invitations/${inviteId}`, {
      headers: { Authorization: 'Bearer token_p2' }
    });
    assert.equal(resP2.status, 200);
    const dataP2 = await resP2.json();
    assert.equal(dataP2.authorization.authenticated, true);
    assert.equal(dataP2.authorization.isP1, false);
    assert.equal(dataP2.authorization.authorized, true);
    assert.equal('p1Uid' in dataP2.invitation, false);
    assert.equal(dataP2.invitation.p1Uid, undefined);
    assert.equal('p1Uid' in dataP2, false);
    assert.equal(JSON.stringify(dataP2).includes(inviterUid), false);

    // D. The Inviter (P1)
    const resP1 = await fetch(`${baseUrl}/api/invitations/${inviteId}`, {
      headers: { Authorization: 'Bearer token_p1' }
    });
    assert.equal(resP1.status, 200);
    const dataP1 = await resP1.json();
    assert.equal(dataP1.authorization.authenticated, true);
    assert.equal(dataP1.authorization.isP1, true);
    assert.equal(dataP1.authorization.authorized, false);
    assert.equal('p1Uid' in dataP1.invitation, false);
    assert.equal(dataP1.invitation.p1Uid, undefined);
    assert.equal('p1Uid' in dataP1, false);
    assert.equal(JSON.stringify(dataP1.invitation).includes(inviterUid), false);
    assert.equal(JSON.stringify(dataP1).includes('p1Uid'), false);

    // Verify inviterName and relationshipType are preserved in public preview
    assert.equal(dataUnauth.invitation.inviterName, 'Partner One');
    assert.equal(dataUnauth.invitation.relationshipType, 'dating');
    assert.equal(dataP1.invitation.inviterName, 'Partner One');
    assert.equal(dataP1.invitation.relationshipType, 'dating');
    assert.equal(dataStranger.invitation.inviterName, 'Partner One');
    assert.equal(dataStranger.invitation.relationshipType, 'dating');
  });
});
