import assert from 'node:assert/strict';
import test from 'node:test';
import { getAccountMenuItems, classifyRelationshipSnapshot } from '../src/utils/relationshipState';
import { translations } from '../src/i18n/translations';

test('getAccountMenuItems truth table and visibility', async (t) => {
  await t.test('not signed in -> all false', () => {
    const res = getAccountMenuItems({
      signedIn: false,
      hasActiveRelationship: false,
      isDeleting: false
    });
    assert.deepEqual(res, {
      blockedPeople: false,
      signOut: false,
      endRelationship: false,
      deleteAccount: false
    });
  });

  await t.test('signed in without relationship -> signOut, deleteAccount, blockedPeople', () => {
    const res = getAccountMenuItems({
      signedIn: true,
      hasActiveRelationship: false,
      isDeleting: false
    });
    assert.deepEqual(res, {
      blockedPeople: true,
      signOut: true,
      endRelationship: false,
      deleteAccount: true
    });
  });

  await t.test('signed in with active relationship -> signOut, endRelationship, deleteAccount, blockedPeople', () => {
    const res = getAccountMenuItems({
      signedIn: true,
      hasActiveRelationship: true,
      isDeleting: false
    });
    assert.deepEqual(res, {
      blockedPeople: true,
      signOut: true,
      endRelationship: true,
      deleteAccount: true
    });
  });

  await t.test('signed in with deleting relationship -> signOut, endRelationship, deleteAccount, blockedPeople', () => {
    const res = getAccountMenuItems({
      signedIn: true,
      hasActiveRelationship: false,
      isDeleting: true
    });
    assert.deepEqual(res, {
      blockedPeople: true,
      signOut: true,
      endRelationship: true,
      deleteAccount: true
    });
  });

  await t.test('signed in with both active and isDeleting -> all true', () => {
    const res = getAccountMenuItems({
      signedIn: true,
      hasActiveRelationship: true,
      isDeleting: true
    });
    assert.deepEqual(res, {
      blockedPeople: true,
      signOut: true,
      endRelationship: true,
      deleteAccount: true
    });
  });
});

test('classifyRelationshipSnapshot classification rules', async (t) => {
  await t.test('exists: false -> cleared', () => {
    const res = classifyRelationshipSnapshot({ exists: false });
    assert.equal(res, 'cleared');
  });

  await t.test('status: deleting -> cleared', () => {
    const res = classifyRelationshipSnapshot({ exists: true, status: 'deleting' });
    assert.equal(res, 'cleared');
  });

  await t.test('status: ended -> cleared', () => {
    const res = classifyRelationshipSnapshot({ exists: true, status: 'ended' });
    assert.equal(res, 'cleared');
  });

  await t.test('status: cancelled -> cleared', () => {
    const res = classifyRelationshipSnapshot({ exists: true, status: 'cancelled' });
    assert.equal(res, 'cleared');
  });

  await t.test('status: active -> keep', () => {
    const res = classifyRelationshipSnapshot({ exists: true, status: 'active' });
    assert.equal(res, 'keep');
  });

  await t.test('status: pending_partner -> keep', () => {
    const res = classifyRelationshipSnapshot({ exists: true, status: 'pending_partner' });
    assert.equal(res, 'keep');
  });

  await t.test('status: draft -> keep', () => {
    const res = classifyRelationshipSnapshot({ exists: true, status: 'draft' });
    assert.equal(res, 'keep');
  });
});

test('translations values and truthful descriptions without notification claims', async (t) => {
  await t.test('English menu labels exact values', () => {
    assert.equal(translations.en.signOutMenu, 'Sign out');
    assert.equal(translations.en.endRelationshipMenu, 'End relationship');
    assert.equal(translations.en.endRelationshipAndDeleteAccountMenu, 'Delete my account');
  });

  await t.test('Arabic menu labels exact values', () => {
    assert.equal(translations.ar.signOutMenu, 'تسجيل الخروج');
    assert.equal(translations.ar.endRelationshipMenu, 'إنهاء العلاقة');
    assert.equal(translations.ar.endRelationshipAndDeleteAccountMenu, 'حذف حسابي');
  });

  await t.test('English confirmation descriptions do not contain "notify"', () => {
    assert.equal(translations.en.exitRelationshipDesc.toLowerCase().includes('notify'), false);
    assert.equal(translations.en.deleteAccountDesc.toLowerCase().includes('notify'), false);
    assert.equal(translations.en.deleteAccountDescNoRelationship.toLowerCase().includes('notify'), false);
  });

  await t.test('Arabic confirmation descriptions do not contain "إشعار"', () => {
    assert.equal(translations.ar.exitRelationshipDesc.includes('إشعار'), false);
    assert.equal(translations.ar.deleteAccountDesc.includes('إشعار'), false);
    assert.equal(translations.ar.deleteAccountDescNoRelationship.includes('إشعار'), false);
  });
});
