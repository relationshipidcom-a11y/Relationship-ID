import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLocalDateParts,
  isOccasionToday,
  isValidIanaTimezone,
  calculateActiveOccasions
} from '../src/utils/reminders';
import { RelationshipRecord } from '../src/types';

test('getLocalDateParts extracts year, month, and day accurately without UTC offset shift', () => {
  const date = new Date('1995-02-28T12:00:00Z');
  const parts = getLocalDateParts('UTC', date);
  assert.equal(parts.year, 1995);
  assert.equal(parts.month, 2);
  assert.equal(parts.day, 28);
  assert.equal(parts.isoDate, '1995-02-28');
});

test('isValidIanaTimezone validates valid and invalid timezones', () => {
  assert.equal(isValidIanaTimezone('Asia/Riyadh'), true);
  assert.equal(isValidIanaTimezone('America/New_York'), true);
  assert.equal(isValidIanaTimezone('UTC'), true);
  assert.equal(isValidIanaTimezone('Invalid/Timezone_Name'), false);
});

test('isOccasionToday applies Feb 29 leap year policy correctly', () => {
  // Occasion: February 29
  // 1. Non-leap year 2025: February 28 is the trigger date
  assert.equal(isOccasionToday(2, 29, 2, 28, 2025), true);
  assert.equal(isOccasionToday(2, 29, 2, 27, 2025), false);

  // 2. Leap year 2028: February 29 is the trigger date
  assert.equal(isOccasionToday(2, 29, 2, 29, 2028), true);
  assert.equal(isOccasionToday(2, 29, 2, 28, 2028), false);

  // Regular occasion: March 15
  assert.equal(isOccasionToday(3, 15, 3, 15, 2025), true);
  assert.equal(isOccasionToday(3, 15, 3, 14, 2025), false);
});

test('calculateActiveOccasions detects user birthday independently of relationship status', () => {
  const refDate = new Date('2025-05-12T12:00:00Z');
  const occasions = calculateActiveOccasions({
    userBirthYear: '1990',
    userBirthMonth: '05',
    userBirthDay: '12',
    timeZone: 'UTC',
    referenceDate: refDate
  });

  assert.equal(occasions.length, 1);
  assert.equal(occasions[0].type, 'user_birthday');
  assert.equal(occasions[0].date, '2025-05-12');
});

test('calculateActiveOccasions requires active relationship for partner birthday and anniversary', () => {
  const activeRecord: RelationshipRecord = {
    id: 'rel_123',
    recordNumber: '1001',
    verificationRef: 'REF123',
    type: 'dating',
    startDate: '2023-05-12',
    startDateAr: '',
    startDateIso: '2023-05-12',
    status: 'active',
    activeSinceDays: 730,
    partner1: {
      fullName: 'Partner 1',
      birthYear: '1990',
      birthMonth: '01',
      birthDay: '01',
      email: 'p1@example.com',
      phoneCountry: 'SA +966',
      phoneNumber: '551234567'
    },
    partner2: {
      fullName: 'Partner 2',
      birthYear: '1992',
      birthMonth: '05',
      birthDay: '12',
      email: 'p2@example.com',
      phoneCountry: 'SA +966',
      phoneNumber: '559876543'
    },
    issuedDate: '2023-05-12',
    issuedDateAr: '',
    createdAt: '2023-05-12T00:00:00Z',
    settings: {
      showSocialHandles: true,
      showContactDetails: false,
      showQrMatrix: true
    }
  };

  const refDate = new Date('2025-05-12T12:00:00Z');

  // When relationship is ACTIVE
  const activeOccasions = calculateActiveOccasions({
    userBirthYear: activeRecord.partner1.birthYear,
    userBirthMonth: activeRecord.partner1.birthMonth,
    userBirthDay: activeRecord.partner1.birthDay,
    partnerBirthYear: activeRecord.partner2.birthYear,
    partnerBirthMonth: activeRecord.partner2.birthMonth,
    partnerBirthDay: activeRecord.partner2.birthDay,
    relationshipStartDateIso: activeRecord.startDateIso,
    relationshipStatus: 'active',
    relationshipRecordId: activeRecord.id,
    timeZone: 'UTC',
    referenceDate: refDate
  });

  // Partner birthday (05/12) + Anniversary (05/12)
  assert.equal(activeOccasions.length, 2);
  const types = activeOccasions.map(o => o.type);
  assert.ok(types.includes('partner_birthday'));
  assert.ok(types.includes('relationship_anniversary'));

  // When relationship is NOT active (e.g. pending/draft/ended)
  const draftOccasions = calculateActiveOccasions({
    userBirthYear: activeRecord.partner1.birthYear,
    userBirthMonth: activeRecord.partner1.birthMonth,
    userBirthDay: activeRecord.partner1.birthDay,
    partnerBirthYear: activeRecord.partner2.birthYear,
    partnerBirthMonth: activeRecord.partner2.birthMonth,
    partnerBirthDay: activeRecord.partner2.birthDay,
    relationshipStartDateIso: activeRecord.startDateIso,
    relationshipStatus: 'draft',
    relationshipRecordId: activeRecord.id,
    timeZone: 'UTC',
    referenceDate: refDate
  });

  // Partner birthday and anniversary are suppressed for non-active relationships
  assert.equal(draftOccasions.length, 0);
});

