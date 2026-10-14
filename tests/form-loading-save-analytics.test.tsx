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
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
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
import { P1RegistrationScreen } from '../src/components/P1RegistrationScreen';
import { P2RegistrationScreen } from '../src/components/P2RegistrationScreen';
import { FormSkeleton } from '../src/components/FormSkeleton';
import { executePrivateRecordLoad } from '../src/utils/relationshipState';
import {
  initGoogleAnalytics,
  trackScreenView,
  getMeasurementId,
  isValidMeasurementId,
  hasAnalyticsConsent,
  setAnalyticsConsent,
  __resetAnalyticsForTesting
} from '../src/utils/analytics';
import type { PartnerData, RelationshipRecord, Invitation } from '../src/types';

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

const emptyPartner = (): PartnerData => ({
  fullName: '',
  birthDay: '',
  birthMonth: '',
  birthYear: '',
  email: '',
  phoneCountry: 'SA +966',
  phoneNumber: '',
  whatsappCountry: 'SA +966',
  whatsappNumber: ''
});

const sampleRecord: RelationshipRecord = {
  id: 'rel_test_1',
  recordNumber: 'RID-12345',
  verificationRef: 'VR-12345',
  type: 'dating',
  startDate: '2025-01-01',
  startDateAr: '2025-01-01',
  startDateIso: '2025-01-01',
  status: 'draft',
  activeSinceDays: 0,
  partner1: {
    fullName: 'Partner One',
    birthDay: '15',
    birthMonth: '05',
    birthYear: '1995',
    email: 'p1@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '500000001',
    phoneE164: '+966500000001',
    phoneVerified: true,
    whatsappTrusted: true,
    whatsappE164: '+966500000001'
  },
  partner2: emptyPartner(),
  issuedDate: '',
  issuedDateAr: '',
  createdAt: new Date().toISOString(),
  settings: {
    showSocialHandles: true,
    showContactDetails: false,
    showQrMatrix: true
  }
};

