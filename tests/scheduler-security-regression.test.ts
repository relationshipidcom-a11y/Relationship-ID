process.env.NODE_ENV = 'test';
if (!process.env.CONTACT_HASH_SECRET || process.env.CONTACT_HASH_SECRET.length < 32) {
  process.env.CONTACT_HASH_SECRET = 'test_contact_hash_secret_at_least_32_characters_long_for_hmac';
}

import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createApp,
  __setTestDeps,
  __setTestAppCheck,
  verifySecret,
  verifyReconcileSecret,
  extractValidatedHeader,
  requireAppCheck
} from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

test('Scheduler security and App Check exemption regression test suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const validTestSecret = 'super_secure_configured_secret_string_32_chars!';
  const originalReconcileSecret = process.env.RECONCILE_SECRET;
  const originalReminderSecret = process.env.REMINDER_SCHEDULER_SECRET;

  t.after(async () => {
    __setTestAppCheck(null);
    process.env.RECONCILE_SECRET = originalReconcileSecret;
    process.env.REMINDER_SCHEDULER_SECRET = originalReminderSecret;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // 1. Unit tests for verifySecret & verifyReconcileSecret
  await t.test('1. verifySecret & verifyReconcileSecret constant-time SHA-256 comparison', () => {
    // Missing or invalid configured secret
    assert.equal(verifySecret('any_secret', undefined), false);
    assert.equal(verifySecret('any_secret', null as any), false);
    assert.equal(verifySecret('any_secret', ''), false);
    assert.equal(verifySecret('any_secret', 'short_under_32'), false);

    // Missing or invalid supplied secret
    assert.equal(verifySecret(undefined, validTestSecret), false);
    assert.equal(verifySecret(null, validTestSecret), false);
    assert.equal(verifySecret('', validTestSecret), false);
    assert.equal(verifySecret(123456 as any, validTestSecret), false);

    // Matching secret
    assert.equal(verifySecret(validTestSecret, validTestSecret), true);

    // Non-matching secret
    assert.equal(verifySecret('wrong_secret_string_that_does_not_match_at_all!', validTestSecret), false);

    // Different lengths
    assert.equal(verifySecret(validTestSecret + '_extra', validTestSecret), false);
    assert.equal(verifySecret(validTestSecret.slice(0, 31), validTestSecret), false);

    // Secrets must NOT be trimmed or normalized
    assert.equal(verifySecret(validTestSecret + ' ', validTestSecret), false);
    assert.equal(verifySecret(' ' + validTestSecret, validTestSecret), false);

    // verifyReconcileSecret public contract delegation
    assert.equal(verifyReconcileSecret(validTestSecret, validTestSecret), true);
    assert.equal(verifyReconcileSecret('wrong', validTestSecret), false);
    assert.equal(verifyReconcileSecret(validTestSecret, 'short'), false);
  });

  // 2. Unit tests for extractValidatedHeader
  await t.test('2. extractValidatedHeader rejects duplicate, ambiguous, or malformed headers', () => {
    // Mock request with primary only
    const reqPrimary: any = {
      rawHeaders: ['X-Reminder-Scheduler-Secret', 'secret_val_1'],
      headers: { 'x-reminder-scheduler-secret': 'secret_val_1' }
    };
    const res1 = extractValidatedHeader(reqPrimary, 'x-reminder-scheduler-secret', 'x-scheduler-secret');
    assert.equal(res1.error, 'NONE');
    assert.equal(res1.value, 'secret_val_1');

    // Mock request with alias only
    const reqAlias: any = {
      rawHeaders: ['x-scheduler-secret', 'secret_val_alias'],
      headers: { 'x-scheduler-secret': 'secret_val_alias' }
    };
    const res2 = extractValidatedHeader(reqAlias, 'x-reminder-scheduler-secret', 'x-scheduler-secret');
    assert.equal(res2.error, 'NONE');
    assert.equal(res2.value, 'secret_val_alias');

    // Mock request with BOTH primary and alias -> ambiguous
    const reqBoth: any = {
      rawHeaders: [
        'X-Reminder-Scheduler-Secret', 'val1',
        'X-Scheduler-Secret', 'val2'
      ],
      headers: {
        'x-reminder-scheduler-secret': 'val1',
        'x-scheduler-secret': 'val2'
      }
    };
    const res3 = extractValidatedHeader(reqBoth, 'x-reminder-scheduler-secret', 'x-scheduler-secret');
    assert.equal(res3.error, 'AMBIGUOUS');

    // Mock request with duplicate primary headers (including case variation)
    const reqDup: any = {
      rawHeaders: [
        'X-Reminder-Scheduler-Secret', 'val1',
        'x-reminder-scheduler-secret', 'val2'
      ],
      headers: {
        'x-reminder-scheduler-secret': 'val1, val2'
      }
    };
    const res4 = extractValidatedHeader(reqDup, 'x-reminder-scheduler-secret', 'x-scheduler-secret');
    assert.equal(res4.error, 'DUPLICATE');

    // Mock request with array-valued header
    const reqArray: any = {
      rawHeaders: [],
      headers: {
        'x-reconcile-secret': ['val1', 'val2']
      }
    };
    const res5 = extractValidatedHeader(reqArray, 'x-reconcile-secret');
    assert.equal(res5.error, 'DUPLICATE');

    // Mock request missing header
    const reqEmpty: any = {
      rawHeaders: [],
      headers: {}
    };
    const res6 = extractValidatedHeader(reqEmpty, 'x-reconcile-secret');
    assert.equal(res6.error, 'MISSING');
  });

  // 3. HTTP Integration tests for POST /api/reminders/process
  await t.test('3. POST /api/reminders/process strict header validation and query param rejection', async () => {
    process.env.REMINDER_SCHEDULER_SECRET = validTestSecret;

    // 3a. Correct primary header alone -> 200 OK
    const resPrimary = await fetch(`${baseUrl}/api/reminders/process`, {
      method: 'POST',
      headers: {
        'X-Reminder-Scheduler-Secret': validTestSecret
      }
    });
    assert.equal(resPrimary.status, 200);
    const jsonPrimary = await resPrimary.json() as any;
    assert.equal(jsonPrimary.success, true);

    // 3b. Correct alias header alone -> 200 OK
    const resAlias = await fetch(`${baseUrl}/api/reminders/process`, {
      method: 'POST',
      headers: {
        'X-Scheduler-Secret': validTestSecret
      }
    });
    assert.equal(resAlias.status, 200);
    const jsonAlias = await resAlias.json() as any;
    assert.equal(jsonAlias.success, true);

    // 3c. Query string only (req.query.secret) -> MUST BE REJECTED with 403
    const resQuery = await fetch(`${baseUrl}/api/reminders/process?secret=${encodeURIComponent(validTestSecret)}`, {
      method: 'POST'
    });
    assert.equal(resQuery.status, 403);
    const jsonQuery = await resQuery.json() as any;
    assert.equal(jsonQuery.error, 'UNAUTHORIZED');

    // 3d. Normal query string allowed alongside valid header
    const resQueryWithHeader = await fetch(`${baseUrl}/api/reminders/process?date=2026-10-25&timezone=UTC`, {
      method: 'POST',
      headers: {
        'X-Reminder-Scheduler-Secret': validTestSecret
      }
    });
    assert.equal(resQueryWithHeader.status, 200);

    // 3e. Both primary and alias headers provided -> 403 UNAUTHORIZED
    const resBoth = await fetch(`${baseUrl}/api/reminders/process`, {
      method: 'POST',
      headers: {
        'X-Reminder-Scheduler-Secret': validTestSecret,
        'X-Scheduler-Secret': validTestSecret
      }
    });
    assert.equal(resBoth.status, 403);
    const jsonBoth = await resBoth.json() as any;
    assert.equal(jsonBoth.error, 'UNAUTHORIZED');

    // 3f. Wrong secret -> 403 UNAUTHORIZED
    const resWrong = await fetch(`${baseUrl}/api/reminders/process`, {
      method: 'POST',
      headers: {
        'X-Reminder-Scheduler-Secret': 'wrong_secret_value_at_least_32_characters_long_123'
      }
    });
    assert.equal(resWrong.status, 403);
    const jsonWrong = await resWrong.json() as any;
    assert.equal(jsonWrong.error, 'UNAUTHORIZED');

    // 3g. Configured secret missing in env -> 403 UNAUTHORIZED
    delete process.env.REMINDER_SCHEDULER_SECRET;
    const resNoEnv = await fetch(`${baseUrl}/api/reminders/process`, {
      method: 'POST',
      headers: {
        'X-Reminder-Scheduler-Secret': validTestSecret
      }
    });
    assert.equal(resNoEnv.status, 403);

    // 3h. Configured secret too short (< 32 chars) -> 403 UNAUTHORIZED
    process.env.REMINDER_SCHEDULER_SECRET = 'short_secret_under_32';
    const resShortEnv = await fetch(`${baseUrl}/api/reminders/process`, {
      method: 'POST',
      headers: {
        'X-Reminder-Scheduler-Secret': 'short_secret_under_32'
      }
    });
    assert.equal(resShortEnv.status, 403);
  });

  // 4. Duplicate raw header detection via raw HTTP socket
  await t.test('4. Raw HTTP request with duplicate headers is rejected', async () => {
    process.env.REMINDER_SCHEDULER_SECRET = validTestSecret;
    process.env.RECONCILE_SECRET = validTestSecret;

    // 4a. Duplicate X-Reminder-Scheduler-Secret -> 403
    // 4a. Duplicate X-Reminder-Scheduler-Secret -> 403
    const duplicateReminderPromise = new Promise<{ status: number; body: string }>((resolve, reject) => {
      const rawReq = http.request({
        host: '127.0.0.1',
        port: addr.port,
        path: '/api/reminders/process',
        method: 'POST',
        headers: {
          'x-reminder-scheduler-secret': [validTestSecret, validTestSecret],
          'Content-Length': '0'
        }
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode || 0, body }));
      });
      rawReq.on('error', reject);
      rawReq.end();
    });

    const dupReminderRes = await duplicateReminderPromise;
    assert.equal(dupReminderRes.status, 403);
    assert.ok(dupReminderRes.body.includes('UNAUTHORIZED'));

    // 4b. Duplicate X-Reconcile-Secret -> 404
    const duplicateReconcilePromise = new Promise<{ status: number; body: string }>((resolve, reject) => {
      const rawReq = http.request({
        host: '127.0.0.1',
        port: addr.port,
        path: '/internal/reconcile',
        method: 'POST',
        headers: {
          'x-reconcile-secret': [validTestSecret, validTestSecret],
          'Content-Length': '0'
        }
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode || 0, body }));
      });
      rawReq.on('error', reject);
      rawReq.end();
    });

    const dupReconcileRes = await duplicateReconcilePromise;
    assert.equal(dupReconcileRes.status, 404);
    assert.ok(dupReconcileRes.body.includes('NOT_FOUND'));
  });

  // 5. Narrow App Check exemption tests
  await t.test('5. Narrow App Check exemption protects similar-prefix paths and non-POST methods', async () => {
    const mockAppCheck = {
      verifyToken: async (token: string) => {
        if (token === 'valid-app-check-token') {
          return { appId: '1:123456789:web:abcdef', token };
        }
        const err: any = new Error('Invalid App Check token');
        err.code = 'app-check/invalid-token';
        throw err;
      }
    };

    __setTestAppCheck(mockAppCheck);
    process.env.REMINDER_SCHEDULER_SECRET = validTestSecret;

    // 5a. POST /api/reminders/process IS exempt from App Check
    const resExactPost = await fetch(`${baseUrl}/api/reminders/process`, {
      method: 'POST',
      headers: {
        'X-Reminder-Scheduler-Secret': validTestSecret
        // No X-Firebase-AppCheck header
      }
    });
    // Should reach the scheduler handler and return 200, NOT 401 app_check_failed
    assert.equal(resExactPost.status, 200);

    // 5b. GET /api/reminders/process is NOT exempt from App Check -> 401
    const resGet = await fetch(`${baseUrl}/api/reminders/process`, {
      method: 'GET'
      // No X-Firebase-AppCheck header
    });
    assert.equal(resGet.status, 401);
    const jsonGet = await resGet.json() as any;
    assert.equal(jsonGet.error, 'app_check_failed');

    // 5c. Similar-prefix path: POST /api/reminders/process-extra is NOT exempt -> 401
    const resPrefix = await fetch(`${baseUrl}/api/reminders/process-extra`, {
      method: 'POST'
      // No X-Firebase-AppCheck header
    });
    assert.equal(resPrefix.status, 401);
    const jsonPrefix = await resPrefix.json() as any;
    assert.equal(jsonPrefix.error, 'app_check_failed');

    // 5d. Subpath: POST /api/reminders/process/child is NOT exempt -> 401
    const resSub = await fetch(`${baseUrl}/api/reminders/process/child`, {
      method: 'POST'
    });
    assert.equal(resSub.status, 401);
    const jsonSub = await resSub.json() as any;
    assert.equal(jsonSub.error, 'app_check_failed');

    // 5e. Normal protected route enforces App Check
    const resProtected = await fetch(`${baseUrl}/api/whatsapp/verify/status`, {
      method: 'GET'
    });
    assert.equal(resProtected.status, 401);
    const jsonProtected = await resProtected.json() as any;
    assert.equal(jsonProtected.error, 'app_check_failed');

    // 5f. GET /api/health remains exempt
    const resHealth = await fetch(`${baseUrl}/api/health`, {
      method: 'GET'
    });
    assert.notEqual(resHealth.status, 401);
  });
});
