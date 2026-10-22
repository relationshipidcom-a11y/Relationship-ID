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
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CountryCode } from 'libphonenumber-js';
import { normalizePhoneNumber } from '../src/utils/phone';
import { auth } from '../src/lib/firebase';
import type { Language } from '../src/types';

// Configure DOM environment for React Testing
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

// Deferred promise helper to control async network resolutions deterministically
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Helper to set input value and trigger React 19 synthetic events
function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

async function flushTicks(ms = 25) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

test('PhoneVerificationField deferred-response and formatting-preservation suite', async (t) => {
  const { PhoneVerificationField } = await import('../src/components/PhoneVerificationField');

  // Test harness component simulating real parent behavior
  interface HarnessProps {
    initialCountry?: CountryCode;
    initialNumber?: string;
    initialVerifiedE164?: string | null;
    language?: Language;
    onVerifiedSpy?: (val: string | null) => void;
  }

  const Harness: React.FC<HarnessProps> = ({
    initialCountry = 'SA',
    initialNumber = '0583347281',
    initialVerifiedE164 = null,
    language = 'en',
    onVerifiedSpy
  }) => {
    const [country, setCountry] = useState<CountryCode>(initialCountry);
    const [number, setNumber] = useState(initialNumber);
    const [verifiedE164, setVerifiedE164] = useState<string | null>(initialVerifiedE164);

    return (
      <PhoneVerificationField
        id="test-phone"
        language={language}
        country={country}
        number={number}
        verifiedE164={verifiedE164}
        isWhatsappVerified={true}
        onCountryChange={(newCountry) => {
          setCountry(newCountry);
          const newCanonical = normalizePhoneNumber(newCountry, number);
          if (!newCanonical || newCanonical !== verifiedE164) {
            setVerifiedE164(null);
          }
        }}
        onNumberChange={(newNumber) => {
          setNumber(newNumber);
          const newCanonical = normalizePhoneNumber(country, newNumber);
          if (!newCanonical || newCanonical !== verifiedE164) {
            setVerifiedE164(null);
          }
        }}
        onVerified={(val) => {
          setVerifiedE164(val);
          onVerifiedSpy?.(val);
        }}
      />
    );
  };

  // Setup mock auth user
  const setAuthUser = (uid: string | null) => {
    Object.defineProperty(auth, 'currentUser', {
      value: uid
        ? {
            uid,
            getIdToken: async () => `mock-token-for-${uid}`
          }
        : null,
      writable: true,
      configurable: true
    });
  };

  // Save original fetch
  const originalFetch = globalThis.fetch;

  t.afterEach(() => {
    globalThis.fetch = originalFetch;
    setAuthUser(null);
  });

  // TEST 1: Pending verification survives formatting-only number edits
  await t.test('1. Pending verification survives formatting-only number edits', async () => {
    setAuthUser('user-1');
    const container = createTestContainer();

    globalThis.fetch = async (url: any) => {
      if (String(url).includes('/api/whatsapp/verify/start')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('{}', { status: 200 });
    };

    await act(async () => {
      container.root.render(<Harness initialCountry="SA" initialNumber="0583347281" />);
    });

    const sendButton = container.div.querySelectorAll('button')[0];
    assert.ok(sendButton, 'Send button exists');

    await act(async () => {
      sendButton.click();
    });
    await flushTicks();

    // OTP input must now be in DOM
    let otpInput = container.div.querySelector('input[autoComplete="one-time-code"]') as HTMLInputElement;
    assert.ok(otpInput, 'OTP input is rendered after sending code');

    // Make a formatting-only edit: add spaces "058 334 7281"
    const numberInput = container.div.querySelector('input[type="tel"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(numberInput, '058 334 7281');
    });
    await flushTicks();

    // Pending session must still be intact
    otpInput = container.div.querySelector('input[autoComplete="one-time-code"]') as HTMLInputElement;
    assert.ok(otpInput, 'OTP input remains rendered after formatting-only edit');

    await container.cleanup();
  });

  // TEST 2: OTP and applicable cooldown survive equivalent formatting edits
  await t.test('2. OTP and applicable cooldown survive equivalent formatting edits', async () => {
    setAuthUser('user-1');
    const container = createTestContainer();

    globalThis.fetch = async (url: any) => {
      if (String(url).includes('/api/whatsapp/verify/start')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('{}', { status: 200 });
    };

    await act(async () => {
      container.root.render(<Harness initialCountry="SA" initialNumber="0583347281" />);
    });
    await flushTicks();

    const sendButton = container.div.querySelectorAll('button')[0];
    await act(async () => {
      sendButton.click();
    });
    await flushTicks();

    // Enter 6-digit OTP
    const otpInput = container.div.querySelector('input[autoComplete="one-time-code"]') as HTMLInputElement;
    assert.ok(otpInput, 'OTP input rendered');
    await act(async () => {
      setInputValue(otpInput, '123456');
    });
    await flushTicks();
    assert.equal(otpInput.value, '123456');

    // Check resend button shows cooldown
    assert.match(container.div.querySelectorAll('button')[0].textContent || '', /Resend in/);

    // Make an equivalent formatting edit
    const numberInput = container.div.querySelector('input[type="tel"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(numberInput, '+966 58 334 7281');
    });
    await flushTicks();

    // OTP input and entered value must survive
    const preservedOtpInput = container.div.querySelector('input[autoComplete="one-time-code"]') as HTMLInputElement;
    assert.ok(preservedOtpInput, 'OTP input is preserved');
    assert.equal(preservedOtpInput.value, '123456', 'Entered OTP digits are preserved');

    // Cooldown must still be active
    assert.match(container.div.querySelectorAll('button')[0].textContent || '', /Resend in/, 'Cooldown text is preserved');

    await container.cleanup();
  });

  // TEST 3: Existing verified status survives equivalent formatting edits
  await t.test('3. Existing verified status survives equivalent formatting edits', async () => {
    setAuthUser('user-1');
    const container = createTestContainer();
    let verifiedValue: string | null = '+966583347281';

    await act(async () => {
      container.root.render(
        <Harness
          initialCountry="SA"
          initialNumber="0583347281"
          initialVerifiedE164="+966583347281"
          onVerifiedSpy={(v) => {
            verifiedValue = v;
          }}
        />
      );
    });
    await flushTicks();

    // Verify verified badge is shown
    assert.match(container.div.textContent || '', /Verified via WhatsApp/);

    // Make equivalent formatting edit
    const numberInput = container.div.querySelector('input[type="tel"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(numberInput, '058 334 7281');
    });
    await flushTicks();

    // Verified badge remains and spy was NOT called with null
    assert.equal(verifiedValue, '+966583347281', 'onVerified was not called with null');
    assert.match(container.div.textContent || '', /Verified via WhatsApp/, 'Status badge remains verified');

    await container.cleanup();
  });

  // TEST 4: A different or invalid number clears the appropriate state
  await t.test('4. A different or invalid number clears the appropriate state', async () => {
    setAuthUser('user-1');
    const container = createTestContainer();
    let verifiedValue: string | null = '+966583347281';

    globalThis.fetch = async (url: any) => {
      if (String(url).includes('/api/whatsapp/verify/start')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('{}', { status: 200 });
    };

    await act(async () => {
      container.root.render(
        <Harness
          initialCountry="SA"
          initialNumber="0583347281"
          initialVerifiedE164="+966583347281"
          onVerifiedSpy={(v) => {
            verifiedValue = v;
          }}
        />
      );
    });
    await flushTicks();

    // Change to a different valid number
    const numberInput = container.div.querySelector('input[type="tel"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(numberInput, '0551112233');
    });
    await flushTicks();

    // Verified status must be cleared
    assert.equal(verifiedValue, null, 'onVerified called with null when number changes');
    assert.match(container.div.textContent || '', /Not verified/, 'Status shows Not verified');

    // Send code on this new number
    const sendButton = container.div.querySelectorAll('button')[0];
    await act(async () => {
      sendButton.click();
    });
    await flushTicks();
    assert.ok(container.div.querySelector('input[autoComplete="one-time-code"]'), 'OTP input appears for new number');

    // Now change to invalid input
    await act(async () => {
      setInputValue(numberInput, 'invalid');
    });
    await flushTicks();
    assert.equal(
      container.div.querySelector('input[autoComplete="one-time-code"]'),
      null,
      'Pending OTP session cleared on invalid number'
    );

    await container.cleanup();
  });

  // TEST 5: Stale send/check success and failure cannot affect the new target
  await t.test('5. Stale send/check success and failure cannot affect the new target', async () => {
    setAuthUser('user-1');
    const container = createTestContainer();

    const deferredStart = createDeferred<Response>();
    globalThis.fetch = async (url: any) => {
      if (String(url).includes('/api/whatsapp/verify/start')) {
        return deferredStart.promise;
      }
      return new Response('{}', { status: 200 });
    };

    await act(async () => {
      container.root.render(<Harness initialCountry="SA" initialNumber="0583347281" />);
    });
    await flushTicks();

    // Click send on number A (+966583347281)
    const sendButton = container.div.querySelectorAll('button')[0];
    await act(async () => {
      sendButton.click();
    });

    // While request is in flight, change number to B (+966551112233)
    const numberInput = container.div.querySelector('input[type="tel"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(numberInput, '0551112233');
    });
    await flushTicks();

    // Now resolve request A with success
    await act(async () => {
      deferredStart.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
    await flushTicks();

    // Stale success for A must NOT open OTP session for B
    assert.equal(
      container.div.querySelector('input[autoComplete="one-time-code"]'),
      null,
      'Stale success for old number does not affect new target'
    );

    // Stale failure check: start another request on B, change to C, reject B
    const deferredStartB = createDeferred<Response>();
    globalThis.fetch = async (url: any) => {
      if (String(url).includes('/api/whatsapp/verify/start')) {
        return deferredStartB.promise;
      }
      return new Response('{}', { status: 200 });
    };

    await act(async () => {
      sendButton.click();
    });

    await act(async () => {
      setInputValue(numberInput, '0562223344');
    });
    await flushTicks();

    // Resolve B with 502 provider error
    await act(async () => {
      deferredStartB.resolve(
        new Response(JSON.stringify({ messageEn: 'Provider failed' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
    await flushTicks();

    // Error for B must NOT be displayed on C
    const errorP = container.div.querySelector('p.text-rose-300');
    assert.equal(errorP, null, 'Stale error for old number does not affect new target');

    await container.cleanup();
  });

  // TEST 6: A -> B -> A does not revive an obsolete request
  await t.test('6. A -> B -> A does not revive an obsolete request', async () => {
    setAuthUser('user-1');
    const container = createTestContainer();

    const deferredOp1 = createDeferred<Response>();
    globalThis.fetch = async (url: any) => {
      if (String(url).includes('/api/whatsapp/verify/start')) {
        return deferredOp1.promise;
      }
      return new Response('{}', { status: 200 });
    };

    await act(async () => {
      container.root.render(<Harness initialCountry="SA" initialNumber="0583347281" />);
    });
    await flushTicks();

    // Send code on A
    const sendButton = container.div.querySelectorAll('button')[0];
    await act(async () => {
      sendButton.click();
    });

    const numberInput = container.div.querySelector('input[type="tel"]') as HTMLInputElement;

    // Change A -> B
    await act(async () => {
      setInputValue(numberInput, '0551112233');
    });
    await flushTicks();

    // Change B -> A
    await act(async () => {
      setInputValue(numberInput, '0583347281');
    });
    await flushTicks();

    // Now obsolete request 1 for A resolves
    await act(async () => {
      deferredOp1.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
    await flushTicks();

    // Obsolete request 1 must NOT open code session or activate cooldown on A
    assert.equal(
      container.div.querySelector('input[autoComplete="one-time-code"]'),
      null,
      'A -> B -> A did not revive obsolete request'
    );
    assert.doesNotMatch(sendButton.textContent || '', /Resend in/, 'No stale cooldown applied');

    await container.cleanup();
  });

  // TEST 7: Account changes and unmount invalidate outstanding operations
  await t.test('7. Account changes and unmount invalidate outstanding operations', async () => {
    setAuthUser('user-1');
    const container = createTestContainer();

    const deferredOp = createDeferred<Response>();
    globalThis.fetch = async (url: any) => {
      if (String(url).includes('/api/whatsapp/verify/start')) {
        return deferredOp.promise;
      }
      return new Response('{}', { status: 200 });
    };

    await act(async () => {
      container.root.render(<Harness initialCountry="SA" initialNumber="0583347281" />);
    });
    await flushTicks();

    const sendButton = container.div.querySelectorAll('button')[0];
    await act(async () => {
      sendButton.click();
    });

    // Switch account
    await act(async () => {
      setAuthUser('user-2');
    });
    await flushTicks();

    // Resolve deferred op
    await act(async () => {
      deferredOp.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
    await flushTicks();

    assert.equal(
      container.div.querySelector('input[autoComplete="one-time-code"]'),
      null,
      'Account change invalidated in-flight operation'
    );

    // Unmount test
    const deferredUnmount = createDeferred<Response>();
    globalThis.fetch = async (url: any) => {
      if (String(url).includes('/api/whatsapp/verify/start')) {
        return deferredUnmount.promise;
      }
      return new Response('{}', { status: 200 });
    };

    await act(async () => {
      sendButton.click();
    });

    // Cleanup unmounts component
    await container.cleanup();

    // Resolving after unmount must not throw or update state
    assert.doesNotThrow(async () => {
      deferredUnmount.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
  });

  // TEST 8: An obsolete finally callback cannot clear a newer operation’s loading lock
  await t.test('8. An obsolete finally callback cannot clear a newer operation’s loading lock', async () => {
    setAuthUser('user-1');
    const container = createTestContainer();

    const deferredOp1 = createDeferred<Response>();
    const deferredOp2 = createDeferred<Response>();
    let requestCount = 0;

    globalThis.fetch = async (url: any) => {
      if (String(url).includes('/api/whatsapp/verify/start')) {
        requestCount++;
        if (requestCount === 1) return deferredOp1.promise;
        return deferredOp2.promise;
      }
      return new Response('{}', { status: 200 });
    };

    await act(async () => {
      container.root.render(<Harness initialCountry="SA" initialNumber="0583347281" />);
    });
    await flushTicks();

    const sendButton = container.div.querySelectorAll('button')[0];

    // Start op 1
    await act(async () => {
      sendButton.click();
    });

    // Change number to B: invalidates op 1 and clears loading lock so B can proceed
    const numberInput = container.div.querySelector('input[type="tel"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(numberInput, '0551112233');
    });
    await flushTicks();

    // Start op 2 on number B
    await act(async () => {
      sendButton.click();
    });
    assert.equal(requestCount, 2, 'Second request initiated on number B');
    assert.ok(sendButton.disabled, 'Send button is disabled while op 2 is in flight');

    // Now op 1 completes and enters finally
    await act(async () => {
      deferredOp1.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
    await flushTicks();

    // Op 2 MUST STILL HAVE ITS LOADING LOCK (sendButton remains disabled)
    assert.ok(sendButton.disabled, 'Op 1 finally did NOT clear Op 2 loading lock');

    // Op 2 now completes
    await act(async () => {
      deferredOp2.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
    await flushTicks();

    // Op 2 completes and codeSent is true on number B
    assert.ok(container.div.querySelector('input[autoComplete="one-time-code"]'), 'Op 2 codeSent is true');

    await container.cleanup();
  });

  // TEST 9: Current successful verification invokes the correct callback
  await t.test('9. Current successful verification invokes the correct callback', async () => {
    setAuthUser('user-1');
    const container = createTestContainer();
    let verifiedCanonical: string | null = null;

    globalThis.fetch = async (url: any) => {
      if (String(url).includes('/api/whatsapp/verify/start')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (String(url).includes('/api/whatsapp/verify/check')) {
        return new Response(JSON.stringify({ success: true, whatsappTrusted: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('{}', { status: 200 });
    };

    await act(async () => {
      container.root.render(
        <Harness
          initialCountry="SA"
          initialNumber="0583347281"
          onVerifiedSpy={(v) => {
            verifiedCanonical = v;
          }}
        />
      );
    });
    await flushTicks();

    // Send code
    const sendButton = container.div.querySelectorAll('button')[0];
    await act(async () => {
      sendButton.click();
    });
    await flushTicks();

    // Enter OTP
    const otpInput = container.div.querySelector('input[autoComplete="one-time-code"]') as HTMLInputElement;
    assert.ok(otpInput, 'OTP input rendered');
    await act(async () => {
      setInputValue(otpInput, '654321');
    });
    await flushTicks();

    // Find and click verify button
    const confirmButton = container.div.querySelectorAll('button')[1];
    assert.ok(confirmButton, 'Confirm button exists');

    await act(async () => {
      confirmButton.click();
    });
    await flushTicks();

    // onVerified must have been called with canonical E.164
    assert.equal(verifiedCanonical, '+966583347281', 'onVerified called with canonical E.164');
    assert.match(container.div.textContent || '', /Verified via WhatsApp/, 'UI shows verified status');

    await container.cleanup();
  });

  // TEST 10: Duplicate submission remains prevented
  await t.test('10. Duplicate submission remains prevented', async () => {
    setAuthUser('user-1');
    const container = createTestContainer();

    let startFetchCount = 0;
    const deferred = createDeferred<Response>();

    globalThis.fetch = async (url: any) => {
      if (String(url).includes('/api/whatsapp/verify/start')) {
        startFetchCount++;
        return deferred.promise;
      }
      return new Response('{}', { status: 200 });
    };

    await act(async () => {
      container.root.render(<Harness initialCountry="SA" initialNumber="0583347281" />);
    });
    await flushTicks();

    const sendButton = container.div.querySelectorAll('button')[0];

    // First click
    await act(async () => {
      sendButton.click();
    });
    assert.equal(startFetchCount, 1, 'First click initiates fetch');

    // Repeated clicks while in flight
    await act(async () => {
      sendButton.click();
      sendButton.click();
    });
    assert.equal(startFetchCount, 1, 'Duplicate submissions while sending are ignored');

    // Resolve request
    await act(async () => {
      deferred.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
    await flushTicks();

    await container.cleanup();
  });
});
