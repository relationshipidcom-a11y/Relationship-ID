import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, HelpCircle, KeyRound, Lock, Mail, Shield, X } from 'lucide-react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile
} from 'firebase/auth';
import { Language, AuthUser } from '../types';
import { translations } from '../i18n/translations';
import {
  auth,
  firebaseConfig,
  googleProvider,
  isFirebaseConfigured,
  maskedApiKey,
  missingFirebaseConfigKeys,
  testFirebaseApiKey
} from '../lib/firebase';
import styles from '../styles/AuthScreen.module.css';

interface AuthScreenProps {
  language: Language;
  onAuthSuccess: (user: AuthUser) => void;
  isP2InvitationFlow?: boolean;
  inviterName?: string;
  defaultEmail?: string;
  defaultFullName?: string;
}

const toAuthUser = (user: { uid: string; email: string | null; displayName: string | null }): AuthUser => ({
  id: user.uid,
  email: user.email || '',
  name: user.displayName || user.email?.split('@')[0] || 'Relationship ID User'
});

const readableError = (error: unknown, language: Language = 'ar'): string => {
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
    return typeof code === 'string' && code ? `${code}: ${error.message}` : error.message;
  }
  return 'Unknown authentication error';
};

export const AuthScreen: React.FC<AuthScreenProps> = ({
  language,
  onAuthSuccess,
  isP2InvitationFlow = false,
  inviterName = '',
  defaultEmail = '',
  defaultFullName = ''
}) => {
  const t = translations[language];
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState(defaultEmail || '');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(defaultFullName || '');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [apiKeyTestResult, setApiKeyTestResult] = useState<string | null>(null);
  const [isTestingApiKey, setIsTestingApiKey] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showForgotEmailModal, setShowForgotEmailModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');


  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) onAuthSuccess(toAuthUser(result.user));
      })
      .catch((err) => setError(readableError(err, language)));
  }, [onAuthSuccess, language]);

  const requireFirebase = () => {
    if (auth && isFirebaseConfigured) return auth;
    throw new Error(`Firebase is not configured. Missing: ${missingFirebaseConfigKeys.join(', ')}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const firebaseAuth = requireFirebase();
      await setPersistence(firebaseAuth, rememberMe ? browserLocalPersistence : browserSessionPersistence);

      if (activeTab === 'login') {
        const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
        onAuthSuccess(toAuthUser(credential.user));
      } else {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
        if (fullName.trim()) {
          await updateProfile(credential.user, { displayName: fullName.trim() });
        }
        onAuthSuccess(toAuthUser(credential.user));
      }
    } catch (err) {
      setError(readableError(err, language));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const firebaseAuth = requireFirebase();
      await setPersistence(firebaseAuth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      try {
        const credential = await signInWithPopup(firebaseAuth, googleProvider);
        onAuthSuccess(toAuthUser(credential.user));
      } catch (popupError) {
        const code = popupError instanceof Error ? Reflect.get(popupError, 'code') : undefined;
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
          await signInWithRedirect(firebaseAuth, googleProvider);
          return;
        }
        throw popupError;
      }
    } catch (err) {
      setError(readableError(err, language));
    } finally {
      setLoading(false);
    }
  };

  const openResetModal = () => {
    setError('');
    setResetEmail(email.trim());
    setResetError('');
    setResetSuccess('');
    setShowResetModal(true);
  };

  const handleModalPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');
    const targetEmail = resetEmail.trim();
    if (!targetEmail) {
      setResetError(language === 'ar' ? 'يرجى إدخال عنوان البريد الإلكتروني.' : 'Please enter your email address.');
      return;
    }
    setResetLoading(true);
    try {
      const firebaseAuth = requireFirebase();
      await sendPasswordResetEmail(firebaseAuth, targetEmail);
      const successMsg = language === 'ar'
        ? `تم إرسال رابط إعادة تعيين كلمة المرور إلى (${targetEmail}). يرجى فحص صندوق الوارد أو البريد غير الهام (Spam).`
        : `Password reset email sent to (${targetEmail}). Please check your inbox or spam folder.`;
      setResetSuccess(successMsg);
      setNotice(successMsg);
    } catch (err) {
      setResetError(readableError(err, language));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <main className="px-5 py-4 flex-1 flex flex-col justify-start">
      <div className="text-center pt-1 pb-4">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3b335c]/50 border border-[#83769c] text-[10.5px] font-semibold tracking-widest text-[#f3c4db] uppercase mb-2.5 font-mono">
          <Shield className="w-3.5 h-3.5" />
          <span>
            {isP2InvitationFlow
              ? (language === 'ar' ? 'P2 • مصادقة الشريك المدعو' : 'P2 • STEP 1 / 3')
              : (language === 'ar' ? 'P1 • الخطوة 1 / 5' : 'P1 • STEP 1 / 5')}
          </span>
        </div>

        <h2 className="text-[18px] font-bold text-white tracking-tight leading-snug max-w-[280px] mx-auto">
          {isP2InvitationFlow
            ? (language === 'ar' ? 'تسجيل الدخول لقبول الدعوة' : 'Sign in to accept invitation')
            : t.authHeroTitle}
        </h2>
        <p className="text-[11px] text-[#b6afd4] mt-1.5 leading-relaxed max-w-[290px] mx-auto">
          {isP2InvitationFlow
            ? (language === 'ar'
                ? `سجّل دخولك لإكمال دعوة ${inviterName}.`
                : `Sign in to continue the invitation from ${inviterName}.`)
            : t.authHeroDesc}
        </p>
      </div>

      {isP2InvitationFlow && (
        <div className="mb-3.5 w-full rounded-xl bg-[#211c38] border border-[#9b6682] p-2.5 flex items-center gap-2.5 shadow-sm text-right">
          <div className="w-8 h-8 rounded-lg bg-[#9b6682]/25 flex items-center justify-center shrink-0 text-[#f3c4db]">
            <Lock className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <p className="text-[11px] font-bold text-[#f3c4db] leading-tight">{t.p2ReturnNoticeTitle}</p>
            <p className="text-[9.5px] text-[#b6afd4]">
              {language === 'ar' ? `الدعوة من ${inviterName}` : `Invitation from ${inviterName}`}
            </p>
          </div>
        </div>
      )}

      <div className={styles.tabPillContainer}>
        <button type="button" onClick={() => setActiveTab('login')} className={activeTab === 'login' ? styles.activeTab : styles.inactiveTab}>
          {t.tabLogin}
        </button>
        <button type="button" onClick={() => setActiveTab('signup')} className={activeTab === 'signup' ? styles.activeTab : styles.inactiveTab}>
          {t.tabSignup}
        </button>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={handleGoogleAuth}
        className="w-full py-2.5 px-4 rounded-xl border border-white/20 bg-[#2e264f] hover:bg-[#39305f] transition-all flex items-center justify-center gap-2.5 text-xs font-medium text-white shadow-sm mb-3.5 active:scale-95 cursor-pointer disabled:opacity-50"
      >
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z" fill="#4285F4" />
          <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.37 7.34 24 12 24z" fill="#34A853" />
          <path d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.94 0 12s.46 3.84 1.26 5.42l4.02-3.15z" fill="#FBBC05" />
          <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.63 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z" fill="#EA4335" />
        </svg>
        <span>{t.googleContinue}</span>
      </button>

      <div className="relative flex items-center justify-center my-1 mb-3.5">
        <div className="border-t border-white/20 w-full" />
        <span className="bg-[#1a1530] px-2 text-[10px] uppercase tracking-widest font-semibold text-[#b6afd4] absolute">{t.orUseEmail}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {activeTab === 'signup' && (
          <div>
            <label className="block text-[11px] font-medium text-[#b6afd4] mb-1" htmlFor="auth-name">{t.fullNameLabel}</label>
            <input id="auth-name" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className={styles.inputField} placeholder={t.fullNamePlaceholder} />
          </div>
        )}

        <div>
          <label className="block text-[11px] font-medium text-[#b6afd4] mb-1" htmlFor="auth-email">{t.emailLabel}</label>
          <input id="auth-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={styles.inputField} placeholder={t.emailPlaceholder} dir="ltr" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2 gap-2">
            <label className="block text-[11px] font-medium text-[#b6afd4] shrink-0 select-none" htmlFor="auth-pass">{t.passwordLabel}</label>
            {activeTab === 'login' && (
              <div className="flex items-center gap-1.5 text-[11px] font-medium shrink-0">
                <button
                  type="button"
                  onClick={openResetModal}
                  className="text-[#f3c4db] hover:text-white hover:underline transition-colors bg-transparent border-none cursor-pointer p-0"
                >
                  {t.forgotPassword}
                </button>
                <span className="text-[#83769c]/70 select-none" aria-hidden="true">|</span>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setShowForgotEmailModal(true);
                  }}
                  className="text-[#b6afd4] hover:text-[#f3c4db] hover:underline transition-colors bg-transparent border-none cursor-pointer p-0"
                >
                  {t.forgotEmail}
                </button>
              </div>
            )}
          </div>
          <div className="relative">
            <input
              id="auth-pass"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${styles.inputField} ltr:pr-10 ltr:pl-4 rtl:pl-10 rtl:pr-4`}
              autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'}
            />
            <button
              type="button"
              aria-label="Toggle password visibility"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 ltr:right-0 ltr:pr-3 rtl:left-0 rtl:pl-3 flex items-center text-[#b6afd4] hover:text-white cursor-pointer bg-transparent border-none"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center pt-0.5">
          <input id="auth-remember" type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-3.5 w-3.5 rounded bg-[#141124] border-white/30 text-[#9b6682] focus:ring-0 cursor-pointer accent-[#9b6682]" />
          <label htmlFor="auth-remember" className="ml-2 block text-[11px] text-[#b6afd4] select-none cursor-pointer">{t.keepSignedIn}</label>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-[11px] leading-relaxed space-y-2 shadow-sm">
            <div className="font-semibold flex items-center gap-1.5 text-rose-300">
              <span aria-hidden="true">⚠️</span>
              <span>{language === 'ar' ? 'تنبيه المصادقة' : 'Authentication Notice'}</span>
            </div>
            <p className="text-rose-100/90 text-[10.5px] leading-normal">{error}</p>
            {(error.toLowerCase().includes('api-key') || error.toLowerCase().includes('apikey')) && (
              <div className="mt-2.5 pt-2 border-t border-rose-500/30 font-mono text-[10px] text-left leading-relaxed" dir="ltr">
                <div className="flex flex-wrap items-center gap-2 mb-2 text-rose-200/90">
                  <span>projectId: <strong>{firebaseConfig.projectId || '(none)'}</strong></span>
                  <span>•</span>
                  <span>apiKey: <strong>{maskedApiKey}</strong></span>
                </div>
                <button
                  type="button"
                  disabled={isTestingApiKey}
                  onClick={async () => {
                    setIsTestingApiKey(true);
                    try {
                      const res = await testFirebaseApiKey();
                      setApiKeyTestResult(res.message);
                    } catch (err) {
                      setApiKeyTestResult(err instanceof Error ? `❌ Error: ${err.message}` : '❌ Error testing API key');
                    } finally {
                      setIsTestingApiKey(false);
                    }
                  }}
                  className="px-2.5 py-1 rounded bg-rose-900/60 hover:bg-rose-900 text-rose-100 border border-rose-400/40 text-[10px] font-medium transition cursor-pointer disabled:opacity-50"
                >
                  {isTestingApiKey ? 'Testing...' : 'Test API key with Google'}
                </button>
                {apiKeyTestResult && (
                  <div className="mt-1.5 p-1.5 rounded bg-black/40 border border-rose-500/30 text-[10px] text-rose-100 whitespace-pre-wrap break-all">
                    {apiKeyTestResult}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {notice && (
          <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-[11px] leading-relaxed flex items-start gap-2.5 shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-300">
                {language === 'ar' ? 'استعادة الحساب' : 'Account Recovery'}
              </p>
              <p className="text-emerald-100/90 text-[10.5px] mt-0.5 leading-normal">{notice}</p>
            </div>
          </div>
        )}

        <button type="submit" disabled={loading} className={`${styles.submitBtn} disabled:opacity-50`}>
          <span>{loading ? '...' : activeTab === 'login' ? t.loginBtn : t.signupBtn}</span>
          {language === 'ar' ? <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />}
        </button>
      </form>

      <div className="text-center mt-3 space-y-1">
        <p className="text-[11px] text-[#8e84af]">
          {activeTab === 'login' ? t.dontHaveAccount : t.haveAccount}{' '}
          <button type="button" onClick={() => setActiveTab(activeTab === 'login' ? 'signup' : 'login')} className="text-[#f3c4db] underline hover:text-white font-medium bg-transparent border-none cursor-pointer">
            {activeTab === 'login' ? t.createAccount : t.tabLogin}
          </button>
        </p>
      </div>

      {showResetModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !resetLoading) setShowResetModal(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#1b1532] border border-[#83769c]/50 p-5 shadow-2xl relative text-start space-y-3.5">
            <button
              type="button"
              onClick={() => setShowResetModal(false)}
              disabled={resetLoading}
              aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#b6afd4] hover:text-white hover:bg-white/10 transition-colors cursor-pointer bg-transparent border-none disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#9b6682]/25 border border-[#9b6682]/40 flex items-center justify-center text-[#f3c4db] shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 id="reset-modal-title" className="text-[15px] font-bold text-white leading-tight">
                  {language === 'ar' ? 'استعادة كلمة المرور' : 'Reset Password'}
                </h3>
                <p className="text-[10.5px] text-[#b6afd4] mt-0.5">
                  {language === 'ar' ? 'استعادة الوصول إلى حسابك' : 'Recover access to your account'}
                </p>
              </div>
            </div>

            <p className="text-[11px] text-[#b6afd4] leading-relaxed">
              {language === 'ar'
                ? 'أدخل عنوان بريدك الإلكتروني المسجل، وسنرسل لك رابطاً رسمياً لإعادة تعيين كلمة المرور.'
                : 'Enter your registered email address, and we will send you an official password reset link.'}
            </p>

            <form onSubmit={handleModalPasswordReset} className="space-y-3 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-[#b6afd4] mb-1" htmlFor="reset-email-input">
                  {t.emailLabel}
                </label>
                <input
                  id="reset-email-input"
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder={t.emailPlaceholder}
                  className={styles.inputField}
                  dir="ltr"
                  autoFocus
                />
              </div>

              {resetError && (
                <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-[10.5px] leading-relaxed">
                  {resetError}
                </div>
              )}

              {resetSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-[10.5px] leading-relaxed flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p>{resetSuccess}</p>
                </div>
              )}

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#9b6682] hover:bg-[#b07494] text-white font-semibold text-xs transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {resetLoading ? (
                    <span>{language === 'ar' ? 'جاري الإرسال...' : 'Sending...'}</span>
                  ) : (
                    <span>{language === 'ar' ? 'إرسال الرابط' : 'Send Reset Link'}</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  disabled={resetLoading}
                  className="py-2.5 px-3.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-xs text-[#b6afd4] hover:text-white transition cursor-pointer"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showForgotEmailModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-email-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowForgotEmailModal(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#1b1532] border border-[#83769c]/50 p-5 shadow-2xl relative text-start space-y-4">
            <button
              type="button"
              onClick={() => setShowForgotEmailModal(false)}
              aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#b6afd4] hover:text-white hover:bg-white/10 transition-colors cursor-pointer bg-transparent border-none"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#9b6682]/25 border border-[#9b6682]/40 flex items-center justify-center text-[#f3c4db] shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 id="forgot-email-modal-title" className="text-[15px] font-bold text-white leading-tight">
                  {language === 'ar' ? 'استعادة البريد الإلكتروني' : 'Forgot Email?'}
                </h3>
                <p className="text-[10.5px] text-[#b6afd4] mt-0.5">
                  {language === 'ar' ? 'إرشادات استرجاع الحساب والوصول' : 'Account access guidance'}
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-[11px] text-[#b6afd4] leading-relaxed">
              <div className="p-3 rounded-xl bg-[#211c38] border border-white/10 space-y-1">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f3c4db]" />
                  <span>{language === 'ar' ? 'البحث في بريدك الإلكتروني' : 'Search Your Mailbox'}</span>
                </p>
                <p className="text-[10.5px] text-[#b6afd4]">
                  {language === 'ar'
                    ? 'ابحث في صناديق بريدك عن رسائل من "Relationship ID" أو إشعارات الدعوة للتحقق من البريد المستخدم.'
                    : 'Search your email accounts for messages or invitations from "Relationship ID" to verify which email was used.'}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#211c38] border border-white/10 space-y-1">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f3c4db]" />
                  <span>{language === 'ar' ? 'المتابعة باستخدام Google' : 'Try Google Sign-In'}</span>
                </p>
                <p className="text-[10.5px] text-[#b6afd4]">
                  {language === 'ar'
                    ? 'إذا كنت قد سجلت عبر حساب Google، يمكنك النقر على "المتابعة باستخدام Google" لتسجيل الدخول فوراً.'
                    : 'If you originally registered with Google, simply use the "Continue with Google" button.'}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#211c38] border border-white/10 space-y-1">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f3c4db]" />
                  <span>{language === 'ar' ? 'التحقق مع الشريك' : 'Check with Your Partner'}</span>
                </p>
                <p className="text-[10.5px] text-[#b6afd4]">
                  {language === 'ar'
                    ? 'يمكن لشريكك مراجعة تفاصيل الدعوة المشتركة للتأكد من عنوان البريد المسجل في السجل.'
                    : 'Your partner can view the mutual invitation details to confirm the registered email address.'}
                </p>
              </div>
            </div>

            <div className="pt-1 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowForgotEmailModal(false)}
                className="w-full py-2 px-4 rounded-xl bg-[#9b6682] hover:bg-[#b07494] text-white font-semibold text-xs transition shadow-sm cursor-pointer"
              >
                {language === 'ar' ? 'فهمت ذلك • إغلاق' : 'Got it • Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

