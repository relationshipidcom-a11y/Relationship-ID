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
import { WheelDatePicker, isLeapYear, getDaysInMonth } from '../src/components/WheelDatePicker';
import { P1RegistrationScreen } from '../src/components/P1RegistrationScreen';
import { P2RegistrationScreen } from '../src/components/P2RegistrationScreen';
import { ChangeRequestModal } from '../src/components/ChangeRequestModal';
import type { PartnerData, RelationshipRecord, ChangeRequest } from '../src/types';

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

const sampleRecord: RelationshipRecord = {
  id: 'rec_test_123',
  recordNumber: '001',
  verificationRef: 'REF123',
  issuedDate: '2024-01-01',
  issuedDateAr: '2024-01-01',
  type: 'dating',
  startDate: '1 January 2024',
  startDateAr: '1 يناير 2024',
  startDateIso: '2024-01-01',
  status: 'active',
  activeSinceDays: 10,
  settings: {
    showSocialHandles: true,
    showContactDetails: true,
    showQrMatrix: true
  },
  partner1: {
    fullName: 'Partner One',
    birthYear: '1990',
    birthMonth: '05',
    birthDay: '15',
    email: 'p1@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '501112233',
    phoneE164: '+966501112233',
    whatsappTrusted: true,
    whatsappE164: '+966501112233'
  },
  partner2: {
    fullName: 'Partner Two',
    birthYear: '1992',
    birthMonth: '08',
    birthDay: '20',
    email: 'p2@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '502223344',
    phoneE164: '+966502223344',
    whatsappTrusted: true,
    whatsappE164: '+966502223344'
  },
  createdAt: '2024-01-01T00:00:00.000Z'
};

