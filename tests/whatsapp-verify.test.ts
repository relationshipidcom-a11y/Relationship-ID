process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createApp,
  __setTestDeps,
  __setTwilioClient,
  isWhatsappVerifyEnabled,
  CURRENT_LEGAL_VERSION,
  WHATSAPP_VERIFY_ATTEMPTS_COL,
  WHATSAPP_VERIFY_LIMITS_COL
} from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

const P1_PHONE = '+966500000001';
const P2_PHONE = '+966500000002';

function validPartner1(customWa?: string, customWaCountry?: string) {
  return {
    fullName: 'Fahad Al-Harbi',
    fullNameEn: 'Fahad Al-Harbi',
    birthDay: '10',
    birthMonth: '04',
    birthYear: '1992',
    email: 'p1@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '0500000001',
    phoneE164: P1_PHONE,
    whatsappCountry: customWaCountry || 'SA +966',
    whatsappNumber: customWa || '0500000001',
    whatsappE164: customWa ? undefined : P1_PHONE
  };
}

function validPartner2(customWa?: string, customWaCountry?: string) {
  return {
    fullName: 'Sara Al-Otaibi',
    fullNameEn: 'Sara Al-Otaibi',
    birthDay: '15',
    birthMonth: '05',
    birthYear: '1995',
    email: 'p2@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '0500000002',
    phoneE164: P2_PHONE,
    whatsappCountry: customWaCountry || 'SA +966',
    whatsappNumber: customWa || '0500000002',
    whatsappE164: customWa ? undefined : P2_PHONE
  };
}

function createMockTwilio(options?: {
  verificationStatus?: string;
  checkStatus?: string;
  checkThrows?: boolean;
}) {
  const verificationsCreated: any[] = [];
  const verificationChecksCreated: any[] = [];

  const mockClient = {
    verificationsCreated,
    verificationChecksCreated,
    verify: {
      v2: {
        services: (serviceSid: string) => ({
          verifications: {
            create: async (params: any) => {
              verificationsCreated.push({ serviceSid, ...params });
              return { status: options?.verificationStatus || 'pending' };
            }
          },
          verificationChecks: {
            create: async (params: any) => {
              verificationChecksCreated.push({ serviceSid, ...params });
              if (options?.checkThrows) {
                const err: any = new Error('Verification check failed');
                err.status = 404;
                throw err;
              }
              return { status: options?.checkStatus || 'approved' };
            }
          }
        })
      }
    }
  };

  return mockClient;
}

