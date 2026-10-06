import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGAL_VERSION, legalContent } from '../src/content/legal';
import { CURRENT_LEGAL_VERSION } from '../server';
import { translations } from '../src/i18n/translations';

test('Legal Content Compliance Suite', async (t) => {
  // 1. LEGAL_VERSION === CURRENT_LEGAL_VERSION
  await t.test('1. LEGAL_VERSION matches CURRENT_LEGAL_VERSION and is updated', () => {
    assert.equal(LEGAL_VERSION, CURRENT_LEGAL_VERSION);
    assert.equal(LEGAL_VERSION, '2026-10-01');
  });

  // 2. Neither privacySections nor termsSections contains the word "Draft" or "مسودة"
  await t.test('2. Neither privacySections nor termsSections contains "Draft" or "مسودة"', () => {
    const allSections = [
      ...legalContent.en.privacySections,
      ...legalContent.en.termsSections,
      ...legalContent.ar.privacySections,
      ...legalContent.ar.termsSections
    ];

    for (const section of allSections) {
      assert.equal(
        section.heading.toLowerCase().includes('draft'),
        false,
        `Heading "${section.heading}" should not contain "draft"`
      );
      assert.equal(
        section.body.toLowerCase().includes('draft'),
        false,
        `Body "${section.body.slice(0, 30)}..." should not contain "draft"`
      );
      assert.equal(
        section.heading.includes('مسودة'),
        false,
        `Heading "${section.heading}" should not contain "مسودة"`
      );
      assert.equal(
        section.body.includes('مسودة'),
        false,
        `Body "${section.body.slice(0, 30)}..." should not contain "مسودة"`
      );
    }
  });

  // 3. privacySections and termsSections each have the same number of entries in en and ar
  await t.test('3. privacySections and termsSections have matching lengths in en and ar', () => {
    assert.equal(
      legalContent.en.privacySections.length,
      legalContent.ar.privacySections.length,
      'Privacy sections count should match between English and Arabic'
    );
    assert.equal(
      legalContent.en.termsSections.length,
      legalContent.ar.termsSections.length,
      'Terms sections count should match between English and Arabic'
    );
    assert.ok(legalContent.en.privacySections.length >= 10, 'Privacy policy should have at least 10 sections');
    assert.ok(legalContent.en.termsSections.length >= 10, 'Terms of service should have at least 10 sections');
  });

  // 4. Every section in both languages has a non-empty heading and a non-empty body
  await t.test('4. Every section in both languages has non-empty heading and body', () => {
    const checkSections = (sections: Array<{ heading: string; body: string }>, docName: string) => {
      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        assert.ok(sec.heading && sec.heading.trim().length > 0, `${docName} section ${i} has non-empty heading`);
        assert.ok(sec.body && sec.body.trim().length > 0, `${docName} section ${i} has non-empty body`);
      }
    };

    checkSections(legalContent.en.privacySections, 'English privacy');
    checkSections(legalContent.en.termsSections, 'English terms');
    checkSections(legalContent.ar.privacySections, 'Arabic privacy');
    checkSections(legalContent.ar.termsSections, 'Arabic terms');
  });

  // 5. The privacy content contains "SDAIA", "rami@relationshipid.org", and a statement about Firebase Authentication being global
  await t.test('5. Privacy content contains SDAIA, contact email, and Firebase Auth global disclosure', () => {
    const enPrivacyCombined = legalContent.en.privacySections.map((s) => `${s.heading} ${s.body}`).join('\n');
    const arPrivacyCombined = legalContent.ar.privacySections.map((s) => `${s.heading} ${s.body}`).join('\n');

    assert.ok(enPrivacyCombined.includes('SDAIA'), 'English privacy content must mention SDAIA');
    assert.ok(arPrivacyCombined.includes('SDAIA') || arPrivacyCombined.includes('سدايا'), 'Arabic privacy content must mention SDAIA / سدايا');

    assert.ok(enPrivacyCombined.includes('rami@relationshipid.org'), 'English privacy content must include rami@relationshipid.org');
    assert.ok(arPrivacyCombined.includes('rami@relationshipid.org'), 'Arabic privacy content must include rami@relationshipid.org');

    assert.ok(
      enPrivacyCombined.includes('Firebase Authentication is a global Google service'),
      'English privacy must state that Firebase Authentication is a global Google service'
    );
    assert.ok(
      arPrivacyCombined.includes('Firebase Authentication') && (arPrivacyCombined.includes('عالمية') || arPrivacyCombined.includes('Google')),
      'Arabic privacy must disclose Firebase Authentication as a global service'
    );
  });

  // 6. The terms content contains "not a government registry" (en) and its Arabic equivalent
  await t.test('6. Terms content contains disclaimer: "not a government registry" and Arabic equivalent', () => {
    const enTermsCombined = legalContent.en.termsSections.map((s) => `${s.heading} ${s.body}`).join('\n');
    const arTermsCombined = legalContent.ar.termsSections.map((s) => `${s.heading} ${s.body}`).join('\n');

    assert.ok(
      enTermsCombined.toLowerCase().includes('not a government registry'),
      'English terms must contain "not a government registry"'
    );
    assert.ok(
      arTermsCombined.includes('ليست سجلاً حكومياً') || arTermsCombined.includes('ليس سجلاً حكومياً'),
      'Arabic terms must contain the Arabic equivalent of "not a government registry"'
    );
  });

  // 7. No personal gmail address appears in legal content
  await t.test('7. No personal gmail address appears in legal content', () => {
    const allContent = JSON.stringify(legalContent);
    assert.equal(/@gmail\.com/i.test(allContent), false,
      'No personal gmail address may appear in legal content');
  });

  // 8. Privacy Policy and Terms of Use legal link pairs exist and are defined for both Arabic and English
  await t.test('8. Privacy Policy and Terms of Use translations exist in en and ar', () => {
    assert.equal(translations.en.privacyPolicy, 'Privacy Policy');
    assert.equal(translations.en.termsOfUse, 'Terms of Use');
    assert.equal(translations.ar.privacyPolicy, 'سياسة الخصوصية');
    assert.equal(translations.ar.termsOfUse, 'شروط الاستخدام');
  });

  // 9. Privacy Policy wording updates (§2 and §7)
  await t.test('9. Privacy Policy wording updates (§2 and §7)', () => {
    const stringified = JSON.stringify(legalContent);

    // Old phrases must be absent
    assert.equal(stringified.includes('security and audit logs'), false, 'Old phrase "security and audit logs" must be absent');
    assert.equal(stringified.includes('وسجلات الأمان والتدقيق'), false, 'Old phrase "وسجلات الأمان والتدقيق" must be absent');
    assert.equal(stringified.includes('optional social media handle'), false, 'Old phrase "optional social media handle" must be absent');
    assert.equal(stringified.includes('عبر تطبيق WhatsApp'), false, 'Old phrase "عبر تطبيق WhatsApp" must be absent');

    // New phrases must be present
    assert.equal(stringified.includes('technical server logs'), true, 'New phrase "technical server logs" must be present');
    assert.equal(stringified.includes('up to six optional social media accounts'), true, 'New phrase "up to six optional social media accounts" must be present');
    assert.equal(stringified.includes('by SMS'), true, 'New phrase "by SMS" must be present');
    assert.equal(stringified.includes('عبر رسالة نصية قصيرة (SMS)'), true, 'New phrase "عبر رسالة نصية قصيرة (SMS)" must be present');
    assert.equal(stringified.includes('والسجلات التقنية للخادم'), true, 'New phrase "والسجلات التقنية للخادم" must be present');

    // Version remains 2026-10-01
    assert.equal(LEGAL_VERSION, '2026-10-01');
  });

  // 10. Storage and Public Contact Search disclosures
  await t.test('10. Storage persistence and public contact search disclosures', () => {
    const stringified = JSON.stringify(legalContent);

    // Old inaccurate claims must be absent
    assert.equal(stringified.includes('uses no localStorage or sessionStorage in this application'), false,
      'Old inaccurate claim "uses no localStorage or sessionStorage" must be absent');
    assert.equal(stringified.includes('ولا يستخدم التخزين المحلي (localStorage) أو تخزين الجلسة (sessionStorage) في هذا التطبيق'), false,
      'Old inaccurate Arabic storage claim must be absent');

    // New accurate storage persistence disclosures must be present
    assert.ok(stringified.includes('Firebase Authentication utilizes browser local storage'),
      'English storage persistence disclosure must be present');
    assert.ok(stringified.includes('تستخدم خدمة Firebase Authentication التخزين المحلي للمتصفح'),
      'Arabic storage persistence disclosure must be present');

    // New accurate public contact search disclosures must be present
    assert.ok(stringified.includes('optional public contact search feature (disabled by default and requiring explicit consent from both partners)'),
      'English public contact search disclosure must be present');
    assert.ok(stringified.includes('تتيح خاصية البحث عن جهة الاتصال الاختيارية (المعطلة افتراضياً والتي تتطلب موافقة صريحة من كِلا الشريكين)'),
      'Arabic public contact search disclosure must be present');

    // Preserved disclosures
    assert.ok(stringified.includes('sets no cookies of its own'), 'Must preserve "sets no cookies of its own"');
    assert.ok(stringified.includes('no third-party analytics, behavioral tracking, or advertising networks'), 'Must preserve analytics disclaimer');
    assert.ok(stringified.includes('Google reCAPTCHA Enterprise'), 'Must preserve reCAPTCHA disclosure');
  });
});
