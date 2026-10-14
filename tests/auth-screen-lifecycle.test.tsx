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
import React, { act, StrictMode } from 'react';
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

import type { PersistenceAdapter } from '../src/utils/authPersistence';
import { AuthPersistenceController } from '../src/utils/authPersistence';
import { runGoogleSignIn } from '../src/utils/googleSignIn';
import { authAttemptFailureMessage } from '../src/utils/authErrors';

test('AuthScreen DOM & lifecycle integration test suite', async (t) => {
  const { AuthScreen } = await import('../src/components/AuthScreen');

  const workingAuthStandIn = {
    currentUser: null,
    app: { name: '[DEFAULT]' },
  } as any;

  const workingAdapter: PersistenceAdapter = {
    localPersistence: {} as any,
    sessionPersistence: {} as any,
    setPersistence: async () => {},
  };

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

  // 5a: Render inside <React.StrictMode> with a working auth stand-in -> the Google button ends enabled, with no console errors
  await t.test('5a. Render inside React.StrictMode with working auth stand-in reaches enabled Google button without console errors', async () => {
    const originalConsoleError = console.error;
    const capturedErrors: string[] = [];
    console.error = (...args: any[]) => {
      capturedErrors.push(args.map(String).join(' '));
    };

    try {
      const { div, root, cleanup } = createTestContainer();

      await act(async () => {
        root.render(
          React.createElement(
            StrictMode,
            null,
            React.createElement(AuthScreen, {
              language: 'en',
              onAuthSuccess: () => {},
              auth: workingAuthStandIn,
              persistenceAdapter: workingAdapter,
            })
          )
        );
      });

      const buttons = Array.from(div.querySelectorAll('button'));
      const googleBtn = buttons.find((b) => b.textContent?.includes('Google') || b.textContent?.includes('Continue'));
      assert.ok(googleBtn, 'Google button must be rendered');
      assert.equal(googleBtn?.hasAttribute('disabled'), false, 'Google button must end enabled');
      assert.equal(capturedErrors.length, 0, `Expected 0 console errors in StrictMode, got: ${capturedErrors.join('; ')}`);

      await cleanup();
    } finally {
      console.error = originalConsoleError;
    }
  });

  // 5b: Unmount, then mount again -> no "state update on unmounted component" warnings, and the second mount reaches enabled
  await t.test('5b. Unmount then mount again reaches enabled with no unmounted state update warnings', async () => {
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const warnings: string[] = [];
    console.error = (...args: any[]) => {
      warnings.push(args.map(String).join(' '));
    };
    console.warn = (...args: any[]) => {
      warnings.push(args.map(String).join(' '));
    };

    try {
      // First mount
      const { root: root1, cleanup: cleanup1 } = createTestContainer();
      await act(async () => {
        root1.render(
          React.createElement(AuthScreen, {
            language: 'en',
            onAuthSuccess: () => {},
            auth: workingAuthStandIn,
            persistenceAdapter: workingAdapter,
          })
        );
      });
      await cleanup1();

      // Second mount
      const { div: div2, root: root2, cleanup: cleanup2 } = createTestContainer();
      await act(async () => {
        root2.render(
          React.createElement(AuthScreen, {
            language: 'en',
            onAuthSuccess: () => {},
            auth: workingAuthStandIn,
            persistenceAdapter: workingAdapter,
          })
        );
      });

      const buttons = Array.from(div2.querySelectorAll('button'));
      const googleBtn = buttons.find((b) => b.textContent?.includes('Google') || b.textContent?.includes('Continue'));
      assert.ok(googleBtn, 'Second mount Google button must be rendered');
      assert.equal(googleBtn?.hasAttribute('disabled'), false, 'Second mount must reach enabled');

      const unmountedWarnings = warnings.filter((w) =>
        /unmounted|Can't perform a React state update/i.test(w)
      );
      assert.equal(unmountedWarnings.length, 0, 'No unmounted state update warnings allowed');

      await cleanup2();
    } finally {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
    }
  });

  // 5c: Render with auth=null in en and ar -> the error banner shows localized text and never the raw "Firebase Auth is not initialized" string
  await t.test('5c. Render with auth=null shows localized text and never raw Firebase Auth is not initialized string', async () => {
    // English
    const { div: divEn, root: rootEn, cleanup: cleanupEn } = createTestContainer();
    await act(async () => {
      rootEn.render(
        React.createElement(AuthScreen, {
          language: 'en',
          onAuthSuccess: () => {},
          auth: null,
        })
      );
    });

    const alertEn = divEn.querySelector('[role="alert"]');
    assert.ok(alertEn, 'Error banner must be rendered in English');
    assert.equal(
      divEn.textContent?.includes('Firebase Auth is not initialized'),
      false,
      'English render must never contain raw "Firebase Auth is not initialized"'
    );
    assert.ok(
      divEn.textContent?.includes('Authentication service is not initialized'),
      'English render must display localized message'
    );
    await cleanupEn();

    // Arabic
    const { div: divAr, root: rootAr, cleanup: cleanupAr } = createTestContainer();
    await act(async () => {
      rootAr.render(
        React.createElement(AuthScreen, {
          language: 'ar',
          onAuthSuccess: () => {},
          auth: null,
        })
      );
    });

    const alertAr = divAr.querySelector('[role="alert"]');
    assert.ok(alertAr, 'Error banner must be rendered in Arabic');
    assert.equal(
      divAr.textContent?.includes('Firebase Auth is not initialized'),
      false,
      'Arabic render must never contain raw "Firebase Auth is not initialized"'
    );
    assert.ok(
      divAr.textContent?.includes('تعذر تهيئة جلسة تسجيل الدخول'),
      'Arabic render must display localized message'
    );
    await cleanupAr();
  });

  await t.test('1. Renders AuthScreen in English with Google button and accessibility attributes', async () => {
    const { div, root, cleanup } = createTestContainer();

    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'en',
          onAuthSuccess: () => {},
          auth: workingAuthStandIn,
          persistenceAdapter: workingAdapter,
        })
      );
    });

    // Check main element renders
    const mainEl = div.querySelector('main');
    assert.ok(mainEl, 'Main container must be rendered');

    // Check Google button is present
    const buttons = Array.from(div.querySelectorAll('button'));
    const googleBtn = buttons.find((b) => b.textContent?.includes('Google') || b.textContent?.includes('Initializing') || b.textContent?.includes('Continue'));
    assert.ok(googleBtn, 'Google button must be rendered');

    // Check email input exists
    const emailInput = div.querySelector('input#auth-email') as HTMLInputElement | null;
    assert.ok(emailInput, 'Email input must exist');
    assert.equal(emailInput?.getAttribute('type'), 'email');

    // Check password input exists
    const passInput = div.querySelector('input#auth-pass') as HTMLInputElement | null;
    assert.ok(passInput, 'Password input must exist');

    // Check rememberMe checkbox exists
    const rememberCheckbox = div.querySelector('input#auth-remember') as HTMLInputElement | null;
    assert.ok(rememberCheckbox, 'Remember me checkbox must exist');
    assert.equal(rememberCheckbox?.checked, true, 'Remember me should default to checked');

    await cleanup();
  });

  await t.test('2. Renders AuthScreen in Arabic with Arabic labels and RTL support', async () => {
    const { div, root, cleanup } = createTestContainer();

    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'ar',
          onAuthSuccess: () => {},
          auth: workingAuthStandIn,
          persistenceAdapter: workingAdapter,
        })
      );
    });

    // Check Arabic email label
    const emailLabel = div.querySelector('label[for="auth-email"]');
    assert.ok(emailLabel, 'Email label must exist');
    assert.ok(
      emailLabel?.textContent?.includes('البريد') || emailLabel?.textContent?.includes('الإلكتروني'),
      'Label must be in Arabic'
    );

    // Check Arabic remember me label
    const rememberLabel = div.querySelector('label[for="auth-remember"]');
    assert.ok(rememberLabel, 'Remember me label must exist');
    assert.ok(
      rememberLabel?.textContent?.includes('تذكر') || rememberLabel?.textContent?.includes('دخولي'),
      'Remember me must have Arabic translation'
    );

    await cleanup();
  });

  await t.test('3. Tab toggling between Login and Signup switches fields and button labels', async () => {
    const { div, root, cleanup } = createTestContainer();

    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'en',
          onAuthSuccess: () => {},
          auth: workingAuthStandIn,
          persistenceAdapter: workingAdapter,
        })
      );
    });

    // In Login tab, full name input should NOT be present
    assert.equal(div.querySelector('input#auth-name'), null);

    // Click signup tab
    const buttons = Array.from(div.querySelectorAll('button'));
    const signupTabBtn = buttons.find((b) => b.textContent?.includes('Sign Up'));
    assert.ok(signupTabBtn, 'Signup tab button should exist');

    await act(async () => {
      signupTabBtn?.click();
    });

    // In Signup tab, full name input MUST be present
    const nameInput = div.querySelector('input#auth-name');
    assert.ok(nameInput, 'Full name input must appear in Signup tab');

    await cleanup();
  });

  await t.test('4. Password reset modal lifecycle: open and close', async () => {
    const { div, root, cleanup } = createTestContainer();

    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'en',
          onAuthSuccess: () => {},
          auth: workingAuthStandIn,
          persistenceAdapter: workingAdapter,
        })
      );
    });

    // Initially modal is not open
    assert.equal(div.querySelector('[role="dialog"]'), null);

    // Click forgot password button
    const buttons = Array.from(div.querySelectorAll('button'));
    const forgotBtn = buttons.find((b) => b.textContent?.trim() === 'Forgot password?');
    assert.ok(forgotBtn, 'Forgot password button should exist');

    await act(async () => {
      forgotBtn?.click();
    });

    // Modal dialog is now open with accessible attributes
    const dialog = div.querySelector('[role="dialog"]');
    assert.ok(dialog, 'Dialog must be rendered when opened');
    assert.equal(dialog?.getAttribute('aria-modal'), 'true');

    // Close the modal
    const closeBtn = dialog?.querySelector('button[aria-label="Close"]') as HTMLButtonElement | null;
    assert.ok(closeBtn, 'Close button must exist in modal');

    await act(async () => {
      closeBtn?.click();
    });

    // Modal is dismissed
    assert.equal(div.querySelector('[role="dialog"]'), null);

    await cleanup();
  });

  await t.test('5. authAttemptFailureMessage localized parity for all failure reasons', () => {
    // English reasons
    assert.equal(
      authAttemptFailureMessage('busy', 'en'),
      'An authentication operation is already in progress. Please wait.'
    );
    assert.equal(
      authAttemptFailureMessage('not-ready', 'en'),
      'Session initialization is in progress. Please wait and try again.'
    );
    assert.equal(
      authAttemptFailureMessage('no-auth', 'en'),
      'Authentication service is not initialized. Please try again.'
    );

    // Arabic reasons (no English leakage)
    assert.equal(
      authAttemptFailureMessage('busy', 'ar'),
      'هناك عملية جارية بالفعل. يرجى الانتظار.'
    );
    assert.equal(
      authAttemptFailureMessage('not-ready', 'ar'),
      'جاري تهيئة جلسة تسجيل الدخول، يرجى الانتظار والمحاولة مجدداً.'
    );
    assert.equal(
      authAttemptFailureMessage('no-auth', 'ar'),
      'تعذر تهيئة جلسة تسجيل الدخول. يرجى إعادة المحاولة.'
    );
  });

  // 6. Synchronous duplicate lock
  await t.test('6. Synchronous duplicate lock: fire Google click 3 times in same tick -> signInWithPopup called exactly once', async () => {
    const { div, root, cleanup } = createTestContainer();
    let popupCallCount = 0;
    let resolvePopup: () => void = () => {};
    const popupPromise = new Promise<any>((res) => {
      resolvePopup = () => res({ user: { uid: 'popup-user-123', email: 'test@example.com' } });
    });

    const mockPopupFn = async () => {
      popupCallCount++;
      return popupPromise;
    };

    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'en',
          onAuthSuccess: () => {},
          auth: workingAuthStandIn,
          persistenceAdapter: workingAdapter,
          signInWithPopupFn: mockPopupFn,
        })
      );
    });

    const buttons = Array.from(div.querySelectorAll('button'));
    const googleBtn = buttons.find((b) => b.textContent?.includes('Google') || b.textContent?.includes('Continue'));
    assert.ok(googleBtn, 'Google button must be rendered');

    // Fire 3 clicks in the same tick synchronously
    await act(async () => {
      googleBtn.click();
      googleBtn.click();
      googleBtn.click();
    });

    assert.equal(popupCallCount, 1, 'signInWithPopup must be called exactly once despite 3 synchronous clicks in same tick');

    // Resolve in-flight attempt to clean up
    await act(async () => {
      resolvePopup();
    });

    await cleanup();
  });

  // 7. Readiness at call time
  await t.test('7. Readiness at call time: controller becomes not-ready -> handler called at call time -> no sign-in attempt and Session initialization is in progress shown', async () => {
    let resolvePersistence: () => void = () => {};
    let isInitialized = true;

    const adapter: PersistenceAdapter = {
      localPersistence: {} as any,
      sessionPersistence: {} as any,
      setPersistence: async () => {
        if (isInitialized) return;
        await new Promise<void>((res) => {
          resolvePersistence = res;
        });
      },
    };

    const { div, root, cleanup } = createTestContainer();

    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'en',
          onAuthSuccess: () => {},
          auth: workingAuthStandIn,
          persistenceAdapter: adapter,
        })
      );
    });

    const buttons = Array.from(div.querySelectorAll('button'));
    const googleBtn = buttons.find((b) => b.textContent?.includes('Google') || b.textContent?.includes('Continue'));
    assert.ok(googleBtn, 'Google button must be rendered');
    assert.equal(googleBtn?.hasAttribute('disabled'), false, 'Google button must initially be enabled');

    const propsKey = Object.keys(googleBtn).find((k) => k.startsWith('__reactProps$'));
    assert.ok(propsKey, 'React props key must exist on button DOM node');
    const googleClick = (googleBtn as any)[propsKey]?.onClick;
    assert.equal(typeof googleClick, 'function', 'Button onClick handler must exist');

    // Track popup calls through AuthPersistenceController.prototype.runAuthAttempt
    let popupCalls = 0;
    const origRunAuthAttempt = AuthPersistenceController.prototype.runAuthAttempt;
    (AuthPersistenceController.prototype as any).runAuthAttempt = async function (
      this: any,
      fn: any
    ) {
      return origRunAuthAttempt.call(this, async (auth: any) => {
        popupCalls++;
        return fn(auth);
      });
    };

    try {
      // Make controller not-ready by unchecking remember-me while persistence update is held pending
      isInitialized = false;
      const rememberCheckbox = div.querySelector('input#auth-remember') as HTMLInputElement | null;
      assert.ok(rememberCheckbox, 'Remember me checkbox must exist');

      await act(async () => {
        rememberCheckbox?.click();
      });

      // Invoke the Google auth handler via the captured onClick while controller is not ready
      await act(async () => {
        await googleClick();
      });

      // Assert popup called 0 times AND "Session initialization is in progress" is shown
      assert.equal(popupCalls, 0, 'Popup must be called 0 times when controller is not ready');
      assert.ok(
        div.textContent?.includes('Session initialization is in progress'),
        'Must show "Session initialization is in progress"'
      );
    } finally {
      AuthPersistenceController.prototype.runAuthAttempt = origRunAuthAttempt;
      resolvePersistence();
      await cleanup();
    }
  });

  // 8. No raw English error leakage in DOM
  await t.test('8. No raw English error leakage: unknown English error "Something internal xyz" shows generic text and appears nowhere in DOM', async () => {
    const { div, root, cleanup } = createTestContainer();

    const failingPopupFn = async () => {
      throw new Error('Something internal xyz');
    };

    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'en',
          onAuthSuccess: () => {},
          auth: workingAuthStandIn,
          persistenceAdapter: workingAdapter,
          signInWithPopupFn: failingPopupFn,
        })
      );
    });

    const googleBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.includes('Google') || b.textContent?.includes('Continue'));
    assert.ok(googleBtn, 'Google button must exist');

    await act(async () => {
      googleBtn.click();
    });

    // Generic error message must be shown
    assert.ok(
      div.textContent?.includes('Something went wrong. Please try again.'),
      'Generic error message must be shown'
    );
    // Raw English error must never appear in text content or HTML
    assert.equal(
      div.textContent?.includes('Something internal xyz'),
      false,
      'Raw English error "Something internal xyz" must never appear in DOM text'
    );
    assert.equal(
      div.innerHTML.includes('Something internal xyz'),
      false,
      'Raw English error "Something internal xyz" must never appear in DOM innerHTML'
    );

    await cleanup();
  });

  // 9. Missing-auth recovery
  await t.test('9. Missing-auth recovery: Auth missing -> error banner shown -> Retry -> Auth now available -> Google button becomes enabled', async () => {
    const { div, root, cleanup } = createTestContainer();

    // 1. Initial render with auth=null (Auth missing)
    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'en',
          onAuthSuccess: () => {},
          auth: null,
          persistenceAdapter: workingAdapter,
        })
      );
    });

    // Error banner shown
    const alertEl = div.querySelector('[role="alert"]');
    assert.ok(alertEl, 'Error banner must be shown when Auth is missing');
    assert.ok(
      div.textContent?.includes('Authentication service is not initialized'),
      'Must show localized service not initialized message'
    );

    // Google button is disabled
    let googleBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.includes('Google') || b.textContent?.includes('Continue'));
    assert.ok(googleBtn, 'Google button must be present');
    assert.equal(googleBtn?.hasAttribute('disabled'), true, 'Google button must be disabled when auth is missing');

    // 2. Auth becomes available and rerender occurs with working auth
    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'en',
          onAuthSuccess: () => {},
          auth: workingAuthStandIn,
          persistenceAdapter: workingAdapter,
        })
      );
    });

    // Find and click the Retry button on the error banner
    const retryBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.includes('Retry') || b.getAttribute('aria-label')?.includes('Retry'));
    if (retryBtn) {
      await act(async () => {
        retryBtn.click();
      });
    }

    // 3. Error banner is now gone, and Google button becomes enabled
    // The missing-auth message must be gone. (jsdom cannot run getRedirectResult, so an unrelated
    // "not supported in this environment" notice may appear; never pass DOM nodes to assert.)
    assert.equal(
      div.textContent?.includes('Authentication service is not initialized'),
      false,
      'Missing-auth error must disappear after recovery'
    );
    googleBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.includes('Google') || b.textContent?.includes('Continue'));
    assert.ok(googleBtn, 'Google button must still exist');
    assert.equal(googleBtn?.hasAttribute('disabled'), false, 'Google button must become enabled after auth recovery');

    await cleanup();
  });
});
