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

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:3000',
});

Object.defineProperty(globalThis, 'window', { value: dom.window, writable: true, configurable: true });
Object.defineProperty(globalThis, 'document', { value: dom.window.document, writable: true, configurable: true });
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
(globalThis as any).HTMLButtonElement = dom.window.HTMLButtonElement;
(globalThis as any).HTMLFormElement = dom.window.HTMLFormElement;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import type { PersistenceAdapter } from '../src/utils/authPersistence';
import type { AuthUser } from '../src/types';
import { AuthScreen } from '../src/components/AuthScreen';

test('AuthScreen form submission, autofill sync, duplicate locking & safe diagnostics', async (t) => {
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

  // 1. Autofill/state mismatch: displayed DOM values differ from stale React state -> submit must use current DOM values
  await t.test('1. Autofill/state mismatch: displayed DOM values authoritative over stale React state, trims email only', async () => {
    const { div, root, cleanup } = createTestContainer();
    let submittedEmail = '';
    let submittedPassword = '';

    const mockSignIn = async (_auth: any, email: string, pass: string) => {
      submittedEmail = email;
      submittedPassword = pass;
      return { user: { uid: 'user-autofill', email, displayName: null } };
    };

    let authSuccessCalled = false;
    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'ar',
          defaultEmail: 'stale-rendered@example.com',
          onAuthSuccess: () => {
            authSuccessCalled = true;
          },
          auth: workingAuthStandIn,
          persistenceAdapter: workingAdapter,
          signInWithEmailAndPasswordFn: mockSignIn,
        })
      );
    });

    const form = div.querySelector('form') as HTMLFormElement;
    assert.ok(form, 'Form must be rendered');

    const emailInput = form.querySelector('input#auth-email') as HTMLInputElement;
    const passInput = form.querySelector('input#auth-pass') as HTMLInputElement;
    assert.ok(emailInput, 'Email input must exist');
    assert.ok(passInput, 'Password input must exist');

    // Verify stable name and autocomplete attributes
    assert.equal(emailInput.getAttribute('name'), 'email');
    assert.equal(emailInput.getAttribute('autocomplete'), 'email');
    assert.equal(passInput.getAttribute('name'), 'password');
    assert.equal(passInput.getAttribute('autocomplete'), 'current-password');

    // Simulate browser autofill mutating the DOM directly without React onChange
    emailInput.value = '  autofilled-user@example.com  ';
    passInput.value = '  secret with whitespace  ';

    // Dispatch form submit
    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.equal(authSuccessCalled, true, 'onAuthSuccess must be called');
    // Email MUST be trimmed
    assert.equal(submittedEmail, 'autofilled-user@example.com', 'Submitted email must be trimmed DOM value');
    // Password MUST NEVER be trimmed
    assert.equal(submittedPassword, '  secret with whitespace  ', 'Submitted password must preserve whitespace');

    await cleanup();
  });

  // 2. Wrong credentials: displays localized error and logs safe diagnostic without credentials
  await t.test('2. Wrong credentials: shows localized error and logs safe diagnostic without credentials', async () => {
    const { div, root, cleanup } = createTestContainer();
    const originalConsoleError = console.error;
    const capturedErrors: any[] = [];
    console.error = (...args: any[]) => {
      capturedErrors.push(args);
    };

    try {
      const mockSignIn = async () => {
        const err = Object.assign(new Error('Invalid credential'), { code: 'auth/invalid-credential' });
        throw err;
      };

      await act(async () => {
        root.render(
          React.createElement(AuthScreen, {
            language: 'ar',
            onAuthSuccess: () => {},
            auth: workingAuthStandIn,
            persistenceAdapter: workingAdapter,
            signInWithEmailAndPasswordFn: mockSignIn,
          })
        );
      });

      const form = div.querySelector('form') as HTMLFormElement;
      const emailInput = form.querySelector('input#auth-email') as HTMLInputElement;
      const passInput = form.querySelector('input#auth-pass') as HTMLInputElement;

      emailInput.value = 'user@wrong.com';
      passInput.value = 'superSecretWrongPassword';

      await act(async () => {
        form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      });

      // Verify localized Arabic error message displayed
      assert.ok(
        div.textContent?.includes('البريد الإلكتروني أو كلمة المرور غير صحيحة.'),
        'Must display localized Arabic wrong credentials message'
      );

      // Verify safe failure diagnostic logged: operation + sanitized code only
      const failureLogs = capturedErrors.filter((args) => args[0] === '[auth-failure]');
      assert.ok(failureLogs.length >= 1, 'Must log [auth-failure] diagnostic');
      const diagnosticPayload = failureLogs[0][1];
      assert.deepEqual(diagnosticPayload, {
        operation: 'signin',
        code: 'auth/invalid-credential',
      });

      // Verify NO passwords, emails, or raw Error objects were logged
      for (const callArgs of capturedErrors) {
        const text = JSON.stringify(callArgs);
        assert.equal(text.includes('superSecretWrongPassword'), false, 'Password must never be logged');
        assert.equal(text.includes('user@wrong.com'), false, 'Email must never be logged');
      }

      await cleanup();
    } finally {
      console.error = originalConsoleError;
    }
  });

  // 3. Blank fields: rejects empty email or empty password with localized parity
  await t.test('3. Blank fields: rejects missing email and missing password with localized parity', async () => {
    const { div, root, cleanup } = createTestContainer();

    // 3a. Blank email in Arabic
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

    const form = div.querySelector('form') as HTMLFormElement;
    const emailInput = form.querySelector('input#auth-email') as HTMLInputElement;
    const passInput = form.querySelector('input#auth-pass') as HTMLInputElement;

    emailInput.value = '   ';
    passInput.value = 'somepassword';

    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.ok(
      div.textContent?.includes('يرجى إدخال عنوان البريد الإلكتروني.'),
      'Must show Arabic missing email message'
    );

    // 3b. Blank password in Arabic
    emailInput.value = 'user@example.com';
    passInput.value = '';

    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.ok(
      div.textContent?.includes('يرجى إدخال كلمة المرور.'),
      'Must show Arabic missing password message'
    );

    // 3c. English parity for missing password
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

    emailInput.value = 'user@example.com';
    passInput.value = '';

    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.ok(
      div.textContent?.includes('Please enter your password.'),
      'Must show English missing password message'
    );

    await cleanup();
  });

  // 4. Pending duplicate prevention: prevents duplicate concurrent submissions in same tick
  await t.test('4. Pending duplicate prevention: blocks synchronous second submit while in flight', async () => {
    const { div, root, cleanup } = createTestContainer();
    let callCount = 0;
    let resolveSignIn: () => void = () => {};
    const signInPromise = new Promise<any>((res) => {
      resolveSignIn = () => res({ user: { uid: 'u1', email: 'a@b.com', displayName: null } });
    });

    const mockSignIn = async () => {
      callCount++;
      return signInPromise;
    };

    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'en',
          onAuthSuccess: () => {},
          auth: workingAuthStandIn,
          persistenceAdapter: workingAdapter,
          signInWithEmailAndPasswordFn: mockSignIn,
        })
      );
    });

    const form = div.querySelector('form') as HTMLFormElement;
    const emailInput = form.querySelector('input#auth-email') as HTMLInputElement;
    const passInput = form.querySelector('input#auth-pass') as HTMLInputElement;

    emailInput.value = 'test@example.com';
    passInput.value = 'mypassword123';

    // Dispatch 3 submits in the same synchronous tick
    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.equal(callCount, 1, 'signInWithEmailAndPasswordFn must be called exactly once');

    // Resolve in flight
    await act(async () => {
      resolveSignIn();
    });

    await cleanup();
  });

  // 5. Retry: failure clears and allows successful retry
  await t.test('5. Retry: failed attempt allows immediate user retry that succeeds and clears error', async () => {
    const { div, root, cleanup } = createTestContainer();
    let attempt = 0;
    let authUserResult: AuthUser | null = null;

    const mockSignIn = async (_auth: any, email: string) => {
      attempt++;
      if (attempt === 1) {
        throw Object.assign(new Error('Wrong password'), { code: 'auth/wrong-password' });
      }
      return { user: { uid: 'retry-user', email, displayName: 'Recovered User' } };
    };

    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'ar',
          onAuthSuccess: (user: AuthUser) => {
            authUserResult = user;
          },
          auth: workingAuthStandIn,
          persistenceAdapter: workingAdapter,
          signInWithEmailAndPasswordFn: mockSignIn,
        })
      );
    });

    const form = div.querySelector('form') as HTMLFormElement;
    const emailInput = form.querySelector('input#auth-email') as HTMLInputElement;
    const passInput = form.querySelector('input#auth-pass') as HTMLInputElement;

    emailInput.value = 'user@retry.com';
    passInput.value = 'badpass';

    // Attempt 1 -> fails
    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.ok(div.textContent?.includes('البريد الإلكتروني أو كلمة المرور غير صحيحة.'));
    assert.equal(authUserResult, null);

    // Attempt 2 -> user retries with good password -> succeeds
    passInput.value = 'correctpass';
    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.equal(attempt, 2);
    assert.equal((authUserResult as any)?.id, 'retry-user');
    assert.equal((authUserResult as any)?.name, 'Recovered User');
    assert.equal(div.textContent?.includes('البريد الإلكتروني أو كلمة المرور غير صحيحة.'), false);

    await cleanup();
  });

  // 6. Signup flow: stable attributes, new-password autocomplete, updateProfile call and user creation
  await t.test('6. Signup flow: sets new-password autocomplete, reads fullName DOM element, calls createUser and updateProfile', async () => {
    const { div, root, cleanup } = createTestContainer();
    let createdEmail = '';
    let createdPassword = '';
    let successUser: AuthUser | null = null;
    let profileUpdateCall: { user: any; profile: any } | null = null;

    const userObj = { uid: 'new-uid', email: 'jane@example.com', displayName: null, getIdToken: async () => 'mock-id-token' };

    const mockCreateUser = async (_auth: any, email: string, pass: string) => {
      createdEmail = email;
      createdPassword = pass;
      return { user: userObj };
    };

    const mockUpdateProfile = async (u: any, p: any) => {
      profileUpdateCall = { user: u, profile: p };
      u.displayName = p.displayName;
    };

    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'en',
          onAuthSuccess: (u) => {
            successUser = u;
          },
          auth: workingAuthStandIn,
          persistenceAdapter: workingAdapter,
          createUserWithEmailAndPasswordFn: mockCreateUser,
          updateProfileFn: mockUpdateProfile,
        })
      );
    });

    // Switch to Signup tab
    const buttons = Array.from(div.querySelectorAll('button'));
    const signupTab = buttons.find((b) => b.textContent?.includes('Sign Up'));
    assert.ok(signupTab, 'Sign Up tab button must exist');

    await act(async () => {
      signupTab.click();
    });

    const form = div.querySelector('form') as HTMLFormElement;
    const nameInput = form.querySelector('input#auth-name') as HTMLInputElement;
    const emailInput = form.querySelector('input#auth-email') as HTMLInputElement;
    const passInput = form.querySelector('input#auth-pass') as HTMLInputElement;

    assert.ok(nameInput, 'Full name input must exist in signup tab');
    assert.equal(nameInput.getAttribute('name'), 'fullName');
    assert.equal(nameInput.getAttribute('autocomplete'), 'name');
    assert.equal(passInput.getAttribute('autocomplete'), 'new-password');

    nameInput.value = '  Jane Doe  ';
    emailInput.value = '  jane@example.com  ';
    passInput.value = '  securePassword123!  ';

    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.equal(createdEmail, 'jane@example.com', 'Created email must be trimmed');
    assert.equal(createdPassword, '  securePassword123!  ', 'Created password must never be trimmed');
    assert.ok(profileUpdateCall, 'updateProfile must be called');
    assert.equal((profileUpdateCall as any).user, userObj);
    assert.deepEqual((profileUpdateCall as any).profile, { displayName: 'Jane Doe' });
    assert.equal((successUser as any)?.id, 'new-uid');
    assert.equal((successUser as any)?.name, 'Jane Doe');

    await cleanup();
  });

  // 6b. Signup flow: updateProfile error properly propagates without swallow/fake mutation
  await t.test('6b. Signup flow: updateProfile error failure propagates, displays error banner, and halts success', async () => {
    const { div, root, cleanup } = createTestContainer();
    let successUser: AuthUser | null = null;

    const mockCreateUser = async (_auth: any, _email: string, _pass: string) => {
      return { user: { uid: 'err-uid', email: 'err@example.com', displayName: null } };
    };

    const mockFailingUpdateProfile = async () => {
      const err = new Error('Network failure during profile write');
      (err as any).code = 'auth/network-request-failed';
      throw err;
    };

    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'en',
          onAuthSuccess: (u) => {
            successUser = u;
          },
          auth: workingAuthStandIn,
          persistenceAdapter: workingAdapter,
          createUserWithEmailAndPasswordFn: mockCreateUser,
          updateProfileFn: mockFailingUpdateProfile,
        })
      );
    });

    const buttons = Array.from(div.querySelectorAll('button'));
    const signupTab = buttons.find((b) => b.textContent?.includes('Sign Up'));
    assert.ok(signupTab);

    await act(async () => {
      signupTab.click();
    });

    const form = div.querySelector('form') as HTMLFormElement;
    const nameInput = form.querySelector('input#auth-name') as HTMLInputElement;
    const emailInput = form.querySelector('input#auth-email') as HTMLInputElement;
    const passInput = form.querySelector('input#auth-pass') as HTMLInputElement;

    nameInput.value = 'Fail Name';
    emailInput.value = 'fail@example.com';
    passInput.value = 'validPassword123';

    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    // onAuthSuccess must NOT be called when updateProfile fails
    assert.equal(successUser, null, 'onAuthSuccess must not be called when updateProfile fails');
    // Error banner must reflect network error
    assert.ok(
      div.textContent?.includes('Network error. Please check your internet connection.'),
      'Error banner must display readable error from failing updateProfile'
    );

    await cleanup();
  });

  // 7. Password reset modal: stable name/autocomplete and authoritative DOM reading
  await t.test('7. Password reset modal: stable name/autocomplete and authoritative DOM reading', async () => {
    const { div, root, cleanup } = createTestContainer();
    let resetEmailSent = '';

    const mockSendReset = async (_auth: any, email: string) => {
      resetEmailSent = email;
    };

    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'en',
          onAuthSuccess: () => {},
          auth: workingAuthStandIn,
          persistenceAdapter: workingAdapter,
          sendPasswordResetEmailFn: mockSendReset,
        })
      );
    });

    // Click forgot password button
    const buttons = Array.from(div.querySelectorAll('button'));
    const forgotBtn = buttons.find((b) => b.textContent?.trim() === 'Forgot password?');
    assert.ok(forgotBtn, 'Forgot password button should exist');

    await act(async () => {
      forgotBtn.click();
    });

    const modal = div.querySelector('[role="dialog"]') as HTMLElement;
    assert.ok(modal, 'Modal must be open');

    const resetForm = modal.querySelector('form') as HTMLFormElement;
    assert.ok(resetForm, 'Reset form must exist');

    const resetInput = resetForm.querySelector('input#reset-email-input') as HTMLInputElement;
    assert.ok(resetInput, 'Reset email input must exist');
    assert.equal(resetInput.getAttribute('name'), 'resetEmail');
    assert.equal(resetInput.getAttribute('autocomplete'), 'email');

    resetInput.value = '  recovery@example.com  ';

    await act(async () => {
      resetForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.equal(resetEmailSent, 'recovery@example.com', 'Reset email sent must be trimmed authoritative DOM value');

    await cleanup();
  });
});