test('calculateActiveOccasions suppresses anniversary in year 0 (less than 1 full year)', () => {
  const refDate = new Date('2025-05-12T12:00:00Z');
  const occasions = calculateActiveOccasions({
    userBirthYear: '1990',
    userBirthMonth: '01',
    userBirthDay: '01',
    relationshipStartDateIso: '2025-05-12',
    relationshipStatus: 'active',
    relationshipRecordId: 'rel_new',
    timeZone: 'UTC',
    referenceDate: refDate
  });

  // Anniversary should be 0 because 1 full year has not elapsed yet (2025 - 2025 = 0)
  const anniversaryOccasion = occasions.find(o => o.type === 'relationship_anniversary');
  assert.equal(anniversaryOccasion, undefined);
});

test('sendReminderEmail and sendReminderPushNotification fail closed when unconfigured', async () => {
  const { sendReminderEmail, sendReminderPushNotification } = await import('../server');
  
  // Ensure keys are absent
  const origResend = process.env.RESEND_API_KEY;
  const origVapidPub = process.env.VAPID_PUBLIC_KEY;
  delete process.env.RESEND_API_KEY;
  delete process.env.VAPID_PUBLIC_KEY;

  try {
    const emailRes = await sendReminderEmail('user@example.com', 'Test Subject', 'Test Body');
    assert.equal(emailRes.success, false);
    assert.equal(emailRes.error, 'SERVICE_UNCONFIGURED');

    const pushRes = await sendReminderPushNotification({ endpoint: 'https://example.com' } as any, { title: 'Test', body: 'Test' });
    assert.equal(pushRes.success, false);
    assert.equal(pushRes.error, 'SERVICE_UNCONFIGURED');
  } finally {
    if (origResend) process.env.RESEND_API_KEY = origResend;
    if (origVapidPub) process.env.VAPID_PUBLIC_KEY = origVapidPub;
  }
});

test('getLocalDateParts includes local hour correctly', () => {
  const date = new Date('2025-05-12T09:30:00Z');
  const parts = getLocalDateParts('UTC', date);
  assert.equal(parts.hour, 9);
  assert.equal(parts.isoDate, '2025-05-12');
});

test('Service worker notification URL validation rejects cross-origin URLs', () => {
  const origin = 'https://www.relationshipid.org';
  const validateUrl = (rawUrl: string) => {
    let safeUrl = '/';
    try {
      const parsed = new URL(rawUrl, origin);
      if (parsed.origin === origin) {
        safeUrl = parsed.pathname + parsed.search + parsed.hash;
      }
    } catch {
      safeUrl = '/';
    }
    return safeUrl;
  };

  assert.equal(validateUrl('/review'), '/review');
  assert.equal(validateUrl('https://www.relationshipid.org/review?ref=1'), '/review?ref=1');
  assert.equal(validateUrl('https://evil-attacker.com/phish'), '/');
  assert.equal(validateUrl('//evil-attacker.com/phish'), '/');
});

