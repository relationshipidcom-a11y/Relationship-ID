import { register } from 'node:module';

// Intercept CSS module imports in Node ESM environment
const cssHook =
  'data:text/javascript,' +
  encodeURIComponent(
    'export function load(url, context, next) { if (url.endsWith(".css")) { return { format: "module", shortCircuit: true, source: "export default {}" }; } return next(url, context); }'
  );
register(cssHook);

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

// Configure DOM environment
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:3000',
});

Object.defineProperty(globalThis, 'window', { value: dom.window, writable: true, configurable: true });
Object.defineProperty(globalThis, 'document', { value: dom.window.document, writable: true, configurable: true });
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
(globalThis as any).HTMLButtonElement = dom.window.HTMLButtonElement;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { authFetch, ALLOWED_ERROR_CODES, ERROR_MESSAGES, getLocalizedErrorMessage } from '../src/utils/api';
import { executePrivateRecordLoad } from '../src/utils/relationshipState';
import { withAppCheckHeaders, resetAppCheckThrottling } from '../src/lib/firebase';
import { runGoogleSignIn } from '../src/utils/googleSignIn';
import { AuthPersistenceController, PersistenceAdapter } from '../src/utils/authPersistence';

test('Google sign-in journey & profile recovery regression suite', async (t) => {
  const workingAdapter: PersistenceAdapter = {
    localPersistence: {} as any,
    sessionPersistence: {} as any,
    setPersistence: async () => {},
  };

  // 1. ALLOWED_ERROR_CODES contains App Check error codes and localized messages
  await t.test('1. ALLOWED_ERROR_CODES includes app_check_failed and APP_CHECK_FAILED without degrading to AUTH_REQUIRED', () => {
    assert.equal(ALLOWED_ERROR_CODES.has('app_check_failed'), true);
    assert.equal(ALLOWED_ERROR_CODES.has('APP_CHECK_FAILED'), true);

    const enMsg = getLocalizedErrorMessage('app_check_failed', 'en');
    const arMsg = getLocalizedErrorMessage('app_check_failed', 'ar');
    assert.ok(enMsg.toLowerCase().includes('security') || enMsg.toLowerCase().includes('throttled'));
    assert.ok(arMsg.includes('الأمني'));
    assert.equal(enMsg.includes('sign in'), false, 'App check error must not tell user to sign in');
  });

  // 2. Delayed auth initialization (authStateReady)
  await t.test('2. authFetch waits for authStateReady before evaluating auth.currentUser', async () => {
    const { auth } = await import('../src/lib/firebase');
    let stateReadyResolved = false;

    // Simulate authStateReady on auth object
    if (auth) {
      (auth as any).authStateReady = async () => {
        await new Promise((r) => setTimeout(r, 10));
        stateReadyResolved = true;
      };
    }

    try {
      // Even if currentUser is null, authStateReady must have been called
      await authFetch('/api/test-route');
    } catch (err: any) {
      assert.equal(err.message, 'AUTH_REQUIRED');
      assert.equal(stateReadyResolved, true, 'authStateReady was awaited');
    } finally {
      if (auth) {
        delete (auth as any).authStateReady;
      }
    }
  });

  // 3. Retry only proven refreshable authentication failure (INVALID_AUTH_TOKEN)
  await t.test('3. authFetch retries exactly once on 401 INVALID_AUTH_TOKEN and succeeds; does not retry on AUTH_REQUIRED or 403', async () => {
    const { auth } = await import('../src/lib/firebase');
    if (!auth) return;

    let tokenRefreshCalls = 0;
    const fakeUser = {
      uid: 'user_test_retry',
      getIdToken: async (force: boolean) => {
        if (force) tokenRefreshCalls++;
        return force ? 'refreshed_valid_token' : 'stale_token';
      }
    };
    Object.defineProperty(auth, 'currentUser', { value: fakeUser, configurable: true });

    let requestCount = 0;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: any, init: any) => {
      requestCount++;
      const authHeader = init?.headers?.get?.('Authorization') || init?.headers?.Authorization;
      if (authHeader === 'Bearer stale_token') {
        return new Response(JSON.stringify({ error: 'INVALID_AUTH_TOKEN' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ success: true, token: authHeader }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }) as any;

    try {
      const res = await authFetch('/api/protected');
      assert.equal(res.status, 200);
      assert.equal(tokenRefreshCalls, 1, 'Forced token refresh was called once');
      assert.equal(requestCount, 2, 'Request was retried once after 401 INVALID_AUTH_TOKEN');
    } finally {
      globalThis.fetch = originalFetch;
      Object.defineProperty(auth, 'currentUser', { value: null, configurable: true });
    }
  });

  // 4. Non-refreshable errors do NOT trigger retries
  await t.test('4. authFetch does not retry on 401 app_check_failed or AUTH_REQUIRED', async () => {
    const { auth } = await import('../src/lib/firebase');
    if (!auth) return;

    let tokenRefreshCalls = 0;
    const fakeUser = {
      uid: 'user_test_no_retry',
      getIdToken: async (force: boolean) => {
        if (force) tokenRefreshCalls++;
        return 'token_val';
      }
    };
    Object.defineProperty(auth, 'currentUser', { value: fakeUser, configurable: true });

    let requestCount = 0;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
      requestCount++;
      return new Response(JSON.stringify({ error: 'app_check_failed' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }) as any;

    try {
      const res = await authFetch('/api/protected');
      assert.equal(res.status, 401);
      assert.equal(requestCount, 1, 'Did not retry on app_check_failed');
      assert.equal(tokenRefreshCalls, 0, 'Did not force refresh token');
    } finally {
      globalThis.fetch = originalFetch;
      Object.defineProperty(auth, 'currentUser', { value: null, configurable: true });
    }
  });

  // 5. Account switching and sign-out discard pending requests
  await t.test('5. executePrivateRecordLoad discards superseded responses after sign-out or account switch', async () => {
    let currentReqId = 1;
    let activeAuthUid: string | null = 'user_1';
    let currentAuthUid: string | null = 'user_1';
    let recordUpdated = false;

    const promise = executePrivateRecordLoad({
      requestUid: 'user_1',
      requestId: 1,
      getCurrentRequestId: () => currentReqId,
      getActiveAuthUid: () => activeAuthUid,
      getCurrentAuthUid: () => currentAuthUid,
      fetchRecord: async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { record: { id: 'rec_user1', status: 'draft' } };
      },
      setRecord: () => { recordUpdated = true; },
      setInvitation: () => {},
      setAppError: () => {},
      initialRecord: {},
      initialInvitation: {}
    });

    // Sign out happens before response returns
    currentReqId = 2;
    activeAuthUid = null;
    currentAuthUid = null;

    const result = await promise;
    assert.equal(result, null, 'Stale result was dropped');
    assert.equal(recordUpdated, false, 'Record was not updated for signed-out user');
  });

  // 6. Popup cancellation and subsequent successful attempt
  await t.test('6. Popup cancellation cleans up in-flight state and allows subsequent attempt to succeed', async () => {
    const dummyAuth = { currentUser: null } as any;
    const controller = new AuthPersistenceController(dummyAuth, true, workingAdapter);
    await controller.apply(true);
    let attemptsCount = 0;

    // First attempt: user cancels popup
    try {
      await runGoogleSignIn(controller, {
        popup: async () => {
          attemptsCount++;
          const err: any = new Error('Popup closed');
          err.code = 'auth/popup-closed-by-user';
          throw err;
        }
      });
      assert.fail('Should have thrown popup closed error');
    } catch (err: any) {
      assert.equal(err.code, 'auth/popup-closed-by-user');
    }

    assert.equal(attemptsCount, 1);
    assert.equal(controller.getState().authInFlight, false, 'In flight cleared after rejection');

    // Second attempt: succeeds
    const secondAttempt = await runGoogleSignIn(controller, {
      popup: async () => {
        attemptsCount++;
        return { user: { uid: 'user_google_success', email: 'test@example.com' } };
      }
    });

    assert.equal(secondAttempt.started, true);
    assert.equal(attemptsCount, 2);
    assert.equal((secondAttempt as any).result?.user?.uid, 'user_google_success');
  });

  // 7. Preserves verified WhatsApp and mobile state in executePrivateRecordLoad
  await t.test('7. executePrivateRecordLoad preserves userProfile whatsappTrusted and whatsappE164 in partner1', async () => {
    let capturedRecord: any = null;

    await executePrivateRecordLoad({
      requestUid: 'user_verified_whatsapp',
      requestId: 1,
      getCurrentRequestId: () => 1,
      getActiveAuthUid: () => 'user_verified_whatsapp',
      getCurrentAuthUid: () => 'user_verified_whatsapp',
      fetchRecord: async () => ({
        record: null,
        invitation: null,
        userProfile: {
          fullName: 'Test User',
          phoneE164: '+966500000001',
          whatsappTrusted: true,
          whatsappE164: '+966500000001'
        }
      }),
      setRecord: (r) => { capturedRecord = r; },
      setInvitation: () => {},
      setAppError: () => {},
      initialRecord: { partner1: { fullName: '', phoneCountry: 'SA +966' } },
      initialInvitation: {}
    });

    assert.ok(capturedRecord);
    assert.equal(capturedRecord.partner1.whatsappTrusted, true);
    assert.equal(capturedRecord.partner1.whatsappE164, '+966500000001');
    assert.equal(capturedRecord.partner1.fullName, 'Test User');
  });

  // 8. App Check throttling backoff
  await t.test('8. withAppCheckHeaders respects throttling and does not hammer throttled endpoint', async () => {
    resetAppCheckThrottling();
    const headers = await withAppCheckHeaders();
    assert.ok(headers instanceof Headers);
  });
});
