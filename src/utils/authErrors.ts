import { Language } from '../types';

export const readableError = (error: unknown, language: Language = 'ar'): string => {
  if (error instanceof Error) {
    const code = String(Reflect.get(error, 'code') || '');
    if (code.startsWith('auth/api-key-not-valid') || code === 'auth/invalid-api-key') {
      return language === 'ar'
        ? 'مفتاح Firebase API غير صالح (auth/api-key-not-valid). مفتاح API الحالي غير معتمد لدى خدمة Google Identity Toolkit. لحل المشكلة: افتح Firebase Console لمشروعك (relationship-id)، وتأكد من تفعيل Authentication، ثم انسخ الـ apiKey من إعدادات المشروع (Project Settings -> General -> Your apps -> Web app) وضعه في ملف .env.'
        : 'Firebase API key is invalid (auth/api-key-not-valid). The current key is not recognized by Google Identity Toolkit. To fix this: open your project in Firebase Console, ensure Authentication is enabled, copy the Web apiKey from Project Settings -> General -> Your apps -> Web app into your .env file.';
    }
    if (code === 'auth/operation-not-allowed') {
      return language === 'ar'
        ? 'تسجيل الدخول بالبريد الإلكتروني غير مفعّل. افتح Firebase Console -> Build -> Authentication -> Sign-in method وقم بتفعيل Email/Password.'
        : 'Email/Password sign-in is not enabled. Go to Firebase Console -> Build -> Authentication -> Sign-in method and enable Email/Password.';
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
    if (code === 'auth/unauthorized-domain') {
      return language === 'ar'
        ? 'نطاق التطبيق غير مصرّح به في Firebase. أضف نطاق المعاينة في Firebase Console -> Authentication -> Settings -> Authorized domains.'
        : 'Domain not authorized. Add this preview domain in Firebase Console -> Authentication -> Settings -> Authorized domains.';
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
    return typeof code === 'string' && code ? `${code}: ${error.message}` : error.message;
  }
  return 'Unknown authentication error';
};
