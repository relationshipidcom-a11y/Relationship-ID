import assert from 'node:assert/strict';
import test from 'node:test';
import { readableError } from '../src/utils/authErrors';

test('Authentication readableError unit tests', async (t) => {
  await t.test('handles auth/popup-blocked in en and ar', () => {
    const error = Object.assign(new Error('Popup blocked'), { code: 'auth/popup-blocked' });
    assert.equal(
      readableError(error, 'en'),
      'Popup was blocked by your browser. Please allow popups for this site to sign in with Google.'
    );
    assert.equal(
      readableError(error, 'ar'),
      'تم حظر النافذة المنبثقة من قِبل المتصفح. يرجى السماح بالنوافذ المنبثقة لهذا الموقع لإتمام تسجيل الدخول عبر Google.'
    );
  });

  await t.test('handles auth/popup-closed-by-user in en and ar', () => {
    const error = Object.assign(new Error('Popup closed'), { code: 'auth/popup-closed-by-user' });
    assert.equal(
      readableError(error, 'en'),
      'Google sign-in popup was closed before completing.'
    );
    assert.equal(
      readableError(error, 'ar'),
      'تم إغلاق نافذة تسجيل الدخول من Google قبل إتمام العملية.'
    );
  });

  await t.test('handles auth/cancelled-popup-request in en and ar', () => {
    const error = Object.assign(new Error('Cancelled'), { code: 'auth/cancelled-popup-request' });
    assert.equal(
      readableError(error, 'en'),
      'Previous sign-in request was cancelled.'
    );
    assert.equal(
      readableError(error, 'ar'),
      'تم إلغاء عملية تسجيل الدخول السابقة.'
    );
  });

  await t.test('handles auth/operation-not-supported-in-this-environment in en and ar', () => {
    const error = Object.assign(new Error('Unsupported'), { code: 'auth/operation-not-supported-in-this-environment' });
    assert.equal(
      readableError(error, 'en'),
      'Google sign-in is not supported in this environment. Please open the app in a standalone browser window or use email sign-in.'
    );
    assert.equal(
      readableError(error, 'ar'),
      'تسجيل الدخول عبر Google غير مدعوم في هذه البيئة. يرجى فتح التطبيق في نافذة متصفح مستقلة أو استخدام البريد الإلكتروني.'
    );
  });

  await t.test('handles auth/account-exists-with-different-credential in en and ar', () => {
    const error = Object.assign(new Error('Account exists'), { code: 'auth/account-exists-with-different-credential' });
    assert.equal(
      readableError(error, 'en'),
      'An account already exists with the same email using a different sign-in method.'
    );
    assert.equal(
      readableError(error, 'ar'),
      'يوجد حساب مسجل مسبقاً بنفس البريد الإلكتروني بطريقة تسجيل دخول مختلفة.'
    );
  });

  await t.test('handles auth/unauthorized-domain in en and ar', () => {
    const error = Object.assign(new Error('Unauthorized domain'), { code: 'auth/unauthorized-domain' });
    assert.equal(
      readableError(error, 'en'),
      'Domain not authorized. Add this preview domain in Firebase Console -> Authentication -> Settings -> Authorized domains.'
    );
    assert.equal(
      readableError(error, 'ar'),
      'نطاق التطبيق غير مصرّح به في Firebase. أضف نطاق المعاينة في Firebase Console -> Authentication -> Settings -> Authorized domains.'
    );
  });

  await t.test('handles generic errors gracefully', () => {
    const error = new Error('Network offline');
    assert.equal(readableError(error, 'en'), 'Network offline');
    assert.equal(readableError('Unknown string', 'en'), 'Unknown authentication error');
  });
});
