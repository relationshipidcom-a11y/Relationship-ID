process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, __setTestDeps, CURRENT_LEGAL_VERSION } from '../server';
import { LEGAL_VERSION } from '../src/content/legal';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

const SAUDI_P1_PHONE = '+966500000001';
const SAUDI_P2_PHONE = '+966500000002';

function validPartner1() {
  return {
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
}

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

test('Legal Consent & Terms/Privacy suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();

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
      phoneE164: SAUDI_P1_PHONE
    });
    mockDb.seed('users', 'uid_p2', {
      uid: 'uid_p2',
      email: 'p2@example.com',
      phoneE164: SAUDI_P2_PHONE
    });
  }

  function seedPendingInvitation() {
    resetState();
    mockDb.seed('relationships', 'rel_1', {
      id: 'rel_1',
      recordNumber: '123456',
      type: 'marriage',
      status: 'pending_partner',
      p1Uid: 'uid_p1',
      p2Uid: null,
      partner1: validPartner1(),
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

  try {
    // 1. POST /api/relationship without acceptedLegalVersion → 400 LEGAL_CONSENT_REQUIRED
    await t.test('1. POST /api/relationship without acceptedLegalVersion → 400 LEGAL_CONSENT_REQUIRED', async () => {
      resetState();
      const res = await fetch(`${baseUrl}/api/relationship`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({
          partner1: validPartner1(),
          type: 'marriage',
          startDate: '2024-01-01'
        })
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as any;
      assert.equal(data.error, 'LEGAL_CONSENT_REQUIRED');
      assert.equal(typeof data.messageEn, 'string');
      assert.equal(typeof data.messageAr, 'string');
    });

    // 2. Wrong version → 400
    await t.test('2. POST /api/relationship with wrong acceptedLegalVersion → 400 LEGAL_CONSENT_REQUIRED', async () => {
      resetState();
      const res = await fetch(`${baseUrl}/api/relationship`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({
          partner1: validPartner1(),
          type: 'marriage',
          startDate: '2024-01-01',
          acceptedLegalVersion: 'invalid-old-version'
        })
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as any;
      assert.equal(data.error, 'LEGAL_CONSENT_REQUIRED');
    });

    // 3. Correct version → success; users/{uid} has legalConsentVersion + legalConsentAt
    await t.test('3. POST /api/relationship with correct version → success; users/{uid} has legalConsentVersion + legalConsentAt', async () => {
      resetState();
      const res = await fetch(`${baseUrl}/api/relationship`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({
          partner1: validPartner1(),
          type: 'marriage',
          startDate: '2024-01-01',
          acceptedLegalVersion: CURRENT_LEGAL_VERSION
        })
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);

      const userDoc = mockDb.getDoc('users', 'uid_p1');
      assert.equal(userDoc?.legalConsentVersion, CURRENT_LEGAL_VERSION);
      assert.ok(userDoc?.legalConsentAt, 'legalConsentAt timestamp exists');
      assert.ok(!Number.isNaN(new Date(userDoc?.legalConsentAt).getTime()), 'legalConsentAt is valid ISO date');
    });

    // 4. Accept without consent → 400; with consent → success and P2 users doc stores consent
    await t.test('4. Accept route: without consent → 400; with consent → 200 & P2 users doc stores consent', async () => {
      // 4a. Without consent
      seedPendingInvitation();
      const resNoConsent = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        },
        body: JSON.stringify({
          partner2: validPartner2()
        })
      });
      assert.equal(resNoConsent.status, 400);
      const noConsentData = (await resNoConsent.json()) as any;
      assert.equal(noConsentData.error, 'LEGAL_CONSENT_REQUIRED');

      // 4b. With wrong consent version
      const resWrongConsent = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        },
        body: JSON.stringify({
          partner2: validPartner2(),
          acceptedLegalVersion: '2020-01-wrong'
        })
      });
      assert.equal(resWrongConsent.status, 400);
      const wrongConsentData = (await resWrongConsent.json()) as any;
      assert.equal(wrongConsentData.error, 'LEGAL_CONSENT_REQUIRED');

      // 4c. With correct consent
      const resSuccess = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        },
        body: JSON.stringify({
          partner2: validPartner2(),
          acceptedLegalVersion: CURRENT_LEGAL_VERSION
        })
      });
      assert.equal(resSuccess.status, 200);
      const successData = (await resSuccess.json()) as any;
      assert.equal(successData.success, true);

      const p2UserDoc = mockDb.getDoc('users', 'uid_p2');
      assert.equal(p2UserDoc?.legalConsentVersion, CURRENT_LEGAL_VERSION);
      assert.ok(p2UserDoc?.legalConsentAt, 'P2 legalConsentAt timestamp exists');
      assert.ok(!Number.isNaN(new Date(p2UserDoc?.legalConsentAt).getTime()), 'P2 legalConsentAt is valid ISO date');
    });

    // 5. LEGAL_VERSION (client) === CURRENT_LEGAL_VERSION (server)
    await t.test('5. LEGAL_VERSION (client) === CURRENT_LEGAL_VERSION (server)', async () => {
      assert.equal(LEGAL_VERSION, CURRENT_LEGAL_VERSION);
      assert.equal(CURRENT_LEGAL_VERSION, '2026-10-01');
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
