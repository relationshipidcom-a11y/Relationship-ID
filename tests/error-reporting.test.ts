process.env.NODE_ENV = 'test';
if (!process.env.CONTACT_HASH_SECRET || process.env.CONTACT_HASH_SECRET.length < 32) {
  process.env.CONTACT_HASH_SECRET = 'test_contact_hash_secret_at_least_32_characters_long_for_hmac';
}

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, __setTestDeps, __setTestAppCheck } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

test('Error Reporting and Privacy Hygiene Test Suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

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

  // 1. Missing App Check token -> 401
  await t.test('1. POST /api/error-report rejects missing App Check token with 401', async () => {
    __setTestAppCheck(mockAppCheck);

    const res = await fetch(`${baseUrl}/api/error-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        errorCategory: 'render_error',
        pageCategory: 'client',
        eventId: 'evt_no_token'
      })
    });

    assert.equal(res.status, 401);
    const data = (await res.json()) as any;
    assert.equal(data.error, 'app_check_failed');
  });

  // 2. Invalid App Check token -> 401
  await t.test('2. POST /api/error-report rejects invalid App Check token with 401', async () => {
    __setTestAppCheck(mockAppCheck);

    const res = await fetch(`${baseUrl}/api/error-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': 'invalid-token-123'
      },
      body: JSON.stringify({
        errorCategory: 'render_error',
        pageCategory: 'client',
        eventId: 'evt_bad_token'
      })
    });

    assert.equal(res.status, 401);
    const data = (await res.json()) as any;
    assert.equal(data.error, 'app_check_failed');
  });

  // 3. Valid App Check token -> 200
  await t.test('3. POST /api/error-report accepts valid App Check token and returns 200', async () => {
    __setTestAppCheck(mockAppCheck);

    const res = await fetch(`${baseUrl}/api/error-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': 'valid-app-check-token'
      },
      body: JSON.stringify({
        errorCategory: 'render_error',
        pageCategory: 'client',
        eventId: 'evt_valid_123',
        appVersion: '2026-10-01'
      })
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.equal(data.success, true);
  });

  // 4. Server discards sensitive fields and raw messages from logs and payload
  await t.test('4. POST /api/error-report discards sensitive fields and raw messages from logs and payload', async () => {
    __setTestAppCheck(mockAppCheck);

    const loggedMessages: string[] = [];
    const originalConsoleLog = console.log;
    console.log = (...args: any[]) => {
      loggedMessages.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
      originalConsoleLog(...args);
    };

    try {
      // Send payload containing forbidden sensitive data (error messages, stack traces, URLs, PII)
      const res = await fetch(`${baseUrl}/api/error-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Firebase-AppCheck': 'valid-app-check-token'
        },
        body: JSON.stringify({
          errorCategory: 'render_error',
          pageCategory: 'client',
          eventId: 'evt_sensitive',
          appVersion: '2026-10-01',
          // Unauthorized sensitive fields that must be discarded
          errorMessage: 'TypeError: Cannot read property uid of undefinedsecret123',
          stackTrace: 'Error at Component.render (https://app.com/main.js:123:45)',
          fullUrl: 'https://app.com/settings?token=secret_abc&email=user@example.com',
          email: 'user@example.com',
          phone: '+966500000001',
          uid: 'firebase_uid_secret'
        })
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);

      // Verify the server log captured during this request contains ZERO sensitive data
      const joinedLogs = loggedMessages.join('\n');
      assert.equal(joinedLogs.includes('secret123'), false, 'Log must not contain error message or token');
      assert.equal(joinedLogs.includes('user@example.com'), false, 'Log must not contain email address');
      assert.equal(joinedLogs.includes('+966500000001'), false, 'Log must not contain phone number');
      assert.equal(joinedLogs.includes('firebase_uid_secret'), false, 'Log must not contain Firebase UID');
      assert.equal(joinedLogs.includes('https://app.com'), false, 'Log must not contain URL');
      assert.equal(joinedLogs.includes('Component.render'), false, 'Log must not contain stack trace');
    } finally {
      console.log = originalConsoleLog;
    }
  });

  // 5. Invalid error category -> 400
  await t.test('5. POST /api/error-report rejects invalid errorCategory with 400', async () => {
    __setTestAppCheck(mockAppCheck);

    const res = await fetch(`${baseUrl}/api/error-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': 'valid-app-check-token'
      },
      body: JSON.stringify({
        errorCategory: 'sql_injection_attempt',
        pageCategory: 'client',
        eventId: 'evt_bad'
      })
    });

    assert.equal(res.status, 400);
    const data = (await res.json()) as any;
    assert.equal(data.error, 'INVALID_INPUT');
  });

  // 6. Rate limiting enforcement
  await t.test('6. POST /api/error-report enforces rate limiting (max 10/min)', async () => {
    __setTestAppCheck(mockAppCheck);

    let lastStatus = 200;
    for (let i = 0; i < 15; i++) {
      const res = await fetch(`${baseUrl}/api/error-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Firebase-AppCheck': 'valid-app-check-token'
        },
        body: JSON.stringify({
          errorCategory: 'render_error',
          pageCategory: 'client',
          eventId: `evt_rate_${i}`
        })
      });
      lastStatus = res.status;
    }

    assert.equal(lastStatus, 429);
  });

  // 7. ErrorBoundary console statements sanitized and recovery screen works
  await t.test('7. ErrorBoundary console statements are sanitized; sensitive values never printed', () => {
    const errorMessages: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      errorMessages.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
    };

    try {
      const boundary = new ErrorBoundary({ children: null });
      const sensitiveError = new Error('Sensitive confidential user data: token=xyz123 email=victim@example.com');
      sensitiveError.stack = 'Sensitive stack at /private/user/record/123';

      boundary.componentDidCatch(sensitiveError, { componentStack: 'Sensitive component stack with phone=+966500000001' } as any);

      const joinedConsole = errorMessages.join('\n');
      assert.equal(joinedConsole.includes('xyz123'), false, 'Console must not contain token');
      assert.equal(joinedConsole.includes('victim@example.com'), false, 'Console must not contain email');
      assert.equal(joinedConsole.includes('+966500000001'), false, 'Console must not contain phone');
      assert.equal(joinedConsole.includes('Sensitive stack'), false, 'Console must not contain raw stack');
      assert.equal(joinedConsole.includes('Sensitive component stack'), false, 'Console must not contain componentStack');
      assert.ok(joinedConsole.includes('[ErrorBoundary] Sanitized render error caught'), 'Sanitized diagnostic message was logged');

      // Test recovery screen
      const derivedState = ErrorBoundary.getDerivedStateFromError(sensitiveError);
      assert.equal(derivedState.hasError, true);
      assert.equal(derivedState.errorMessage, 'UNEXPECTED_RENDER_ERROR');

      // Boundary state set
      boundary.state = derivedState;
      const rendered = boundary.render();
      assert.ok(rendered !== null, 'Recovery screen renders');
    } finally {
      console.error = origError;
    }
  });
});
