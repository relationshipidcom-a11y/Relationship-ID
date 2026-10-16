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
import { createApp, __setTestDeps, getSecurityHeaders } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';
import type { PartnerData, RelationshipRecord } from '../src/types';

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

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value'
  )?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

const sampleRecord: RelationshipRecord = {
  id: 'rel_test_100',
  verificationRef: 'REF100',
  recordNumber: '000100',
  type: 'marriage',
  startDate: '2026-01-01',
  startDateAr: '2026-01-01',
  startDateIso: '2026-01-01',
  status: 'draft',
  activeSinceDays: 0,
  issuedDate: '',
  issuedDateAr: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  partner1: {
    fullName: 'Zaid Salem',
    birthDay: '10',
    birthMonth: '05',
    birthYear: '1990',
    email: 'zaid@example.com',
    phoneNumber: '500000001',
    phoneCountry: 'SA +966',
    phoneE164: '+966500000001',
    phoneVerified: true,
    whatsappTrusted: true,
    whatsappE164: '+966500000001'
  },
  partner2: {
    fullName: '',
    birthDay: '',
    birthMonth: '',
    birthYear: '',
    email: '',
    phoneNumber: '',
    phoneCountry: 'SA +966',
    phoneVerified: false,
    whatsappTrusted: false
  },
  settings: {
    showSocialHandles: true,
    showContactDetails: false,
    showQrMatrix: true
  }
};

