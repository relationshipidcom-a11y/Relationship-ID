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
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'http://localhost:3000',
});

Object.defineProperty(globalThis, 'window', { value: dom.window, writable: true, configurable: true });
Object.defineProperty(globalThis, 'document', { value: dom.window.document, writable: true, configurable: true });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Helper to create test container
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
    }
  };
}

// Helper to dispatch input and change events simulating user or mobile autofill
function setInputValue(input: HTMLInputElement, value: string, dispatchChange = true) {
  input.value = value;
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  if (dispatchChange) {
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }
}

async function flushTicks(ms = 25) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

test('P1InviteScreen mobile Chrome and submission resilience suite', async (t) => {
  const { P1InviteScreen } = await import('../src/components/P1InviteScreen');

  // TEST 1: Name + valid mobile number, blank email submits successfully without email
  await t.test('1. Name + mobile, blank email submits correctly', async () => {
    const container = createTestContainer();
    let capturedPayload: any = null;

    await act(async () => {
      container.root.render(
        <P1InviteScreen
          language="en"
          onCreateInvite={async (payload) => {
            capturedPayload = payload;
          }}
        />
      );
    });
    await flushTicks();

    const nameInput = container.div.querySelector('#partner-name') as HTMLInputElement;
    const phoneInput = container.div.querySelector('#partner-phone') as HTMLInputElement;
    const emailInput = container.div.querySelector('#partner-email') as HTMLInputElement;
    const submitButton = container.div.querySelector('button[type="submit"]') as HTMLButtonElement;

    assert.ok(nameInput, 'Name input rendered');
    assert.ok(phoneInput, 'Phone input rendered');
    assert.ok(submitButton, 'Submit button rendered');

    // Fill name and mobile, leaving email blank
    await act(async () => {
      setInputValue(nameInput, 'Jane Doe');
      setInputValue(phoneInput, '0583347281');
    });
    await flushTicks();

    assert.equal(emailInput.value, '', 'Email is blank');

    // Tap submit
    await act(async () => {
      submitButton.click();
    });
    await flushTicks();

    assert.ok(capturedPayload, 'onCreateInvite was called');
    assert.equal(capturedPayload.partner2Name, 'Jane Doe');
    assert.equal(capturedPayload.partner2Phone, '+966583347281');
    assert.equal(capturedPayload.partner2Email, undefined, 'Blank email passed as undefined');
    assert.equal(capturedPayload.partner2Whatsapp, '+966583347281');

    await container.cleanup();
  });

  // TEST 2: Name + email, blank mobile submits correctly
  await t.test('2. Name + email, blank mobile submits correctly', async () => {
    const container = createTestContainer();
    let capturedPayload: any = null;

    await act(async () => {
      container.root.render(
        <P1InviteScreen
          language="en"
          onCreateInvite={async (payload) => {
            capturedPayload = payload;
          }}
        />
      );
    });
    await flushTicks();

    const nameInput = container.div.querySelector('#partner-name') as HTMLInputElement;
    const emailInput = container.div.querySelector('#partner-email') as HTMLInputElement;
    const submitButton = container.div.querySelector('button[type="submit"]') as HTMLButtonElement;

    await act(async () => {
      setInputValue(nameInput, 'Alex Smith');
      setInputValue(emailInput, 'alex@example.com');
    });
    await flushTicks();

    await act(async () => {
      submitButton.click();
    });
    await flushTicks();

    assert.ok(capturedPayload, 'onCreateInvite called for email-only');
    assert.equal(capturedPayload.partner2Name, 'Alex Smith');
    assert.equal(capturedPayload.partner2Email, 'alex@example.com');
    assert.equal(capturedPayload.partner2Phone, undefined, 'Blank phone passed as undefined');

    await container.cleanup();
  });

  // TEST 3: Invalid input produces visible localized explanations
  await t.test('3. Invalid input produces visible localized explanations', async () => {
    const container = createTestContainer();
    let callCount = 0;

    await act(async () => {
      container.root.render(
        <P1InviteScreen
          language="en"
          onCreateInvite={async () => {
            callCount++;
          }}
        />
      );
    });
    await flushTicks();

    const nameInput = container.div.querySelector('#partner-name') as HTMLInputElement;
    const emailInput = container.div.querySelector('#partner-email') as HTMLInputElement;
    const phoneInput = container.div.querySelector('#partner-phone') as HTMLInputElement;
    const submitButton = container.div.querySelector('button[type="submit"]') as HTMLButtonElement;

    // Subcase 3a: Empty name
    await act(async () => {
      submitButton.click();
    });
    await flushTicks();
    assert.equal(callCount, 0, 'Does not submit with empty name');
    let errorEl = container.div.querySelector('#p1-invite-error');
    assert.ok(errorEl, 'Error element is rendered');
    assert.match(errorEl?.textContent || '', /partner’s full name/i);

    // Subcase 3b: Name provided, but no contact details
    await act(async () => {
      setInputValue(nameInput, 'John Doe');
      submitButton.click();
    });
    await flushTicks();
    assert.equal(callCount, 0, 'Does not submit without any contact');
    errorEl = container.div.querySelector('#p1-invite-error');
    assert.ok(errorEl, 'Error element is rendered');
    assert.match(errorEl?.textContent || '', /at least one partner contact/i);

    // Subcase 3c: Invalid phone number
    await act(async () => {
      setInputValue(phoneInput, '1234');
      submitButton.click();
    });
    await flushTicks();
    assert.equal(callCount, 0, 'Does not submit with invalid phone');
    errorEl = container.div.querySelector('#p1-invite-error');
    assert.ok(errorEl, 'Error element is rendered');
    assert.match(errorEl?.textContent || '', /Partner mobile number is invalid/i);

    // Subcase 3d: Invalid email format
    await act(async () => {
      setInputValue(phoneInput, '');
      setInputValue(emailInput, 'notanemail');
      submitButton.click();
    });
    await flushTicks();
    assert.equal(callCount, 0, 'Does not submit with invalid email format');
    errorEl = container.div.querySelector('#p1-invite-error');
    assert.ok(errorEl, 'Error element is rendered');
    assert.match(errorEl?.textContent || '', /email format is invalid/i);

    await container.cleanup();
  });

  // TEST 4: Pending request and duplicate taps prevention
  await t.test('4. Pending request shows visual feedback and prevents duplicate taps', async () => {
    const container = createTestContainer();
    let callCount = 0;
    let resolvePromise!: () => void;
    const deferred = new Promise<void>((res) => {
      resolvePromise = res;
    });

    await act(async () => {
      container.root.render(
        <P1InviteScreen
          language="en"
          onCreateInvite={async () => {
            callCount++;
            return deferred;
          }}
        />
      );
    });
    await flushTicks();

    const nameInput = container.div.querySelector('#partner-name') as HTMLInputElement;
    const phoneInput = container.div.querySelector('#partner-phone') as HTMLInputElement;
    const submitButton = container.div.querySelector('button[type="submit"]') as HTMLButtonElement;

    await act(async () => {
      setInputValue(nameInput, 'Jane Doe');
      setInputValue(phoneInput, '0583347281');
    });
    await flushTicks();

    // First tap
    await act(async () => {
      submitButton.click();
    });
    await flushTicks();

    assert.equal(callCount, 1, 'First tap triggered onCreateInvite');
    assert.ok(submitButton.disabled, 'Submit button is disabled while submitting');
    assert.match(submitButton.textContent || '', /Creating Invitation/);

    // Second tap while still in-flight
    await act(async () => {
      submitButton.click();
    });
    await flushTicks();

    assert.equal(callCount, 1, 'Second tap did not trigger duplicate submission');

    // Complete the request
    await act(async () => {
      resolvePromise();
    });
    await flushTicks();

    await container.cleanup();
  });

  // TEST 5: Rejected request with visible error and retry preserving entered values
  await t.test('5. Rejected request produces visible error and enables retry preserving values', async () => {
    const container = createTestContainer();
    let attempt = 0;
    let finalPayload: any = null;

    await act(async () => {
      container.root.render(
        <P1InviteScreen
          language="en"
          onCreateInvite={async (payload) => {
            attempt++;
            if (attempt === 1) {
              throw new Error('RATE_LIMITED');
            }
            finalPayload = payload;
          }}
        />
      );
    });
    await flushTicks();

    const nameInput = container.div.querySelector('#partner-name') as HTMLInputElement;
    const phoneInput = container.div.querySelector('#partner-phone') as HTMLInputElement;
    const submitButton = container.div.querySelector('button[type="submit"]') as HTMLButtonElement;

    await act(async () => {
      setInputValue(nameInput, 'Jane Doe');
      setInputValue(phoneInput, '0583347281');
      submitButton.click();
    });
    await flushTicks();

    assert.equal(attempt, 1, 'First attempt failed');

    // Error is rendered near submit button
    const errorEl = container.div.querySelector('#p1-invite-error');
    assert.ok(errorEl, 'Error element rendered after rejection');
    assert.match(errorEl.textContent || '', /Too many requests/i);

    // Form values are preserved
    assert.equal(nameInput.value, 'Jane Doe', 'Name input preserved');
    assert.equal(phoneInput.value, '0583347281', 'Phone input preserved');

    // Button is re-enabled for retry
    assert.equal(submitButton.disabled, false, 'Submit button re-enabled after failure');

    // Retry
    await act(async () => {
      submitButton.click();
    });
    await flushTicks();

    assert.equal(attempt, 2, 'Second attempt succeeded');
    assert.ok(finalPayload, 'Final payload received');

    await container.cleanup();
  });

  // TEST 6: Mobile autofill dispatching only 'input' event without 'change' synchronizes properly
  await t.test('6. Mobile autofill input-event-only synchronization succeeds', async () => {
    const container = createTestContainer();
    let capturedPayload: any = null;

    await act(async () => {
      container.root.render(
        <P1InviteScreen
          language="en"
          onCreateInvite={async (payload) => {
            capturedPayload = payload;
          }}
        />
      );
    });
    await flushTicks();

    const nameInput = container.div.querySelector('#partner-name') as HTMLInputElement;
    const phoneInput = container.div.querySelector('#partner-phone') as HTMLInputElement;
    const submitButton = container.div.querySelector('button[type="submit"]') as HTMLButtonElement;

    // Simulate mobile Chrome autofill: ONLY 'input' event is dispatched without blur/change
    await act(async () => {
      setInputValue(nameInput, 'Mobile User', false);
      setInputValue(phoneInput, '+966583347281', false);
    });
    await flushTicks();

    // User directly taps submit
    await act(async () => {
      submitButton.click();
    });
    await flushTicks();

    assert.ok(capturedPayload, 'Submission succeeded with mobile autofill input events');
    assert.equal(capturedPayload.partner2Name, 'Mobile User');
    assert.equal(capturedPayload.partner2Phone, '+966583347281');

    await container.cleanup();
  });

  // TEST 7: Form has noValidate preventing native Chrome validation interference
  await t.test('7. Form has noValidate attribute', async () => {
    const container = createTestContainer();

    await act(async () => {
      container.root.render(
        <P1InviteScreen
          language="en"
          onCreateInvite={async () => {}}
        />
      );
    });
    await flushTicks();

    const form = container.div.querySelector('form');
    assert.ok(form, 'Form rendered');
    assert.equal(form.noValidate, true, 'Form has noValidate attribute to prevent Chrome silent cancellation');

    await container.cleanup();
  });
});
