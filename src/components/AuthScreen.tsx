import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, HelpCircle, KeyRound, Lock, Mail, Shield, X } from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile
} from 'firebase/auth';
import { Language, AuthUser, ScreenId } from '../types';
import { translations } from '../i18n/translations';
import type { Auth } from 'firebase/auth';
import type { PersistenceAdapter } from '../utils/authPersistence';
import {
  auth as defaultAuth,
  googleProvider,
  isFirebaseConfigured,
  missingFirebaseConfigKeys
} from '../lib/firebase';
import styles from '../styles/AuthScreen.module.css';
import { authAttemptFailureMessage, getAuthErrorCode, readableError } from '../utils/authErrors';
import { useAuthPersistence } from '../utils/authPersistence';
import { runGoogleSignIn } from '../utils/googleSignIn';
import { runDiagnostics, Diagnostics } from '../utils/diagnostics';
import { DiagnosticDetails } from './DiagnosticDetails';
import { BrandMark } from './BrandMark';
import { getInvitationInstruction } from '../utils/invitationGuidance';
import { validateEmailAddress, validateFullName } from '../utils/validation';

export { getAuthErrorCode, readableError };

interface AuthScreenProps {
  language: Language;
  onAuthSuccess: (user: AuthUser) => void;
  isP2InvitationFlow?: boolean;
  inviterName?: string;
  contactRequirement?: 'email' | 'mobile' | 'both';
  defaultEmail?: string;
  defaultFullName?: string;
  onNavigate?: (screen: ScreenId) => void;
  step?: number;
  totalSteps?: number;
  auth?: Auth | null;
  persistenceAdapter?: PersistenceAdapter;
  signInWithPopupFn?: (auth: Auth, provider: any) => Promise<any>;
  signInWithEmailAndPasswordFn?: (auth: Auth, email: string, pass: string) => Promise<any>;
  createUserWithEmailAndPasswordFn?: (auth: Auth, email: string, pass: string) => Promise<any>;
  updateProfileFn?: (user: any, profile: { displayName?: string | null; photoURL?: string | null }) => Promise<void>;
  sendPasswordResetEmailFn?: (auth: Auth, email: string) => Promise<any>;
}

const toAuthUser = (user: { uid: string; email: string | null; displayName: string | null }): AuthUser => ({
  id: user.uid,
  email: user.email || '',
  name: user.displayName || user.email?.split('@')[0] || 'Relationship ID User'
});