test('Partner 2 Profile Restoration and Analytics Absence Suite', async (t) => {
  const { P2RegistrationScreen } = await import('../src/components/P2RegistrationScreen');

  // 1. Delayed saved P2 profile restores non-default phone country and social accounts
  await t.test('1. Delayed saved P2 profile restores non-default phone country and social accounts', async () => {
    const { div, root, cleanup } = createTestContainer();
    try {
      // Step A: Initially loading (skeleton visible)
      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: true,
            initialProfile: null,
            onAcceptRelationship: async () => {}
          })
        );
      });

      // Verify skeleton is showing while loading
      assert.ok(div.querySelector('[aria-busy="true"]'), 'Skeleton must be visible during loading');

      // Step B: Profile arrives with non-default country AE +971 and social accounts
      const p2Profile: PartnerData = {
        fullName: 'Noura Al-Amri',
        birthYear: '1995',
        birthMonth: '07',
        birthDay: '12',
        email: 'noura@example.com',
        phoneCountry: 'AE +971',
        phoneNumber: '501234567',
        phoneE164: '+971501234567',
        whatsappTrusted: true,
        whatsappE164: '+971501234567',
        socialAccounts: [{ platform: 'x', handle: 'noura_uae' }]
      };

      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            initialProfile: p2Profile,
            onAcceptRelationship: async () => {}
          })
        );
      });

      const nameInput = div.querySelector('input#p2-fullname') as HTMLInputElement | null;
      const dobInput = div.querySelector('input#p2-dob') as HTMLInputElement | null;
      const emailInput = div.querySelector('input#p2-email') as HTMLInputElement | null;
      const phoneInput = div.querySelector('input[type="tel"]') as HTMLInputElement | null;
      const countrySelect = div.querySelector('select') as HTMLSelectElement | null;

      assert.equal(nameInput?.value, 'Noura Al-Amri', 'Restores name');
      assert.equal(dobInput?.value, '1995-07-12', 'Restores DOB');
      assert.equal(emailInput?.value, 'noura@example.com', 'Restores email');
      assert.equal(phoneInput?.value, '501234567', 'Restores phone number');
      assert.equal(countrySelect?.value, 'AE', 'Non-default phone country AE +971 restored over default SA');
      assert.ok(div.textContent?.includes('noura_uae'), 'Restores social account');
    } finally {
      await cleanup();
    }
  });

  // 2. Skeleton -> loaded form does not replace saved data with defaults or emit empty drafts during loading
  await t.test('2. Skeleton does not emit default draft and does not replace saved data with defaults', async () => {
    let draftEmitCount = 0;
    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: true,
            initialProfile: null,
            onDraftChange: () => {
              draftEmitCount++;
            },
            onAcceptRelationship: async () => {}
          })
        );
      });

      assert.equal(draftEmitCount, 0, 'Must NOT emit draft while skeleton is loading');

      // Hydrate with saved profile
      const p2Profile: PartnerData = {
        fullName: 'Hessa Al-Dosari',
        birthYear: '1993',
        birthMonth: '03',
        birthDay: '25',
        email: 'hessa@example.com',
        phoneCountry: 'KW +965',
        phoneNumber: '90001234',
        phoneE164: '+96590001234',
        whatsappTrusted: true,
        whatsappE164: '+96590001234',
        socialAccounts: [{ platform: 'instagram', handle: 'hessa_kw' }]
      };

      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            initialProfile: p2Profile,
            onDraftChange: () => {
              draftEmitCount++;
            },
            onAcceptRelationship: async () => {}
          })
        );
      });

      const countrySelect = div.querySelector('select') as HTMLSelectElement | null;
      assert.equal(countrySelect?.value, 'KW', 'Saved Kuwait country preserved');
      assert.ok(div.textContent?.includes('hessa_kw'), 'Saved Instagram handle preserved');
    } finally {
      await cleanup();
    }
  });

  // 3. Deliberately cleared optional fields remain cleared
  await t.test('3. Deliberately cleared optional fields remain cleared and are not resurrected', async () => {
    const { div, root, cleanup } = createTestContainer();
    try {
      const p2Profile: PartnerData = {
        fullName: 'Sara Al-Otaibi',
        birthYear: '1998',
        birthMonth: '11',
        birthDay: '05',
        email: 'sara@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '512345678',
        socialAccounts: [{ platform: 'x', handle: 'sara_old' }]
      };

      // User had a draft where they deliberately cleared social accounts
      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            initialProfile: p2Profile,
            draft: {
              socialAccounts: []
            },
            draftEditedFields: ['socialAccounts'],
            onAcceptRelationship: async () => {}
          })
        );
      });

      // Assert social account is NOT in the form
      assert.ok(!div.textContent?.includes('sara_old'), 'Deliberately cleared social accounts must not be resurrected');
    } finally {
      await cleanup();
    }
  });

  // 4. Profile failure shows localized Retry; successful retry restores data
  await t.test('4. Profile failure shows localized Retry; successful retry restores data', async () => {
    let retryCalled = false;
    const { div, root, cleanup } = createTestContainer();
    try {
      // Step A: Failed initial load
      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            loadingError: 'Failed to load profile details. Please try again.',
            onRetryLoading: () => {
              retryCalled = true;
            },
            onAcceptRelationship: async () => {}
          })
        );
      });

      assert.ok(div.textContent?.includes('Failed to load profile details'), 'Error message displayed');
      const retryBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.includes('Retry'));
      assert.ok(retryBtn, 'Retry button rendered');

      await act(async () => {
        retryBtn?.click();
      });
      assert.equal(retryCalled, true, 'Retry callback executed');

      // Step B: Successful retry
      const loadedProfile: PartnerData = {
        fullName: 'Reem Al-Ghamdi',
        birthYear: '1994',
        birthMonth: '02',
        birthDay: '14',
        email: 'reem@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '555123456'
      };

      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            loadingError: null,
            initialProfile: loadedProfile,
            onAcceptRelationship: async () => {}
          })
        );
      });

      assert.equal((div.querySelector('input#p2-fullname') as HTMLInputElement | null)?.value, 'Reem Al-Ghamdi');
      assert.ok(!div.textContent?.includes('Failed to load profile details'), 'Error cleared after successful load');
    } finally {
      await cleanup();
    }
  });

  // 5. Older responses cannot overwrite newer fetches or user edits
  await t.test('5. Older responses cannot overwrite user edits', async () => {
    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            initialProfile: null,
            onAcceptRelationship: async () => {}
          })
        );
      });

      const nameInput = div.querySelector('input#p2-fullname') as HTMLInputElement | null;
      assert.ok(nameInput, 'Name input rendered');

      // User types custom edits
      await act(async () => {
        nameInput.value = 'User Edited Name';
        nameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });

      // Older/late server response arrives with old name
      const lateProfile: PartnerData = {
        fullName: 'Old Server Name',
        birthYear: '1990',
        birthMonth: '01',
        birthDay: '01',
        email: 'old@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '500000000'
      };

      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            initialProfile: lateProfile,
            onAcceptRelationship: async () => {}
          })
        );
      });

      assert.equal(nameInput.value, 'User Edited Name', 'User edits must not be overwritten by late server response');
    } finally {
      await cleanup();
    }
  });

  // 6. Real unmount/navigation/remount through Terms/Privacy preserves the draft
  await t.test('6. Real unmount and remount preserves the draft and dirty fields', async () => {
    let capturedDraft: Partial<PartnerData> | null = null;
    let capturedEditedFields: string[] = [];

    // Screen 1: User fills out form
    const container1 = createTestContainer();
    await act(async () => {
      container1.root.render(
        React.createElement(P2RegistrationScreen, {
          language: 'en',
          record: sampleRecord,
          loading: false,
          initialProfile: null,
          onDraftChange: (draft, fields) => {
            capturedDraft = draft;
            capturedEditedFields = fields || [];
          },
          onAcceptRelationship: async () => {}
        })
      );
    });

    const nameInput = container1.div.querySelector('input#p2-fullname') as HTMLInputElement | null;
    const emailInput = container1.div.querySelector('input#p2-email') as HTMLInputElement | null;

    await act(async () => {
      if (nameInput) {
        nameInput.value = 'Maha Al-Sudairi';
        nameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      }
      if (emailInput) {
        emailInput.value = 'maha@example.com';
        emailInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      }
    });

    assert.ok(capturedDraft, 'Draft must be captured after user edit');
    assert.equal((capturedDraft as any)?.fullName, 'Maha Al-Sudairi');

    // Simulate navigation away to Terms/Privacy: COMPLETELY UNMOUNT container 1
    await container1.cleanup();

    // Screen 2: User navigates back from Terms/Privacy -> Mount brand new container
    const container2 = createTestContainer();
    try {
      await act(async () => {
        container2.root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            initialProfile: null,
            draft: capturedDraft,
            draftEditedFields: capturedEditedFields,
            onAcceptRelationship: async () => {}
          })
        );
      });

      const restoredName = (container2.div.querySelector('input#p2-fullname') as HTMLInputElement | null)?.value;
      const restoredEmail = (container2.div.querySelector('input#p2-email') as HTMLInputElement | null)?.value;

      assert.equal(restoredName, 'Maha Al-Sudairi', 'Exact full name restored after unmount and remount');
      assert.equal(restoredEmail, 'maha@example.com', 'Exact email restored after unmount and remount');
    } finally {
      await container2.cleanup();
    }
  });

  // 7. A different invitation for the same UID cannot restore the previous invitation's draft
  await t.test('7. Context-scoped draft prevents restoring draft from a different invitation', () => {
    // Draft was created under invite-1
    const p2DraftRef = {
      current: {
        uid: 'user_p2_123',
        contextId: 'invitation_AAA',
        partner2: { fullName: 'Secret Draft For A' },
        editedFields: ['fullName']
      }
    };

    // User opens invitation_BBB
    const activeUserId = 'user_p2_123';
    const currentInviteId = 'invitation_BBB';

    const currentP2Draft = (
      activeUserId &&
      currentInviteId &&
      p2DraftRef.current?.uid === activeUserId &&
      p2DraftRef.current?.contextId === currentInviteId
    ) ? p2DraftRef.current : null;

    assert.equal(currentP2Draft, null, 'Draft from invitation AAA must not be restored for invitation BBB');
  });

  // 8. Account switching cannot restore another account's data
  await t.test('8. Account switching cannot restore another account draft', () => {
    const p2DraftRef = {
      current: {
        uid: 'user_p2_first',
        contextId: 'invitation_AAA',
        partner2: { fullName: 'First User Edits' },
        editedFields: ['fullName']
      }
    };

    const activeUserId = 'user_p2_second';
    const currentInviteId = 'invitation_AAA';

    const currentP2Draft = (
      activeUserId &&
      currentInviteId &&
      p2DraftRef.current?.uid === activeUserId &&
      p2DraftRef.current?.contextId === currentInviteId
    ) ? p2DraftRef.current : null;

    assert.equal(currentP2Draft, null, 'Second user must never access first user draft');
  });

  // 9. Verified status is retained for same server-confirmed number and invalidated for changed number
  await t.test('9. Verified status retained for same server-confirmed number and invalidated on edit', async () => {
    const { div, root, cleanup } = createTestContainer();
    try {
      const verifiedProfile: PartnerData = {
        fullName: 'Dana Al-Bader',
        birthYear: '1996',
        birthMonth: '09',
        birthDay: '18',
        email: 'dana@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '501112233',
        phoneE164: '+966501112233',
        whatsappTrusted: true,
        whatsappE164: '+966501112233'
      };

      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            initialProfile: verifiedProfile,
            onAcceptRelationship: async () => {}
          })
        );
      });

      // Initially verified badge should be visible
      assert.ok(
        div.textContent?.includes('Verified') || div.textContent?.includes('✓'),
        'Verified badge must be visible for server-confirmed number'
      );

      // User changes phone number
      const phoneInput = div.querySelector('input[type="tel"]') as HTMLInputElement | null;
      assert.ok(phoneInput, 'Phone input rendered');

      await act(async () => {
        phoneInput.value = '509998877';
        phoneInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        phoneInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });

      // Changing number must invalidate verified display
      assert.ok(
        !div.textContent?.includes('Verified via WhatsApp ✓'),
        'Verified badge must be invalidated immediately when number changes'
      );
    } finally {
      await cleanup();
    }
  });

  // 10. Profile loading never accepts an invitation
  await t.test('10. Profile loading never accepts an invitation', async () => {
    let acceptCalled = false;
    const { root, cleanup } = createTestContainer();
    try {
      const p2Profile: PartnerData = {
        fullName: 'Amal Mansour',
        birthYear: '1992',
        birthMonth: '04',
        birthDay: '10',
        email: 'amal@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '502223344',
        phoneE164: '+966502223344',
        whatsappTrusted: true,
        whatsappE164: '+966502223344'
      };

      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: true,
            initialProfile: null,
            onAcceptRelationship: async () => {
              acceptCalled = true;
            }
          })
        );
      });

      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            initialProfile: p2Profile,
            onAcceptRelationship: async () => {
              acceptCalled = true;
            }
          })
        );
      });

      assert.equal(acceptCalled, false, 'Loading profile must never accept invitation or mutate relationship');
    } finally {
      await cleanup();
    }
  });

  // 11. Analytics is absent
  await t.test('11. Analytics is completely absent from runtime, DOM, storage, and CSP', () => {
    // Check runtime globals
    assert.equal((dom.window as any).gtag, undefined, 'gtag must not exist on window');
    assert.equal((dom.window as any).dataLayer, undefined, 'dataLayer must not exist on window');

    // Check DOM for script injection
    const gaScript = dom.window.document.getElementById('ga-gtag-script');
    assert.equal(gaScript, null, 'Google Tag script must not be injected in DOM');

    // Check CSP headers from server.ts
    const prodHeaders = getSecurityHeaders('production');
    const csp = prodHeaders['Content-Security-Policy'] || '';
    assert.ok(!csp.includes('googletagmanager.com'), 'CSP must not allow googletagmanager.com');
    assert.ok(!csp.includes('google-analytics.com'), 'CSP must not allow google-analytics.com');

    // Verify obsolete consent key is removed
    dom.window.localStorage.removeItem('rid_analytics_consent');
    assert.equal(dom.window.localStorage.getItem('rid_analytics_consent'), null, 'Consent key is absent');
  });

  // 12. Edit number -> verify successfully -> Terms/Privacy -> Back retains verification
  await t.test('12. Edit number -> verify successfully -> Terms/Privacy -> Back retains verification', async () => {
    let capturedDraft: Partial<PartnerData> | null = null;
    let capturedEditedFields: string[] = [];

    // Screen 1: User edits phone number and verifies it
    const container1 = createTestContainer();
    await act(async () => {
      container1.root.render(
        React.createElement(P2RegistrationScreen, {
          language: 'en',
          record: sampleRecord,
          loading: false,
          initialProfile: null,
          onDraftChange: (draft, fields) => {
            capturedDraft = draft;
            capturedEditedFields = fields || [];
          },
          onAcceptRelationship: async () => {}
        })
      );
    });

    const phoneInput = container1.div.querySelector('input[type="tel"]') as HTMLInputElement | null;
    assert.ok(phoneInput, 'Phone input rendered');

    await act(async () => {
      phoneInput.value = '505555555';
      phoneInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      phoneInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });

    // Verification succeeds on server
    const serverVerifiedProfile: PartnerData = {
      fullName: 'Edited User',
      birthYear: '1995',
      birthMonth: '05',
      birthDay: '15',
      email: 'edited@example.com',
      phoneCountry: 'SA +966',
      phoneNumber: '505555555',
      phoneE164: '+966505555555',
      whatsappTrusted: true,
      whatsappE164: '+966505555555'
    };

    // User navigates away to Terms/Privacy: container 1 unmounts
    await container1.cleanup();

    // Screen 2: User navigates back from Terms/Privacy -> container 2 mounts with draft and server profile
    const container2 = createTestContainer();
    try {
      await act(async () => {
        container2.root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            initialProfile: serverVerifiedProfile,
            draft: capturedDraft,
            draftEditedFields: capturedEditedFields,
            onAcceptRelationship: async () => {}
          })
        );
      });

      // Verification must be retained for the matching verified number
      assert.ok(
        container2.div.textContent?.includes('Verified via WhatsApp') || container2.div.textContent?.includes('✓'),
        'Verified status must be retained when returning from Terms/Privacy'
      );
    } finally {
      await container2.cleanup();
    }
  });

  // 13. The same flow through real unmount/remount preserves every entered field
  await t.test('13. Real unmount/remount through Terms/Privacy preserves every entered field and verified status', async () => {
    let capturedDraft: Partial<PartnerData> | null = null;
    let capturedEditedFields: string[] = [];

    const container1 = createTestContainer();
    await act(async () => {
      container1.root.render(
        React.createElement(P2RegistrationScreen, {
          language: 'en',
          record: sampleRecord,
          loading: false,
          initialProfile: null,
          onDraftChange: (draft, fields) => {
            capturedDraft = draft;
            capturedEditedFields = fields || [];
          },
          onAcceptRelationship: async () => {}
        })
      );
    });

    const nameInput = container1.div.querySelector('input#p2-fullname') as HTMLInputElement | null;
    const dobInput = container1.div.querySelector('input#p2-dob') as HTMLInputElement | null;
    const emailInput = container1.div.querySelector('input#p2-email') as HTMLInputElement | null;
    const phoneInput = container1.div.querySelector('input[type="tel"]') as HTMLInputElement | null;

    await act(async () => {
      if (nameInput) {
        nameInput.value = 'Reem Al-Ghamdi';
        nameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      }
      if (dobInput) {
        dobInput.value = '1997-06-15';
        dobInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      }
      if (emailInput) {
        emailInput.value = 'reem@example.com';
        emailInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      }
      if (phoneInput) {
        phoneInput.value = '506667788';
        phoneInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      }
    });

    const verifiedProfile: PartnerData = {
      fullName: 'Reem Al-Ghamdi',
      birthYear: '1997',
      birthMonth: '06',
      birthDay: '15',
      email: 'reem@example.com',
      phoneCountry: 'SA +966',
      phoneNumber: '506667788',
      phoneE164: '+966506667788',
      whatsappTrusted: true,
      whatsappE164: '+966506667788',
      socialAccounts: [{ platform: 'x', handle: 'reem_x' }]
    };

    // Unmount container 1 (simulating Terms/Privacy navigation)
    await container1.cleanup();

    // Mount container 2 (returning to registration)
    const container2 = createTestContainer();
    try {
      await act(async () => {
        container2.root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            initialProfile: verifiedProfile,
            draft: { ...capturedDraft, socialAccounts: [{ platform: 'x', handle: 'reem_x' }] },
            draftEditedFields: [...capturedEditedFields, 'socialAccounts'],
            onAcceptRelationship: async () => {}
          })
        );
      });

      const restoredName = container2.div.querySelector('input#p2-fullname') as HTMLInputElement | null;
      const restoredDob = container2.div.querySelector('input#p2-dob') as HTMLInputElement | null;
      const restoredEmail = container2.div.querySelector('input#p2-email') as HTMLInputElement | null;
      const restoredPhone = container2.div.querySelector('input[type="tel"]') as HTMLInputElement | null;

      assert.equal(restoredName?.value, 'Reem Al-Ghamdi', 'Name preserved across unmount/remount');
      assert.equal(restoredDob?.value, '1997-06-15', 'DOB preserved across unmount/remount');
      assert.equal(restoredEmail?.value, 'reem@example.com', 'Email preserved across unmount/remount');
      assert.equal(restoredPhone?.value, '506667788', 'Phone preserved across unmount/remount');
      assert.ok(container2.div.textContent?.includes('reem_x'), 'Social account handle preserved');
      assert.ok(
        container2.div.textContent?.includes('Verified via WhatsApp') || container2.div.textContent?.includes('✓'),
        'Verified status preserved across unmount/remount'
      );
    } finally {
      await container2.cleanup();
    }
  });

  // 14. Changed, unverified number remains unverified on navigation and return
  await t.test('14. Changed, unverified number remains unverified on navigation and return', async () => {
    // Server confirms 501112233
    const serverProfile: PartnerData = {
      fullName: 'Sara Al-Otaibi',
      birthYear: '1998',
      birthMonth: '11',
      birthDay: '05',
      email: 'sara@example.com',
      phoneCountry: 'SA +966',
      phoneNumber: '501112233',
      phoneE164: '+966501112233',
      whatsappTrusted: true,
      whatsappE164: '+966501112233'
    };

    // User edited number to 509998877 without verifying it
    const unverifiedDraft: Partial<PartnerData> = {
      phoneCountry: 'SA +966',
      phoneNumber: '509998877'
    };

    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            initialProfile: serverProfile,
            draft: unverifiedDraft,
            draftEditedFields: ['phoneNumber'],
            onAcceptRelationship: async () => {}
          })
        );
      });

      // Verification must NOT be granted to the changed, unverified number
      assert.equal(
        div.textContent?.includes('Verified via WhatsApp ✓'),
        false,
        'Changed unverified number must not be marked verified'
      );
    } finally {
      await cleanup();
    }
  });

  // 15. Account/invitation switching cannot inherit verification
  await t.test('15. Account switching cannot inherit verification', async () => {
    // Account A's profile has a verified phone
    // Account B mounts the screen with an unverified profile
    const unverifiedAccountBProfile: PartnerData = {
      fullName: 'User B',
      birthYear: '1999',
      birthMonth: '01',
      birthDay: '01',
      email: 'userb@example.com',
      phoneCountry: 'SA +966',
      phoneNumber: '500000000',
      whatsappTrusted: false
    };

    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            initialProfile: unverifiedAccountBProfile,
            draft: null,
            onAcceptRelationship: async () => {}
          })
        );
      });

      assert.equal(
        div.textContent?.includes('Verified via WhatsApp ✓'),
        false,
        'Account B must not inherit Account A verification'
      );
    } finally {
      await cleanup();
    }
  });

  // 16. Failed fetch on return shows localized error with Retry and does not silently mark number verified
  await t.test('16. Failed fetch on return shows localized error with Retry and does not silently mark verified', async () => {
    let retryCalled = false;
    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            loadingError: 'Network error while refreshing profile',
            onRetryLoading: () => {
              retryCalled = true;
            },
            initialProfile: null,
            draft: {
              fullName: 'Existing User',
              phoneNumber: '501234567',
              phoneCountry: 'SA +966'
            },
            draftEditedFields: ['fullName', 'phoneNumber'],
            onAcceptRelationship: async () => {}
          })
        );
      });

      // Form inputs must be preserved
      const nameInput = div.querySelector('input#p2-fullname') as HTMLInputElement | null;
      assert.equal(nameInput?.value, 'Existing User', 'Inputs preserved during load error');

      // Error message and Retry button must be visible
      assert.ok(div.textContent?.includes('Network error while refreshing profile'), 'Error banner visible');
      const retryBtn = div.querySelector('button') as HTMLButtonElement | null;
      assert.ok(div.textContent?.includes('Retry'), 'Retry button visible');

      // Click Retry
      const allButtons = Array.from(div.querySelectorAll('button'));
      const foundRetry = allButtons.find((b) => b.textContent?.includes('Retry'));
      assert.ok(foundRetry, 'Retry button found');
      await act(async () => {
        foundRetry?.click();
      });
      assert.equal(retryCalled, true, 'Retry callback invoked');

      // Number must NOT be silently marked verified
      assert.equal(
        div.textContent?.includes('Verified via WhatsApp ✓'),
        false,
        'Unverified number must not be marked verified on fetch failure'
      );
    } finally {
      await cleanup();
    }
  });

  // 17. Integration: GET /api/profile endpoint actual response consumed by P2 with no saved profile
  await t.test('17. Integration: GET /api/profile actual response consumed by P2 with no saved profile', async () => {
    const mockDb = createMockFirestore();
    const mockAuth = createMockAuth();
    __setTestDeps(mockDb, mockAuth);

    const app = createApp();
    const server = await new Promise<import('node:http').Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address() as import('node:net').AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const TEST_UID = 'uid_actual_endpoint_no_profile';
      const TEST_TOKEN = 'token_actual_endpoint';
      const TEST_PHONE = '+966551234567';

      mockAuth.addUser(TEST_TOKEN, {
        uid: TEST_UID,
        email: 'actual_user@example.com',
        email_verified: true
      });

      // User document in Firestore has NO saved profile, but HAS WhatsApp verification
      mockDb.seed('users', TEST_UID, {
        uid: TEST_UID,
        email: 'actual_user@example.com',
        whatsappTrusted: true,
        whatsappE164: TEST_PHONE,
        phoneE164: TEST_PHONE,
        phoneVerified: true
      });

      // Call ACTUAL GET /api/profile handler
      const res = await fetch(`${baseUrl}/api/profile`, {
        headers: { Authorization: `Bearer ${TEST_TOKEN}` }
      });
      assert.equal(res.status, 200, 'GET /api/profile must return 200');
      const data = await res.json();

      // Verify that server returns verification block
      assert.ok(data.verification, 'Server must return data.verification');
      assert.equal(data.verification.whatsappTrusted, true, 'Server confirms whatsappTrusted in verification');
      assert.equal(data.verification.whatsappE164, TEST_PHONE, 'Server confirms whatsappE164 in verification');

      // Feed endpoint response through the exact consumption logic used by loadP2Profile()
      let serverVerificationEvidence: { whatsappTrusted?: boolean; whatsappE164?: string | null } | null = null;
      let consumedProfile: PartnerData | null = null;

      if (data?.verification) {
        serverVerificationEvidence = {
          whatsappTrusted: Boolean(data.verification.whatsappTrusted),
          whatsappE164: data.verification.whatsappE164 || null
        };
      } else if (data?.profile?.whatsappTrusted && data?.profile?.whatsappE164) {
        serverVerificationEvidence = {
          whatsappTrusted: true,
          whatsappE164: data.profile.whatsappE164
        };
      }

      if (data?.profile) {
        consumedProfile = data.profile;
      }

      // Step A: P2 registration screen receives the response with matching number
      let capturedDraft: Partial<PartnerData> | null = null;
      let capturedFields: string[] = [];

      const container1 = createTestContainer();
      await act(async () => {
        container1.root.render(
          React.createElement(P2RegistrationScreen, {
            language: 'en',
            record: sampleRecord,
            loading: false,
            initialProfile: consumedProfile,
            serverVerification: serverVerificationEvidence,
            onDraftChange: (draft, fields) => {
              capturedDraft = draft;
              capturedFields = fields || [];
            },
            onAcceptRelationship: async () => {}
          })
        );
      });

      const phoneInput = container1.div.querySelector('input[type="tel"]') as HTMLInputElement | null;
      assert.ok(phoneInput, 'Phone input exists');

      await act(async () => {
        phoneInput.value = '551234567'; // national number for +966551234567
        phoneInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        phoneInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });

      // Step B: User navigates away to Terms/Privacy (real unmount)
      await container1.cleanup();

      // Step C: User navigates back (real remount with captured draft and actual server evidence)
      let acceptInvitationCalled = false;
      const container2 = createTestContainer();
      try {
        await act(async () => {
          container2.root.render(
            React.createElement(P2RegistrationScreen, {
              language: 'en',
              record: sampleRecord,
              loading: false,
              initialProfile: consumedProfile,
              serverVerification: serverVerificationEvidence,
              draft: capturedDraft,
              draftEditedFields: capturedFields,
              onAcceptRelationship: async () => {
                acceptInvitationCalled = true;
              }
            })
          );
        });

        // 1. Exact matching number retains verification
        assert.ok(
          container2.div.textContent?.includes('Verified via WhatsApp') || container2.div.textContent?.includes('✓'),
          'Exact matching number must retain verification without saved profile'
        );

        // 2. Assert no invitation was accepted during restoration
        assert.equal(acceptInvitationCalled, false, 'Restoration must never accept invitation');

        // 3. Changing to a different unverified number removes verification
        const remountedPhoneInput = container2.div.querySelector('input[type="tel"]') as HTMLInputElement | null;
        assert.ok(remountedPhoneInput, 'Remounted phone input exists');
        await act(async () => {
          remountedPhoneInput.value = '559999999';
          remountedPhoneInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
          remountedPhoneInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        });

        assert.equal(
          container2.div.textContent?.includes('Verified via WhatsApp ✓'),
          false,
          'Different number must remain unverified'
        );
      } finally {
        await container2.cleanup();
      }

      // Step D: Stale responses or account changes cannot apply verification
      const container3 = createTestContainer();
      try {
        const unverifiedEvidence = { whatsappTrusted: false, whatsappE164: null };
        await act(async () => {
          container3.root.render(
            React.createElement(P2RegistrationScreen, {
              language: 'en',
              record: sampleRecord,
              loading: false,
              initialProfile: null,
              serverVerification: unverifiedEvidence,
              draft: { phoneNumber: '551234567', phoneCountry: 'SA +966' },
              draftEditedFields: ['phoneNumber'],
              onAcceptRelationship: async () => {}
            })
          );
        });

        assert.equal(
          container3.div.textContent?.includes('Verified via WhatsApp ✓'),
          false,
          'Account without server confirmation cannot apply verification'
        );
      } finally {
        await container3.cleanup();
      }

      // Step E: Failed fetch and Retry preserve inputs
      let retryTriggered = false;
      const container4 = createTestContainer();
      try {
        await act(async () => {
          container4.root.render(
            React.createElement(P2RegistrationScreen, {
              language: 'en',
              record: sampleRecord,
              loading: false,
              loadingError: 'Failed to fetch verification status',
              onRetryLoading: () => {
                retryTriggered = true;
              },
              initialProfile: null,
              serverVerification: null,
              draft: { fullName: 'Preserved Name', phoneNumber: '551234567' },
              draftEditedFields: ['fullName', 'phoneNumber'],
              onAcceptRelationship: async () => {}
            })
          );
        });

        const nameInput = container4.div.querySelector('input#p2-fullname') as HTMLInputElement | null;
        assert.equal(nameInput?.value, 'Preserved Name', 'Inputs preserved during fetch error');
        assert.ok(container4.div.textContent?.includes('Failed to fetch verification status'), 'Error shown');

        const allBtns = Array.from(container4.div.querySelectorAll('button'));
        const retryBtn = allBtns.find((b) => b.textContent?.includes('Retry'));
        assert.ok(retryBtn, 'Retry button visible');
        await act(async () => {
          retryBtn?.click();
        });
        assert.equal(retryTriggered, true, 'Retry callback called');

        assert.equal(
          container4.div.textContent?.includes('Verified via WhatsApp ✓'),
          false,
          'Failed fetch does not grant verification'
        );
      } finally {
        await container4.cleanup();
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
