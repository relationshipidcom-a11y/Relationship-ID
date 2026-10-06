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
      'Sign-in is temporarily unavailable. Please try again later.'
    );
    assert.equal(
      readableError(error, 'ar'),
      'تسجيل الدخول غير متاح مؤقتاً. يرجى المحاولة لاحقاً.'
    );
  });

  await t.test('handles generic errors gracefully', () => {
    const error = new Error('Network offline');
    assert.equal(readableError(error, 'en'), 'Network offline');
    assert.equal(readableError('Unknown string', 'en'), 'Unknown authentication error');
  });

  // Step 3 additional credential and validation tests
  await t.test('handles auth/api-key-not-valid and auth/invalid-api-key (Step 3)', () => {
    const error = Object.assign(new Error('Invalid key'), { code: 'auth/api-key-not-valid' });
    assert.equal(readableError(error, 'en'), 'Sign-in is temporarily unavailable. Please try again later.');
    assert.equal(readableError(error, 'ar'), 'تسجيل الدخول غير متاح مؤقتاً. يرجى المحاولة لاحقاً.');

    const error2 = Object.assign(new Error('Invalid key'), { code: 'auth/invalid-api-key' });
    assert.equal(readableError(error2, 'en'), 'Sign-in is temporarily unavailable. Please try again later.');
    assert.equal(readableError(error2, 'ar'), 'تسجيل الدخول غير متاح مؤقتاً. يرجى المحاولة لاحقاً.');
  });

  await t.test('handles auth/operation-not-allowed (Step 3)', () => {
    const error = Object.assign(new Error('Not allowed'), { code: 'auth/operation-not-allowed' });
    assert.equal(readableError(error, 'en'), 'Sign-in is temporarily unavailable. Please try again later.');
    assert.equal(readableError(error, 'ar'), 'تسجيل الدخول غير متاح مؤقتاً. يرجى المحاولة لاحقاً.');
  });

  await t.test('handles auth/email-already-in-use (Step 3)', () => {
    const error = Object.assign(new Error('In use'), { code: 'auth/email-already-in-use' });
    assert.equal(readableError(error, 'en'), 'This email is already in use. Please switch to "Sign In".');
    assert.equal(readableError(error, 'ar'), 'هذا البريد الإلكتروني مسجل مسبقاً. يرجى التبديل إلى تبويب "تسجيل الدخول".');
  });

  await t.test('handles auth/wrong-password and auth/invalid-credential (Step 3)', () => {
    const error1 = Object.assign(new Error('Wrong'), { code: 'auth/wrong-password' });
    assert.equal(readableError(error1, 'en'), 'Invalid email or password.');
    assert.equal(readableError(error1, 'ar'), 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');

    const error2 = Object.assign(new Error('Invalid'), { code: 'auth/invalid-credential' });
    assert.equal(readableError(error2, 'en'), 'Invalid email or password.');
    assert.equal(readableError(error2, 'ar'), 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
  });

  await t.test('handles auth/user-not-found (Step 3)', () => {
    const error = Object.assign(new Error('Not found'), { code: 'auth/user-not-found' });
    assert.equal(readableError(error, 'en'), 'No account found with this email. Please create an account first.');
    assert.equal(readableError(error, 'ar'), 'لا يوجد حساب مسجل بهذا البريد الإلكتروني. يرجى إنشاء حساب أولاً.');
  });

  await t.test('handles auth/invalid-email and auth/missing-email (Step 3)', () => {
    const error1 = Object.assign(new Error('Invalid email'), { code: 'auth/invalid-email' });
    assert.equal(readableError(error1, 'en'), 'Invalid email address format.');
    assert.equal(readableError(error1, 'ar'), 'صيغة البريد الإلكتروني غير صحيحة.');

    const error2 = Object.assign(new Error('Missing email'), { code: 'auth/missing-email' });
    assert.equal(readableError(error2, 'en'), 'Please enter your email address.');
    assert.equal(readableError(error2, 'ar'), 'يرجى إدخال عنوان البريد الإلكتروني.');
  });

  await t.test('handles auth/too-many-requests and auth/weak-password (Step 3)', () => {
    const error1 = Object.assign(new Error('Too many'), { code: 'auth/too-many-requests' });
    assert.equal(readableError(error1, 'en'), 'Too many requests. Please wait a few minutes and try again.');
    assert.equal(readableError(error1, 'ar'), 'تم حظر الطلبات مؤقتاً بسبب تكرار المحاولات. يرجى الانتظار بضع دقائق والمحاولة مجدداً.');

    const error2 = Object.assign(new Error('Weak'), { code: 'auth/weak-password' });
    assert.equal(readableError(error2, 'en'), 'Password is too weak. It must be at least 6 characters.');
    assert.equal(readableError(error2, 'ar'), 'كلمة المرور ضعيفة. يجب أن تتكون من 6 أحرف على الأقل.');
  });

  // a) Verify developer text is absent from auth error messages
  await t.test('developer text is absent from auth error messages in en and ar', () => {
    const codes = [
      'auth/api-key-not-valid',
      'auth/invalid-api-key',
      'auth/operation-not-allowed',
      'auth/unauthorized-domain'
    ];
    const forbidden = ['Console', '.env', 'apiKey', 'Firebase', 'Authorized domains'];

    for (const code of codes) {
      const err = Object.assign(new Error('Internal reason'), { code });
      for (const lang of ['en', 'ar'] as const) {
        const msg = readableError(err, lang);
        for (const phrase of forbidden) {
          assert.equal(
            msg.includes(phrase),
            false,
            `Message for ${code} in ${lang} must not contain "${phrase}"`
          );
        }
      }
    }
  });

  // b) One test per new code in Step 2, checking exact en and ar text
  await t.test('handles auth/invalid-verification-code in en and ar', () => {
    const error = Object.assign(new Error('Invalid verification code'), { code: 'auth/invalid-verification-code' });
    assert.equal(readableError(error, 'en'), 'The code is incorrect. Please check it and try again.');
    assert.equal(readableError(error, 'ar'), 'رمز التحقق غير صحيح. يرجى التأكد منه والمحاولة مجدداً.');
  });

  await t.test('handles auth/code-expired in en and ar', () => {
    const error = Object.assign(new Error('Code expired'), { code: 'auth/code-expired' });
    assert.equal(readableError(error, 'en'), 'This code has expired. Please request a new one.');
    assert.equal(readableError(error, 'ar'), 'انتهت صلاحية الرمز. يرجى طلب رمز جديد.');
  });

  await t.test('handles auth/invalid-phone-number in en and ar', () => {
    const error = Object.assign(new Error('Invalid phone number'), { code: 'auth/invalid-phone-number' });
    assert.equal(readableError(error, 'en'), 'Please enter a valid mobile number.');
    assert.equal(readableError(error, 'ar'), 'يرجى إدخال رقم جوال صحيح.');
  });

  await t.test('handles auth/missing-phone-number in en and ar', () => {
    const error = Object.assign(new Error('Missing phone number'), { code: 'auth/missing-phone-number' });
    assert.equal(readableError(error, 'en'), 'Please enter a valid mobile number.');
    assert.equal(readableError(error, 'ar'), 'يرجى إدخال رقم جوال صحيح.');
  });

  await t.test('handles auth/quota-exceeded in en and ar', () => {
    const error = Object.assign(new Error('Quota exceeded'), { code: 'auth/quota-exceeded' });
    assert.equal(readableError(error, 'en'), "We can't send codes right now. Please try again later.");
    assert.equal(readableError(error, 'ar'), 'لا يمكن إرسال رموز التحقق حالياً. يرجى المحاولة لاحقاً.');
  });

  await t.test('handles auth/captcha-check-failed in en and ar', () => {
    const error = Object.assign(new Error('Captcha check failed'), { code: 'auth/captcha-check-failed' });
    assert.equal(readableError(error, 'en'), 'Security check failed. Please reload the page and try again.');
    assert.equal(readableError(error, 'ar'), 'فشل التحقق الأمني. يرجى إعادة تحميل الصفحة والمحاولة مجدداً.');
  });

  // c) Error with code 'auth/some-unknown-code' returns generic message from Step 3 without 'auth/'
  await t.test('handles unknown auth code with safe fallback without auth/', () => {
    const error = Object.assign(new Error('Internal unexpected auth error'), { code: 'auth/some-unknown-code' });
    const en = readableError(error, 'en');
    const ar = readableError(error, 'ar');
    assert.equal(en, 'Something went wrong. Please try again.');
    assert.equal(ar, 'حدث خطأ. يرجى المحاولة مرة أخرى.');
    assert.equal(en.includes('auth/'), false);
    assert.equal(ar.includes('auth/'), false);
  });
});
