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
  CURRENT_LEGAL_VERSION
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
});
