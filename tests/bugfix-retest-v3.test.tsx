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
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

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

import { createApp, __setTestDeps, getPublicStaticDir } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';
import { P2LandingScreen } from '../src/components/P2LandingScreen';
import { VerifyPortalModal } from '../src/components/VerifyPortalModal';
import { executeInvitationLoad } from '../src/utils/relationshipState';
import type { Invitation } from '../src/types';

test('Bugfix Re-Test Suite (Comprehensive Verification of Known Issues)', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  const staticDir = getPublicStaticDir();
  const app = createApp({ staticDir });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  function createTestContainer() {
    const div = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(div);
    const root = createRoot(div);
    return {
      div,
      root,
      cleanup: async () => {
        await act(async () => {
          root.unmount();
        });
        div.remove();
      },
    };
  }

  try {
    // 1. Unsafe auth proxy removed: /__/auth/* and /__/firebase/* return 404 and never proxy
    await t.test('1. App-host Firebase auth helper routes return 404 NOT_FOUND and never proxy', async () => {
      const endpoints = [
        '/__/auth/handler',
        '/__/auth/experiments.js',
        '/__/firebase/init.js',
        '/__/firebase/init.json',
      ];
      for (const ep of endpoints) {
        const res = await fetch(`${baseUrl}${ep}`);
        assert.equal(res.status, 404, `Endpoint ${ep} must return 404`);
        const json = (await res.json().catch(() => null)) as any;
        assert.equal(json?.error, 'NOT_FOUND', `Endpoint ${ep} must return { error: 'NOT_FOUND' }`);
      }
    });

    // 2. Invalid invitation links fail-closed without displaying pending invitation details
    await t.test('2. Invalid invitation links render Invitation Not Found and do not display pending card', async () => {
      const { div, root, cleanup } = createTestContainer();

      // Test with not_found status
      const notFoundInv: Invitation = {
        id: '',
        recordId: '',
        inviterName: '',
        partner2Name: '',
        relationshipType: 'dating',
        startDate: '',
        startDateAr: '',
        startDateIso: '',
        status: 'cancelled',
        createdAt: '',
        expiresAt: '',
        reminderCount: 0,
      };

      await act(async () => {
        root.render(
          React.createElement(P2LandingScreen, {
            language: 'en',
            invitation: notFoundInv,
            invitationNotFound: true,
            onAccept: () => {},
            onDecline: () => {},
          })
        );
      });

      assert.ok(div.textContent?.includes('Invitation Not Found'), 'Must display "Invitation Not Found"');
      assert.equal(div.textContent?.includes('Special Invitation'), false, 'Must not display pending badge');
      assert.equal(Boolean(div.querySelector('button')?.textContent?.includes('Accept')), false, 'Must not display accept button');

      // Test in Arabic
      await act(async () => {
        root.render(
          React.createElement(P2LandingScreen, {
            language: 'ar',
            invitation: notFoundInv,
            invitationNotFound: true,
            onAccept: () => {},
            onDecline: () => {},
          })
        );
      });
      assert.ok(div.textContent?.includes('رابط الدعوة غير صالح أو غير موجود'), 'Must display Arabic invalid invitation title');

      await cleanup();
    });

    // Shared harness for executeInvitationLoad error handling
    async function runLoadWithError(thrown: Error) {
      const calls = { setInvitation: [] as any[], resets: 0, notFound: [] as boolean[], appError: null as any };
      await executeInvitationLoad({
        inviteId: 'some_invite_token',
        requestUid: null,
        requestId: 1,
        getCurrentRequestId: () => 1,
        getActiveAuthUid: () => null,
        getCurrentAuthUid: () => null,
        fetchInvitation: async () => {
          throw thrown;
        },
        setInvitation: (inv) => {
          calls.setInvitation.push(inv);
        },
        resetInvitation: () => {
          calls.resets++;
        },
        setInvitationAuth: () => {},
        setInvitationNotFound: (nf) => {
          calls.notFound.push(nf);
        },
        setRecord: () => {},
        setAppError: (err) => {
          calls.appError = err;
        },
        setInvitationLoading: () => {},
      });
      return calls;
    }

    // 2b. Server says INVITATION_NOT_FOUND -> not-found state, stale invitation cleared, no invented invitation
    await t.test('2b. INVITATION_NOT_FOUND sets invitationNotFound true and resets invitation without inventing one', async () => {
      const calls = await runLoadWithError(new Error('INVITATION_NOT_FOUND'));
      assert.equal(calls.notFound.at(-1), true);
      assert.equal(calls.resets, 1, 'Stale invitation must be cleared');
      assert.equal(calls.setInvitation.length, 0, 'setInvitation must never receive an invented invitation');
      assert.ok(calls.appError);
    });

    // 2c. Network / timeout / rate-limit / server errors are load failures, never "not found"
    await t.test('2c. Network, timeout, rate-limit and server errors never set invitationNotFound', async () => {
      for (const code of ['NETWORK_ERROR', 'NETWORK_TIMEOUT', 'RATE_LIMITED', 'DATABASE_UNAVAILABLE', 'DATABASE_ERROR', 'SERVER_ERROR', 'AUTH_REQUIRED']) {
        const calls = await runLoadWithError(new Error(code));
        assert.equal(calls.notFound.at(-1), false, `${code} must not mark the invitation as not found`);
        assert.equal(calls.resets, 1, `${code} must clear the stale invitation`);
        assert.equal(calls.setInvitation.length, 0, `${code} must not invent an invitation`);
        assert.ok(calls.appError, `${code} must surface a localized app error`);
      }
    });

    // 2d. Load failure renders "Could Not Load Invitation" with retry, never "Not Found" or an empty invitation card
    await t.test('2d. Load failure renders Could Not Load Invitation with Try Again, not Invitation Not Found', async () => {
      const { div, root, cleanup } = createTestContainer();
      const emptyInv: Invitation = {
        id: '', recordId: '', inviterName: '', partner2Name: '', relationshipType: 'dating',
        startDate: '', startDateAr: '', startDateIso: '', status: 'pending', createdAt: '', expiresAt: '', reminderCount: 0,
      };
      await act(async () => {
        root.render(React.createElement(P2LandingScreen, { language: 'en', invitation: emptyInv, invitationNotFound: false, onAccept: () => {}, onDecline: () => {} }));
      });
      assert.ok(div.textContent?.includes('Could Not Load Invitation'));
      assert.ok(div.textContent?.includes('Try Again'));
      assert.equal(div.textContent?.includes('Invitation Not Found'), false);
      assert.equal(div.textContent?.includes('Special Invitation'), false, 'Must not render an empty invitation card');
      assert.equal(Array.from(div.querySelectorAll('button')).some((b) => b.textContent?.includes('Accept')), false);

      await act(async () => {
        root.render(React.createElement(P2LandingScreen, { language: 'ar', invitation: emptyInv, invitationNotFound: false, onAccept: () => {}, onDecline: () => {} }));
      });
      assert.ok(div.textContent?.includes('تعذر تحميل الدعوة'));
      assert.ok(div.textContent?.includes('إعادة المحاولة'));
      await cleanup();
    });

    // 3. Technical errors and configuration diagnostics never reach normal visitors in AuthScreen
    await t.test('3. AuthScreen error alert shows clean localized message without technical diagnostics', async () => {
      const { AuthScreen } = await import('../src/components/AuthScreen');
      const { div, root, cleanup } = createTestContainer();

      await act(async () => {
        root.render(
          React.createElement(AuthScreen, {
            language: 'en',
            onAuthSuccess: () => {},
            auth: null, // Null auth triggers initialization error
          })
        );
      });

      const alert = div.querySelector('[role="alert"]');
      assert.ok(alert, 'Alert banner must be present');
      const alertText = alert.textContent || '';

      // Must NOT contain technical diagnostics
      assert.equal(alertText.includes('projectId:'), false, 'Must not disclose projectId');
      assert.equal(alertText.includes('apiKey:'), false, 'Must not disclose apiKey');
      assert.equal(alertText.includes('Test API key'), false, 'Must not render Test API key button');
      assert.equal(alertText.includes('domain:'), false, 'Must not disclose domain');
      assert.equal(alertText.includes('auth/'), false, 'Must not disclose internal Firebase auth error codes');

      await cleanup();
    });

    // 4. Verification-modal layout includes mobile viewport overflow correction
    await t.test('4. VerifyPortalModal includes mobile max-height and overflow-y-auto scrolling', () => {
      const { div, root } = createTestContainer();

      act(() => {
        root.render(
          React.createElement(VerifyPortalModal, {
            language: 'en',
            isOpen: true,
            onClose: () => {},
          })
        );
      });

      const modalDialog = div.querySelector('[role="dialog"] > div');
      assert.ok(modalDialog, 'Modal dialog container must be present');
      const className = modalDialog.getAttribute('class') || '';
      assert.ok(
        className.includes('max-h-[calc(100dvh-2rem)]'),
        'Modal must constrain maximum height for mobile viewports'
      );
      assert.ok(
        className.includes('overflow-y-auto'),
        'Modal must support vertical scrolling when content exceeds viewport'
      );
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
