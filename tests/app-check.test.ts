process.env.NODE_ENV = 'test';
if (!process.env.CONTACT_HASH_SECRET || process.env.CONTACT_HASH_SECRET.length < 32) {
  process.env.CONTACT_HASH_SECRET = 'test_contact_hash_secret_at_least_32_characters_long_for_hmac';
}

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, __setTestDeps, __setTestAppCheck, requireAppCheck } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

test('Firebase App Check enforcement suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  mockAuth.addUser('token_user1', {
    uid: 'uid_user1',
    email: 'user1@example.com',
    email_verified: true,
    phone_number: '+966500000001'
  });

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const mockAppCheck = {
    verifyToken: async (token: string) => {
      if (token === 'valid-app-check-token') {
        return {
          appId: '1:123456789:web:abcdef',
          token
        };
      }
      const err: any = new Error('Invalid App Check token');
      err.code = 'app-check/invalid-token';
      throw err;
    }
  };

  t.after(async () => {
    __setTestAppCheck(null);
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // 1. /api/health works without a token
  await t.test('1. GET /api/health works without App Check token', async () => {
    __setTestAppCheck(mockAppCheck);

    const res = await fetch(`${baseUrl}/api/health`);
    assert.notEqual(res.status, 401);
    const data = (await res.json()) as any;
    assert.notEqual(data?.error, 'app_check_failed');
  });

  // 2. missing header -> 401 { error: 'app_check_failed' }
  await t.test('2. Missing X-Firebase-AppCheck header -> 401 { error: "app_check_failed" }', async () => {
    __setTestAppCheck(mockAppCheck);

    const res = await fetch(`${baseUrl}/api/whatsapp/verify/status`, {
      headers: {
        Authorization: 'Bearer token_user1'
      }
    });
    assert.equal(res.status, 401);
    const data = (await res.json()) as any;
    assert.equal(data.error, 'app_check_failed');
  });

  // 3. invalid token -> 401 { error: 'app_check_failed' }
  await t.test('3. Invalid App Check token -> 401 { error: "app_check_failed" }', async () => {
    __setTestAppCheck(mockAppCheck);

    const res = await fetch(`${baseUrl}/api/whatsapp/verify/status`, {
      headers: {
        Authorization: 'Bearer token_user1',
        'X-Firebase-AppCheck': 'malformed-or-expired-token'
      }
    });
    assert.equal(res.status, 401);
    const data = (await res.json()) as any;
    assert.equal(data.error, 'app_check_failed');
  });

  // 4. valid token passes
  await t.test('4. Valid App Check token passes requireAppCheck and reaches endpoint', async () => {
    __setTestAppCheck(mockAppCheck);

    const res = await fetch(`${baseUrl}/api/whatsapp/verify/status`, {
      headers: {
        Authorization: 'Bearer token_user1',
        'X-Firebase-AppCheck': 'valid-app-check-token'
      }
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.equal(typeof data.enabled, 'boolean');
  });

  // 5. requireAppCheck unit test for Direct Middleware Invocation
  await t.test('5. requireAppCheck direct unit tests', async () => {
    __setTestAppCheck(mockAppCheck);

    // 5a. Missing token
    let statusCode = 0;
    let jsonBody: any = null;
    const reqMissing: any = {
      path: '/record',
      header: (name: string) => undefined
    };
    const resMock: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          }
        };
      },
      locals: {}
    };
    let nextCalled = false;
    await requireAppCheck(reqMissing, resMock, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 401);
    assert.equal(jsonBody?.error, 'app_check_failed');

    // 5b. Invalid token
    statusCode = 0;
    jsonBody = null;
    nextCalled = false;
    const reqInvalid: any = {
      path: '/record',
      header: (name: string) => name.toLowerCase() === 'x-firebase-appcheck' ? 'bad-token' : undefined
    };
    await requireAppCheck(reqInvalid, resMock, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 401);
    assert.equal(jsonBody?.error, 'app_check_failed');

    // 5c. Valid token
    nextCalled = false;
    const reqValid: any = {
      path: '/record',
      header: (name: string) => name.toLowerCase() === 'x-firebase-appcheck' ? 'valid-app-check-token' : undefined
    };
    await requireAppCheck(reqValid, resMock, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(resMock.locals.appCheck?.appId, '1:123456789:web:abcdef');
  });
});
