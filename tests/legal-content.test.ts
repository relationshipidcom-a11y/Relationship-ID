import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGAL_VERSION, legalContent } from '../src/content/legal';
import { CURRENT_LEGAL_VERSION } from '../server';

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
});
