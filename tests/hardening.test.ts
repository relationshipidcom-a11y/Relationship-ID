process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import { createApp, __setTestDeps, rateLimitMap, parseTrustProxyHops, CURRENT_LEGAL_VERSION } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

const SAUDI_P1_PHONE = '+966500000001';
const SAUDI_P2_PHONE = '+966500000002';

function validPartner1(overrideName?: string) {
  return {
    fullName: overrideName ?? 'Fahad Al-Harbi',
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

test('Hardening test suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  function resetState() {
    mockDb.reset();
    mockAuth.reset();
    rateLimitMap.clear();

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

    mockDb.seed('users', 'uid_p1', {
      uid: 'uid_p1',
      email: 'p1@example.com',
      phoneE164: SAUDI_P1_PHONE,
      profile: validPartner1()
    });

    mockDb.seed('users', 'uid_p2', {
      uid: 'uid_p2',
      email: 'p2@example.com',
      phoneE164: SAUDI_P2_PHONE,
      profile: validPartner2()
    });
  }

  try {
    // Test 1: fullName of 101 characters → 400 FIELD_TOO_LONG; 100 characters → accepted; whitespace-only → 400
    await t.test('1. fullName length validation (101 -> 400 FIELD_TOO_LONG, 100 -> 200, whitespace -> 400 INVALID_INPUT)', async () => {
    resetState();

    // 101 chars -> 400 FIELD_TOO_LONG
    const name101 = 'A'.repeat(101);
    const res101 = await fetch(`${baseUrl}/api/relationship`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_p1'
      },
      body: JSON.stringify({
        partner1: validPartner1(name101),
        type: 'marriage',
        startDate: '2024-01-01',
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(res101.status, 400);
    const json101 = await res101.json();
    assert.equal(json101.error, 'FIELD_TOO_LONG');
    assert.equal(typeof json101.messageEn, 'string');
    assert.equal(typeof json101.messageAr, 'string');

    // 100 chars -> 200
    const name100 = 'A'.repeat(100);
    const res100 = await fetch(`${baseUrl}/api/relationship`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_p1'
      },
      body: JSON.stringify({
        partner1: validPartner1(name100),
        type: 'marriage',
        startDate: '2024-01-01',
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(res100.status, 200);
    const json100 = await res100.json();
    assert.equal(json100.success, true);
    assert.equal(json100.record.partner1.fullName, name100);

    // whitespace-only -> 400 INVALID_INPUT
    const resWs = await fetch(`${baseUrl}/api/relationship`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_p1'
      },
      body: JSON.stringify({
        partner1: validPartner1('    '),
        type: 'marriage',
        startDate: '2024-01-01',
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(resWs.status, 400);
    const jsonWs = await resWs.json();
    assert.equal(jsonWs.error, 'INVALID_INPUT');
  });

  // Test 2: Arabic name at 100 characters counts correctly (Unicode) and is accepted
  await t.test('2. Arabic name at 100 characters counts correctly (Unicode) and is accepted', async () => {
    resetState();

    // 100 Arabic characters
    const arabicPart = 'عبدالرحمن محمد الشمري ';
    const arabic100 = arabicPart.repeat(10).slice(0, 100);
    assert.equal(Array.from(arabic100).length, 100);

    const resAr100 = await fetch(`${baseUrl}/api/relationship`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_p1'
      },
      body: JSON.stringify({
        partner1: validPartner1(arabic100),
        type: 'marriage',
        startDate: '2024-01-01',
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(resAr100.status, 200);
    const jsonAr100 = await resAr100.json();
    assert.equal(jsonAr100.success, true);
    assert.equal(jsonAr100.record.partner1.fullName, arabic100);

    // 101 Arabic characters -> 400 FIELD_TOO_LONG
    const arabic101 = arabicPart.repeat(10).slice(0, 101);
    assert.equal(Array.from(arabic101).length, 101);

    const resAr101 = await fetch(`${baseUrl}/api/relationship`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_p1'
      },
      body: JSON.stringify({
        partner1: validPartner1(arabic101),
        type: 'marriage',
        startDate: '2024-01-01',
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(resAr101.status, 400);
    const jsonAr101 = await resAr101.json();
    assert.equal(jsonAr101.error, 'FIELD_TOO_LONG');
  });

  // Test 3: change-request newValue of 101 characters → 400
  await t.test('3. change-request newValue of 101 characters → 400', async () => {
    resetState();

    // Seed active relationship
    const p1 = validPartner1();
    const p2 = validPartner2();
    mockDb.seed('relationships', 'rel_1', {
      id: 'rel_1',
      recordNumber: '123456',
      verificationRef: 'RID-2024-123456-ABC',
      type: 'marriage',
      status: 'active',
      p1Uid: 'uid_p1',
      p2Uid: 'uid_p2',
      partner1: p1,
      partner2: p2,
      startDate: '2024-01-01',
      startDateAr: '1 يناير 2024',
      startDateIso: '2024-01-01',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    });
    mockDb.seed('users', 'uid_p1', {
      uid: 'uid_p1',
      email: 'p1@example.com',
      activeRecordId: 'rel_1'
    });
    mockDb.seed('users', 'uid_p2', {
      uid: 'uid_p2',
      email: 'p2@example.com',
      activeRecordId: 'rel_1'
    });

    const resOverlong = await fetch(`${baseUrl}/api/change-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_p1'
      },
      body: JSON.stringify({
        field: 'partner1FullName',
        proposedValue: 'X'.repeat(101)
      })
    });
    assert.equal(resOverlong.status, 400);
    const jsonOverlong = await resOverlong.json();
    assert.equal(jsonOverlong.error, 'FIELD_TOO_LONG');

    // 100 chars -> 200
    const resValid = await fetch(`${baseUrl}/api/change-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_p1'
      },
      body: JSON.stringify({
        field: 'partner1FullName',
        proposedValue: 'X'.repeat(100)
      })
    });
    assert.equal(resValid.status, 200);
    const jsonValid = await resValid.json();
    assert.equal(jsonValid.success, true);
  });

  // Test 4: /api/verify/<70-character ref> and /api/invitations/<invalid chars> → the normal not-found response
  await t.test('4. /api/verify/<70-character ref> and /api/invitations/<invalid chars> → normal not-found response', async () => {
    resetState();

    // 70-character ref -> 404 { found: false, message: 'No record found' }
    const longRef = 'RID-' + 'A'.repeat(66);
    assert.equal(longRef.length, 70);
    const resVerify = await fetch(`${baseUrl}/api/verify/${longRef}`);
    assert.equal(resVerify.status, 404);
    const jsonVerify = await resVerify.json();
    assert.deepEqual(jsonVerify, { found: false, message: 'No record found' });

    // Invalid chars in invitation param -> 404 { error: 'INVITATION_NOT_FOUND' }
    const resInv = await fetch(`${baseUrl}/api/invitations/invalid!char@id`);
    assert.equal(resInv.status, 404);
    const jsonInv = await resInv.json();
    assert.equal(jsonInv.error, 'INVITATION_NOT_FOUND');
  });

  // Test 5: POST /api/account/delete 4 times in a minute by the same uid → 4th is 429 RATE_LIMITED with a Retry-After header
  await t.test('5. POST /api/account/delete 4 times in a minute by the same uid → 4th is 429 RATE_LIMITED with Retry-After header', async () => {
    resetState();

    // Call 1, 2, 3
    for (let i = 0; i < 3; i++) {
      // Re-seed user and auth so deletion doesn't fail on missing user
      mockAuth.addUser('token_p1', {
        uid: 'uid_p1',
        email: 'p1@example.com',
        email_verified: true,
        phone_number: SAUDI_P1_PHONE
      });
      mockDb.seed('users', 'uid_p1', {
        uid: 'uid_p1',
        email: 'p1@example.com',
        phoneE164: SAUDI_P1_PHONE
      });

      const res = await fetch(`${baseUrl}/api/account/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        }
      });
      assert.equal(res.status, 200);
    }

    // Ensure token is still valid for 4th request
    mockAuth.addUser('token_p1', {
      uid: 'uid_p1',
      email: 'p1@example.com',
      email_verified: true,
      phone_number: SAUDI_P1_PHONE
    });

    // Call 4 -> 429 RATE_LIMITED with Retry-After header
    const res4 = await fetch(`${baseUrl}/api/account/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_p1'
      }
    });
    assert.equal(res4.status, 429);
    assert.ok(res4.headers.has('retry-after'));
    assert.equal(res4.headers.get('retry-after'), '60');
    const json4 = await res4.json();
    assert.equal(json4.error, 'RATE_LIMITED');
  });

  // Test 6: POST /api/verify/contact over its limit → 429 with body exactly { found: false, stage: null } and Retry-After header
  await t.test('6. POST /api/verify/contact over limit → 429 { found: false, stage: null } and Retry-After header', async () => {
    resetState();

    // 20 requests allowed per minute
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${baseUrl}/api/verify/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'test@example.com' })
      });
      assert.equal(res.status, 200);
    }

    // 21st request -> 429
    const res21 = await fetch(`${baseUrl}/api/verify/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test@example.com' })
    });
    assert.equal(res21.status, 429);
    assert.ok(res21.headers.has('retry-after'));
    assert.equal(res21.headers.get('retry-after'), '60');
    const json21 = await res21.json();
    assert.deepEqual(json21, { found: false, stage: null });
  });

  // Test 7: POST /internal/reconcile with no secret / wrong secret / short env secret → 404; with correct secret → { relationships, accounts, skipped } (all numbers >= 0) and 200
  await t.test('7. POST /internal/reconcile secret authentication and response shape', async () => {
    resetState();

    const originalSecret = process.env.RECONCILE_SECRET;

    try {
      // 1. Secret not configured in env -> 404
      delete process.env.RECONCILE_SECRET;
      const resNoEnv = await fetch(`${baseUrl}/internal/reconcile`, {
        method: 'POST',
        headers: {
          'X-Reconcile-Secret': 'a'.repeat(32)
        }
      });
      assert.equal(resNoEnv.status, 404);

      // 2. Secret too short in env (< 32 chars) -> 404
      process.env.RECONCILE_SECRET = 'short_secret_under_32';
      const resShortEnv = await fetch(`${baseUrl}/internal/reconcile`, {
        method: 'POST',
        headers: {
          'X-Reconcile-Secret': 'short_secret_under_32'
        }
      });
      assert.equal(resShortEnv.status, 404);

      // 3. Valid env secret configured (32+ chars)
      const validSecret = 'super_secret_reconcile_token_at_least_32_chars!';
      process.env.RECONCILE_SECRET = validSecret;

      // No header -> 404
      const resNoHeader = await fetch(`${baseUrl}/internal/reconcile`, {
        method: 'POST'
      });
      assert.equal(resNoHeader.status, 404);

      // Wrong header -> 404
      const resWrongHeader = await fetch(`${baseUrl}/internal/reconcile`, {
        method: 'POST',
        headers: {
          'X-Reconcile-Secret': 'wrong_secret_that_does_not_match_at_all!'
        }
      });
      assert.equal(resWrongHeader.status, 404);

      // Correct secret -> 200 with { relationships, accounts, skipped }
      const resOk = await fetch(`${baseUrl}/internal/reconcile`, {
        method: 'POST',
        headers: {
          'X-Reconcile-Secret': validSecret
        }
      });
      assert.equal(resOk.status, 200);
      const jsonOk = await resOk.json();
      assert.equal(typeof jsonOk.relationships, 'number');
      assert.equal(typeof jsonOk.accounts, 'number');
      assert.equal(typeof jsonOk.skipped, 'number');
      assert.ok(jsonOk.relationships >= 0);
      assert.ok(jsonOk.accounts >= 0);
      assert.ok(jsonOk.skipped >= 0);
    } finally {
      if (originalSecret !== undefined) {
        process.env.RECONCILE_SECRET = originalSecret;
      } else {
        delete process.env.RECONCILE_SECRET;
      }
    }
  });

  // Test 8: TRUST_PROXY_HOPS parsing: string '2' → 2 hops; 'invalid' → 1 hop
  await t.test('8. TRUST_PROXY_HOPS parsing', () => {
    assert.equal(parseTrustProxyHops('2'), 2);
    assert.equal(parseTrustProxyHops('5'), 5);
    assert.equal(parseTrustProxyHops('invalid'), 1);
    assert.equal(parseTrustProxyHops(''), 1);
    assert.equal(parseTrustProxyHops(undefined), 1);
    assert.equal(parseTrustProxyHops(-2), 1);
    assert.equal(parseTrustProxyHops(3), 3);
    assert.equal(parseTrustProxyHops(0), 0);
  });
} finally {
  server.closeAllConnections?.();
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
});
