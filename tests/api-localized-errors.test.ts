process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, __setTestDeps } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';
import { fetchWithTimeout, getLocalizedErrorMessage, parseApiError, ALLOWED_ERROR_CODES } from '../src/utils/api';

test('API Localized Errors & Resilience Suite (Step 4)', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  let server: Server;
  let baseUrl: string;

  t.before(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // 1. Malformed JSON body handling
  await t.test('1. Malformed JSON body returns HTTP 400 with INVALID_REQUEST and no stack traces', async () => {
    const res = await fetch(`${baseUrl}/api/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: '{"invalid": json syntax'
    });

    assert.equal(res.status, 400);
    const contentType = res.headers.get('content-type') || '';
    assert.equal(contentType.includes('application/json'), true);
    const data = await res.json();
    assert.equal(data.error, 'INVALID_REQUEST');
    // Ensure no stack traces or server paths leak in response
    assert.equal('stack' in data, false);
  });

  // 2. Network timeout with fetchWithTimeout
  await t.test('2. fetchWithTimeout aborts stalled requests and throws NETWORK_TIMEOUT', async () => {
    let didTimeout = false;
    try {
      await fetchWithTimeout(`${baseUrl}/api/health`, {}, 1); // 1ms timeout guarantees abort
    } catch (err: any) {
      if (err.message === 'NETWORK_TIMEOUT') {
        didTimeout = true;
      }
    }
    assert.equal(didTimeout, true, 'Expected fetchWithTimeout to throw NETWORK_TIMEOUT');
  });

  // 3. Localized error messages for network errors
  await t.test('3. getLocalizedErrorMessage translates NETWORK_TIMEOUT and NETWORK_ERROR bilingually', () => {
    const timeoutEn = getLocalizedErrorMessage('NETWORK_TIMEOUT', 'en');
    const timeoutAr = getLocalizedErrorMessage('NETWORK_TIMEOUT', 'ar');
    assert.equal(timeoutEn.includes('timed out'), true);
    assert.equal(timeoutAr.includes('انتهت مهلة الطلب'), true);

    const errorEn = getLocalizedErrorMessage('NETWORK_ERROR', 'en');
    const errorAr = getLocalizedErrorMessage('NETWORK_ERROR', 'ar');
    assert.equal(errorEn.includes('Network error'), true);
    assert.equal(errorAr.includes('خطأ في الاتصال'), true);
  });

  // 4. All ALLOWED_ERROR_CODES have non-empty bilingual translations
  await t.test('4. All allowlisted API error codes have meaningful Arabic and English messages', () => {
    for (const code of ALLOWED_ERROR_CODES) {
      const en = getLocalizedErrorMessage(code, 'en');
      const ar = getLocalizedErrorMessage(code, 'ar');
      assert.ok(en.length > 0, `Missing English message for ${code}`);
      assert.ok(ar.length > 0, `Missing Arabic message for ${code}`);
      // Ensure it doesn't fall back to generic API_ERROR unless intended
      if (code !== 'API_ERROR') {
        assert.notEqual(en, 'An error occurred. Please try again.', `Code ${code} defaulted to fallback in English`);
      }
    }
  });

  // 5. parseApiError converts unknown errors to safe status fallback
  await t.test('5. parseApiError strips unapproved errors and maps to safe allowlisted codes', async () => {
    const mockResponse = new Response(JSON.stringify({ error: 'DATABASE_SECRET_LEAK_XYZ' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });

    await assert.rejects(
      async () => {
        await parseApiError(mockResponse);
      },
      (err: Error) => {
        assert.equal(err.message, 'SERVER_ERROR');
        assert.equal(err.message.includes('SECRET'), false);
        return true;
      }
    );
  });

  // 6. Social-account & input error messages (Step 1)
  await t.test('6. Social-account & input error messages return expected text and are allowlisted', () => {
    const expected = {
      UNSAFE_INPUT: {
        en: "This entry contains characters or links that aren't allowed.",
        ar: 'يحتوي هذا الإدخال على رموز أو روابط غير مسموح بها.'
      },
      INVALID_PLATFORM: {
        en: 'Please choose a supported social platform.',
        ar: 'يرجى اختيار منصة تواصل اجتماعي مدعومة.'
      },
      FIELD_TOO_LONG: {
        en: 'One of the entries is too long. Please shorten it.',
        ar: 'أحد الحقول أطول من المسموح. يرجى اختصاره.'
      },
      INVALID_INPUT: {
        en: 'Please check the information you entered.',
        ar: 'يرجى التحقق من المعلومات المدخلة.'
      }
    };

    for (const [code, messages] of Object.entries(expected)) {
      assert.equal(ALLOWED_ERROR_CODES.has(code), true, `${code} must be in ALLOWED_ERROR_CODES`);
      assert.equal(getLocalizedErrorMessage(code, 'en'), messages.en, `English message mismatch for ${code}`);
      assert.equal(getLocalizedErrorMessage(code, 'ar'), messages.ar, `Arabic message mismatch for ${code}`);
    }
  });
});
