import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Shield } from 'lucide-react';
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
import { auth, googleProvider, isFirebaseConfigured, missingFirebaseConfigKeys } from '../lib/firebase';
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

const readableError = (error: unknown): string => {
  if (error instanceof Error) {
    const code = Reflect.get(error, 'code');
    return typeof code === 'string' ? `${code}: ${error.message}` : error.message;
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


  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) onAuthSuccess(toAuthUser(result.user));
      })
      .catch((err) => setError(readableError(err)));
  }, [onAuthSuccess]);

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
      setError(readableError(err));
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
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setError('');
    setNotice('');
    try {
      const firebaseAuth = requireFirebase();
      if (!email.trim()) {
        throw new Error(language === 'ar' ? 'أدخل البريد الإلكتروني أولاً.' : 'Enter your email first.');
      }
      await sendPasswordResetEmail(firebaseAuth, email.trim());
      setNotice(language === 'ar' ? 'تم إرسال رابط إعادة تعيين كلمة المرور.' : 'Password reset email sent.');
    } catch (err) {
      setError(readableError(err));
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
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-medium text-[#b6afd4]" htmlFor="auth-pass">{t.passwordLabel}</label>
            <button type="button" onClick={handlePasswordReset} className="text-[11px] text-[#f3c4db] hover:underline transition-colors bg-transparent border-none cursor-pointer p-0">{t.forgotPassword}</button>
          </div>
          <div className="relative">
            <input id="auth-pass" type={showPassword ? 'text' : 'password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={`${styles.inputField} pr-10`} autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'} />
            <button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#b6afd4] hover:text-white cursor-pointer bg-transparent border-none">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center pt-0.5">
          <input id="auth-remember" type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-3.5 w-3.5 rounded bg-[#141124] border-white/30 text-[#9b6682] focus:ring-0 cursor-pointer accent-[#9b6682]" />
          <label htmlFor="auth-remember" className="ml-2 block text-[11px] text-[#b6afd4] select-none cursor-pointer">{t.keepSignedIn}</label>
        </div>

        {error && <p className="text-[10px] text-rose-300 leading-relaxed break-words" dir="ltr">{error}</p>}
        {notice && <p className="text-[10px] text-[#f3c4db] leading-relaxed">{notice}</p>}

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
    </main>
  );
};
