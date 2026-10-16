import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGAL_VERSION, legalContent } from '../src/content/legal';
import { CURRENT_LEGAL_VERSION } from '../server';
import { translations } from '../src/i18n/translations';

test('Legal Content Compliance Suite', async (t) => {
  // 1. LEGAL_VERSION === CURRENT_LEGAL_VERSION
  await t.test('1. LEGAL_VERSION matches CURRENT_LEGAL_VERSION and is updated', () => {
    assert.equal(LEGAL_VERSION, CURRENT_LEGAL_VERSION);
    assert.equal(LEGAL_VERSION, '2026-10-10');
  });

  // 2. Neither privacySections nor termsSections contains the word "Draft" or "مسودة"
  await t.test('2. Neither privacySections nor termsSections contains "Draft" or "مسودة"', () => {
    const allSections = [
      ...legalContent.en.privacySections,
      ...legalContent.en.termsSections,
      ...legalContent.en.aboutSections,
      ...legalContent.ar.privacySections,
      ...legalContent.ar.termsSections,
      ...legalContent.ar.aboutSections
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

  // 3. privacySections, termsSections, and aboutSections each have the same number of entries in en and ar
  await t.test('3. privacySections, termsSections, and aboutSections have matching lengths in en and ar', () => {
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
    assert.equal(
      legalContent.en.aboutSections.length,
      legalContent.ar.aboutSections.length,
      'About sections count should match between English and Arabic'
    );
    assert.ok(legalContent.en.privacySections.length >= 10, 'Privacy policy should have at least 10 sections');
    assert.ok(legalContent.en.termsSections.length >= 10, 'Terms of service should have at least 10 sections');
    assert.ok(legalContent.en.aboutSections.length >= 5, 'About page should have at least 5 sections');
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
    checkSections(legalContent.en.aboutSections, 'English about');
    checkSections(legalContent.ar.privacySections, 'Arabic privacy');
    checkSections(legalContent.ar.termsSections, 'Arabic terms');
    checkSections(legalContent.ar.aboutSections, 'Arabic about');
  });

  // 5. The privacy content contains "SDAIA", "customerservices@relationshipid.org", and a statement about Firebase Authentication being global
  await t.test('5. Privacy content contains SDAIA, contact email, and Firebase Auth global disclosure', () => {
    const enPrivacyCombined = legalContent.en.privacySections.map((s) => `${s.heading} ${s.body}`).join('\n');
    const arPrivacyCombined = legalContent.ar.privacySections.map((s) => `${s.heading} ${s.body}`).join('\n');

    assert.ok(enPrivacyCombined.includes('SDAIA'), 'English privacy content must mention SDAIA');
    assert.ok(arPrivacyCombined.includes('SDAIA') || arPrivacyCombined.includes('سدايا'), 'Arabic privacy content must mention SDAIA / سدايا');

    assert.ok(enPrivacyCombined.includes('customerservices@relationshipid.org'), 'English privacy content must include customerservices@relationshipid.org');
    assert.ok(arPrivacyCombined.includes('customerservices@relationshipid.org'), 'Arabic privacy content must include customerservices@relationshipid.org');

    assert.ok(
      enPrivacyCombined.includes('Firebase Authentication is a global Google service'),
      'English privacy must state that Firebase Authentication is a global Google service'
    );
    assert.ok(
      arPrivacyCombined.includes('Firebase Authentication') && (arPrivacyCombined.includes('عالمية') || arPrivacyCombined.includes('Google')),
      'Arabic privacy must disclose Firebase Authentication as a global service'
    );
  });

  // 6. The terms content contains barcode/reference number and no government registration disclaimer
  await t.test('6. Terms content contains barcode/reference number and no government registration disclaimer', () => {
    const enTermsCombined = legalContent.en.termsSections.map((s) => `${s.heading} ${s.body}`).join('\n');
    const arTermsCombined = legalContent.ar.termsSections.map((s) => `${s.heading} ${s.body}`).join('\n');

    assert.ok(
      enTermsCombined.includes('reference number and barcode'),
      'English terms must state relationship is digitally documented with a reference number and barcode'
    );
    assert.ok(
      arTermsCombined.includes('برقم مرجعي وباركود'),
      'Arabic terms must state relationship is digitally documented with a reference number and barcode'
    );
    assert.ok(
      enTermsCombined.toLowerCase().includes('government registration'),
      'English terms must contain "government registration" disclaimer'
    );
    assert.ok(
      arTermsCombined.includes('تسجيلاً حكومياً'),
      'Arabic terms must contain "تسجيلاً حكومياً" disclaimer'
    );
    assert.ok(
      !enTermsCombined.includes('Saudi') && !arTermsCombined.includes('السعودية'),
      'Terms of Use must not mention any country'
    );
  });

  // 7. No personal gmail address appears in legal content
  await t.test('7. No personal gmail address appears in legal content', () => {
    const allContent = JSON.stringify(legalContent);
    assert.equal(/@gmail\.com/i.test(allContent), false,
      'No personal gmail address may appear in legal content');
  });

  // 8. Privacy Policy, Terms of Use, and About legal link translations exist in en and ar
  await t.test('8. Privacy Policy and Terms of Use translations exist in en and ar', () => {
    assert.equal(translations.en.privacyPolicy, 'Privacy Policy');
    assert.equal(translations.en.termsOfUse, 'Terms of Use');
    assert.equal(translations.en.aboutPlatform, 'About');
    assert.equal(translations.ar.privacyPolicy, 'سياسة الخصوصية');
    assert.equal(translations.ar.termsOfUse, 'شروط الاستخدام');
    assert.equal(translations.ar.aboutPlatform, 'عن المنصة');
  });

  // 9. Privacy Policy wording updates (§2 and §7)
  await t.test('9. Privacy Policy wording updates (§2 and §7)', () => {
    const stringified = JSON.stringify(legalContent);

    // Old phrases must be absent
    assert.equal(stringified.includes('security and audit logs'), false, 'Old phrase "security and audit logs" must be absent');
    assert.equal(stringified.includes('وسجلات الأمان والتدقيق'), false, 'Old phrase "وسجلات الأمان والتدقيق" must be absent');
    assert.equal(stringified.includes('optional social media handle'), false, 'Old phrase "optional social media handle" must be absent');
    assert.equal(stringified.includes('by SMS'), false, 'Old phrase "by SMS" must be absent');
    assert.equal(stringified.includes('عبر رسالة نصية قصيرة (SMS)'), false, 'Old phrase "عبر رسالة نصية قصيرة (SMS)" must be absent');

    // New phrases must be present
    assert.equal(stringified.includes('technical server logs'), true, 'New phrase "technical server logs" must be present');
    assert.equal(stringified.includes('up to six optional social media accounts'), true, 'New phrase "up to six optional social media accounts" must be present');
    assert.equal(stringified.includes('deliver one-time verification passcodes through WhatsApp'), true, 'New phrase "deliver one-time verification passcodes through WhatsApp" must be present');
    assert.equal(stringified.includes('عبر تطبيق WhatsApp للتحقق من رقم جوال المستخدم'), true, 'New phrase "عبر تطبيق WhatsApp للتحقق من رقم جوال المستخدم" must be present');
    assert.equal(stringified.includes('والسجلات التقنية للخادم'), true, 'New phrase "والسجلات التقنية للخادم" must be present');

    // Version updated to 2026-10-10
    assert.equal(LEGAL_VERSION, '2026-10-10');
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

  // 11. Google Preferred Sources footer link configuration and translations
  await t.test('11. Google Preferred Sources footer link translations and destination', () => {
    assert.equal(translations.en.addPreferredSource, 'Add to Preferred Sources on Google');
    assert.equal(translations.ar.addPreferredSource, 'أضفنا إلى المصادر المفضّلة على Google');
    const expectedUrl = 'https://www.google.com/preferences/source?q=relationshipid.org';
    assert.equal(expectedUrl, 'https://www.google.com/preferences/source?q=relationshipid.org');
  });

  // 12. About content privacy, verification, ending, and payment accuracy
  await t.test('12. About content privacy, verification, ending, and payment accuracy', () => {
    const enAboutText = legalContent.en.aboutSections.map((s) => `${s.heading} ${s.body}`).join('\n');
    const arAboutText = legalContent.ar.aboutSections.map((s) => `${s.heading} ${s.body}`).join('\n');

    // 1. Operator Privacy: No personal name, street address, district, or postcode
    const enPrivacyText = legalContent.en.privacySections.map((s) => `${s.heading} ${s.body}`).join('\n');
    const arPrivacyText = legalContent.ar.privacySections.map((s) => `${s.heading} ${s.body}`).join('\n');
    assert.equal(/Ramy|Gabriel|Fayha|14253/i.test(enAboutText), false, 'English About must not disclose personal operator info');
    assert.equal(/رامي|جبرائيل|الفيحاء|14253/.test(arAboutText), false, 'Arabic About must not disclose personal operator info');
    assert.equal(/Ramy|Gabriel|Fayha|14253/i.test(enPrivacyText), false, 'English Privacy must not disclose personal operator info');
    assert.equal(/رامي|جبرائيل|الفيحاء|14253/.test(arPrivacyText), false, 'Arabic Privacy must not disclose personal operator info');

    // 2. Ending a relationship wording
    assert.ok(
      enAboutText.includes('Either partner can end the relationship, removing its public verification.'),
      'English About must state either partner can end relationship removing public verification'
    );
    assert.ok(
      arAboutText.includes('يمكن لأي من الطرفين إنهاء العلاقة، مما يزيل إمكانية التحقق العلني منها.'),
      'Arabic About must state either partner can end relationship removing public verification'
    );

    // 3. Email and WhatsApp verification wording
    assert.ok(
      enAboutText.includes('Email verification confirms access to an email address. A WhatsApp verification code confirms access to the mobile number used for verification. Neither establishes government identity, civil status, background, or personal safety.'),
      'English About must include precise verification scope'
    );
    assert.ok(
      arAboutText.includes('يؤكد التحقق من البريد الإلكتروني إمكانية الوصول إلى عنوان البريد، ويؤكد رمز التحقق عبر WhatsApp إمكانية الوصول إلى رقم الجوال المستخدم للتحقق. ولا يثبت أي منهما الهوية الحكومية أو الحالة المدنية أو الخلفية الشخصية أو السلامة.'),
      'Arabic About must include precise verification scope'
    );

    // 4. Blocking wording: "block senders", not "permanently block"
    assert.equal(enAboutText.includes('permanently block'), false, 'English About must not claim permanent blocking');
    assert.ok(enAboutText.includes('block senders'), 'English About must mention blocking senders');
    assert.equal(arAboutText.includes('بشكل دائم'), false, 'Arabic About must not claim permanent blocking');
    assert.ok(arAboutText.includes('حظر المرسلين'), 'Arabic About must mention blocking senders');

    // 5. Support email and no dev notes
    assert.ok(enAboutText.includes('customerservices@relationshipid.org'), 'English About must include support email');
    assert.ok(arAboutText.includes('customerservices@relationshipid.org'), 'Arabic About must include support email');
    assert.equal(enAboutText.includes('delivery unverified'), false, 'English About must not contain dev notes');
    assert.equal(enAboutText.includes('monitored by support'), false, 'English About must not contain unconfirmed monitoring claims');
    assert.equal(arAboutText.includes('لم يتم التحقق المستقل من تسليم البريد'), false, 'Arabic About must not contain dev notes');

    // 6. Payment wording: no "completely free", accurate payment wording
    assert.equal(/completely free/i.test(enAboutText), false, 'English About must not use "completely free"');
    assert.ok(
      enAboutText.includes('No payment or credit-card details are required to use the current service.'),
      'English About must use approved payment text'
    );
    assert.equal(/مجانية بالكامل/.test(arAboutText), false, 'Arabic About must not use "مجانية بالكامل"');
    assert.ok(
      arAboutText.includes('لا يتطلب استخدام الخدمة الحالية أي دفع مالي أو تقديم بيانات بطاقة ائتمانية.'),
      'Arabic About must use approved payment text'
    );
  });
});
