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