test('WheelDatePicker Component and Integration Suite', async (t) => {

  // 1. Confirm on 16 May 1979 emits exactly '1979-05-16'; run once with process.env.TZ='Asia/Riyadh' and once 'America/Los_Angeles' — same result
  await t.test('1. Confirm on 16 May 1979 emits exactly "1979-05-16" across different timezones', async () => {
    const timezones = ['Asia/Riyadh', 'America/Los_Angeles'];
    for (const tz of timezones) {
      const origTz = process.env.TZ;
      process.env.TZ = tz;
      const { div, root, cleanup } = createTestContainer();
      try {
        let emittedValue = '';
        await act(async () => {
          root.render(
            <WheelDatePicker
              id="test-date-picker"
              value=""
              onChange={(val) => {
                emittedValue = val;
              }}
              language="en"
              defaultDate="1979-05-16"
            />
          );
        });

        const btn = div.querySelector('button#test-date-picker') as HTMLButtonElement | null;
        assert.ok(btn, 'Trigger button rendered');

        // Open picker
        await act(async () => {
          btn?.click();
        });

        // Find Confirm button
        const confirmBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Confirm');
        assert.ok(confirmBtn, 'Confirm button found');

        // Click confirm
        await act(async () => {
          confirmBtn?.click();
        });

        assert.equal(emittedValue, '1979-05-16', `Emitted date in ${tz} must be exactly 1979-05-16`);
      } finally {
        process.env.TZ = origTz;
        await cleanup();
      }
    }
  });

  // 2. 31 Jan → Feb 2023 clamps to 28; Feb 2024 allows 29; 29 Feb 2024 → year 2023 clamps to 28
  await t.test('2. Clamping logic: 31 Jan -> Feb 2023 clamps to 28, Feb 2024 allows 29, 29 Feb 2024 -> year 2023 clamps to 28', async () => {
    assert.equal(isLeapYear(2023), false);
    assert.equal(isLeapYear(2024), true);
    assert.equal(getDaysInMonth(2023, 2), 28);
    assert.equal(getDaysInMonth(2024, 2), 29);

    const { div, root, cleanup } = createTestContainer();
    try {
      let emitted = '';
      await act(async () => {
        root.render(
          <WheelDatePicker
            id="clamp-picker"
            value="2023-01-31"
            onChange={(val) => { emitted = val; }}
            language="en"
            minDate="2020-01-01"
            maxDate="2025-12-31"
          />
        );
      });

      const btn = div.querySelector('button#clamp-picker') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      // Switch month from Jan to Feb
      const monthOptions = Array.from(div.querySelectorAll('[role="listbox"][aria-label="Month"] [role="option"]'));
      const febOption = monthOptions.find((o) => o.textContent?.trim() === 'February') as HTMLElement;
      assert.ok(febOption, 'February option exists');

      await act(async () => {
        febOption.click();
      });

      // Click confirm and verify day clamped from 31 to 28
      const confirmBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Confirm') as HTMLElement;
      await act(async () => {
        confirmBtn.click();
      });
      assert.equal(emitted, '2023-02-28', '31 Jan -> Feb 2023 must clamp to 28');

      // Now set to leap year 2024-02-29
      await act(async () => {
        root.render(
          <WheelDatePicker
            id="clamp-picker"
            value="2024-02-29"
            onChange={(val) => { emitted = val; }}
            language="en"
            minDate="2020-01-01"
            maxDate="2025-12-31"
          />
        );
      });

      await act(async () => {
        btn.click();
      });

      const day29 = Array.from(div.querySelectorAll('[role="listbox"][aria-label="Day"] [role="option"]')).find(
        (o) => o.textContent?.trim() === '29'
      );
      assert.ok(day29, 'Feb 2024 allows day 29');

      // Switch year to 2023 while day is 29
      const yearOptions = Array.from(div.querySelectorAll('[role="listbox"][aria-label="Year"] [role="option"]'));
      const year2023 = yearOptions.find((o) => o.textContent?.trim() === '2023') as HTMLElement;
      assert.ok(year2023, 'Year 2023 option exists');

      await act(async () => {
        year2023.click();
      });

      const confirmBtn2 = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Confirm') as HTMLElement;
      await act(async () => {
        confirmBtn2.click();
      });

      assert.equal(emitted, '2023-02-28', '29 Feb 2024 -> year 2023 must clamp to 28');
    } finally {
      await cleanup();
    }
  });

  // 3. DOB max year = currentYear − 18 (currentYear − 17 not present)
  await t.test('3. DOB max year = currentYear - 18 (currentYear - 17 not present)', async () => {
    const currentYear = 2026;
    const maxDobYear = currentYear - 18; // 2008
    const maxDobDate = `${maxDobYear}-12-31`;

    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          <WheelDatePicker
            id="dob-picker"
            value=""
            onChange={() => {}}
            language="en"
            minDate="1900-01-01"
            maxDate={maxDobDate}
          />
        );
      });

      const btn = div.querySelector('button#dob-picker') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      const yearOptions = Array.from(div.querySelectorAll('[role="listbox"][aria-label="Year"] [role="option"]')).map(
        (o) => o.textContent?.trim()
      );

      assert.ok(yearOptions.includes(String(maxDobYear)), `Year list must include ${maxDobYear}`);
      assert.equal(yearOptions.includes(String(currentYear - 17)), false, `${currentYear - 17} must NOT be present in DOB year options`);
    } finally {
      await cleanup();
    }
  });

  // 4. start date: no option after max is selectable or emitted
  await t.test('4. start date: no option after max is selectable or emitted', async () => {
    const maxDate = '2026-10-30';
    const { div, root, cleanup } = createTestContainer();
    try {
      let emitted = '';
      await act(async () => {
        root.render(
          <WheelDatePicker
            id="start-date-picker"
            value="2026-10-30"
            onChange={(val) => { emitted = val; }}
            language="en"
            minDate="1900-01-01"
            maxDate={maxDate}
          />
        );
      });

      const btn = div.querySelector('button#start-date-picker') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      // In year 2026, month should only be up to 10 (October); November (11) and December (12) must not be selectable
      const monthOptions = Array.from(div.querySelectorAll('[role="listbox"][aria-label="Month"] [role="option"]')).map(
        (o) => o.textContent?.trim()
      );
      assert.ok(monthOptions.includes('October'), 'October is available');
      assert.equal(monthOptions.includes('November'), false, 'November must not be available for 2026-10 max');
      assert.equal(monthOptions.includes('December'), false, 'December must not be available for 2026-10 max');

      // Days in October 2026 should only be up to 30; day 31 must not be available
      const dayOptions = Array.from(div.querySelectorAll('[role="listbox"][aria-label="Day"] [role="option"]')).map(
        (o) => o.textContent?.trim()
      );
      assert.ok(dayOptions.includes('30'), 'Day 30 is available');
      assert.equal(dayOptions.includes('31'), false, 'Day 31 must not be available when max is 2026-10-30');

      const confirmBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Confirm') as HTMLElement;
      await act(async () => {
        confirmBtn.click();
      });

      assert.ok(emitted <= maxDate, 'Emitted date must not exceed maxDate');
    } finally {
      await cleanup();
    }
  });

  // 5. Cancel and Escape emit nothing; Confirm emits exactly once
  await t.test('5. Cancel and Escape emit nothing; Confirm emits exactly once', async () => {
    const { div, root, cleanup } = createTestContainer();
    try {
      let emitCount = 0;
      await act(async () => {
        root.render(
          <WheelDatePicker
            id="action-picker"
            value="2000-05-15"
            onChange={() => { emitCount++; }}
            language="en"
          />
        );
      });

      const btn = div.querySelector('button#action-picker') as HTMLButtonElement;

      // Open and Cancel
      await act(async () => {
        btn.click();
      });
      assert.ok(div.querySelector('[role="dialog"]'), 'Dialog opened');
      const cancelBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancel') as HTMLElement;
      await act(async () => {
        cancelBtn.click();
      });
      assert.equal(div.querySelector('[role="dialog"]'), null, 'Dialog closed on cancel');
      assert.equal(emitCount, 0, 'Cancel must not emit');

      // Open and Escape
      await act(async () => {
        btn.click();
      });
      assert.ok(div.querySelector('[role="dialog"]'), 'Dialog opened');
      await act(async () => {
        dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      assert.equal(div.querySelector('[role="dialog"]'), null, 'Dialog closed on Escape');
      assert.equal(emitCount, 0, 'Escape must not emit');

      // Open and Confirm
      await act(async () => {
        btn.click();
      });
      assert.ok(div.querySelector('[role="dialog"]'), 'Dialog opened');
      const confirmBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Confirm') as HTMLElement;
      await act(async () => {
        confirmBtn.click();
      });
      assert.equal(div.querySelector('[role="dialog"]'), null, 'Dialog closed on confirm');
      assert.equal(emitCount, 1, 'Confirm must emit exactly once');
    } finally {
      await cleanup();
    }
  });

  // 6. prefill '1990-12-01' shows day 1, December, 1990
  await t.test('6. prefill "1990-12-01" shows day 1, December, 1990', async () => {
    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          <WheelDatePicker
            id="prefill-picker"
            value="1990-12-01"
            onChange={() => {}}
            language="en"
          />
        );
      });

      const btn = div.querySelector('button#prefill-picker') as HTMLButtonElement;
      assert.ok(btn.textContent?.includes('1 December 1990'), `Button text must display "1 December 1990", got: ${btn.textContent}`);

      await act(async () => {
        btn.click();
      });

      const daySelected = div.querySelector('[role="listbox"][aria-label="Day"] [aria-selected="true"]');
      const monthSelected = div.querySelector('[role="listbox"][aria-label="Month"] [aria-selected="true"]');
      const yearSelected = div.querySelector('[role="listbox"][aria-label="Year"] [aria-selected="true"]');

      assert.equal(daySelected?.textContent?.trim(), '1');
      assert.equal(monthSelected?.textContent?.trim(), 'December');
      assert.equal(yearSelected?.textContent?.trim(), '1990');
    } finally {
      await cleanup();
    }
  });

  // 7. invalid prefill 'abc' shows placeholder and calls console.error
  await t.test('7. invalid prefill "abc" shows placeholder and calls console.error', async () => {
    const origError = console.error;
    let errorCalled = false;
    console.error = () => {
      errorCalled = true;
    };

    const { div, root, cleanup } = createTestContainer();
    try {
      await act(async () => {
        root.render(
          <WheelDatePicker
            id="invalid-picker"
            value="abc"
            onChange={() => {}}
            language="en"
          />
        );
      });

      const btn = div.querySelector('button#invalid-picker') as HTMLButtonElement;
      assert.ok(errorCalled, 'console.error must be called on invalid prefill');
      assert.ok(btn.textContent?.includes('Select date'), `Button must show placeholder "Select date", got: ${btn.textContent}`);
    } finally {
      console.error = origError;
      await cleanup();
    }
  });

  // 8. ar: Arabic month names and Day column rightmost; en: English names
  await t.test('8. ar: Arabic month names and Day column rightmost; en: English names', async () => {
    // Test Arabic
    const { div: arDiv, root: arRoot, cleanup: arCleanup } = createTestContainer();
    try {
      await act(async () => {
        arRoot.render(
          <WheelDatePicker
            id="ar-picker"
            value="2020-05-15"
            onChange={() => {}}
            language="ar"
          />
        );
      });

      const arBtn = arDiv.querySelector('button#ar-picker') as HTMLButtonElement;
      assert.ok(arBtn.textContent?.includes('15 مايو 2020'), `Arabic formatted date expected, got: ${arBtn.textContent}`);

      await act(async () => {
        arBtn.click();
      });

      const modal = arDiv.querySelector('[role="dialog"]') as HTMLElement;
      assert.equal(modal.getAttribute('dir'), 'rtl', 'Arabic modal must have dir="rtl"');

      const columns = Array.from(modal.querySelectorAll('[role="listbox"]'));
      assert.equal(columns.length, 3, 'Must have 3 columns');
      // In RTL with flex layout, the first DOM child is positioned at the rightmost position visually
      assert.equal(columns[0].getAttribute('aria-label'), 'اليوم', 'First DOM listbox in RTL is Day (rightmost in RTL)');
      assert.equal(columns[1].getAttribute('aria-label'), 'الشهر', 'Second DOM listbox is Month');
      assert.equal(columns[2].getAttribute('aria-label'), 'السنة', 'Third DOM listbox is Year');

      // Verify Arabic month name
      const mayOption = modal.querySelector('[role="listbox"][aria-label="الشهر"] [aria-selected="true"]');
      assert.equal(mayOption?.textContent?.trim(), 'مايو');
    } finally {
      await arCleanup();
    }

    // Test English
    const { div: enDiv, root: enRoot, cleanup: enCleanup } = createTestContainer();
    try {
      await act(async () => {
        enRoot.render(
          <WheelDatePicker
            id="en-picker"
            value="2020-05-15"
            onChange={() => {}}
            language="en"
          />
        );
      });

      const enBtn = enDiv.querySelector('button#en-picker') as HTMLButtonElement;
      assert.ok(enBtn.textContent?.includes('15 May 2020'));

      await act(async () => {
        enBtn.click();
      });

      const modal = enDiv.querySelector('[role="dialog"]') as HTMLElement;
      assert.equal(modal.getAttribute('dir'), 'ltr', 'English modal must have dir="ltr"');
      const mayOption = modal.querySelector('[role="listbox"][aria-label="Month"] [aria-selected="true"]');
      assert.equal(mayOption?.textContent?.trim(), 'May');
    } finally {
      await enCleanup();
    }
  });

  // 9. ArrowDown on the day column moves to the next day
  await t.test('9. ArrowDown on the day column moves to the next day', async () => {
    const { div, root, cleanup } = createTestContainer();
    try {
      let emitted = '';
      await act(async () => {
        root.render(
          <WheelDatePicker
            id="arrow-picker"
            value="2020-05-15"
            onChange={(val) => { emitted = val; }}
            language="en"
          />
        );
      });

      const btn = div.querySelector('button#arrow-picker') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      const dayCol = div.querySelector('[role="listbox"][aria-label="Day"]') as HTMLElement;
      assert.ok(dayCol, 'Day listbox found');

      await act(async () => {
        dayCol.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });

      const selectedDay = div.querySelector('[role="listbox"][aria-label="Day"] [aria-selected="true"]');
      assert.equal(selectedDay?.textContent?.trim(), '16', 'ArrowDown must move day from 15 to 16');

      const confirmBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Confirm') as HTMLElement;
      await act(async () => {
        confirmBtn.click();
      });

      assert.equal(emitted, '2020-05-16', 'Emitted date reflects moved day 16');
    } finally {
      await cleanup();
    }
  });

  // 10. the registration form submits with a valid picked date (hidden input does not block submit)
  await t.test('10. the registration form submits with a valid picked date (hidden input does not block submit)', async () => {
    const { div, root, cleanup } = createTestContainer();
    try {
      let saved = false;
      const initialP1Data: PartnerData = {
        fullName: 'Test Partner',
        birthYear: '1995',
        birthMonth: '06',
        birthDay: '15',
        email: 'test@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '501234567',
        phoneE164: '+966501234567',
        phoneVerified: true,
        whatsappTrusted: true,
        whatsappE164: '+966501234567',
        socialAccounts: []
      };

      await act(async () => {
        root.render(
          <P1RegistrationScreen
            language="en"
            initialData={initialP1Data}
            relationshipType="dating"
            initialStartDate="2024-01-01"
            onSaveAndNext={async () => {
              saved = true;
            }}
          />
        );
      });

      // Hidden inputs must not have required attribute
      const p1DobHidden = div.querySelector('input#p1-dob') as HTMLInputElement | null;
      const p1StartHidden = div.querySelector('input#p1-start-date') as HTMLInputElement | null;
      assert.ok(p1DobHidden, 'Hidden p1-dob input exists');
      assert.ok(p1StartHidden, 'Hidden p1-start-date input exists');
      assert.equal(p1DobHidden.hasAttribute('required'), false, 'p1-dob hidden input must NOT have required');
      assert.equal(p1StartHidden.hasAttribute('required'), false, 'p1-start-date hidden input must NOT have required');

      // Check terms checkbox
      const termsCheckbox = div.querySelector('input#p1-terms') as HTMLInputElement | null;
      assert.ok(termsCheckbox, 'Terms checkbox exists');
      await act(async () => {
        termsCheckbox.click();
      });

      // Submit form
      const form = div.querySelector('form');
      assert.ok(form, 'Form exists');
      await act(async () => {
        form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      });

      assert.equal(saved, true, 'Form must submit successfully without being blocked by hidden input');
    } finally {
      await cleanup();
    }
  });

  // 11. after Confirm, a later profile hydration does NOT overwrite the picked date
  await t.test('11. after Confirm, a later profile hydration does NOT overwrite the picked date', async () => {
    const { div, root, cleanup } = createTestContainer();
    try {
      const initialProfile: PartnerData = {
        fullName: 'Initial Name',
        birthYear: '1990',
        birthMonth: '01',
        birthDay: '01',
        email: 'init@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '501111111',
        phoneE164: '+966501111111',
        whatsappTrusted: true,
        whatsappE164: '+966501111111'
      };

      const pendingRecord: RelationshipRecord = {
        ...sampleRecord,
        status: 'pending_p2' as any
      };

      await act(async () => {
        root.render(
          <P2RegistrationScreen
            language="en"
            record={pendingRecord}
            initialProfile={initialProfile}
            onAcceptRelationship={() => {}}
          />
        );
      });

      const dobBtn = div.querySelector('button#p2-dob-button') as HTMLButtonElement;
      assert.ok(dobBtn, 'p2-dob-button exists');

      // Open picker and confirm new date '1985-04-12'
      await act(async () => {
        dobBtn.click();
      });

      // Find day 12, month April, year 1985
      const day12 = Array.from(div.querySelectorAll('[role="listbox"][aria-label="Day"] [role="option"]')).find(
        (o) => o.textContent?.trim() === '12'
      ) as HTMLElement;
      const monthApr = Array.from(div.querySelectorAll('[role="listbox"][aria-label="Month"] [role="option"]')).find(
        (o) => o.textContent?.trim() === 'April'
      ) as HTMLElement;
      const year1985 = Array.from(div.querySelectorAll('[role="listbox"][aria-label="Year"] [role="option"]')).find(
        (o) => o.textContent?.trim() === '1985'
      ) as HTMLElement;

      await act(async () => {
        if (year1985) year1985.click();
        if (monthApr) monthApr.click();
        if (day12) day12.click();
      });

      const confirmBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Confirm') as HTMLElement;
      await act(async () => {
        confirmBtn.click();
      });

      assert.ok(dobBtn.textContent?.includes('12 April 1985'), 'DOB button updated to 12 April 1985');

      // Simulate a later profile hydration with a different birth date
      const updatedProfile: PartnerData = {
        ...initialProfile,
        birthYear: '1999',
        birthMonth: '09',
        birthDay: '09'
      };

      await act(async () => {
        root.render(
          <P2RegistrationScreen
            language="en"
            record={pendingRecord}
            initialProfile={updatedProfile}
            onAcceptRelationship={() => {}}
          />
        );
      });

      const dobBtnAfter = div.querySelector('button#p2-dob-button') as HTMLButtonElement;
      assert.ok(
        dobBtnAfter.textContent?.includes('12 April 1985'),
        'Hydration must NOT overwrite the user-confirmed picked date'
      );
      const hiddenInput = div.querySelector('input#p2-dob') as HTMLInputElement;
      assert.equal(hiddenInput.value, '1985-04-12', 'Hidden input value preserved');
    } finally {
      await cleanup();
    }
  });

  // 12. in ChangeRequestModal, Escape closes the picker only; the modal stays open with its other inputs intact
  await t.test('12. in ChangeRequestModal, Escape closes the picker only; the modal stays open with its other inputs intact', async () => {
    const { div, root, cleanup } = createTestContainer();
    try {
      let modalClosed = false;
      const changeRequests: ChangeRequest[] = [];

      await act(async () => {
        root.render(
          <ChangeRequestModal
            language="en"
            record={sampleRecord}
            currentUserId="uid_p1"
            changeRequests={changeRequests}
            onClose={() => {
              modalClosed = true;
            }}
            onSubmitChangeRequest={async () => {}}
            onSavePersonalInfo={async () => {}}
            onApproveRequest={async () => {}}
            onDeclineRequest={async () => {}}
          />
        );
      });

      // Switch to Shared Certificate Information tab
      const sharedTabBtn = Array.from(div.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Shared')
      ) as HTMLElement | null;
      assert.ok(sharedTabBtn, 'Shared info tab button found');
      await act(async () => {
        sharedTabBtn.click();
      });

      // Select 'startDate' change field
      const select = div.querySelector('select') as HTMLSelectElement | null;
      assert.ok(select, 'Select field exists');
      await act(async () => {
        select.value = 'startDate';
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });

      const datePickerBtn = div.querySelector('button#proposed-start-date-button') as HTMLButtonElement | null;
      assert.ok(datePickerBtn, 'Proposed start date picker button rendered in modal');

      // Open date picker
      await act(async () => {
        datePickerBtn?.click();
      });

      // Verify date picker sheet is open
      assert.ok(div.querySelector('[role="dialog"][aria-labelledby="proposed-start-date-button-picker-title"]'), 'Date picker sheet open');

      // Press Escape
      await act(async () => {
        dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      // Date picker sheet must be closed
      assert.equal(
        div.querySelector('[role="dialog"][aria-labelledby="proposed-start-date-button-picker-title"]'),
        null,
        'Date picker sheet must be closed on Escape'
      );

      // Parent ChangeRequestModal must still be open
      assert.equal(modalClosed, false, 'Parent modal onClose must NOT be called on Escape inside picker');
      assert.ok(div.querySelector('[role="dialog"][aria-labelledby="change-request-modal-title"]'), 'Parent ChangeRequestModal remains open');
    } finally {
      await cleanup();
    }
  });

});