export const AuthScreen: React.FC<AuthScreenProps> = ({
  language,
  onAuthSuccess,
  isP2InvitationFlow = false,
  inviterName = '',
  contactRequirement,
  defaultEmail = '',
  defaultFullName = '',
  onNavigate,
  step,
  totalSteps,
  auth: propAuth,
  persistenceAdapter,
  signInWithPopupFn,
  signInWithEmailAndPasswordFn,
  createUserWithEmailAndPasswordFn,
  updateProfileFn,
  sendPasswordResetEmailFn
}) => {
  const effectiveAuth = propAuth !== undefined ? propAuth : defaultAuth;
  const t = translations[language];
  const googleInFlightRef = useRef(false);
  const emailInFlightRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState(defaultEmail || '');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(defaultFullName || '');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [nameError, setNameError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showForgotEmailModal, setShowForgotEmailModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  const {
    persistenceStatus,
    rememberMe,
    persistenceError,
    authInFlight,
    isGoogleSignInReady,
    setRememberMe,
    retryPersistence,
    controller
  } = useAuthPersistence(effectiveAuth, false, persistenceAdapter);

  const isGoogleReady = isGoogleSignInReady(loading);

  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      prevTabRef.current = activeTab;
    }
  }, [activeTab]);

  const handleNameChange = (e: React.FormEvent<HTMLInputElement>) => {
    const val = (e.target as HTMLInputElement).value;
    setFullName(val);
    if (nameError && validateFullName(val.trim())) {
      setNameError(false);
    }
  };

  const handleNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (activeTab === 'signup') {
      const trimmed = (e.target.value !== undefined ? e.target.value : fullName).trim();
      setNameError(!validateFullName(trimmed));
    }
  };

  const handleEmailChange = (e: React.FormEvent<HTMLInputElement>) => {
    const val = (e.target as HTMLInputElement).value;
    setEmail(val);
    if (emailError && validateEmailAddress(val.trim().toLowerCase())) {
      setEmailError(false);
    }
  };

  const handleEmailBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (activeTab === 'signup') {
      const trimmedLower = (e.target.value !== undefined ? e.target.value : email).trim().toLowerCase();
      setEmailError(!validateEmailAddress(trimmedLower));
    }
  };

  useEffect(() => {
    if (persistenceStatus === 'error') {
      try {
        setDiagnostics(runDiagnostics());
      } catch {
        console.error('Diagnostic collection failed');
      }
    } else {
      setDiagnostics(null);
    }
  }, [persistenceStatus]);

  useEffect(() => {
    if (!effectiveAuth) return;
    getRedirectResult(effectiveAuth)
      .then((result) => {
        if (result?.user) onAuthSuccess(toAuthUser(result.user));
      })
      .catch((err) => {
        setError(readableError(err, language));
      });
  }, [onAuthSuccess, language, effectiveAuth]);

  const requireFirebaseConfig = () => {
    if (isFirebaseConfigured) return;
    console.error('[auth] Missing required Firebase configuration keys:', missingFirebaseConfigKeys.join(', '));
    const err = new Error('Authentication service is not configured');
    (err as any).code = 'app/not-configured';
    throw err;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading || authInFlight || emailInFlightRef.current) return;
    emailInFlightRef.current = true;

    // Synchronously extract authoritative values from form elements before any await
    const form = e.currentTarget;
    const formElements = form.elements;
    const emailEl = formElements.namedItem('email') as HTMLInputElement | null;
    const passEl = formElements.namedItem('password') as HTMLInputElement | null;
    const nameEl = formElements.namedItem('fullName') as HTMLInputElement | null;

    // Current DOM values authoritative even if React state is nonempty or stale
    const authoritativeEmail = (emailEl ? emailEl.value : email).trim().toLowerCase();
    const authoritativePassword = passEl ? passEl.value : password; // NEVER trim password!
    const authoritativeFullName = (nameEl ? nameEl.value : fullName).trim();

    // Sync state for consistency
    if (authoritativeEmail !== email) setEmail(authoritativeEmail);
    if (authoritativePassword !== password) setPassword(authoritativePassword);
    if (activeTab === 'signup' && authoritativeFullName !== fullName) setFullName(authoritativeFullName);

    setError('');
    setNotice('');

    if (activeTab === 'signup') {
      let hasValidationError = false;
      const isNameValid = validateFullName(authoritativeFullName);
      setNameError(!isNameValid);
      if (!isNameValid) {
        hasValidationError = true;
      }

      const isEmailValid = validateEmailAddress(authoritativeEmail);
      setEmailError(!isEmailValid);
      if (!isEmailValid) {
        hasValidationError = true;
      }

      if (hasValidationError) {
        emailInFlightRef.current = false;
        return;
      }
    }

    setLoading(true);
    try {
      if (!authoritativeEmail) {
        throw Object.assign(new Error('Missing email'), { code: 'auth/missing-email' });
      }
      if (!authoritativePassword) {
        throw Object.assign(new Error('Missing password'), { code: 'auth/missing-password' });
      }

      requireFirebaseConfig();
      const attempt = await controller.runAuthAttempt(async (firebaseAuth: Auth) => {
        if (activeTab === 'login') {
          const credential = await (signInWithEmailAndPasswordFn || signInWithEmailAndPassword)(
            firebaseAuth,
            authoritativeEmail,
            authoritativePassword
          );
          onAuthSuccess(toAuthUser(credential.user));
        } else {
          const credential = await (createUserWithEmailAndPasswordFn || createUserWithEmailAndPassword)(
            firebaseAuth,
            authoritativeEmail,
            authoritativePassword
          );
          if (authoritativeFullName) {
            await (updateProfileFn || updateProfile)(credential.user, { displayName: authoritativeFullName });
          }
          onAuthSuccess(toAuthUser(credential.user));
        }
      });

      if (!attempt.started) {
        setError(authAttemptFailureMessage(attempt.reason, language));
        return;
      }
    } catch (err: unknown) {
      const authCode = getAuthErrorCode(err) || (err instanceof Error && (err as any).code) || 'unknown';
      const sanitizedCode = typeof authCode === 'string' && /^auth\/[a-z0-9.-]+$/i.test(authCode) ? authCode : 'unknown';
      console.error('[auth-failure]', {
        operation: activeTab === 'login' ? 'signin' : 'signup',
        code: sanitizedCode,
      });
      setError(readableError(err, language));
    } finally {
      emailInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    // Synchronous duplicate lock: checked AND set synchronously before first await
    if (googleInFlightRef.current) return;
    googleInFlightRef.current = true;

    setError('');
    setNotice('');

    // Readiness at call time: re-check from controller's current state, not render-captured isGoogleReady
    const liveControllerState = controller.getState();
    const isLiveReady = controller.isGoogleSignInReady(loading);
    if (!isLiveReady || liveControllerState.status !== 'ready') {
      const reason = !effectiveAuth
        ? 'no-auth'
        : liveControllerState.authInFlight || loading
        ? 'busy'
        : 'not-ready';
      setError(authAttemptFailureMessage(reason, language));
      googleInFlightRef.current = false;
      return;
    }

    setLoading(true);
    try {
      requireFirebaseConfig();
      const attempt = await runGoogleSignIn(controller, {
        popup: (firebaseAuth) => (signInWithPopupFn || signInWithPopup)(firebaseAuth, googleProvider),
      });

      if (!attempt.started) {
        setError(authAttemptFailureMessage(attempt.reason, language));
        return;
      }

      if (attempt.result?.user) {
        onAuthSuccess(toAuthUser(attempt.result.user));
      }
    } catch (err) {
      setError(readableError(err, language));
    } finally {
      googleInFlightRef.current = false;
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

  const handleModalPasswordReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');
    const form = e.currentTarget;
    const resetInput = form?.elements?.namedItem('resetEmail') as HTMLInputElement | null;
    const targetEmail = (resetInput ? resetInput.value : resetEmail).trim();
    if (!targetEmail) {
      setResetError(language === 'ar' ? 'يرجى إدخال عنوان البريد الإلكتروني.' : 'Please enter your email address.');
      return;
    }
    if (!effectiveAuth) {
      setResetError(
        language === 'ar'
          ? 'تعذر تهيئة جلسة تسجيل الدخول. يرجى إعادة المحاولة.'
          : 'Authentication service is not initialized. Please try again.'
      );
      return;
    }
    setResetLoading(true);
    try {
      requireFirebaseConfig();
      await (sendPasswordResetEmailFn || sendPasswordResetEmail)(effectiveAuth, targetEmail);
      const successMsg = language === 'ar'
        ? `تم إرسال رابط إعادة تعيين كلمة المرور إلى (${targetEmail}). يرجى فحص صندوق الوارد أو البريد غير الهام (Spam).`
        : `Password reset email sent to (${targetEmail}). Please check your inbox or spam folder.`;
      setResetSuccess(successMsg);
      setNotice(successMsg);
    } catch (err: unknown) {
      const authCode = getAuthErrorCode(err) || (err instanceof Error && (err as any).code) || 'unknown';
      const sanitizedCode = typeof authCode === 'string' && /^auth\/[a-z0-9.-]+$/i.test(authCode) ? authCode : 'unknown';
      console.error('[auth-failure]', { operation: 'password-reset', code: sanitizedCode });
      setResetError(readableError(err, language));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <main className="px-5 py-4 flex-1 flex flex-col justify-start">
      <div className="flex justify-center mb-4">
        <BrandMark size={96} alt="Relationship ID" />
      </div>

      <div className="text-center pt-1 pb-3">
        {isP2InvitationFlow ? (
          <>
            {(() => {
              const currentStep = step ?? 1;
              const total = totalSteps ?? 3;
              return (
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#39436D]/70 border border-[#A0A9D1] text-sm font-semibold text-[#B8BCE6] mb-2.5 ${language === 'ar' ? 'font-sans tracking-normal' : 'tracking-wider uppercase'}`}>
                  <Shield className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? `الخطوة ${currentStep} من ${total}` : `Step ${currentStep} of ${total}`}</span>
                </div>
              );
            })()}
            <h2 className="text-xl font-bold text-white tracking-tight leading-snug max-w-[280px] mx-auto">
              {language === 'ar' ? 'تسجيل الدخول لقبول الدعوة' : 'Sign in to accept invitation'}
            </h2>
            <p className="text-base sm:text-sm text-[#D6DAED] mt-1.5 leading-relaxed max-w-[290px] mx-auto">
              {language === 'ar'
                ? `سجّل دخولك لإكمال دعوة ${inviterName}.`
                : `Sign in to continue the invitation from ${inviterName}.`}
            </p>
          </>
        ) : (
          <div className="w-full bg-[#414A75] border border-[#A0A9D1] rounded-2xl p-4 text-start shadow-xl space-y-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug">
                {t.serviceIntroTitle}
              </h2>
              <p className="text-xs sm:text-sm text-[#D6DAED] mt-1 leading-relaxed">
                {t.serviceIntroDesc}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 py-1.5 px-2 bg-[#39436D] rounded-xl border border-[#A0A9D1]/50 text-xs font-semibold text-[#B8BCE6] text-center">
              <span>{t.serviceIntroDating}</span>
              <span className="text-white/40">•</span>
              <span>{t.serviceIntroEngaged}</span>
              <span className="text-white/40">•</span>
              <span>{t.serviceIntroMarried}</span>
            </div>

            <div className="flex items-center justify-between text-xs font-medium text-white/90 pt-0.5 px-1" dir={language === 'ar' ? 'rtl' : 'ltr'}>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#B8BCE6]" />{t.serviceIntroStep1}</span>
              <span className="text-[#B8BCE6]" aria-hidden="true">{language === 'ar' ? '←' : '→'}</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#B8BCE6]" />{t.serviceIntroStep2}</span>
              <span className="text-[#B8BCE6]" aria-hidden="true">{language === 'ar' ? '←' : '→'}</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#B8BCE6]" />{t.serviceIntroStep3}</span>
            </div>

            <p className="text-[11px] sm:text-xs text-[#B8BED8] pt-1.5 border-t border-white/10 leading-relaxed text-center">
              {t.serviceIntroClarification}
            </p>
          </div>
        )}

        <div className="mt-2.5">
          <a
            href="/about"
            onClick={(e) => {
              e.preventDefault();
              onNavigate?.('about');
            }}
            className="inline-flex items-center gap-1.5 text-xs text-[#B8BCE6] hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t.aboutStandards}</span>
          </a>
        </div>
      </div>

      {isP2InvitationFlow && (
        <div className="mb-3.5 w-full rounded-xl bg-[#414A75] border border-[#B8BCE6]/40 p-3 flex flex-col gap-2 shadow-sm text-start">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#B8BCE6]/20 flex items-center justify-center shrink-0 text-[#B8BCE6]">
              <Lock className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-sm font-bold text-[#B8BCE6] leading-tight">{t.p2ReturnNoticeTitle}</p>
              <p className="text-sm text-[#D6DAED]">
                {language === 'ar' ? `الدعوة من ${inviterName || ''}` : `Invitation from ${inviterName || ''}`}
              </p>
            </div>
          </div>
          {contactRequirement && getInvitationInstruction(contactRequirement, language) && (
            <div className="pt-2 border-t border-white/10 flex items-start gap-2 text-xs sm:text-sm text-[#B8BCE6]">
              <Shield className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{getInvitationInstruction(contactRequirement, language)}</span>
            </div>
          )}
        </div>
      )}

      <div className={styles.tabPillContainer}>
        <button
          type="button"
          onClick={() => {
            setError('');
            setNameError(false);
            setEmailError(false);
            setActiveTab('login');
          }}
          className={activeTab === 'login' ? styles.activeTab : styles.inactiveTab}
        >
          {t.tabLogin}
        </button>
        <button
          type="button"
          onClick={() => {
            setError('');
            setNameError(false);
            setEmailError(false);
            setActiveTab('signup');
          }}
          className={activeTab === 'signup' ? styles.activeTab : styles.inactiveTab}
        >
          {t.tabSignup}
        </button>
      </div>

      <button
        type="button"
        disabled={!isGoogleReady || authInFlight}
        onClick={handleGoogleAuth}
        aria-busy={persistenceStatus === 'pending' || loading || authInFlight}
        className="w-full py-3 px-4 rounded-xl border border-[#A0A9D1] bg-[#39436D] hover:bg-[#4F5A8C] transition-all flex items-center justify-center gap-2.5 text-base sm:text-sm font-medium text-white shadow-sm mb-3.5 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
      >
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z" fill="#4285F4" />
          <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.37 7.34 24 12 24z" fill="#34A853" />
          <path d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.94 0 12s.46 3.84 1.26 5.42l4.02-3.15z" fill="#FBBC05" />
          <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.63 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z" fill="#EA4335" />
        </svg>
        <span>
          {persistenceStatus === 'pending'
            ? t.sessionInitializing
            : t.googleContinue}
        </span>
      </button>

      {persistenceStatus === 'error' && (
        <div
          role="alert"
          aria-live="polite"
          aria-atomic="true"
          className="mb-3.5 p-3 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-200 text-sm leading-relaxed space-y-2 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-amber-300">
              <span aria-hidden="true">⚠️</span>
              <span>{t.sessionInitErrorTitle}</span>
            </div>
            <button
              type="button"
              onClick={retryPersistence}
              aria-label={t.sessionInitRetry}
              className="px-2.5 py-1 rounded bg-amber-900/60 hover:bg-amber-900 text-amber-100 border border-amber-400/40 text-xs font-medium transition cursor-pointer"
            >
              {t.sessionInitRetry}
            </button>
          </div>
          <p className="text-amber-100/90 text-xs leading-normal">
            {persistenceError ? readableError(persistenceError, language) : (language === 'ar' 
              ? 'تعذر عرض هذه الصفحة بشكل صحيح. يمكنك إعادة تحميلها أو العودة إلى الصفحة الرئيسية.' 
              : 'This page could not be displayed properly. You can try reloading it or return to the home screen.')}
          </p>
          {diagnostics && (
            <DiagnosticDetails
              diagnostics={diagnostics}
              initStatus="unknown"
              failureCategory="persistence_initialization_failure"
              authPersistence={persistenceStatus}
              isRtl={language === 'ar'}
            />
          )}
        </div>
      )}

      <div className="relative flex items-center justify-center my-1 mb-3.5">
        <div className="border-t border-[#A0A9D1] w-full" />
        <span className="bg-[#252D52] px-2 text-sm uppercase tracking-widest font-semibold text-[#D6DAED] absolute">{t.orUseEmail}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {activeTab === 'signup' && (
          <div>
            <label className="block text-sm font-medium text-[#D6DAED] mb-1.5" htmlFor="auth-name">{t.fullNameLabel}</label>
            <input
              id="auth-name"
              name="fullName"
              type="text"
              required
              minLength={2}
              maxLength={60}
              value={fullName}
              onChange={handleNameChange}
              onInput={handleNameChange}
              onBlur={handleNameBlur}
              className={styles.inputField}
              placeholder={t.fullNamePlaceholder}
              autoComplete="name"
              aria-invalid={nameError ? 'true' : 'false'}
              aria-describedby={nameError ? 'auth-name-error' : undefined}
            />
            {nameError && (
              <p
                id="auth-name-error"
                role="alert"
                className="text-xs text-rose-300 mt-1.5 text-start"
              >
                {language === 'ar' ? 'الرجاء إدخال اسم صحيح (2–60 حرفاً)' : 'Please enter a valid name (2–60 characters)'}
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-[#D6DAED] mb-1.5" htmlFor="auth-email">{t.emailLabel}</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            required
            value={email}
            onChange={handleEmailChange}
            onInput={handleEmailChange}
            onBlur={handleEmailBlur}
            className={styles.inputField}
            placeholder={t.emailPlaceholder}
            dir="ltr"
            autoComplete="email"
            aria-invalid={emailError ? 'true' : 'false'}
            aria-describedby={emailError ? 'auth-email-error' : undefined}
          />
          {emailError && (
            <p
              id="auth-email-error"
              role="alert"
              className="text-xs text-rose-300 mt-1.5 text-start"
            >
              {language === 'ar' ? 'الرجاء إدخال بريد إلكتروني صحيح' : 'Please enter a valid email address'}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2 gap-2">
            <label className="block text-sm font-medium text-[#D6DAED] shrink-0 select-none" htmlFor="auth-pass">{t.passwordLabel}</label>
            {activeTab === 'login' && (
              <div className="flex items-center gap-1.5 text-sm font-medium shrink-0">
                <button
                  type="button"
                  onClick={openResetModal}
                  className="text-[#B8BCE6] hover:text-white hover:underline transition-colors bg-transparent border-none cursor-pointer p-0"
                >
                  {t.forgotPassword}
                </button>
                <span className="text-[#D6DAED]/40 select-none" aria-hidden="true">|</span>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setShowForgotEmailModal(true);
                  }}
                  className="text-[#D6DAED] hover:text-[#B8BCE6] hover:underline transition-colors bg-transparent border-none cursor-pointer p-0"
                >
                  {t.forgotEmail}
                </button>
              </div>
            )}
          </div>
          <div className="relative">
            <input
              id="auth-pass"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              className={`${styles.inputField} ltr:pr-10 ltr:pl-4 rtl:pl-10 rtl:pr-4`}
              autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'}
            />
            <button
              type="button"
              aria-label="Toggle password visibility"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 ltr:right-0 ltr:pr-3 rtl:left-0 rtl:pl-3 flex items-center text-[#D6DAED] hover:text-white cursor-pointer bg-transparent border-none"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="pt-0.5">
          <label htmlFor="auth-remember" className={`inline-flex items-center gap-2.5 text-sm text-[#D6DAED] select-none ${loading || authInFlight ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
            <input
              id="auth-remember"
              type="checkbox"
              checked={rememberMe}
              disabled={loading || authInFlight}
              onChange={(e) => {
                if (loading || authInFlight) return;
                setRememberMe(e.target.checked);
              }}
              className="h-4 w-4 rounded bg-[#252D52] border-[#A0A9D1] text-[#B8BCE6] focus:ring-2 focus:ring-[#D3D8FF] cursor-pointer accent-[#B8BCE6] shrink-0 disabled:cursor-not-allowed"
            />
            <span>{t.keepSignedIn}</span>
          </label>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-sm leading-relaxed space-y-1.5 shadow-sm">
            <div className="font-semibold flex items-center gap-1.5 text-rose-300">
              <span aria-hidden="true">⚠️</span>
              <span>{language === 'ar' ? 'تنبيه المصادقة' : 'Authentication Notice'}</span>
            </div>
            <p className="text-rose-100/90 text-sm leading-normal">{error}</p>
          </div>
        )}
        {notice && (
          <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-sm leading-relaxed flex items-start gap-2.5 shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-300">
                {language === 'ar' ? 'استعادة الحساب' : 'Account Recovery'}
              </p>
              <p className="text-emerald-100/90 text-sm mt-0.5 leading-normal">{notice}</p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || authInFlight || emailInFlightRef.current}
          className={`${styles.submitBtn} disabled:opacity-50`}
        >
          <span>{loading ? '...' : activeTab === 'login' ? t.loginBtn : t.signupBtn}</span>
          {language === 'ar' ? <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />}
        </button>
      </form>

      <div className="text-center mt-3 space-y-1">
        <p className="text-sm text-[#B8BED8]">
          {activeTab === 'login' ? t.dontHaveAccount : t.haveAccount}{' '}
          <button
            type="button"
            onClick={() => {
              setError('');
              setNameError(false);
              setEmailError(false);
              const nextTab = activeTab === 'login' ? 'signup' : 'login';
              setActiveTab(nextTab);
            }}
            className="text-[#B8BCE6] underline hover:text-white font-medium bg-transparent border-none cursor-pointer"
          >
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
          <div className="w-full max-w-sm rounded-2xl bg-[#414A75] border border-[#A0A9D1] p-5 shadow-2xl relative text-start space-y-3.5">
            <button
              type="button"
              onClick={() => setShowResetModal(false)}
              disabled={resetLoading}
              aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[#252D52] text-[#D6DAED] hover:text-white flex items-center justify-center cursor-pointer border border-[#A0A9D1] transition-colors disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#B8BCE6]/20 border border-[#B8BCE6]/40 flex items-center justify-center text-[#B8BCE6] shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 id="reset-modal-title" className="text-base font-bold text-white leading-tight">
                  {language === 'ar' ? 'استعادة كلمة المرور' : 'Reset Password'}
                </h3>
                <p className="text-sm text-[#D6DAED] mt-0.5">
                  {language === 'ar' ? 'استعادة الوصول إلى حسابك' : 'Recover access to your account'}
                </p>
              </div>
            </div>

            <p className="text-sm text-[#D6DAED] leading-relaxed">
              {language === 'ar'
                ? 'أدخل عنوان بريدك الإلكتروني المسجل، وسنرسل لك رابطاً رسمياً لإعادة تعيين كلمة المرور.'
                : 'Enter your registered email address, and we will send you an official password reset link.'}
            </p>

            <form onSubmit={handleModalPasswordReset} className="space-y-3 pt-1">
              <div>
                <label className="block text-sm font-medium text-[#D6DAED] mb-1.5" htmlFor="reset-email-input">
                  {t.emailLabel}
                </label>
                <input
                  id="reset-email-input"
                  name="resetEmail"
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  onInput={(e) => setResetEmail((e.target as HTMLInputElement).value)}
                  placeholder={t.emailPlaceholder}
                  className={styles.inputField}
                  dir="ltr"
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {resetError && (
                <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-sm leading-relaxed">
                  {resetError}
                </div>
              )}

              {resetSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-sm leading-relaxed flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p>{resetSuccess}</p>
                </div>
              )}

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#B8BCE6] to-[#B8BCE6] hover:from-[#C5C9EC] hover:to-[#C5C9EC] text-[#202747] font-semibold text-sm transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 min-h-[40px]"
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
                  className="py-2.5 px-3.5 rounded-xl border border-[#A0A9D1] bg-white/5 hover:bg-white/10 text-sm text-[#D6DAED] hover:text-white transition cursor-pointer min-h-[40px] disabled:opacity-50"
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
          <div className="w-full max-w-sm rounded-2xl bg-[#414A75] border border-[#A0A9D1] p-5 shadow-2xl relative text-start space-y-4">
            <button
              type="button"
              onClick={() => setShowForgotEmailModal(false)}
              aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[#252D52] text-[#D6DAED] hover:text-white flex items-center justify-center cursor-pointer border border-[#A0A9D1] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#B8BCE6]/20 border border-[#B8BCE6]/40 flex items-center justify-center text-[#B8BCE6] shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 id="forgot-email-modal-title" className="text-base font-bold text-white leading-tight">
                  {language === 'ar' ? 'استعادة البريد الإلكتروني' : 'Forgot Email?'}
                </h3>
                <p className="text-sm text-[#D6DAED] mt-0.5">
                  {language === 'ar' ? 'إرشادات استرجاع الحساب والوصول' : 'Account access guidance'}
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-sm text-[#D6DAED] leading-relaxed">
              <div className="p-3 rounded-xl bg-[#39436D] border border-[#A0A9D1] space-y-1">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B8BCE6]" />
                  <span>{language === 'ar' ? 'البحث في بريدك الإلكتروني' : 'Search Your Mailbox'}</span>
                </p>
                <p className="text-sm text-[#D6DAED]">
                  {language === 'ar'
                    ? 'ابحث في صناديق بريدك عن رسائل من "Relationship ID" أو إشعارات الدعوة للتحقق من البريد المستخدم.'
                    : 'Search your email accounts for messages or invitations from "Relationship ID" to verify which email was used.'}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#39436D] border border-[#A0A9D1] space-y-1">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B8BCE6]" />
                  <span>{language === 'ar' ? 'المتابعة باستخدام Google' : 'Try Google Sign-In'}</span>
                </p>
                <p className="text-sm text-[#D6DAED]">
                  {language === 'ar'
                    ? 'إذا كنت قد سجلت عبر حساب Google، يمكنك النقر على "المتابعة باستخدام Google" لتسجيل الدخول فوراً.'
                    : 'If you originally registered with Google, simply use the "Continue with Google" button.'}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#39436D] border border-[#A0A9D1] space-y-1">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B8BCE6]" />
                  <span>{language === 'ar' ? 'التحقق مع الشريك' : 'Check with Your Partner'}</span>
                </p>
                <p className="text-sm text-[#D6DAED]">
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
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#B8BCE6] to-[#B8BCE6] hover:from-[#C5C9EC] hover:to-[#C5C9EC] text-[#202747] font-semibold text-sm transition shadow-sm cursor-pointer min-h-[40px]"
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

