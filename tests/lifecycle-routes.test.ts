process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, __setTestDeps } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

const SAUDI_P1_PHONE = '+966500000001';
const SAUDI_P2_PHONE = '+966500000002';
const STRANGER_PHONE = '+966500000099';

function seedActiveState(mockDb: any) {
  mockDb.reset();

  const p1 = {
    fullName: 'رامي خليل',
    fullNameEn: 'Rami Khalil',
    birthDay: '10',
    birthMonth: '05',
    birthYear: '1995',
    email: 'rami@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '0500000001',
    phoneE164: SAUDI_P1_PHONE,
    phoneVerified: true,
    whatsappCountry: 'SA +966',
    whatsappNumber: '0500000001',
    whatsappE164: SAUDI_P1_PHONE,
    socialHandle: 'rami_k'
  };

  const p2 = {
    fullName: 'سارة أحمد',
    fullNameEn: 'Sara Ahmed',
    birthDay: '14',
    birthMonth: '08',
    birthYear: '1997',
    email: 'sara@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '0500000002',
    phoneE164: SAUDI_P2_PHONE,
    phoneVerified: true,
    whatsappCountry: 'SA +966',
    whatsappNumber: '0500000002',
    whatsappE164: SAUDI_P2_PHONE,
    socialHandle: 'sara_a'
  };

  mockDb.seed('users', 'uid_p1_rami', {
    uid: 'uid_p1_rami',
    email: 'rami@example.com',
    phoneE164: SAUDI_P1_PHONE,
    relationshipId: 'rec_1001',
    activeRecordId: 'rec_1001',
    profile: p1
  });

  mockDb.seed('users', 'uid_p2_sara', {
    uid: 'uid_p2_sara',
    email: 'sara@example.com',
    phoneE164: SAUDI_P2_PHONE,
    relationshipId: 'rec_1001',
    activeRecordId: 'rec_1001',
    profile: p2
  });

  mockDb.seed('relationships', 'rec_1001', {
    id: 'rec_1001',
    recordNumber: '556677',
    verificationRef: 'RID-2026-556677-ABC',
    type: 'dating',
    startDate: '2026-01-15',
    startDateAr: '١٥ يناير ٢٠٢٦',
    status: 'active',
    p1Uid: 'uid_p1_rami',
    p2Uid: 'uid_p2_sara',
    partner1: p1,
    partner2: p2,
    settings: {
      showAnniversary: true,
      publicContactSearchP1: false,
      publicContactSearchP2: false
    },
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z'
  });

  mockDb.seed('certificates', 'RID-2026-556677-ABC', {
    verificationRef: 'RID-2026-556677-ABC',
    recordNumber: '556677',
    partner1Name: 'رامي خليل',
    partner2Name: 'سارة أحمد',
    partner1En: 'Rami Khalil',
    partner2En: 'Sara Ahmed',
    type: 'dating',
    startDate: '2026-01-15',
    startDateAr: '١٥ يناير ٢٠٢٦',
    issuedDate: '2026-01-15',
    issuedDateAr: '١٥ يناير ٢٠٢٦',
    status: 'active',
    relationshipId: 'rec_1001'
  });

  // Seed a pending change request
  mockDb.seed('change_requests', 'cr_1', {
    id: 'cr_1',
    recordId: 'rec_1001',
    verificationRef: 'RID-2026-556677-ABC',
    requesterUid: 'uid_p1_rami',
    approverUid: 'uid_p2_sara',
    field: 'type',
    oldValue: 'dating',
    proposedValue: 'marriage',
    status: 'pending',
    createdAt: '2026-01-16T00:00:00Z'
  });
}

