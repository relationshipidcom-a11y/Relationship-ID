import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePhoneNumber } from '../src/utils/phone';

test('Saudi national number normalizes to E.164', () => {
  assert.equal(normalizePhoneNumber('SA', '551234567'), '+966551234567');
});

test('Saudi trunk zero is removed by phone parsing', () => {
  assert.equal(normalizePhoneNumber('SA', '0551234567'), '+966551234567');
});

test('already international input is not double-prefixed', () => {
  assert.equal(normalizePhoneNumber('SA', '+966551234567'), '+966551234567');
});

test('invalid phone is rejected', () => {
  assert.equal(normalizePhoneNumber('SA', '123'), null);
});

test('All equivalent Saudi phone formats resolve to +966583347281', () => {
  const target = '+966583347281';
  const formats = [
    '0583347281',
    '583347281',
    '+966583347281',
    '966583347281',
    '00966583347281',
    '058 334 7281',
    '+966 58 334 7281',
    '٠٥٨٣٣٤٧٢٨١', // Arabic-Indic digits
    '۰۵۸۳۳۴۷۲۸۱'  // Persian digits
  ];

  for (const fmt of formats) {
    assert.equal(
      normalizePhoneNumber('SA', fmt),
      target,
      `Failed to normalize format: ${fmt}`
    );
  }
});

test('International numbering rules across regions', () => {
  // Egypt (+20)
  assert.equal(normalizePhoneNumber('EG', '01012345678'), '+201012345678');
  assert.equal(normalizePhoneNumber('EG', '+201012345678'), '+201012345678');

  // UK (+44)
  assert.equal(normalizePhoneNumber('GB', '02079460901'), '+442079460901');

  // Italy (+39) preserving significant leading zero in 061234567
  assert.equal(normalizePhoneNumber('IT', '061234567'), '+39061234567');

  // Germany (+49)
  assert.equal(normalizePhoneNumber('DE', '03012345'), '+493012345');

  // India (+91)
  assert.equal(normalizePhoneNumber('IN', '9876543210'), '+919876543210');

  // US (+1)
  assert.equal(normalizePhoneNumber('US', '4155552671'), '+14155552671');

  // Explicit international input while a different country is selected (France selected, US number entered)
  assert.equal(normalizePhoneNumber('FR', '+14155552671'), '+14155552671');
});


