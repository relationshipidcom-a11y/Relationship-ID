import { Language } from '../types';

export const readableError = (error: unknown, language: Language = 'ar'): string => {
  if (error instanceof Error) {
    const code = String(Reflect.get(error, 'code') || '');
    if (
      code.startsWith('auth/api-key-not-valid') ||
      code === 'auth/invalid-api-key' ||
      code === 'auth/operation-not-allowed' ||
      code === 'auth/unauthorized-domain'
    ) {
      console.error('[auth]', code);
      return language === 'ar'
        ? 'تسجيل الدخول غير متاح مؤقتاً. يرجى المحاولة لاحقاً.'
        : 'Sign-in is temporarily unavailable. Please try again later.';
    }
    if (code === 'auth/email-already-in-use') {
      return language === 'ar'
        ? 'هذا البريد الإلكتروني مسجل مسبقاً. يرجى التبديل إلى تبويب "تسجيل الدخول".'
        : 'This email is already in use. Please switch to "Sign In".';
    }
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return language === 'ar'
        ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
        : 'Invalid email or password.';
    }
    if (code === 'auth/user-not-found') {
      return language === 'ar'
        ? 'لا يوجد حساب مسجل بهذا البريد الإلكتروني. يرجى إنشاء حساب أولاً.'
        : 'No account found with this email. Please create an account first.';
    }
    if (code === 'auth/invalid-email') {
      return language === 'ar'
        ? 'صيغة البريد الإلكتروني غير صحيحة.'
        : 'Invalid email address format.';
    }
    if (code === 'auth/missing-email') {
      return language === 'ar'
        ? 'يرجى إدخال عنوان البريد الإلكتروني.'
        : 'Please enter your email address.';
    }
    if (code === 'auth/too-many-requests') {
      return language === 'ar'
        ? 'تم حظر الطلبات مؤقتاً بسبب تكرار المحاولات. يرجى الانتظار بضع دقائق والمحاولة مجدداً.'
        : 'Too many requests. Please wait a few minutes and try again.';
    }
    if (code === 'auth/weak-password') {
      return language === 'ar'
        ? 'كلمة المرور ضعيفة. يجب أن تتكون من 6 أحرف على الأقل.'
        : 'Password is too weak. It must be at least 6 characters.';
    }
    if (code === 'auth/popup-blocked') {
      return language === 'ar'
        ? 'تم حظر النافذة المنبثقة من قِبل المتصفح. يرجى السماح بالنوافذ المنبثقة لهذا الموقع لإتمام تسجيل الدخول عبر Google.'
        : 'Popup was blocked by your browser. Please allow popups for this site to sign in with Google.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return language === 'ar'
        ? 'تم إغلاق نافذة تسجيل الدخول من Google قبل إتمام العملية.'
        : 'Google sign-in popup was closed before completing.';
    }
    if (code === 'auth/cancelled-popup-request') {
      return language === 'ar'
        ? 'تم إلغاء عملية تسجيل الدخول السابقة.'
        : 'Previous sign-in request was cancelled.';
    }
    if (code === 'auth/operation-not-supported-in-this-environment') {
      return language === 'ar'
        ? 'تسجيل الدخول عبر Google غير مدعوم في هذه البيئة. يرجى فتح التطبيق في نافذة متصفح مستقلة أو استخدام البريد الإلكتروني.'
        : 'Google sign-in is not supported in this environment. Please open the app in a standalone browser window or use email sign-in.';
    }
    if (code === 'auth/account-exists-with-different-credential') {
      return language === 'ar'
        ? 'يوجد حساب مسجل مسبقاً بنفس البريد الإلكتروني بطريقة تسجيل دخول مختلفة.'
        : 'An account already exists with the same email using a different sign-in method.';
    }
    if (code === 'auth/invalid-verification-code') {
      return language === 'ar'
        ? 'رمز التحقق غير صحيح. يرجى التأكد منه والمحاولة مجدداً.'
        : 'The code is incorrect. Please check it and try again.';
    }
    if (code === 'auth/code-expired') {
      return language === 'ar'
        ? 'انتهت صلاحية الرمز. يرجى طلب رمز جديد.'
        : 'This code has expired. Please request a new one.';
    }
    if (code === 'auth/invalid-phone-number' || code === 'auth/missing-phone-number') {
      return language === 'ar'
        ? 'يرجى إدخال رقم جوال صحيح.'
        : 'Please enter a valid mobile number.';
    }
    if (code === 'auth/quota-exceeded') {
      return language === 'ar'
        ? 'لا يمكن إرسال رموز التحقق حالياً. يرجى المحاولة لاحقاً.'
        : "We can't send codes right now. Please try again later.";
    }
    if (code === 'auth/captcha-check-failed') {
      return language === 'ar'
        ? 'فشل التحقق الأمني. يرجى إعادة تحميل الصفحة والمحاولة مجدداً.'
        : 'Security check failed. Please reload the page and try again.';
    }
    if (typeof code === 'string' && code) {
      console.error('[auth]', code, error.message);
      return language === 'ar'
        ? 'حدث خطأ. يرجى المحاولة مرة أخرى.'
        : 'Something went wrong. Please try again.';
    }
    return error.message;
  }
  return 'Unknown authentication error';
};