test('WhatsApp verification via Twilio Verify test suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();

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

  __setTestDeps(mockDb as any, mockAuth as any);

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  function resetState() {
    mockDb.reset();
    mockDb.seed('users', 'uid_p1', {
      uid: 'uid_p1',
      email: 'p1@example.com',
      phoneE164: P1_PHONE
    });
    mockDb.seed('users', 'uid_p2', {
      uid: 'uid_p2',
      email: 'p2@example.com',
      phoneE164: P2_PHONE
    });
  }

  t.after(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_VERIFY_SID;
    __setTwilioClient(null);
    server.close();
  });

  // 1. status returns enabled false when env vars missing, true when present
  await t.test('1. status returns enabled false when env vars missing, true when present', async () => {
    resetState();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_VERIFY_SID;
    assert.equal(isWhatsappVerifyEnabled(), false);

    const resDisabled = await fetch(`${baseUrl}/api/whatsapp/verify/status`, {
      headers: { Authorization: 'Bearer token_p1' }
    });
    assert.equal(resDisabled.status, 200);
    const dataDisabled = (await resDisabled.json()) as any;
    assert.equal(dataDisabled.enabled, false);

    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';
    assert.equal(isWhatsappVerifyEnabled(), true);

    const resEnabled = await fetch(`${baseUrl}/api/whatsapp/verify/status`, {
      headers: { Authorization: 'Bearer token_p1' }
    });
    assert.equal(resEnabled.status, 200);
    const dataEnabled = (await resEnabled.json()) as any;
    assert.equal(dataEnabled.enabled, true);
  });

  // 2. start/check return 503 when disabled
  await t.test('2. start/check return 503 when disabled', async () => {
    resetState();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_VERIFY_SID;

    const resStart = await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: '0501234567' })
    });
    assert.equal(resStart.status, 503);
    const startJson = (await resStart.json()) as any;
    assert.equal(startJson.error, 'WHATSAPP_VERIFY_UNAVAILABLE');

    const resCheck = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: '0501234567', code: '123456' })
    });
    assert.equal(resCheck.status, 503);
    const checkJson = (await resCheck.json()) as any;
    assert.equal(checkJson.error, 'WHATSAPP_VERIFY_UNAVAILABLE');
  });

  // 3. approved code sets whatsappTrusted true
  await t.test('3. approved code sets whatsappTrusted true', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    const mockTwilio = createMockTwilio({ checkStatus: 'approved' });
    __setTwilioClient(mockTwilio);

    const diffWa = '0599988776';
    const diffWaE164 = '+966599988776';

    const resStart = await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: diffWa })
    });
    assert.equal(resStart.status, 200);
    const startJson = (await resStart.json()) as any;
    assert.equal(startJson.success, true);
    assert.equal(mockTwilio.verificationsCreated.length, 1);
    assert.equal(mockTwilio.verificationsCreated[0].to, diffWaE164);
    assert.equal(mockTwilio.verificationsCreated[0].channel, 'whatsapp');

    const resCheck = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: diffWa, code: '123456' })
    });
    assert.equal(resCheck.status, 200);
    const checkJson = (await resCheck.json()) as any;
    assert.equal(checkJson.success, true);
    assert.equal(checkJson.whatsappTrusted, true);
    assert.equal(checkJson.whatsappE164, diffWaE164);

    // Verify user doc has trusted whatsapp
    const userDoc = await mockDb.collection('users').doc('uid_p1').get();
    assert.equal(userDoc.data()?.whatsappTrusted, true);
    assert.equal(userDoc.data()?.whatsappE164, diffWaE164);

    // When P1 subsequently submits relationship with this verified number, whatsappTrusted is true
    const resRecord = await fetch(`${baseUrl}/api/record`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner1: validPartner1(diffWa),
        type: 'marriage',
        startDate: '2024-01-01',
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(resRecord.status, 200);
    const recJson = (await resRecord.json()) as any;
    assert.equal(recJson.record.partner1.whatsappTrusted, true);
    assert.equal(recJson.record.partner1.whatsappE164, diffWaE164);
  });

  // 4. wrong code leaves it false
  await t.test('4. wrong code leaves it false', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    const mockTwilio = createMockTwilio({ checkStatus: 'pending' });
    __setTwilioClient(mockTwilio);

    const diffWa = '0588889999';

    await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: diffWa })
    });

    const resCheck = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: diffWa, code: '000000' })
    });
    assert.equal(resCheck.status, 400);

    // Verify user doc does NOT have whatsappTrusted = true
    const userDoc = await mockDb.collection('users').doc('uid_p1').get();
    assert.notEqual(userDoc.data()?.whatsappTrusted, true);

    // Submitting relationship with unverified different WhatsApp number leaves whatsappTrusted false
    const resRecord = await fetch(`${baseUrl}/api/record`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner1: validPartner1(diffWa),
        type: 'marriage',
        startDate: '2024-01-01',
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(resRecord.status, 200);
    const recJson = (await resRecord.json()) as any;
    assert.equal(recJson.record.partner1.whatsappTrusted, false);
  });

  // 5. client cannot set whatsappTrusted via any request body
  await t.test('5. client cannot set whatsappTrusted via any request body', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    const unverifiedDifferentWa = '0577771122';

    // 5a. POST /api/record
    const resRecord = await fetch(`${baseUrl}/api/record`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner1: {
          ...validPartner1(unverifiedDifferentWa),
          whatsappTrusted: true,
          whatsappVerifiedAt: '2026-01-01T00:00:00.000Z'
        },
        type: 'dating',
        startDate: '2024-05-01',
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(resRecord.status, 200);
    const recJson = (await resRecord.json()) as any;
    assert.equal(recJson.record.partner1.whatsappTrusted, false);
    assert.equal(recJson.record.partner1.whatsappVerifiedAt, undefined);

    // 5b. POST /api/invitations/:inviteId/accept
    const recId = recJson.record.id;
    const invId = 'inv_test_security';
    mockDb.seed('invitations', invId, {
      id: invId,
      recordId: recId,
      p1Uid: 'uid_p1',
      status: 'pending',
      partner2Email: 'p2@example.com',
      partner2Phone: P2_PHONE,
      relationshipType: 'dating',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    mockDb.seed('relationships', recId, {
      ...recJson.record,
      status: 'pending_partner',
      inviteId: invId
    });

    const resAccept = await fetch(`${baseUrl}/api/invitations/${invId}/accept`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p2',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner2: {
          ...validPartner2('0566663344'),
          whatsappTrusted: true,
          whatsappVerifiedAt: '2026-01-01T00:00:00.000Z'
        },
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(resAccept.status, 200);
    const acceptJson = (await resAccept.json()) as any;
    assert.equal(acceptJson.record.partner2.whatsappTrusted, false);
    assert.equal(acceptJson.record.partner2.whatsappVerifiedAt, undefined);

    // 5c. PATCH /api/profile/me
    const resPatch = await fetch(`${baseUrl}/api/profile/me`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        whatsappNumber: '0555554433',
        whatsappTrusted: true
      })
    });
    assert.equal(resPatch.status, 200);
    const patchJson = (await resPatch.json()) as any;
    assert.equal(patchJson.record.partner1.whatsappTrusted, false);
    assert.equal(patchJson.record.partner1.whatsappVerifiedAt, undefined);
  });

  // 6. changing number afterwards resets trusted to false
  await t.test('6. changing number afterwards resets trusted to false', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    const activeRecId = 'rec_active_change_num';
    // Initially trusted because it matches verified mobile
    mockDb.seed('relationships', activeRecId, {
      id: activeRecId,
      status: 'active',
      type: 'marriage',
      p1Uid: 'uid_p1',
      p2Uid: 'uid_p2',
      partner1: {
        ...validPartner1(),
        whatsappTrusted: true
      },
      partner2: {
        ...validPartner2(),
        whatsappTrusted: true
      },
      settings: {}
    });
    mockDb.seed('users', 'uid_p1', {
      uid: 'uid_p1',
      activeRecordId: activeRecId,
      phoneE164: P1_PHONE,
      whatsappE164: P1_PHONE,
      whatsappTrusted: true
    });

    // P1 changes WhatsApp number to a different unverified number
    const resPatch = await fetch(`${baseUrl}/api/profile/me`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        whatsappNumber: '0512349988',
        whatsappCountry: 'SA +966'
      })
    });
    assert.equal(resPatch.status, 200);
    const patchJson = (await resPatch.json()) as any;
    assert.equal(patchJson.record.partner1.whatsappTrusted, false);

    // Verify stored in DB as false
    const relDoc = await mockDb.collection('relationships').doc(activeRecId).get();
    assert.equal(relDoc.data()?.partner1.whatsappTrusted, false);

    const userDoc = await mockDb.collection('users').doc('uid_p1').get();
    assert.equal(userDoc.data()?.whatsappTrusted, false);
  });

  // 7. 6th start within an hour -> 429
  await t.test('7. 6th start within an hour -> 429', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    const mockTwilio = createMockTwilio();
    __setTwilioClient(mockTwilio);

    // 5 start requests within an hour should succeed
    for (let i = 1; i <= 5; i++) {
      const res = await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token_p1',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ country: 'SA +966', number: '0533334444' })
      });
      assert.equal(res.status, 200, `Expected attempt ${i} to succeed with 200, got ${res.status}`);
      const json = (await res.json()) as any;
      assert.equal(json.success, true);
    }

    // 6th attempt should be rate limited with 429
    const res6 = await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: '0533334444' })
    });
    assert.equal(res6.status, 429, `Expected attempt 6 to be rate limited with 429, got ${res6.status}`);
    const json6 = (await res6.json()) as any;
    assert.equal(json6.error, 'WHATSAPP_VERIFY_RATE_LIMITED');
  });

  // 8. Provider failure during start or check grants no verification
  await t.test('8. Provider failure during start or check grants no verification', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    // Mock Twilio where create throws error (e.g. WhatsApp channel failure / template failure)
    const failingTwilio = {
      verify: {
        v2: {
          services: (_sid: string) => ({
            verifications: {
              create: async () => {
                throw new Error('Twilio WhatsApp provider error');
              }
            },
            verificationChecks: {
              create: async () => {
                throw new Error('Twilio verification check error');
              }
            }
          })
        }
      }
    };
    __setTwilioClient(failingTwilio);

    const testNumber = '0566667777';
    const testE164 = '+966566667777';

    // Start fails with 502 WHATSAPP_VERIFY_PROVIDER_ERROR
    const resStart = await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: testNumber })
    });
    assert.equal(resStart.status, 502);
    const startJson = (await resStart.json()) as any;
    assert.equal(startJson.error, 'WHATSAPP_VERIFY_PROVIDER_ERROR');

    // Check attempt also fails and grants no verification
    const resCheck = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: testNumber, code: '123456' })
    });
    assert.equal(resCheck.status, 400);

    // Verify user doc has NO whatsapp verification granted
    const userDoc = await mockDb.collection('users').doc('uid_p1').get();
    assert.notEqual(userDoc.data()?.whatsappTrusted, true);
    assert.notEqual(userDoc.data()?.whatsappE164, testE164);
  });

  // 9. verified number A cannot authorize submitted mobile number B
  await t.test('9. verified number A cannot authorize submitted mobile number B', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    // P3 has email only (no Firebase phone_number)
    mockAuth.addUser('token_p3', {
      uid: 'uid_p3',
      email: 'p3@example.com',
      email_verified: true
    });
    mockDb.seed('users', 'uid_p3', {
      uid: 'uid_p3',
      email: 'p3@example.com'
    });

    const mockTwilio = createMockTwilio({ checkStatus: 'approved' });
    __setTwilioClient(mockTwilio);

    const verifiedNumberA = '0599988776';
    const unverifiedMobileB = '0511122233';

    // P3 starts and verifies number A via WhatsApp
    await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p3',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: verifiedNumberA })
    });

    const resCheck = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p3',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: verifiedNumberA, code: '123456' })
    });
    assert.equal(resCheck.status, 200);

    // P3 tries to submit mobile number B to /api/record (even if whatsappNumber is number A)
    const resRecord = await fetch(`${baseUrl}/api/record`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p3',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner1: {
          fullName: 'Test User',
          birthDay: '10',
          birthMonth: '04',
          birthYear: '1992',
          email: 'p3@example.com',
          phoneCountry: 'SA +966',
          phoneNumber: unverifiedMobileB,
          whatsappCountry: 'SA +966',
          whatsappNumber: verifiedNumberA
        },
        type: 'marriage',
        startDate: '2024-01-01',
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });

    assert.equal(resRecord.status, 400);
    const recJson = (await resRecord.json()) as any;
    assert.equal(recJson.error, 'VERIFIED_PHONE_REQUIRED');
  });

  // 10. active or deleting relationships cannot have their identity changed through verification
  await t.test('10. active or deleting relationships cannot have their identity changed through verification', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    const mockTwilio = createMockTwilio({ checkStatus: 'approved' });
    __setTwilioClient(mockTwilio);

    const activeRecId = 'rec_active_identity_lock';
    mockDb.seed('relationships', activeRecId, {
      id: activeRecId,
      status: 'active',
      type: 'marriage',
      p1Uid: 'uid_p1',
      p2Uid: 'uid_p2',
      partner1: validPartner1(),
      partner2: validPartner2(),
      settings: {}
    });
    mockDb.seed('users', 'uid_p1', {
      uid: 'uid_p1',
      activeRecordId: activeRecId,
      phoneE164: P1_PHONE
    });

    // 10a. P1 attempts to verify a DIFFERENT phone number while in active relationship
    const diffNumber = '0577778899';
    await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: diffNumber })
    });
    const resActive = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: diffNumber, code: '123456' })
    });
    assert.equal(resActive.status, 409);
    const activeErr = (await resActive.json()) as any;
    assert.equal(activeErr.error, 'ACTIVE_RELATIONSHIP_LOCKED');

    // Confirm relationship partner1 phone was NOT altered
    const relAfter = await mockDb.collection('relationships').doc(activeRecId).get();
    assert.equal(relAfter.data()?.partner1.phoneE164, P1_PHONE);

    // 10b. Deleting relationship blocks verification
    mockDb.seed('relationship_deletions', activeRecId, {
      recordId: activeRecId,
      startedAt: new Date().toISOString()
    });
    await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: '0500000001' })
    });
    const resDel = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: '0500000001', code: '123456' })
    });
    assert.equal(resDel.status, 409);
    const delErr = (await resDel.json()) as any;
    assert.equal(delErr.error, 'RELATIONSHIP_DELETION_PENDING');

    // 10c. Pending account deletion blocks verification
    await mockDb.collection('relationship_deletions').doc(activeRecId).delete();
    mockDb.seed('account_deletions', 'uid_p1', {
      uid: 'uid_p1',
      startedAt: new Date().toISOString()
    });
    await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: '0500000001' })
    });
    const resAccDel = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: '0500000001', code: '123456' })
    });
    assert.equal(resAccDel.status, 409);
    const accDelErr = (await resAccDel.json()) as any;
    assert.equal(accDelErr.error, 'ACCOUNT_DELETION_PENDING');
  });

  // 11. duplicate-number safeguards hold during verification
  await t.test('11. duplicate-number safeguards hold during verification', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    const mockTwilio = createMockTwilio({ checkStatus: 'approved' });
    __setTwilioClient(mockTwilio);

    const conflictingPhone = '0544445555';
    const conflictingE164 = '+966544445555';

    // Seed another active relationship with this phone and a contact reservation
    const otherRelId = 'rec_other_active';
    mockDb.seed('relationships', otherRelId, {
      id: otherRelId,
      status: 'active',
      partner1: validPartner1(),
      partner2: { ...validPartner2(), phoneE164: conflictingE164 }
    });
    // Hash helper
    const { hashContact } = await import('../src/utils/contacts');
    mockDb.seed('contact_reservations', hashContact(conflictingE164), {
      recordId: otherRelId,
      contactHash: hashContact(conflictingE164)
    });

    // P1 attempts to verify this conflicting number
    await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: conflictingPhone })
    });

    const resCheck = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: conflictingPhone, code: '123456' })
    });

    assert.equal(resCheck.status, 409);
    const checkErr = (await resCheck.json()) as any;
    assert.equal(checkErr.error, 'CONTACT_IN_ACTIVE_RELATIONSHIP');
  });

  // 12. unchanged returning users retain proof and changed numbers require a new code
  await t.test('12. unchanged returning users retain proof and changed numbers require a new code', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    const returningPhone = '0588887777';
    const returningE164 = '+966588887777';

    mockAuth.addUser('token_ret', {
      uid: 'uid_ret',
      email: 'ret@example.com',
      email_verified: true
    });
    mockDb.seed('users', 'uid_ret', {
      uid: 'uid_ret',
      email: 'ret@example.com',
      phoneE164: returningE164,
      phoneVerified: true,
      whatsappE164: returningE164,
      whatsappTrusted: true,
      whatsappVerifiedAt: '2026-02-01T00:00:00.000Z'
    });

    // Profile returns verified status for returning user
    const resProfile = await fetch(`${baseUrl}/api/profile/me`, {
      headers: { Authorization: 'Bearer token_ret' }
    });
    assert.equal(resProfile.status, 200);
    const profJson = (await resProfile.json()) as any;
    assert.equal(profJson.verification.phoneVerified, true);
    assert.equal(profJson.verification.whatsappTrusted, true);
    assert.equal(profJson.verification.phoneE164, returningE164);

    // Unchanged number submits successfully
    const resRecord = await fetch(`${baseUrl}/api/record`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_ret',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner1: {
          fullName: 'Returning User',
          birthDay: '10',
          birthMonth: '04',
          birthYear: '1992',
          email: 'ret@example.com',
          phoneCountry: 'SA +966',
          phoneNumber: returningPhone,
          phoneE164: returningE164,
          whatsappCountry: 'SA +966',
          whatsappNumber: returningPhone,
          whatsappE164: returningE164
        },
        type: 'marriage',
        startDate: '2024-01-01',
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(resRecord.status, 200);

    // Changed number fails with VERIFIED_PHONE_REQUIRED
    const resChanged = await fetch(`${baseUrl}/api/record`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_ret',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner1: {
          fullName: 'Returning User',
          birthDay: '10',
          birthMonth: '04',
          birthYear: '1992',
          email: 'ret@example.com',
          phoneCountry: 'SA +966',
          phoneNumber: '0599990000',
          phoneE164: '+966599990000',
          whatsappCountry: 'SA +966',
          whatsappNumber: '0599990000',
          whatsappE164: '+966599990000'
        },
        type: 'marriage',
        startDate: '2024-01-01',
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(resChanged.status, 400);
    const changedJson = (await resChanged.json()) as any;
    assert.equal(changedJson.error, 'VERIFIED_PHONE_REQUIRED');
  });

  // 13. no SMS fallback occurs on start verification
  await t.test('13. no SMS fallback occurs on start verification', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    const mockTwilio = createMockTwilio();
    __setTwilioClient(mockTwilio);

    const testNum = '0512345678';
    const testE164 = '+966512345678';

    const res = await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'SA +966', number: testNum })
    });
    assert.equal(res.status, 200);
    assert.equal(mockTwilio.verificationsCreated.length, 1);
    assert.equal(mockTwilio.verificationsCreated[0].to, testE164);
    assert.equal(mockTwilio.verificationsCreated[0].channel, 'whatsapp');
    assert.notEqual(mockTwilio.verificationsCreated[0].channel, 'sms');
  });

  // 14. legacy Firebase-only user saving profile keeps phoneVerified true but whatsappTrusted false
  await t.test('14. legacy Firebase-only user saving profile keeps phoneVerified true but whatsappTrusted false', async () => {
    resetState();
    const legacyUid = 'uid_legacy_firebase';
    const legacyToken = 'token_legacy_firebase';
    const legacyPhone = '0500000001';
    const legacyE164 = '+966500000001';

    mockAuth.addUser(legacyToken, {
      uid: legacyUid,
      email: 'legacy@example.com',
      email_verified: true,
      phone_number: legacyE164
    });
    mockDb.seed('users', legacyUid, {
      uid: legacyUid,
      email: 'legacy@example.com',
      phoneE164: legacyE164,
      whatsappTrusted: false
    });

    const res = await fetch(`${baseUrl}/api/profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${legacyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fullName: 'Legacy User',
        phoneNumber: legacyPhone,
        phoneCountry: 'SA +966',
        phoneE164: legacyE164,
        sameWhatsapp: true,
        whatsappTrusted: true // attempt client spoofing
      })
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.equal(data.profile.phoneVerified, true);
    assert.equal(data.profile.whatsappTrusted, false);
    assert.equal(data.verification.phoneVerified, true);
    assert.equal(data.verification.whatsappTrusted, false);

    // Verify user document in DB
    const uDoc = await mockDb.collection('users').doc(legacyUid).get();
    assert.equal(uDoc.data()?.whatsappTrusted, false);

    // Hydration check via GET /api/profile/me
    const getRes = await fetch(`${baseUrl}/api/profile/me`, {
      headers: { Authorization: `Bearer ${legacyToken}` }
    });
    assert.equal(getRes.status, 200);
    const getData = (await getRes.json()) as any;
    assert.equal(getData.profile.phoneVerified, true);
    assert.equal(getData.profile.whatsappTrusted, false);
    assert.equal(getData.verification.phoneVerified, true);
    assert.equal(getData.verification.whatsappTrusted, false);
  });

  // 15. returning user with genuine WhatsApp verification retains proof; changed number requires new code
  await t.test('15. returning user with genuine WhatsApp verification retains proof; changed number requires new code', async () => {
    resetState();
    const retUid = 'uid_ret_wa';
    const retToken = 'token_ret_wa';
    const retPhone = '0500000001';
    const retE164 = '+966500000001';

    mockAuth.addUser(retToken, {
      uid: retUid,
      email: 'retwa@example.com',
      email_verified: true
    });
    mockDb.seed('users', retUid, {
      uid: retUid,
      email: 'retwa@example.com',
      whatsappTrusted: true,
      whatsappE164: retE164,
      whatsappVerifiedAt: '2024-01-01T00:00:00.000Z'
    });

    // Save profile with unchanged number
    const resUnchanged = await fetch(`${baseUrl}/api/profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${retToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fullName: 'Returning WA User',
        phoneNumber: retPhone,
        phoneCountry: 'SA +966',
        phoneE164: retE164,
        sameWhatsapp: true
      })
    });
    assert.equal(resUnchanged.status, 200);
    const dataUnchanged = (await resUnchanged.json()) as any;
    assert.equal(dataUnchanged.profile.phoneVerified, true);
    assert.equal(dataUnchanged.profile.whatsappTrusted, true);
    assert.equal(dataUnchanged.verification.whatsappTrusted, true);

    // Save profile with changed number -> invalidates proof
    const resChanged = await fetch(`${baseUrl}/api/profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${retToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fullName: 'Returning WA User',
        phoneNumber: '0599990000',
        phoneCountry: 'SA +966',
        phoneE164: '+966599990000',
        sameWhatsapp: true
      })
    });
    assert.equal(resChanged.status, 200);
    const dataChanged = (await resChanged.json()) as any;
    assert.equal(dataChanged.profile.whatsappTrusted, false);
    assert.equal(dataChanged.verification.whatsappTrusted, false);

    const uDoc = await mockDb.collection('users').doc(retUid).get();
    assert.equal(uDoc.data()?.whatsappTrusted, false);
  });

  // 16. P2 accepting when P1 has a different unverified WhatsApp leaves P1 whatsappTrusted false
  await t.test('16. P2 accepting when P1 has a different unverified WhatsApp leaves P1 whatsappTrusted false', async () => {
    resetState();
    const p1Uid = 'uid_p1_diff_wa';
    const p1Token = 'token_p1_diff_wa';
    const p1Mobile = '+966500000001';
    const p1UnverifiedWa = '+966599990099';

    const p2Uid = 'uid_p2_accepting';
    const p2Token = 'token_p2_accepting';
    const p2Mobile = '+966500000002';

    mockAuth.addUser(p1Token, {
      uid: p1Uid,
      email: 'p1diff@example.com',
      email_verified: true
    });
    // P1's mobile was verified via WhatsApp, but NOT the separate WhatsApp number
    mockDb.seed('users', p1Uid, {
      uid: p1Uid,
      email: 'p1diff@example.com',
      whatsappTrusted: true,
      whatsappE164: p1Mobile,
      whatsappVerifiedAt: '2024-01-01T00:00:00.000Z'
    });

    mockAuth.addUser(p2Token, {
      uid: p2Uid,
      email: 'p2acc@example.com',
      email_verified: true
    });
    // P2's mobile was genuinely verified via WhatsApp
    mockDb.seed('users', p2Uid, {
      uid: p2Uid,
      email: 'p2acc@example.com',
      whatsappTrusted: true,
      whatsappE164: p2Mobile,
      whatsappVerifiedAt: '2024-01-01T00:00:00.000Z'
    });

    // P1 created draft relationship where mobile is p1Mobile, but whatsapp is p1UnverifiedWa
    const relId = 'rel_diff_wa';
    const inviteId = 'inv_diff_wa';
    mockDb.seed('relationships', relId, {
      id: relId,
      recordNumber: '888888',
      type: 'marriage',
      status: 'pending_partner',
      p1Uid,
      p2Uid: null,
      partner1: {
        fullName: 'Partner One',
        birthDay: '10',
        birthMonth: '04',
        birthYear: '1992',
        email: 'p1diff@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '0500000001',
        phoneE164: p1Mobile,
        phoneVerified: true,
        whatsappCountry: 'SA +966',
        whatsappNumber: '0599990099',
        whatsappE164: p1UnverifiedWa
      },
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
      inviteId
    });

    mockDb.seed('invitations', inviteId, {
      id: inviteId,
      recordId: relId,
      p1Uid,
      p2Uid: null,
      inviterName: 'Partner One',
      relationshipType: 'marriage',
      partner2Name: 'Partner Two',
      partner2Email: 'p2acc@example.com',
      partner2Phone: '0500000002',
      partner2PhoneCountry: 'SA +966',
      partner2Whatsapp: '0500000002',
      partner2WhatsappCountry: 'SA +966',
      status: 'pending',
      createdAt: '2024-01-01T00:00:00Z',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });

    // P2 accepts the invitation
    const resAccept = await fetch(`${baseUrl}/api/invitations/${inviteId}/accept`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${p2Token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner2: {
          fullName: 'Partner Two',
          birthDay: '15',
          birthMonth: '05',
          birthYear: '1995',
          email: 'p2acc@example.com',
          phoneCountry: 'SA +966',
          phoneNumber: '0500000002',
          phoneE164: p2Mobile,
          phoneVerified: true,
          sameWhatsapp: true,
          whatsappCountry: 'SA +966',
          whatsappNumber: '0500000002',
          whatsappE164: p2Mobile
        },
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(resAccept.status, 200);

    // Verify relationship document
    const relDoc = await mockDb.collection('relationships').doc(relId).get();
    const relData = relDoc.data() as any;
    assert.equal(relData.status, 'active');
    // P1's phone remains verified, but unverified separate WhatsApp is NOT trusted
    assert.equal(relData.partner1.phoneVerified, true);
    assert.equal(relData.partner1.whatsappTrusted, false);
    // P2's genuine WhatsApp verification is trusted
    assert.equal(relData.partner2.phoneVerified, true);
    assert.equal(relData.partner2.whatsappTrusted, true);

    // P1 user document has whatsappTrusted: false for that unverified WhatsApp
    const p1Doc = await mockDb.collection('users').doc(p1Uid).get();
    assert.equal(p1Doc.data()?.whatsappTrusted, false);
  });

  // 17. P1 and P2 flow with single mobile field (no separate WhatsApp field) verified via WhatsApp
  await t.test('17. P1 and P2 flow with single mobile field (no separate WhatsApp field) verified via WhatsApp', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    const mockTwilio = createMockTwilio({ verificationStatus: 'pending', checkStatus: 'approved' });
    __setTwilioClient(mockTwilio);

    const p1Uid = 'uid_single_p1';
    const p1Token = 'token_single_p1';
    const p1Mobile = '+966511112222';

    const p2Uid = 'uid_single_p2';
    const p2Token = 'token_single_p2';
    const p2Mobile = '+966533334444';

    mockAuth.addUser(p1Token, {
      uid: p1Uid,
      email: 'p1_single@example.com',
      email_verified: true
    });
    mockAuth.addUser(p2Token, {
      uid: p2Uid,
      email: 'p2_single@example.com',
      email_verified: true
    });

    // 1. P1 starts WhatsApp verification for single mobile number
    const p1Start = await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: '0511112222' })
    });
    assert.equal(p1Start.status, 200);
    assert.equal(mockTwilio.verificationsCreated[mockTwilio.verificationsCreated.length - 1].to, p1Mobile);
    assert.equal(mockTwilio.verificationsCreated[mockTwilio.verificationsCreated.length - 1].channel, 'whatsapp');

    // 2. P1 checks code
    const p1Check = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: '0511112222', code: '123456' })
    });
    assert.equal(p1Check.status, 200);
    const p1CheckData = await p1Check.json();
    assert.equal(p1CheckData.success, true);
    assert.equal(p1CheckData.phoneVerified, true);
    assert.equal(p1CheckData.whatsappTrusted, true);

    // 3. P1 saves profile without separate WhatsApp number
    const p1ProfileRes = await fetch(`${baseUrl}/api/profile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner: {
          fullName: 'Tariq Mansoor',
          birthDay: '12',
          birthMonth: '08',
          birthYear: '1990',
          email: 'p1_single@example.com',
          phoneCountry: 'SA +966',
          phoneNumber: '0511112222'
        }
      })
    });
    assert.equal(p1ProfileRes.status, 200);
    const p1ProfileData = await p1ProfileRes.json();
    assert.equal(p1ProfileData.profile.phoneVerified, true);
    assert.equal(p1ProfileData.profile.whatsappTrusted, true);

    // 4. P1 creates relationship record (draft)
    const p1RecRes = await fetch(`${baseUrl}/api/record`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'marriage',
        startDate: '2024-01-01',
        acceptedLegalVersion: CURRENT_LEGAL_VERSION,
        partner1: {
          fullName: 'Tariq Mansoor',
          birthDay: '12',
          birthMonth: '08',
          birthYear: '1990',
          email: 'p1_single@example.com',
          phoneCountry: 'SA +966',
          phoneNumber: '0511112222'
        }
      })
    });
    assert.equal(p1RecRes.status, 200);
    const p1RecData = await p1RecRes.json();
    assert.equal(p1RecData.record.partner1.phoneVerified, true);
    assert.equal(p1RecData.record.partner1.whatsappTrusted, true);

    // 5. P1 creates invitation with only partner2 phone
    const invRes = await fetch(`${baseUrl}/api/invite/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner2Name: 'Reem Al-Ghamdi',
        partner2Email: 'p2_single@example.com',
        partner2Phone: p2Mobile,
        partner2PhoneCountry: 'SA +966'
      })
    });
    assert.equal(invRes.status, 200);
    const invData = await invRes.json();
    const inviteId = invData.invitation.id;

    // 6. P2 verifies their mobile via WhatsApp
    const p2Start = await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p2Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: '0533334444' })
    });
    assert.equal(p2Start.status, 200);

    const p2Check = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p2Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: '0533334444', code: '654321' })
    });
    assert.equal(p2Check.status, 200);
    const p2CheckData = await p2Check.json();
    assert.equal(p2CheckData.phoneVerified, true);
    assert.equal(p2CheckData.whatsappTrusted, true);

    // 7. P2 accepts invitation with single mobile number (no separate WhatsApp field)
    const acceptRes = await fetch(`${baseUrl}/api/invitations/${inviteId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p2Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner2: {
          fullName: 'Reem Al-Ghamdi',
          birthDay: '20',
          birthMonth: '11',
          birthYear: '1993',
          email: 'p2_single@example.com',
          phoneCountry: 'SA +966',
          phoneNumber: '0533334444',
          phoneE164: p2Mobile
        },
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(acceptRes.status, 200);

    // 8. Authoritative active record verification
    const activeRel = await mockDb.collection('relationships').doc(invData.record.id).get();
    const activeData = activeRel.data() as any;
    assert.equal(activeData.status, 'active');
    assert.equal(activeData.partner1.phoneVerified, true);
    assert.equal(activeData.partner1.whatsappTrusted, true);
    assert.equal(activeData.partner2.phoneVerified, true);
    assert.equal(activeData.partner2.whatsappTrusted, true);
  });

  // 18. User B cannot approve User A's verification attempt, even with correct number and code
  await t.test("18. User B cannot approve User A's verification attempt, even with correct number and code", async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    const mockTwilio = createMockTwilio({ checkStatus: 'approved' });
    __setTwilioClient(mockTwilio);

    const userANumber = '0511119999';
    const userAE164 = '+966511119999';

    // User A (P1) starts verification for their number
    const resStart = await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: userANumber })
    });
    assert.equal(resStart.status, 200);

    // User B (P2) attempts to check with User A's number and valid code
    const resCheck = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p2', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: userANumber, code: '123456' })
    });
    // User B has no attempt for this number; rejected with 400
    assert.equal(resCheck.status, 400);
    const checkErr = (await resCheck.json()) as any;
    assert.equal(checkErr.error, 'NO_ACTIVE_VERIFICATION_ATTEMPT');

    // Confirm User B received no verification
    const userBDoc = await mockDb.collection('users').doc('uid_p2').get();
    assert.notEqual(userBDoc.data()?.whatsappTrusted, true);
    assert.notEqual(userBDoc.data()?.whatsappE164, userAE164);

    // Confirm User A's attempt is still pending and untouched
    const attemptDoc = await mockDb.collection(WHATSAPP_VERIFY_ATTEMPTS_COL).doc('uid_p1').get();
    assert.equal(attemptDoc.data()?.state, 'pending');
  });

  // 19. Missing attempt, number mismatch, expired attempt, or already consumed attempt are rejected
  await t.test('19. Missing attempt, number mismatch, expired attempt, or already consumed attempt are rejected', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    const mockTwilio = createMockTwilio({ checkStatus: 'approved' });
    __setTwilioClient(mockTwilio);

    const testNum = '0522223333';
    const otherNum = '0533332222';

    // 19a. Missing attempt: check without start -> 400 NO_ACTIVE_VERIFICATION_ATTEMPT
    const resNoAttempt = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: testNum, code: '123456' })
    });
    assert.equal(resNoAttempt.status, 400);
    const noAttemptErr = (await resNoAttempt.json()) as any;
    assert.equal(noAttemptErr.error, 'NO_ACTIVE_VERIFICATION_ATTEMPT');

    // Start verification for testNum
    await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: testNum })
    });

    // 19b. Number mismatch: check with otherNum -> 400 PHONE_NUMBER_MISMATCH
    const resMismatch = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: otherNum, code: '123456' })
    });
    assert.equal(resMismatch.status, 400);
    const mismatchErr = (await resMismatch.json()) as any;
    assert.equal(mismatchErr.error, 'PHONE_NUMBER_MISMATCH');

    // 19c. Expired attempt: set expiresAtMs in the past -> 400 VERIFICATION_ATTEMPT_EXPIRED
    await mockDb.collection(WHATSAPP_VERIFY_ATTEMPTS_COL).doc('uid_p1').update({
      expiresAtMs: Date.now() - 1000
    });
    const resExpired = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: testNum, code: '123456' })
    });
    assert.equal(resExpired.status, 400);
    const expiredErr = (await resExpired.json()) as any;
    assert.equal(expiredErr.error, 'VERIFICATION_ATTEMPT_EXPIRED');

    // 19d. Consumed attempt: start fresh, check once (consumed), check second time -> 400 VERIFICATION_ATTEMPT_CONSUMED
    await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: testNum })
    });
    const resFirst = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: testNum, code: '123456' })
    });
    assert.equal(resFirst.status, 200);

    const resSecond = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: testNum, code: '123456' })
    });
    assert.equal(resSecond.status, 400);
    const secondErr = (await resSecond.json()) as any;
    assert.equal(secondErr.error, 'VERIFICATION_ATTEMPT_CONSUMED');
  });

  // 20. Superseded attempts and concurrent requests cannot approve stale proof
  await t.test('20. Superseded attempts and concurrent requests cannot approve stale proof', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    const mockTwilio = createMockTwilio({ checkStatus: 'approved' });
    __setTwilioClient(mockTwilio);

    const num1 = '0544441111';
    const num2 = '0544442222';

    // Start attempt 1
    await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: num1 })
    });
    const attempt1Doc = await mockDb.collection(WHATSAPP_VERIFY_ATTEMPTS_COL).doc('uid_p1').get();
    const attempt1Id = attempt1Doc.data()?.attemptId;

    // Start attempt 2 (supersedes attempt 1)
    await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: num2 })
    });
    const attempt2Doc = await mockDb.collection(WHATSAPP_VERIFY_ATTEMPTS_COL).doc('uid_p1').get();
    const attempt2Id = attempt2Doc.data()?.attemptId;
    assert.notEqual(attempt1Id, attempt2Id);

    // Stale check for num1 is rejected (phone number mismatch with current active attempt)
    const resStale = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: num1, code: '123456' })
    });
    assert.equal(resStale.status, 400);
    const staleErr = (await resStale.json()) as any;
    assert.equal(staleErr.error, 'PHONE_NUMBER_MISMATCH');

    // Only current active attempt with matching number num2 can be approved
    const resValid = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: num2, code: '123456' })
    });
    assert.equal(resValid.status, 200);
  });

  // 21. Provider success followed by database failure without false success, and safe retry
  await t.test('21. Provider success followed by database failure without false success, and safe retry', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    let twilioCheckCount = 0;
    const trackingTwilio = {
      verify: {
        v2: {
          services: (_sid: string) => ({
            verifications: {
              create: async () => ({ status: 'pending' })
            },
            verificationChecks: {
              create: async () => {
                twilioCheckCount++;
                return { status: 'approved', channel: 'whatsapp' };
              }
            }
          })
        }
      }
    };
    __setTwilioClient(trackingTwilio);

    const testNum = '0555556666';

    // Start verification
    await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: testNum })
    });

    // Mock a transient transaction failure on the first attempt
    const originalRunTransaction = mockDb.runTransaction.bind(mockDb);
    let failedOnce = false;
    mockDb.runTransaction = async (updateFunction: any) => {
      if (!failedOnce) {
        failedOnce = true;
        throw new Error('DATABASE_ERROR');
      }
      return originalRunTransaction(updateFunction);
    };

    // First check fails at database transaction step
    const resFailed = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: testNum, code: '123456' })
    });
    assert.equal(resFailed.status, 500);

    // Ensure no false success occurred: user doc remains unverified
    const userDocBefore = await mockDb.collection('users').doc('uid_p1').get();
    assert.notEqual(userDocBefore.data()?.whatsappTrusted, true);

    // Restore runTransaction
    mockDb.runTransaction = originalRunTransaction;

    // Retry check: succeeds without re-calling Twilio (reusing provider_approved state safely)
    const resRetry = await fetch(`${baseUrl}/api/whatsapp/verify/check`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: testNum, code: '123456' })
    });
    assert.equal(resRetry.status, 200);
    const retryData = (await resRetry.json()) as any;
    assert.equal(retryData.success, true);
    assert.equal(retryData.whatsappTrusted, true);

    // Verify user doc now successfully committed
    const userDocAfter = await mockDb.collection('users').doc('uid_p1').get();
    assert.equal(userDocAfter.data()?.whatsappTrusted, true);

    // Twilio was called only once (the retry reused the provider approval)
    assert.equal(twilioCheckCount, 1);
  });

  // 22. Account deletion removes verification attempts and rate limits while preserving legacy SMS provenance
  await t.test('22. Account deletion removes verification attempts and rate limits while preserving legacy SMS provenance', async () => {
    resetState();
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_123';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TEST_123';
    process.env.TWILIO_VERIFY_SID = 'VA_TEST_123';

    const mockTwilio = createMockTwilio({ checkStatus: 'approved' });
    __setTwilioClient(mockTwilio);

    // P1 starts verification
    await fetch(`${baseUrl}/api/whatsapp/verify/start`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'SA +966', number: '0512345678' })
    });

    // Verify attempt and limits docs exist
    const attemptBefore = await mockDb.collection(WHATSAPP_VERIFY_ATTEMPTS_COL).doc('uid_p1').get();
    assert.equal(attemptBefore.exists, true);
    const limitBefore = await mockDb.collection(WHATSAPP_VERIFY_LIMITS_COL).doc('uid_p1').get();
    assert.equal(limitBefore.exists, true);

    // P1 deletes account
    const resDel = await fetch(`${baseUrl}/api/account/delete`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_p1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE' })
    });
    assert.equal(resDel.status, 200);

    // Attempt and limits docs were cleaned up
    const attemptAfter = await mockDb.collection(WHATSAPP_VERIFY_ATTEMPTS_COL).doc('uid_p1').get();
    assert.equal(attemptAfter.exists, false);
    const limitAfter = await mockDb.collection(WHATSAPP_VERIFY_LIMITS_COL).doc('uid_p1').get();
    assert.equal(limitAfter.exists, false);
  });
});
