
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

import { validateFullName, validateEmailAddress, EMAIL_VALIDATION_REGEX } from '../src/utils/contacts';
import { validateFieldLength } from '../server';
import type { PersistenceAdapter } from '../src/utils/authPersistence';

test('Sign-up form validation suite: name, email, remember me, and backend validation', async (t) => {
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

  // 1. Direct validation tests for requested inputs
  await t.test('1. Core input validation test results', async () => {
    // "   "
    assert.equal(validateFullName('   '), false, '"   " must be rejected for name');
    // "ر"
    assert.equal(validateFullName('ر'), false, '"ر" must be rejected for name (minlength 2)');
    // 61-character name
    const long61 = 'ا'.repeat(61);
    assert.equal(validateFullName(long61), false, '61-character name must be rejected (maxlength 60)');
    // "<b>x</b>"
    assert.equal(validateFullName('<b>x</b>'), false, '"<b>x</b>" must be rejected for name (contains < >)');
    // Valid names
    assert.equal(validateFullName('رامي خليل'), true, 'Valid Arabic name must be accepted');
    assert.equal(validateFullName("John O'Connor-Smith"), true, 'Valid English name with apostrophe and hyphen must be accepted');

    // "a@b"
    assert.equal(validateEmailAddress('a@b'), false, '"a@b" must be rejected for email');
    // "test@"
    assert.equal(validateEmailAddress('test@'), false, '"test@" must be rejected for email');
    // "test@site"
    assert.equal(validateEmailAddress('test@site'), false, '"test@site" must be rejected for email');
    // Addresses with spaces
    assert.equal(validateEmailAddress('user @domain.com'), false, 'Address with spaces in local part must be rejected');
    assert.equal(validateEmailAddress('user@dom ain.com'), false, 'Address with spaces in domain must be rejected');
    // " Test@Mail.com "
    assert.equal(validateEmailAddress(' Test@Mail.com '), true, '" Test@Mail.com " must be valid after trimming');

    // Regex check
    assert.equal(EMAIL_VALIDATION_REGEX.test('a@b'), false);
    assert.equal(EMAIL_VALIDATION_REGEX.test('test@'), false);
    assert.equal(EMAIL_VALIDATION_REGEX.test('test@site'), false);
    assert.equal(EMAIL_VALIDATION_REGEX.test('test@mail.com'), true);
  });

  // 2. Server-side validation parity in validateFieldLength
  await t.test('2. Server-side validateFieldLength parity', async () => {
    // Name checks
    assert.equal(validateFieldLength('   ', 'fullName', true).valid, false);
    assert.equal(validateFieldLength('ر', 'fullName', true).valid, false);
    assert.equal(validateFieldLength('ا'.repeat(61), 'fullName', true).valid, false);
    assert.equal(validateFieldLength('<b>x</b>', 'fullName', true).valid, false);
    assert.equal(validateFieldLength('Valid Name', 'fullName', true).valid, true);
    assert.equal(validateFieldLength('اسم صحيح', 'fullName', true).valid, true);

    // Email checks
    assert.equal(validateFieldLength('a@b', 'email', true).valid, false);
    assert.equal(validateFieldLength('test@', 'email', true).valid, false);
    assert.equal(validateFieldLength('test@site', 'email', true).valid, false);
    assert.equal(validateFieldLength(' Test@Mail.com ', 'email', true).valid, true);
  });

  // 3. Remember Me checkbox default behavior
  await t.test('3. Remember Me (#auth-remember) is unchecked by default on login and Create Account forms', async () => {
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

    const rememberCheckbox = div.querySelector('input#auth-remember') as HTMLInputElement;
    assert.ok(rememberCheckbox, '#auth-remember checkbox must exist');

    // On fresh login form, default is UNCHECKED
    assert.equal(rememberCheckbox.checked, false, 'Remember Me must be unchecked by default on login form');

    // Switch to Create Account (signup) tab
    const signupTabButton = Array.from(div.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('إنشاء حساب جديد')
    );
    assert.ok(signupTabButton, 'Sign-up tab button must exist');

    await act(async () => {
      signupTabButton.click();
    });

    // On Create Account form, selection is preserved (unchecked)
    assert.equal(rememberCheckbox.checked, false, 'Remember Me selection must be preserved on Create Account form');

    // User explicitly checks the box
    await act(async () => {
      rememberCheckbox.click();
    });
    assert.equal(rememberCheckbox.checked, true, 'Remember Me becomes checked upon user click');

    // Switch back to login form
    const loginTabButton = Array.from(div.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('تسجيل الدخول')
    );
    assert.ok(loginTabButton, 'Login tab button must exist');

    await act(async () => {
      loginTabButton.click();
    });

    // Explicit choice (checked = true) is preserved on tab switch
    assert.equal(rememberCheckbox.checked, true, 'Explicit Remember Me choice must be preserved when switching tabs');

    await cleanup();
  });

  // 4. HTML input attributes for name field on signup form
  await t.test('4. Name input has minlength="2" and maxlength="60"', async () => {
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

    // Switch to signup tab
    const signupTabButton = Array.from(div.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('إنشاء حساب جديد')
    );
    await act(async () => {
      signupTabButton?.click();
    });

    const nameInput = div.querySelector('input#auth-name') as HTMLInputElement;
    assert.ok(nameInput, '#auth-name input must exist on signup tab');
    assert.equal(nameInput.getAttribute('minlength'), '2', 'minlength must be 2');
    assert.equal(nameInput.getAttribute('maxlength'), '60', 'maxlength must be 60');

    await cleanup();
  });

  // 5. Inline errors on blur and live clearing when valid (Arabic)
  await t.test('5. Inline errors on blur and live clearing when valid in Arabic', async () => {
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

    // Switch to signup tab
    const signupTabButton = Array.from(div.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('إنشاء حساب جديد')
    );
    await act(async () => {
      signupTabButton?.click();
    });

    const nameInput = div.querySelector('input#auth-name') as HTMLInputElement;
    const emailInput = div.querySelector('input#auth-email') as HTMLInputElement;

    // Blur name with single character "ر"
    nameInput.value = 'ر';
    await act(async () => {
      nameInput.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }));
    });

    const nameErrorEl = div.querySelector('#auth-name-error');
    assert.ok(nameErrorEl, '#auth-name-error element must appear on invalid name blur');
    assert.equal(nameErrorEl.textContent, 'الرجاء إدخال اسم صحيح (2–60 حرفاً)');

    // Type valid name -> error should clear immediately
    await act(async () => {
      nameInput.value = 'رامي خليل';
      nameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    assert.equal(div.querySelector('#auth-name-error'), null, 'Name error must clear when field becomes valid');

    // Blur email with "a@b"
    emailInput.value = 'a@b';
    await act(async () => {
      emailInput.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }));
    });

    const emailErrorEl = div.querySelector('#auth-email-error');
    assert.ok(emailErrorEl, '#auth-email-error element must appear on invalid email blur');
    assert.equal(emailErrorEl.textContent, 'الرجاء إدخال بريد إلكتروني صحيح');

    // Type valid email -> error should clear immediately
    await act(async () => {
      emailInput.value = 'test@example.com';
      emailInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      emailInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    assert.equal(div.querySelector('#auth-email-error'), null, 'Email error must clear when field becomes valid');

    await cleanup();
  });

  // 6. English inline error messages and submit validation
  await t.test('6. English inline error messages and submit validation', async () => {
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

    // Switch to signup tab
    const signupTabButton = Array.from(div.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Sign Up (Register)')
    );
    await act(async () => {
      signupTabButton?.click();
    });

    const form = div.querySelector('form') as HTMLFormElement;
    const nameInput = div.querySelector('input#auth-name') as HTMLInputElement;
    const emailInput = div.querySelector('input#auth-email') as HTMLInputElement;
    const passInput = div.querySelector('input#auth-pass') as HTMLInputElement;

    // Fill invalid values: HTML tags in name, incomplete email
    nameInput.value = '<b>x</b>';
    emailInput.value = 'test@site';
    passInput.value = 'validpassword123';

    // Submit form
    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    const nameErrorEl = div.querySelector('#auth-name-error');
    assert.ok(nameErrorEl, 'English name error must appear on invalid submit');
    assert.equal(nameErrorEl.textContent, 'Please enter a valid name (2–60 characters)');

    const emailErrorEl = div.querySelector('#auth-email-error');
    assert.ok(emailErrorEl, 'English email error must appear on invalid submit');
    assert.equal(emailErrorEl.textContent, 'Please enter a valid email address');

    await cleanup();
  });

  // 7. Successful sign up trims name, trims and lowercases email, and passes to Firebase Auth
  await t.test('7. Successful sign up trims name, trims and lowercases email', async () => {
    const { div, root, cleanup } = createTestContainer();

    let createdEmail = '';
    let updatedDisplayName = '';
    const mockCreateUser = async (_auth: any, email: string, _pass: string) => {
      createdEmail = email;
      return {
        user: {
          uid: 'new-user-123',
          email,
          displayName: null,
        },
      };
    };

    const mockUpdateProfile = async (_user: any, profile: { displayName?: string | null }) => {
      updatedDisplayName = profile.displayName || '';
    };

    let authSuccessUser: any = null;

    await act(async () => {
      root.render(
        React.createElement(AuthScreen, {
          language: 'ar',
          onAuthSuccess: (u) => {
            authSuccessUser = u;
          },
          auth: workingAuthStandIn,
          persistenceAdapter: workingAdapter,
          createUserWithEmailAndPasswordFn: mockCreateUser,
          updateProfileFn: mockUpdateProfile,
        })
      );
    });

    // Switch to signup tab
    const signupTabButton = Array.from(div.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('إنشاء حساب جديد')
    );
    await act(async () => {
      signupTabButton?.click();
    });

    const form = div.querySelector('form') as HTMLFormElement;
    const nameInput = div.querySelector('input#auth-name') as HTMLInputElement;
    const emailInput = div.querySelector('input#auth-email') as HTMLInputElement;
    const passInput = div.querySelector('input#auth-pass') as HTMLInputElement;

    nameInput.value = '   سارة أحمد   ';
    emailInput.value = '   Test@Mail.com   ';
    passInput.value = 'secret12345';

    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.equal(createdEmail, 'test@mail.com', 'Created email must be trimmed and lowercased');
    assert.equal(updatedDisplayName, 'سارة أحمد', 'Updated display name must be trimmed');
    assert.ok(authSuccessUser, 'onAuthSuccess must be called upon successful signup');

    await cleanup();
  });
});
