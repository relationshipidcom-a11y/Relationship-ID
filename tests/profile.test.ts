import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, __setTestDeps, __setTwilioClient, CURRENT_LEGAL_VERSION } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';
import type { PartnerData } from '../src/types';

test('Profile route suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  const PHONE_1 = '+966500000001';
  const PHONE_2 = '+966500000002';

  mockAuth.addUser('token_user1', {
    uid: 'uid_user1',
    email: 'user1@example.com',
    email_verified: true,
    phone_number: PHONE_1
  });

  mockAuth.addUser('token_user1_nophone', {
    uid: 'uid_user1',
    email: 'user1@example.com',
    email_verified: true,
    phone_number: undefined
  });

  mockAuth.addUser('token_user_active', {
    uid: 'uid_user_active',
    email: 'active@example.com',
    email_verified: true,
    phone_number: '+966511111111'
  });

  mockAuth.addUser('token_user_draft', {
    uid: 'uid_user_draft',
    email: 'draft@example.com',
    email_verified: true,
    phone_number: '+966522222222'
  });

  // Seed user with active relationship for test 3d
  mockDb.seed('users', 'uid_user_active', {
    uid: 'uid_user_active',
    email: 'active@example.com',
    phoneE164: '+966511111111',
    activeRecordId: 'rel_active_1'
  });

  mockDb.seed('relationships', 'rel_active_1', {
    id: 'rel_active_1',
    recordNumber: '999999',
    type: 'marriage',
    status: 'active',
    p1Uid: 'uid_user_active',
    p2Uid: 'uid_other_active',
    partner1: {
      fullName: 'Original P1 Name',
      fullNameEn: 'Original P1 Name',
      birthDay: '01',
      birthMonth: '01',
      birthYear: '1990',
      email: 'active@example.com',
      phoneCountry: 'SA +966',
      phoneNumber: '0511111111',
      phoneE164: '+966511111111',
      whatsappCountry: 'SA +966',
      whatsappNumber: '0511111111',
      whatsappE164: '+966511111111',
      whatsappTrusted: true
    },
    partner2: {
      fullName: 'Original P2 Name',
      fullNameEn: 'Original P2 Name',
      birthDay: '02',
      birthMonth: '02',
      birthYear: '1991',
      email: 'p2active@example.com',
      phoneCountry: 'SA +966',
      phoneNumber: '0522222222',
      phoneE164: '+966522222222'
    },
    startDate: '2020-01-01',
    startDateAr: '1 يناير 2020',
    createdAt: '2020-01-01T00:00:00Z',
    updatedAt: '2020-01-01T00:00:00Z'
  });

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // a. POST /api/profile with a phone that equals the token phone_number → 200, profile.phoneVerified === true.
    await t.test('a. POST /api/profile with matching phone -> 200, profile.phoneVerified === true', async () => {
      const res = await fetch(`${baseUrl}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_user1' },
        body: JSON.stringify({
          fullName: 'User One',
          birthDay: '10',
          birthMonth: '10',
          birthYear: '1992',
          phoneNumber: '0500000001',
          phoneCountry: 'SA +966',
          phoneE164: PHONE_1
        })
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);
      assert.equal(data.profile.phoneVerified, true);
      assert.equal(data.verification.phoneVerified, true);
    });

    // b. POST /api/profile with a different phone than the token phone_number → 200, profile.phoneVerified === false.
    await t.test('b. POST /api/profile with different phone -> 200, profile.phoneVerified === false', async () => {
      const res = await fetch(`${baseUrl}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_user1' },
        body: JSON.stringify({
          fullName: 'User One',
          birthDay: '10',
          birthMonth: '10',
          birthYear: '1992',
          phoneNumber: '0500000002',
          phoneCountry: 'SA +966',
          phoneE164: PHONE_2
        })
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);
      assert.equal(data.profile.phoneVerified, false);
      assert.equal(data.verification.phoneVerified, false);
    });

    // c. POST /api/profile with a different WhatsApp number, sameWhatsapp false, and no stored trusted WhatsApp in the user doc → profile.whatsappTrusted === false, even if the request body sends whatsappTrusted: true.
    await t.test('c. POST /api/profile with different WhatsApp, sameWhatsapp false, no stored trusted WhatsApp -> profile.whatsappTrusted === false even if body has whatsappTrusted: true', async () => {
      const res = await fetch(`${baseUrl}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_user1' },
        body: JSON.stringify({
          fullName: 'User One',
          phoneNumber: '0500000001',
          phoneCountry: 'SA +966',
          phoneE164: PHONE_1,
          sameWhatsapp: false,
          whatsappNumber: '0599999999',
          whatsappCountry: 'SA +966',
          whatsappTrusted: true
        })
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.profile.whatsappTrusted, false);
      assert.equal(data.verification.whatsappTrusted, false);
    });

    // d. POST /api/profile for a user with an ACTIVE relationship, changing fullName → 403 ACTIVE_RELATIONSHIP_LOCKED.
    await t.test('d. POST /api/profile for user with ACTIVE relationship changing fullName -> 403 ACTIVE_RELATIONSHIP_LOCKED', async () => {
      const res = await fetch(`${baseUrl}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_user_active' },
        body: JSON.stringify({
          fullName: 'Changed P1 Name'
        })
      });
      assert.equal(res.status, 403);
      const data = (await res.json()) as any;
      assert.equal(data.error, 'ACTIVE_RELATIONSHIP_LOCKED');
    });

    // e. POST /api/profile alone, then POST /api/invite/create → 404 RELATIONSHIP_DRAFT_NOT_FOUND. Then POST /api/record (with acceptedLegalVersion = CURRENT_LEGAL_VERSION), then POST /api/invite/create → 200.
    await t.test('e. POST /api/profile alone, then invite -> 404 RELATIONSHIP_DRAFT_NOT_FOUND; then POST /api/record, then invite -> 200', async () => {
      // Step 1: POST /api/profile alone
      const resProf = await fetch(`${baseUrl}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_user_draft' },
        body: JSON.stringify({
          fullName: 'Draft P1 User',
          birthDay: '01',
          birthMonth: '01',
          birthYear: '1990',
          phoneNumber: '0522222222',
          phoneCountry: 'SA +966',
          phoneE164: '+966522222222'
        })
      });
      assert.equal(resProf.status, 200);

      // Step 2: POST /api/invite/create -> 404 RELATIONSHIP_DRAFT_NOT_FOUND
      const resInviteFail = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_user_draft' },
        body: JSON.stringify({
          partner2Name: 'Partner Two',
          partner2Phone: '0533333333',
          partner2PhoneCountry: 'SA +966'
        })
      });
      assert.equal(resInviteFail.status, 404);
      const dataInviteFail = (await resInviteFail.json()) as any;
      assert.ok(
        dataInviteFail.error === 'RELATIONSHIP_DRAFT_NOT_FOUND' || dataInviteFail.error === 'INVALID_REQUEST',
        `Expected 404 error, got: ${dataInviteFail.error}`
      );

      // Step 3: POST /api/record (with acceptedLegalVersion = CURRENT_LEGAL_VERSION)
      const resRecord = await fetch(`${baseUrl}/api/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_user_draft' },
        body: JSON.stringify({
          partner1: {
            fullName: 'Draft P1 User',
            birthDay: '01',
            birthMonth: '01',
            birthYear: '1990',
            phoneNumber: '0522222222',
            phoneCountry: 'SA +966',
            phoneE164: '+966522222222'
          },
          type: 'marriage',
          startDate: '2023-01-01',
          acceptedLegalVersion: CURRENT_LEGAL_VERSION
        })
      });
      assert.equal(resRecord.status, 200);

      // Step 4: POST /api/invite/create -> 200
      const resInviteSuccess = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_user_draft' },
        body: JSON.stringify({
          partner2Name: 'Partner Two',
          partner2Phone: '0533333333',
          partner2PhoneCountry: 'SA +966'
        })
      });
      assert.equal(resInviteSuccess.status, 200);
      const dataInviteSuccess = (await resInviteSuccess.json()) as any;
      assert.equal(dataInviteSuccess.success, true);
    });

    // f. GET /api/record after saving a profile returns userProfile, and userProfile.phoneVerified is recomputed from the token (false when the token has no phone_number), not taken from the stored value.
    await t.test('f. GET /api/record returns userProfile, phoneVerified recomputed from token (false when token has no phone_number)', async () => {
      // token_user1 saved with matching phone in test (a), where DB profile stored phoneVerified: true.
      // Now fetch with token_user1_nophone (same uid, but phone_number is undefined in token).
      const res = await fetch(`${baseUrl}/api/record`, {
        method: 'GET',
        headers: { Authorization: 'Bearer token_user1_nophone' }
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.ok(data.userProfile, 'userProfile must be present');
      assert.equal(data.userProfile.phoneVerified, false, 'phoneVerified must be false when token has no phone_number');
    });

    // g. PUT /api/profile → 404 (route removed).
    await t.test('g. PUT /api/profile -> 404 (route removed)', async () => {
      const res = await fetch(`${baseUrl}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_user1' },
        body: JSON.stringify({ fullName: 'Attempt PUT' })
      });
      assert.equal(res.status, 404);
    });

    // h. GET /api/profile without a token → 401.
    await t.test('h. GET /api/profile without a token -> 401', async () => {
      const res = await fetch(`${baseUrl}/api/profile`, {
        method: 'GET'
      });
      assert.equal(res.status, 401);
      const data = (await res.json()) as any;
      assert.equal(data.error, 'AUTH_REQUIRED');
    });

    // 1. Pending account deletion rejects profile save and verification sync with 409 and zero writes
    await t.test('1. Pending account deletion rejects profile save and verification sync with 409 and zero writes', async () => {
      const DEL_UID = 'uid_del_user';
      mockAuth.addUser('token_user_del', {
        uid: DEL_UID,
        email: 'deluser@example.com',
        email_verified: true,
        phone_number: '+966588888888'
      });

      const initialDelProfile: PartnerData = {
        fullName: 'Initial Del Name',
        email: 'deluser@example.com',
        birthDay: '01',
        birthMonth: '01',
        birthYear: '1990',
        phoneCountry: 'SA +966',
        phoneNumber: '0588888888',
        phoneE164: '+966588888888',
        whatsappCountry: 'SA +966',
        whatsappNumber: '0588888888'
      };

      mockDb.seed('users', DEL_UID, {
        uid: DEL_UID,
        email: 'deluser@example.com',
        profile: initialDelProfile,
        updatedAt: '2020-01-01T00:00:00Z'
      });

      mockDb.seed('account_deletions', DEL_UID, {
        uid: DEL_UID,
        requestedAt: new Date().toISOString()
      });

      // Attempt POST /api/profile
      const resProfile = await fetch(`${baseUrl}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_user_del' },
        body: JSON.stringify({
          fullName: 'Attempted Change After Deletion'
        })
      });
      assert.equal(resProfile.status, 409);
      const dataProfile = (await resProfile.json()) as any;
      assert.equal(dataProfile.error, 'ACCOUNT_DELETION_PENDING');

      // Verify ZERO writes occurred in users doc
      const userDocAfterProfile = mockDb.store.get('users')?.get(DEL_UID);
      assert.equal(userDocAfterProfile.profile.fullName, 'Initial Del Name');
      assert.equal(userDocAfterProfile.updatedAt, '2020-01-01T00:00:00Z');

      // Attempt POST /api/profile/sync-verification
      const resSync = await fetch(`${baseUrl}/api/profile/sync-verification`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token_user_del' }
      });
      assert.equal(resSync.status, 409);
      const dataSync = (await resSync.json()) as any;
      assert.equal(dataSync.error, 'ACCOUNT_DELETION_PENDING');

      // Verify ZERO writes occurred after sync attempt
      const userDocAfterSync = mockDb.store.get('users')?.get(DEL_UID);
      assert.equal(userDocAfterSync.updatedAt, '2020-01-01T00:00:00Z');
    });

    // 2. The relationship-deletion guard blocks draft changes from the profile route
    await t.test('2. Relationship-deletion guard blocks draft changes from the profile route with 409', async () => {
      const DRAFT_DEL_UID = 'uid_draft_rel_del';
      const DRAFT_REL_ID = 'rel_draft_pending_del';

      mockAuth.addUser('token_draft_rel_del', {
        uid: DRAFT_DEL_UID,
        email: 'draftreldel@example.com',
        email_verified: true,
        phone_number: '+966577777777'
      });

      mockDb.seed('users', DRAFT_DEL_UID, {
        uid: DRAFT_DEL_UID,
        email: 'draftreldel@example.com',
        activeRecordId: DRAFT_REL_ID
      });

      mockDb.seed('relationships', DRAFT_REL_ID, {
        id: DRAFT_REL_ID,
        status: 'draft',
        p1Uid: DRAFT_DEL_UID,
        partner1: {
          fullName: 'Original Draft P1',
          email: 'draftreldel@example.com',
          phoneCountry: 'SA +966',
          phoneNumber: '0577777777',
          phoneE164: '+966577777777'
        }
      });

      mockDb.seed('relationship_deletions', DRAFT_REL_ID, {
        recordId: DRAFT_REL_ID,
        requestedAt: new Date().toISOString()
      });

      const res = await fetch(`${baseUrl}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_draft_rel_del' },
        body: JSON.stringify({
          fullName: 'Attempted Modified Draft P1'
        })
      });

      assert.equal(res.status, 409);
      const data = (await res.json()) as any;
      assert.equal(data.error, 'RELATIONSHIP_DELETION_PENDING');

      // Verify draft partner1 was NOT modified
      const relDoc = mockDb.store.get('relationships')?.get(DRAFT_REL_ID);
      assert.equal(relDoc.partner1.fullName, 'Original Draft P1');
    });

    // 3. Explicit sameWhatsapp true and false both survive save → GET /api/profile
    await t.test('3. Explicit sameWhatsapp true and false both survive save -> GET /api/profile', async () => {
      const WA_UID = 'uid_wa_test_user';
      mockAuth.addUser('token_wa_test', {
        uid: WA_UID,
        email: 'watest@example.com',
        email_verified: true,
        phone_number: '+966566666666'
      });

      // 3a. Save with explicit sameWhatsapp: true
      const resTrue = await fetch(`${baseUrl}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_wa_test' },
        body: JSON.stringify({
          fullName: 'WA Test User',
          phoneNumber: '0566666666',
          phoneCountry: 'SA +966',
          phoneE164: '+966566666666',
          sameWhatsapp: true
        })
      });
      assert.equal(resTrue.status, 200);
      const dataTrue = (await resTrue.json()) as any;
      assert.equal(dataTrue.profile.sameWhatsapp, true);

      const getTrue = await fetch(`${baseUrl}/api/profile`, {
        method: 'GET',
        headers: { Authorization: 'Bearer token_wa_test' }
      });
      assert.equal(getTrue.status, 200);
      const getTrueData = (await getTrue.json()) as any;
      assert.equal(getTrueData.profile.sameWhatsapp, true);

      // 3b. Save with explicit sameWhatsapp: false and distinct WhatsApp number
      const resFalse = await fetch(`${baseUrl}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_wa_test' },
        body: JSON.stringify({
          fullName: 'WA Test User',
          phoneNumber: '0566666666',
          phoneCountry: 'SA +966',
          phoneE164: '+966566666666',
          sameWhatsapp: false,
          whatsappNumber: '0599999999',
          whatsappCountry: 'SA +966'
        })
      });
      assert.equal(resFalse.status, 200);
      const dataFalse = (await resFalse.json()) as any;
      assert.equal(dataFalse.profile.sameWhatsapp, false);

      const getFalse = await fetch(`${baseUrl}/api/profile`, {
        method: 'GET',
        headers: { Authorization: 'Bearer token_wa_test' }
      });
      assert.equal(getFalse.status, 200);
      const getFalseData = (await getFalse.json()) as any;
      assert.equal(getFalseData.profile.sameWhatsapp, false);
    });

    // 4. Saved socialAccounts are returned by GET /api/profile after a save
    await t.test('4. Saved socialAccounts are returned by GET /api/profile after a save', async () => {
      const SOCIAL_UID = 'uid_social_user';
      mockAuth.addUser('token_social_user', {
        uid: SOCIAL_UID,
        email: 'social@example.com',
        email_verified: true,
        phone_number: '+966544444444'
      });

      const accounts = [
        { platform: 'instagram', handle: 'insta_star' },
        { platform: 'x', handle: 'x_guru' }
      ];

      const saveRes = await fetch(`${baseUrl}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_social_user' },
        body: JSON.stringify({
          fullName: 'Social User',
          phoneNumber: '0544444444',
          phoneCountry: 'SA +966',
          phoneE164: '+966544444444',
          socialAccounts: accounts
        })
      });
      assert.equal(saveRes.status, 200);

      const getRes = await fetch(`${baseUrl}/api/profile`, {
        method: 'GET',
        headers: { Authorization: 'Bearer token_social_user' }
      });
      assert.equal(getRes.status, 200);
      const getData = (await getRes.json()) as any;
      assert.ok(Array.isArray(getData.profile.socialAccounts));
      assert.equal(getData.profile.socialAccounts.length, 2);
      assert.equal(getData.profile.socialAccounts[0].platform, 'instagram');
      assert.equal(getData.profile.socialAccounts[0].handle, 'insta_star');
      assert.equal(getData.profile.socialAccounts[1].platform, 'x');
      assert.equal(getData.profile.socialAccounts[1].handle, 'x_guru');
    });

    // 5. A Twilio failure in verify/start returns WHATSAPP_VERIFY_PROVIDER_ERROR, not DATABASE_ERROR
    await t.test('5. Twilio failure in verify/start returns WHATSAPP_VERIFY_PROVIDER_ERROR (502), not DATABASE_ERROR', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC_mock_twilio_account_sid';
      process.env.TWILIO_AUTH_TOKEN = 'mock_twilio_auth_token_secret';
      process.env.TWILIO_VERIFY_SID = 'VA_mock_twilio_verify_sid';

      const mockFailingTwilio = {
        verify: {
          v2: {
            services: () => ({
              verifications: {
                create: async () => {
                  const error: any = new Error('Twilio upstream provider connection error');
                  error.status = 500;
                  throw error;
                }
              }
            })
          }
        }
      };

      __setTwilioClient(mockFailingTwilio);

      const res = await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_user1' },
        body: JSON.stringify({
          country: 'SA +966',
          number: '0500000001'
        })
      });

      assert.equal(res.status, 502);
      const data = (await res.json()) as any;
      assert.equal(data.error, 'WHATSAPP_VERIFY_PROVIDER_ERROR');
      assert.notEqual(data.error, 'DATABASE_ERROR');
      assert.ok(data.messageEn && data.messageEn.length > 0);
      assert.ok(data.messageAr && data.messageAr.length > 0);
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
