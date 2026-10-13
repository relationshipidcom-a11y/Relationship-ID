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
            onAccept: () => {},
            onDecline: () => {},
          })
        );
      });
      assert.ok(div.textContent?.includes('رابط الدعوة غير صالح أو غير موجود'), 'Must display Arabic invalid invitation title');

      await cleanup();
    });

    // 2b. executeInvitationLoad clears invitation state on fetch failure
    await t.test('2b. executeInvitationLoad resets invitation to not_found state when fetch throws', async () => {
      let stateInvitation: any = { id: 'old_pending_id', inviterName: 'Stale Inviter', status: 'pending' };
      let stateError: any = null;

      await executeInvitationLoad({
        inviteId: 'bad_invite_token',
        requestUid: null,
        requestId: 1,
        getCurrentRequestId: () => 1,
        getActiveAuthUid: () => null,
        getCurrentAuthUid: () => null,
        fetchInvitation: async () => {
          throw new Error('INVITATION_NOT_FOUND');
        },
        setInvitation: (inv) => {
          stateInvitation = inv;
        },
        setInvitationAuth: () => {},
        setRecord: () => {},
        setAppError: (err) => {
          stateError = err;
        },
        setInvitationLoading: () => {},
      });

      assert.equal(stateInvitation.status, 'cancelled');
      assert.equal(stateInvitation.id, '');
      assert.equal(stateInvitation.inviterName, '');
      assert.ok(stateError);
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
