process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, __setTestDeps, rateLimitMap } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

test('Account Data Export (PDPL Right of Access) suite', async (t) => {
  rateLimitMap.clear();

  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();

  mockAuth.addUser('token_p1', {
    uid: 'uid_p1',
    email: 'p1@example.com',
    email_verified: true,
    phone_number: '+966500000001'
  });

  mockAuth.addUser('token_p2', {
    uid: 'uid_p2',
    email: 'p2@example.com',
    email_verified: true,
    phone_number: '+966500000002'
  });

  // Seed user profiles
  mockDb.seed('users', 'uid_p1', {
    uid: 'uid_p1',
    email: 'p1@example.com',
    fullName: 'Fahad Al-Harbi',
    fullNameEn: 'Fahad Al-Harbi',
    phoneHash: 'secret_hash_value',
    contactHashes: ['hash1', 'hash2']
  });

  mockDb.seed('users', 'uid_p2', {
    uid: 'uid_p2',
    email: 'p2@example.com',
    fullName: 'Sara Al-Otaibi',
    fullNameEn: 'Sara Al-Otaibi'
  });

  // Seed active relationship
  mockDb.seed('relationships', 'rel_active', {
    id: 'rel_active',
    recordNumber: 'REC-001',
    verificationRef: 'REF-001',
    type: 'dating',
    startDate: '2023-01-01',
    startDateAr: '1 يناير 2023',
    startDateIso: '2023-01-01',
    issuedDate: '2023-01-02',
    issuedDateAr: '2 يناير 2023',
    status: 'active',
    createdAt: '2023-01-01T00:00:00.000Z',
    settings: { showSocialHandles: true },
    p1Uid: 'uid_p1',
    p2Uid: 'uid_p2',
    partner1: {
      fullName: 'Fahad Al-Harbi',
      fullNameEn: 'Fahad Al-Harbi',
      email: 'p1@example.com',
      phoneNumber: '0500000001',
      phoneE164: '+966500000001',
      socialHandle: 'fahad_handle',
      birthYear: '1990'
    },
    partner2: {
      fullName: 'Sara Al-Otaibi',
      fullNameEn: 'Sara Al-Otaibi',
      email: 'p2@example.com',
      phoneNumber: '0500000002',
      phoneE164: '+966500000002',
      socialHandle: 'sara_handle',
      birthYear: '1995'
    }
  });

  // Seed ended relationship
  mockDb.seed('relationships', 'rel_ended', {
    id: 'rel_ended',
    recordNumber: 'REC-000',
    verificationRef: 'REF-000',
    type: 'dating',
    startDate: '2022-01-01',
    startDateAr: '1 يناير 2022',
    startDateIso: '2022-01-01',
    issuedDate: '2022-01-02',
    issuedDateAr: '2 يناير 2022',
    status: 'ended',
    createdAt: '2022-01-01T00:00:00.000Z',
    settings: {},
    p1Uid: 'uid_p1',
    p2Uid: 'uid_p2',
    partner1: {
      fullName: 'Fahad Al-Harbi',
      fullNameEn: 'Fahad Al-Harbi',
      email: 'p1@example.com'
    },
    partner2: {
      fullName: 'Sara Al-Otaibi',
      fullNameEn: 'Sara Al-Otaibi',
      email: 'p2@example.com',
      phoneNumber: '0500000002',
      phoneE164: '+966500000002',
      socialHandle: 'sara_handle',
      birthYear: '1995'
    }
  });

  // Seed invitation with realistic create/accept shape
  mockDb.seed('invitations', 'inv_1', {
    id: 'inv_1',
    recordId: 'rel_active',
    inviterName: 'Fahad Al-Harbi',
    partner2Name: 'Sara Al-Otaibi',
    partner2Email: 'p2@example.com',
    partner2Phone: '+966500000002',
    partner2PhoneCountry: 'SA +966',
    partner2Whatsapp: '+966500000002',
    partner2WhatsappCountry: 'SA +966',
    relationshipType: 'dating',
    startDate: '2023-01-01',
    startDateAr: '1 يناير 2023',
    startDateIso: '2023-01-01',
    status: 'accepted',
    createdAt: '2023-01-01T00:00:00.000Z',
    expiresAt: '2023-01-04T00:00:00.000Z',
    reminderCount: 0,
    p1Uid: 'uid_p1',
    p2Uid: 'uid_p2'
  });

  __setTestDeps(mockDb, mockAuth);
  const app = createApp();

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. No Authorization header → 401
    await t.test('1. No Authorization header → 401', async () => {
      const res = await fetch(`${baseUrl}/api/account/export`);
      assert.equal(res.status, 401);
      const data = (await res.json()) as any;
      assert.equal(data.error, 'AUTH_REQUIRED');
    });

    // 2. Authenticated → 200, body.success === true, body.exportedAt parses to a valid Date, all 6 keys
    let exportBody: any = null;
    await t.test('2. Authenticated → 200, body.success === true, valid Date, and all six keys present', async () => {
      const res = await fetch(`${baseUrl}/api/account/export`, {
        headers: { Authorization: 'Bearer token_p1' }
      });
      assert.equal(res.status, 200);
      exportBody = (await res.json()) as any;
      assert.equal(exportBody.success, true);
      assert.ok(exportBody.exportedAt, 'exportedAt exists');
      const parsedDate = new Date(exportBody.exportedAt);
      assert.ok(!Number.isNaN(parsedDate.getTime()), 'exportedAt parses to a valid Date');

      const expectedKeys = ['profile', 'relationships', 'invitations', 'changeRequests', 'notifications', 'invitationBlocks'];
      for (const k of expectedKeys) {
        assert.ok(k in exportBody.data, `Key "${k}" must be present in data`);
      }
      assert.equal(exportBody.data.profile.fullName, 'Fahad Al-Harbi');
      assert.equal('phoneHash' in exportBody.data.profile, false, 'phoneHash must be dropped');
      assert.equal('contactHashes' in exportBody.data.profile, false, 'contactHashes must be dropped');
    });

    // 3. The 'ended' relationship appears in body.data.relationships
    await t.test("3. The 'ended' relationship appears in body.data.relationships", () => {
      assert.ok(Array.isArray(exportBody.data.relationships));
      const endedRel = exportBody.data.relationships.find((r: any) => r.id === 'rel_ended');
      assert.ok(endedRel, "Ended relationship 'rel_ended' must appear in export");
      assert.equal(endedRel.status, 'ended');
    });

    // 4. LEAK TEST — raw does NOT contain partner2 private data
    await t.test('4. LEAK TEST — raw JSON does not contain partner2 private data', () => {
      const raw = JSON.stringify(exportBody);
      assert.equal(raw.includes('p2@example.com'), false, 'Must not leak partner2 email');
      assert.equal(raw.includes('+966500000002'), false, 'Must not leak partner2 phone E164');
      assert.equal(raw.includes('0500000002'), false, 'Must not leak partner2 phone local');
      assert.equal(raw.includes('sara_handle'), false, 'Must not leak partner2 social handle');
      assert.equal(raw.includes('"birthYear":"1995"'), false, 'Must not leak partner2 birth year');
    });

    // 5. UID TEST — raw does NOT contain uid_p2
    await t.test('5. UID TEST — raw JSON does not contain uid_p2', () => {
      const raw = JSON.stringify(exportBody);
      assert.equal(raw.includes('uid_p2'), false, 'Must not leak partner UID');
    });

    // 6. Each relationship entry has otherPartner with exactly { fullName, fullNameEn } and no p1Uid or p2Uid
    await t.test('6. Relationship projection: otherPartner exactly fullName/fullNameEn, no p1Uid/p2Uid', () => {
      assert.ok(exportBody.data.relationships.length > 0);
      for (const rel of exportBody.data.relationships) {
        assert.equal('p1Uid' in rel, false, 'Relationship must not contain p1Uid');
        assert.equal('p2Uid' in rel, false, 'Relationship must not contain p2Uid');
        assert.ok(rel.otherPartner, 'Relationship must have otherPartner');
        const otherPartnerKeys = Object.keys(rel.otherPartner).sort();
        assert.deepEqual(otherPartnerKeys, ['fullName', 'fullNameEn']);
        assert.equal(rel.otherPartner.fullName, 'Sara Al-Otaibi');
      }
    });

    // 7. A 4th request inside the window → 429 with error 'RATE_LIMITED'
    await t.test('7. A 4th request inside the window → 429 with error RATE_LIMITED', async () => {
      // 2nd request
      const res2 = await fetch(`${baseUrl}/api/account/export`, {
        headers: { Authorization: 'Bearer token_p1' }
      });
      assert.equal(res2.status, 200);

      // 3rd request
      const res3 = await fetch(`${baseUrl}/api/account/export`, {
        headers: { Authorization: 'Bearer token_p1' }
      });
      assert.equal(res3.status, 200);

      // 4th request -> 429
      const res4 = await fetch(`${baseUrl}/api/account/export`, {
        headers: { Authorization: 'Bearer token_p1' }
      });
      assert.equal(res4.status, 429);
      const data4 = (await res4.json()) as any;
      assert.equal(data4.error, 'RATE_LIMITED');
    });

    // 8. Partner 2's own export: call rateLimitMap.clear(), export with token_p2
    await t.test("8. Partner 2's own export: does not leak P1 private data and keeps own invitation contact fields", async () => {
      rateLimitMap.clear();
      const resP2 = await fetch(`${baseUrl}/api/account/export`, {
        headers: { Authorization: 'Bearer token_p2' }
      });
      assert.equal(resP2.status, 200);
      const p2Body = (await resP2.json()) as any;
      const rawP2 = JSON.stringify(p2Body);

      assert.equal(rawP2.includes('p1@example.com'), false, 'Must not leak P1 email');
      assert.equal(rawP2.includes('+966500000001'), false, 'Must not leak P1 phone E164');
      assert.equal(rawP2.includes('0500000001'), false, 'Must not leak P1 local phone');
      assert.equal(rawP2.includes('fahad_handle'), false, 'Must not leak P1 social handle');
      assert.equal(rawP2.includes('1990'), false, 'Must not leak P1 birth year');
      assert.equal(rawP2.includes('uid_p1'), false, 'Must not leak P1 UID');

      assert.ok(Array.isArray(p2Body.data.invitations));
      const p2Inv = p2Body.data.invitations.find((inv: any) => inv.id === 'inv_1');
      assert.ok(p2Inv, 'Invitation inv_1 must appear in P2 export');
      assert.equal(p2Inv.invitedMe, true, 'invitedMe must be true for P2');
      assert.equal(p2Inv.partner2Email, 'p2@example.com', 'partner2Email must be preserved for P2');
    });

    // 9. Partner 1's invitation projection
    await t.test("9. Partner 1's invitation projection: invitedMe is false and Partner 2 contact details are redacted", () => {
      assert.ok(Array.isArray(exportBody.data.invitations));
      const p1Inv = exportBody.data.invitations.find((inv: any) => inv.id === 'inv_1');
      assert.ok(p1Inv, 'Invitation inv_1 must appear in P1 export');
      assert.equal(p1Inv.invitedMe, false, 'invitedMe must be false for P1');
      assert.equal(p1Inv.partner2Name, 'Sara Al-Otaibi', 'partner2Name must be preserved');
      assert.equal('partner2Email' in p1Inv, false, 'partner2Email must be dropped for P1');
      assert.equal('partner2Phone' in p1Inv, false, 'partner2Phone must be dropped for P1');
      assert.equal('partner2PhoneCountry' in p1Inv, false, 'partner2PhoneCountry must be dropped for P1');
      assert.equal('partner2Whatsapp' in p1Inv, false, 'partner2Whatsapp must be dropped for P1');
      assert.equal('partner2WhatsappCountry' in p1Inv, false, 'partner2WhatsappCountry must be dropped for P1');
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