test('Reminder settings use the device timezone automatically and account menus omit JSON downloads', async (t) => {
  const { JSDOM } = await import('jsdom');
  const { default: React, act } = await import('react');
  const { auth } = await import('../src/lib/firebase');
  const { ReminderSettingsModal } = await import('../src/components/ReminderSettingsModal');
  const { TopBar } = await import('../src/components/TopBar');
  assert.ok(auth);
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  dom.window.matchMedia = (() => ({ matches: false })) as any;
  const { createRoot } = await import('react-dom/client');
  const originalUser = Object.getOwnPropertyDescriptor(auth, 'currentUser');
  Object.defineProperty(auth, 'currentUser', {
    value: { uid: 'timezone_test', getIdToken: async () => 'modeled_token' }, configurable: true
  });
  t.mock.method(auth, 'authStateReady', async () => {});
  let deviceZone = 'Asia/Riyadh';
  t.mock.method(Intl, 'DateTimeFormat', (() => {
    if (deviceZone === 'unavailable') throw new Error('Device timezone unavailable');
    return { resolvedOptions: () => ({ timeZone: deviceZone }) };
  }) as any);
  const requests: any[] = [];
  t.mock.method(globalThis, 'fetch', (async (_input: any, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      requests.push(body);
      return new Response(JSON.stringify({ success: true, settings: body }));
    }
    return new Response(JSON.stringify({
      settings: { inAppEnabled: true, emailEnabled: true, pushEnabled: false, timezone: 'UTC' },
      serverEmailConfigured: true, serverPushConfigured: false
    }));
  }) as any);
  try {
    for (const language of ['ar', 'en'] as const) {
      await t.test(language, async () => {
        const container = dom.window.document.createElement('div');
        dom.window.document.body.appendChild(container);
        const root = createRoot(container);
        try {
          await act(async () => {
            root.render(React.createElement(ReminderSettingsModal, { language, onClose: () => {} }));
            await new Promise(resolve => setTimeout(resolve, 15));
          });
          assert.equal(container.querySelector('select'), null);
          assert.doesNotMatch(container.textContent || '', /Confirmed Timezone|Use Device Timezone|المنطقة الزمنية المعتمدة|استخدام توقيت الجهاز/);
          const save = Array.from(container.querySelectorAll('button')).find(button =>
            button.textContent?.includes(language === 'ar' ? 'حفظ التفضيلات' : 'Save Preferences'));
          assert.ok(save);
          for (const zone of ['Asia/Riyadh', 'America/New_York', 'unavailable']) {
            deviceZone = zone;
            await act(async () => {
              save.click();
              await new Promise(resolve => setTimeout(resolve, 15));
            });
            assert.deepEqual(requests.at(-1), {
              inAppEnabled: true, emailEnabled: true, pushEnabled: false,
              timezone: zone === 'unavailable' ? 'UTC' : zone, language
            });
          }
          await act(async () => root.render(React.createElement(TopBar, {
            language, onToggleLanguage: () => {}, currentScreen: 'p1_invite_create', onNavigate: () => {},
            signedIn: true, onOpenReminderSettings: () => {}, onSignOut: () => {}
          })));
          const menuButton = container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
          assert.ok(menuButton);
          await act(async () => menuButton.click());
          assert.ok(container.querySelector('[role="menu"]'));
          assert.equal(container.querySelectorAll('[role="menuitem"]').length, 2);
          assert.doesNotMatch(container.textContent || '', /Download My Data|تنزيل بياناتي|JSON/);
        } finally {
          await act(async () => root.unmount());
          container.remove();
        }
      });
    }
  } finally {
    t.mock.restoreAll();
    if (originalUser) Object.defineProperty(auth, 'currentUser', originalUser);
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
    dom.window.close();
  }
});