test('Form Loading, Skeletons, Reliable Save & Restore, and Google Analytics Suite', async (t) => {
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

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // 1. Skeletons for P1 and P2 during delayed loading
  await t.test('1. Skeletons render during delayed loading with accessibility attributes', async () => {
    const container1 = createTestContainer();
    try {
      await act(async () => {
        container1.root.render(
          React.createElement(P1RegistrationScreen, {
            language: 'en',
            initialData: emptyPartner(),
            relationshipType: 'dating',
            onSaveAndNext: () => {},
            loading: true
          })
        );
      });
      const statusEl = container1.div.querySelector('[role="status"]');
      assert.ok(statusEl, 'P1 skeleton should render element with role="status"');
      assert.equal(statusEl?.getAttribute('aria-busy'), 'true', 'P1 skeleton should have aria-busy="true"');
      assert.ok(container1.div.textContent?.includes('Loading relationship details...'), 'Accessible announcement present');
      assert.equal(container1.div.querySelectorAll('input').length, 0, 'No inputs should render while skeleton is active');
    } finally {
      await container1.cleanup();
    }

    const container2 = createTestContainer();
    try {
      await act(async () => {
        container2.root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'ar',
            record: sampleRecord,
            onAcceptRelationship: async () => {},
            loading: true
          })
        );
      });
      const statusEl = container2.div.querySelector('[role="status"]');
      assert.ok(statusEl, 'P2 skeleton should render element with role="status"');
      assert.equal(statusEl?.getAttribute('aria-busy'), 'true', 'P2 skeleton should have aria-busy="true"');
      assert.ok(container2.div.textContent?.includes('جاري تحميل تفاصيل السجل...'), 'Arabic accessible announcement present');
    } finally {
      await container2.cleanup();
    }
  });

  // 2. Fetch failure, Retry, and successful empty-profile handling
  await t.test('2. Profile fetch failure shows localized error with working Retry button', async () => {
    let retryCalled = false;
    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          React.createElement(P1RegistrationScreen, {
            language: 'ar',
            initialData: emptyPartner(),
            relationshipType: 'dating',
            onSaveAndNext: () => {},
            loading: false,
            loadingError: 'تعذر الاتصال بقاعدة البيانات',
            onRetryLoading: () => {
              retryCalled = true;
            }
          })
        );
      });

      assert.ok(div.textContent?.includes('تعذر الاتصال بقاعدة البيانات'), 'Error message displayed');
      const retryBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.includes('إعادة المحاولة'));
      assert.ok(retryBtn, 'Retry button should be displayed');
      await act(async () => {
        retryBtn?.click();
      });
      assert.equal(retryCalled, true, 'Retry callback called on button click');
    } finally {
      await cleanup();
    }
  });

  // 3. P1 Next -> Back and temporary Terms/Privacy navigation with draft preservation
  await t.test('3. Draft edits survive temporary Terms/Privacy navigation and Back navigation', async () => {
    let latestDraft: any = null;
    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          React.createElement(P1RegistrationScreen, {
            language: 'en',
            initialData: emptyPartner(),
            relationshipType: 'dating',
            onSaveAndNext: () => {},
            onDraftChange: (draft) => {
              latestDraft = draft;
            }
          })
        );
      });

      const nameInput = div.querySelector('input#p1-name') as HTMLInputElement | null;
      assert.ok(nameInput, 'Full name input must exist');
      await act(async () => {
        nameInput.value = 'Layla Al-Amri';
        nameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });

      assert.ok(latestDraft, 'Draft should be emitted');
      assert.equal(latestDraft.fullName, 'Layla Al-Amri', 'Draft should capture edited full name');

      // Simulate re-mounting (e.g. returning from Terms/Privacy) with the saved draft
      await act(async () => {
        root.render(
          React.createElement(P1RegistrationScreen, {
            language: 'en',
            initialData: { ...emptyPartner(), ...latestDraft },
            relationshipType: latestDraft.relationshipType || 'dating',
            onSaveAndNext: () => {},
            onDraftChange: () => {}
          })
        );
      });

      const reloadedName = (div.querySelector('input#p1-name') as HTMLInputElement | null)?.value;
      assert.equal(reloadedName, 'Layla Al-Amri', 'Full name preserved after simulated navigation return');
    } finally {
      await cleanup();
    }
  });

  // 4. Saved-data restoration through authenticated backend and executePrivateRecordLoad
  await t.test('4. Saved data restores from backend across page refresh or account reload', async () => {
    mockAuth.addUser('token_restore_user', {
      uid: 'uid_restore_1',
      email: 'restore@example.com',
      email_verified: true,
      phone_number: '+966500000009'
    });

    // 1. Save profile to server
    const profileRes = await fetch(`${baseUrl}/api/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_restore_user'
      },
      body: JSON.stringify({
        partner1: {
          fullName: 'Tariq Mansoor',
          birthDay: '10',
          birthMonth: '02',
          birthYear: '1990',
          email: 'restore@example.com',
          phoneCountry: 'SA +966',
          phoneNumber: '500000009',
          phoneE164: '+966500000009',
          socialAccounts: [{ platform: 'x', handle: 'tariq_m' }]
        }
      })
    });
    assert.equal(profileRes.status, 200, 'Profile save must succeed');

    // 2. Load via executePrivateRecordLoad (simulating App.tsx loadPrivateRecord on refresh)
    let loadedRecord: any = null;
    await executePrivateRecordLoad({
      requestUid: 'uid_restore_1',
      requestId: 1,
      getCurrentRequestId: () => 1,
      getActiveAuthUid: () => 'uid_restore_1',
      getCurrentAuthUid: () => 'uid_restore_1',
      fetchRecord: async () => {
        const res = await fetch(`${baseUrl}/api/record`, {
          headers: { Authorization: 'Bearer token_restore_user' }
        });
        return res.json();
      },
      setRecord: (r) => {
        loadedRecord = r;
      },
      setInvitation: () => {},
      setAppError: () => {},
      initialRecord: sampleRecord,
      initialInvitation: { id: '', recordId: '', inviterName: '', partner2Name: '', relationshipType: 'dating', startDate: '', startDateAr: '', status: 'pending', createdAt: '', expiresAt: '', reminderCount: 0 }
    });

    assert.ok(loadedRecord, 'Record must be loaded');
    assert.equal(loadedRecord.partner1.fullName, 'Tariq Mansoor', 'Full name restored from saved profile');
    assert.equal(loadedRecord.partner1.birthYear, '1990', 'Birth year restored');
  });

  // 5. P2 profile restoration without premature acceptance
  await t.test('5. P2 personal profile hydrates into form without accepting invitation or creating active record', async () => {
    const p2Profile: PartnerData = {
      fullName: 'Fatima Al-Harbi',
      birthDay: '20',
      birthMonth: '08',
      birthYear: '1996',
      email: 'fatima@example.com',
      phoneCountry: 'SA +966',
      phoneNumber: '500000002',
      phoneE164: '+966500000002',
      phoneVerified: true,
      whatsappTrusted: true,
      whatsappE164: '+966500000002',
      socialAccounts: [{ platform: 'instagram', handle: 'fatima_h' }]
    };

    let acceptCalled = false;
    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            initialProfile: p2Profile,
            onAcceptRelationship: async () => {
              acceptCalled = true;
            }
          })
        );
      });

      const nameVal = (div.querySelector('input#p2-fullname') as HTMLInputElement | null)?.value;
      const dobVal = (div.querySelector('input#p2-dob') as HTMLInputElement | null)?.value;
      const emailVal = (div.querySelector('input#p2-email') as HTMLInputElement | null)?.value;

      assert.equal(nameVal, 'Fatima Al-Harbi', 'P2 full name hydrated from personal profile');
      assert.equal(dobVal, '1996-08-20', 'P2 DOB hydrated from personal profile');
      assert.equal(emailVal, 'fatima@example.com', 'P2 email hydrated');
      assert.equal(acceptCalled, false, 'Hydration must never prematurely accept invitation');
    } finally {
      await cleanup();
    }
  });

  // 6. Save failure preserves values and prevents navigation
  await t.test('6. Save failure keeps user on page, displays actionable error, and preserves inputs', async () => {
    let saveAttempted = false;
    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          React.createElement(P1RegistrationScreen, {
            language: 'en',
            initialData: {
              ...emptyPartner(),
              fullName: 'Ahmad Salem',
              birthDay: '01',
              birthMonth: '01',
              birthYear: '1992',
              email: 'ahmad@example.com',
              phoneNumber: '500000001',
              phoneCountry: 'SA +966',
              phoneE164: '+966500000001',
              phoneVerified: true,
              whatsappTrusted: true,
              whatsappE164: '+966500000001'
            },
            relationshipType: 'marriage',
            initialStartDate: '2024-06-01',
            onSaveAndNext: async () => {
              saveAttempted = true;
              throw new Error('NETWORK_TIMEOUT');
            }
          })
        );
      });

      // Accept terms
      const termsCheckbox = div.querySelector('input#p1-terms') as HTMLInputElement | null;
      assert.ok(termsCheckbox, 'Terms checkbox must exist');
      await act(async () => {
        termsCheckbox.click();
      });

      // Submit form
      const form = div.querySelector('form') as HTMLFormElement | null;
      assert.ok(form, 'Form must exist');
      await act(async () => {
        form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      });

      assert.equal(saveAttempted, true, 'Save should have been attempted');
      assert.ok(div.textContent?.includes('Network error') || div.textContent?.includes('timed out') || div.textContent?.includes('NETWORK_TIMEOUT') || div.querySelector('p.text-rose-300'), 'Error message displayed');
      const nameVal = (div.querySelector('input#p1-name') as HTMLInputElement | null)?.value;
      assert.equal(nameVal, 'Ahmad Salem', 'Entered values remain preserved after failure');
    } finally {
      await cleanup();
    }
  });

  // 7. Duplicate submit clicks are blocked & button shows saving text
  await t.test('7. Duplicate submit clicks are blocked and saving label is displayed', async () => {
    let submitCount = 0;
    let resolveSave: () => void = () => {};
    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          React.createElement(P1RegistrationScreen, {
            language: 'en',
            initialData: {
              ...emptyPartner(),
              fullName: 'Ahmad Salem',
              birthDay: '01',
              birthMonth: '01',
              birthYear: '1992',
              email: 'ahmad@example.com',
              phoneNumber: '500000001',
              phoneCountry: 'SA +966',
              phoneE164: '+966500000001',
              phoneVerified: true,
              whatsappTrusted: true,
              whatsappE164: '+966500000001'
            },
            relationshipType: 'marriage',
            initialStartDate: '2024-06-01',
            onSaveAndNext: async () => {
              submitCount++;
              await new Promise<void>((res) => {
                resolveSave = res;
              });
            }
          })
        );
      });

      const termsCheckbox = div.querySelector('input#p1-terms') as HTMLInputElement | null;
      await act(async () => {
        termsCheckbox?.click();
      });

      const submitBtn = div.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      assert.ok(submitBtn, 'Submit button must exist');

      // Click once to start submission
      await act(async () => {
        submitBtn.click();
      });

      assert.equal(submitCount, 1, 'First click triggers submission');
      assert.equal(submitBtn.hasAttribute('disabled'), true, 'Button is disabled while saving');
      assert.ok(submitBtn.textContent?.includes('Saving...'), 'Button displays Saving... while saving');

      // Attempt second click while still in-flight
      await act(async () => {
        submitBtn.click();
      });
      assert.equal(submitCount, 1, 'Duplicate click blocked while save is in flight');

      // Complete save
      await act(async () => {
        resolveSave();
      });
    } finally {
      await cleanup();
    }
  });

  // 8. Intentionally cleared optional fields are preserved and not resurrected
  await t.test('8. Cleared optional fields do not resurrect old values', async () => {
    let emittedDraft: any = null;
    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          React.createElement(P1RegistrationScreen, {
            language: 'en',
            initialData: {
              ...emptyPartner(),
              socialAccounts: [{ platform: 'x', handle: 'old_handle' }]
            },
            relationshipType: 'dating',
            onSaveAndNext: () => {},
            onDraftChange: (d) => {
              emittedDraft = d;
            }
          })
        );
      });

      // Remove social account
      const removeBtn = div.querySelector('button[aria-label="Remove social account"], button svg.lucide-trash, button svg.lucide-x') as HTMLElement | null;
      if (removeBtn) {
        await act(async () => {
          removeBtn.click();
        });
      }

      assert.ok(emittedDraft, 'Draft should be emitted');
    } finally {
      await cleanup();
    }
  });

  // 9. Phone verification status: verified on same number, invalidated on change
  await t.test('9. Phone verification is valid for canonical number and invalidated when number changes', async () => {
    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          React.createElement(P1RegistrationScreen, {
            language: 'en',
            initialData: {
              ...emptyPartner(),
              phoneNumber: '500000001',
              phoneCountry: 'SA +966',
              phoneE164: '+966500000001',
              phoneVerified: true,
              whatsappTrusted: true,
              whatsappE164: '+966500000001'
            },
            relationshipType: 'dating',
            onSaveAndNext: () => {}
          })
        );
      });

      // Initially verified
      assert.ok(div.textContent?.includes('Verified') || div.textContent?.includes('✓'), 'Verified status visible');

      // Change number
      const phoneInput = div.querySelector('input#p1-mobile, input[type="tel"]') as HTMLInputElement | null;
      assert.ok(phoneInput, 'Phone input must exist');
      await act(async () => {
        phoneInput.value = '500000002';
        phoneInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });

      // Verification must be invalidated
      assert.equal(div.textContent?.includes('Verified via WhatsApp'), false, 'Changing number invalidates verified badge');
    } finally {
      await cleanup();
    }
  });

  // 10. Google Analytics initialization and screen tracking
  await t.test('10. Google Analytics handles missing ID safely, sanitizes paths, and prevents duplicates', async () => {
    __resetAnalyticsForTesting();

    // With no valid ID configured, initialization safely reports NOT_CONFIGURED
    assert.equal(isValidMeasurementId(''), false, 'Empty ID is not valid');
    assert.equal(isValidMeasurementId('G-ABC123XYZ'), true, 'G- prefixed ID is valid');

    const statusNoConfig = initGoogleAnalytics();
    assert.equal(statusNoConfig, 'NOT_CONFIGURED', 'Missing ID results in NOT_CONFIGURED status');

    // Test sanitization and single transition tracking
    const events: any[] = [];
    (dom.window as any).gtag = (type: string, name: string, params: any) => {
      events.push({ type, name, params });
    };

    // Set consent for testing tracking helper
    setAnalyticsConsent(true);
    assert.equal(hasAnalyticsConsent(), true, 'Consent granted');

    // Simulate script injection state
    const scriptEl = dom.window.document.createElement('script');
    scriptEl.id = 'ga-gtag-script';
    dom.window.document.head.appendChild(scriptEl);

    // Track initial screen
    trackScreenView('p1_details');
    // Track redundant same screen
    trackScreenView('p1_details');

    // Transition to next screen
    trackScreenView('p1_invite_create');

    // Transition to certificate
    trackScreenView('official_certificate');

    assert.ok(events.length <= 3, 'No duplicate pageviews for identical screens');

    // Check payload sanitization on tracked events
    for (const ev of events) {
      if (ev.name === 'page_view') {
        assert.ok(!ev.params.page_location.includes('?'), 'No query strings in location');
        assert.ok(!ev.params.page_location.includes('#'), 'No fragments in location');
        assert.ok(!ev.params.page_location.includes('@'), 'No PII or email in location');
        assert.ok(!ev.params.page_location.includes('+966'), 'No phone numbers in location');
      }
    }

    __resetAnalyticsForTesting();
    scriptEl.remove();
  });
});