test('Lifecycle & public verification route test suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  mockAuth.addUser('token_p1', {
    uid: 'uid_p1_rami',
    email: 'rami@example.com',
    email_verified: true,
    phone_number: SAUDI_P1_PHONE
  });

  mockAuth.addUser('token_p2', {
    uid: 'uid_p2_sara',
    email: 'sara@example.com',
    email_verified: true,
    phone_number: SAUDI_P2_PHONE
  });

  mockAuth.addUser('token_stranger', {
    uid: 'uid_stranger',
    email: 'stranger@example.com',
    email_verified: true,
    phone_number: STRANGER_PHONE
  });

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. GET /api/verify/:refCode - public projection contains zero PII or internal IDs
    await t.test('1. GET /api/verify/:refCode public projection contains no email, phone, birth date, or internal IDs', async () => {
      seedActiveState(mockDb);

      const res = await fetch(`${baseUrl}/api/verify/RID-2026-556677-ABC`);
      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const data = (await res.json()) as any;

      assert.equal(data.found, true);
      const cert = data.record;
      assert.ok(cert);
      assert.equal(cert.verificationRef, 'RID-2026-556677-ABC');
      assert.equal(cert.recordNumber, '556677');
      assert.equal(cert.partner1Name, 'رامي خليل');
      assert.equal(cert.partner2Name, 'سارة أحمد');
      assert.equal(cert.status, 'active');

      // Assert zero PII
      const jsonStr = JSON.stringify(data);
      assert.equal(jsonStr.includes('rami@example.com'), false, 'Must not leak email');
      assert.equal(jsonStr.includes('sara@example.com'), false, 'Must not leak email');
      assert.equal(jsonStr.includes('+966500000001'), false, 'Must not leak phone');
      assert.equal(jsonStr.includes('+966500000002'), false, 'Must not leak phone');
      assert.equal(jsonStr.includes('1995'), false, 'Must not leak birth year');
      assert.equal(jsonStr.includes('1997'), false, 'Must not leak birth year');
      assert.equal(jsonStr.includes('uid_p1_rami'), false, 'Must not leak UIDs');
      assert.equal(jsonStr.includes('uid_p2_sara'), false, 'Must not leak UIDs');
    });

    // 2. GET /api/verify/:refCode - Unknown ref returns safe not-found
    await t.test('2. GET /api/verify/:refCode with unknown ref returns safe 404', async () => {
      seedActiveState(mockDb);

      const res = await fetch(`${baseUrl}/api/verify/RID-9999-000000-XYZ`);
      assert.equal(res.status, 404);
      const data = (await res.json()) as any;
      assert.equal(data.found, false);
    });

    // 3. GET /api/verify/:refCode - Internal record ID lookup is rejected
    await t.test('3. GET /api/verify/:refCode strictly uses verificationRef, not internal recordId', async () => {
      seedActiveState(mockDb);

      const res = await fetch(`${baseUrl}/api/verify/rec_1001`);
      assert.equal(res.status, 404);
    });

    // 4. POST /api/verify/contact - Response shape and consent rules
    await t.test('4. POST /api/verify/contact: response keys are exactly { found, stage }, stage returned only when active AND both consented', async () => {
      seedActiveState(mockDb);

      // A: When consent flags are false -> { found: false, stage: null }
      const res1 = await fetch(`${baseUrl}/api/verify/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: SAUDI_P1_PHONE })
      });
      assert.equal(res1.status, 200);
      const data1 = (await res1.json()) as any;
      assert.deepEqual(Object.keys(data1).sort(), ['found', 'stage']);
      assert.equal(data1.found, false);
      assert.equal(data1.stage, null);

      // B: Enable both consent flags via PATCH /api/record/settings
      await fetch(`${baseUrl}/api/record/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({ publicContactSearchP1: true })
      });
      await fetch(`${baseUrl}/api/record/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        },
        body: JSON.stringify({ publicContactSearchP2: true })
      });

      // C: Search with both consent flags enabled -> { found: true, stage: 'Dating' }
      const res3 = await fetch(`${baseUrl}/api/verify/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: SAUDI_P1_PHONE })
      });
      const data3 = (await res3.json()) as any;
      assert.deepEqual(Object.keys(data3).sort(), ['found', 'stage']);
      assert.equal(data3.found, true);
      assert.equal(data3.stage, 'Dating');

      // D: Unknown contact -> { found: false, stage: null }
      const res4 = await fetch(`${baseUrl}/api/verify/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '+966509999999' })
      });
      const data4 = (await res4.json()) as any;
      assert.deepEqual(Object.keys(data4).sort(), ['found', 'stage']);
      assert.equal(data4.found, false);
      assert.equal(data4.stage, null);
    });

    // 5. POST /api/relationship/end - P1 or P2 ends relationship
    await t.test('5. POST /api/relationship/end deactivates relationship & certificate, closes change requests, stores NO partner notification, keeps personal accounts', async () => {
      seedActiveState(mockDb);

      const res = await fetch(`${baseUrl}/api/relationship/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({ relationshipId: 'rec_1001' })
      });

      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);

      // 1. Relationship document is deleted from relationships collection
      const rel = mockDb.getDoc('relationships', 'rec_1001');
      assert.equal(rel, undefined, 'Relationship document must be cleaned');

      // 2. Certificate is deleted
      const cert = mockDb.getDoc('certificates', 'RID-2026-556677-ABC');
      assert.equal(cert, undefined, 'Certificate document must be cleaned');

      // 3. Change requests cleaned
      const cr = mockDb.getDoc('change_requests', 'cr_1');
      assert.equal(cr, undefined, 'Change request must be cleaned');

      // 4. Personal user documents preserved for both users
      const u1 = mockDb.getDoc('users', 'uid_p1_rami');
      const u2 = mockDb.getDoc('users', 'uid_p2_sara');
      assert.ok(u1, 'P1 user document must be preserved');
      assert.ok(u2, 'P2 user document must be preserved');
      assert.equal(u1.activeRecordId, undefined);
      assert.equal(u2.activeRecordId, undefined);

      // 5. NO notifications collection or partner notification created
      const notifCol = mockDb.store.get('notifications');
      const notifCount = notifCol ? notifCol.size : 0;
      assert.equal(notifCount, 0, 'Must not create partner notification per owner rules');
    });

    // 6. Verification lookup of ended certificate returns safe 404
    await t.test('6. Ended relationship certificate is cleaned and public lookup returns safe 404', async () => {
      const res = await fetch(`${baseUrl}/api/verify/RID-2026-556677-ABC`);
      assert.equal(res.status, 404);
      const data = (await res.json()) as any;
      assert.equal(data.found, false);
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
