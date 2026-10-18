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

