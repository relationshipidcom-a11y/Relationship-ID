import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Loader2, Phone, ShieldCheck } from 'lucide-react';
import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  linkWithCredential,
  updatePhoneNumber
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import type { CountryCode } from 'libphonenumber-js';
import { legacyCountryValue, normalizePhoneNumber, supportedCountries } from '../utils/phone';
import { Language } from '../types';
import styles from '../styles/RegistryForm.module.css';

interface PhoneVerificationFieldProps {
  id: string;
  language: Language;
  country: CountryCode;
  number: string;
  verifiedE164?: string | null;
  onCountryChange: (country: CountryCode) => void;
  onNumberChange: (number: string) => void;
  onVerified: (e164: string | null) => void;
  required?: boolean;
  label?: string;
}

const readableError = (error: unknown): string => {
  if (error instanceof Error) {
    const code = Reflect.get(error, 'code');
    return typeof code === 'string' ? `${code}: ${error.message}` : error.message;
  }
  return 'Unknown verification error';
};

export const PhoneVerificationField: React.FC<PhoneVerificationFieldProps> = ({
  id,
  language,
  country,
  number,
  verifiedE164,
  onCountryChange,
  onNumberChange,
  onVerified,
  required = true,
  label
}) => {
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const verifierRef = useRef<RecaptchaVerifier | null>(null);

  const canonical = useMemo(() => normalizePhoneNumber(country, number), [country, number]);
  const isVerified = Boolean(canonical && verifiedE164 === canonical);

  const clearVerifier = () => {
    try {
      verifierRef.current?.clear();
    } catch {
      // Clearing an already-destroyed verifier is harmless.
    }
    verifierRef.current = null;
  };

  useEffect(() => () => clearVerifier(), []);

  const resetCandidateVerification = () => {
    setVerificationId(null);
    setOtp('');
    setError('');
    clearVerifier();
    onVerified(null);
  };

  const changeCountry = (value: string) => {
    resetCandidateVerification();
    onCountryChange(value as CountryCode);
  };

  const changeNumber = (value: string) => {
    resetCandidateVerification();
    onNumberChange(value);
  };

  const sendCode = async () => {
    setError('');
    if (!canonical) {
      setError(language === 'ar' ? 'أدخل رقم جوال صالحاً.' : 'Enter a valid mobile number.');
      return;
    }
    if (!auth?.currentUser) {
      setError(language === 'ar' ? 'سجّل الدخول أولاً للتحقق من الجوال.' : 'Sign in before verifying your mobile.');
      return;
    }

    if (auth.currentUser.phoneNumber === canonical) {
      onVerified(canonical);
      return;
    }

    setSending(true);
    clearVerifier();
    try {
      auth.languageCode = language === 'ar' ? 'ar' : 'en';
      const verifier = new RecaptchaVerifier(auth, `${id}-recaptcha`, {
        size: 'invisible'
      });
      verifierRef.current = verifier;
      const provider = new PhoneAuthProvider(auth);
      const idFromFirebase = await provider.verifyPhoneNumber(canonical, verifier);
      setVerificationId(idFromFirebase);
    } catch (err) {
      setError(readableError(err));
      clearVerifier();
    } finally {
      setSending(false);
    }
  };

  const confirmCode = async () => {
    setError('');
    if (!verificationId || otp.trim().length < 6) {
      setError(language === 'ar' ? 'أدخل رمز التحقق المرسل إليك.' : 'Enter the verification code sent to you.');
      return;
    }
    if (!auth?.currentUser || !canonical) {
      setError(language === 'ar' ? 'جلسة التحقق غير صالحة.' : 'Verification session is not valid.');
      return;
    }

    setConfirming(true);
    try {
      const credential = PhoneAuthProvider.credential(verificationId, otp.trim());
      const hasPhoneProvider = auth.currentUser.providerData.some((item) => item.providerId === 'phone');
      if (hasPhoneProvider) {
        await updatePhoneNumber(auth.currentUser, credential);
      } else {
        await linkWithCredential(auth.currentUser, credential);
      }
      await auth.currentUser.reload();
      onVerified(auth.currentUser.phoneNumber || canonical);
      setVerificationId(null);
      setOtp('');
      clearVerifier();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${id}-number`} className="block text-[11px] font-medium text-[#b6afd4]">
          {label || (language === 'ar' ? 'رقم الجوال' : 'Mobile Number')}
        </label>
        {isVerified ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#9b6682]/25 border border-[#9b6682]/50 text-[#f3c4db] inline-flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            {language === 'ar' ? 'تم التحقق' : 'Verified'}
          </span>
        ) : (
          <span className="text-[10px] text-[#8e84af]">{language === 'ar' ? 'غير متحقق' : 'Not verified'}</span>
        )}
      </div>

      <div className="grid grid-cols-12 gap-2" dir="ltr">
        <select
          aria-label={language === 'ar' ? 'رمز الدولة' : 'Country code'}
          value={country}
          onChange={(event) => changeCountry(event.target.value)}
          className="col-span-5 bg-[#141124] border border-white/20 text-white rounded-xl px-2 py-2.5 text-[11px] outline-none focus:border-[#f3c4db]"
        >
          {supportedCountries.map((item) => (
            <option key={item.iso} value={item.iso}>
              {item.flag} {item.dialCode} {language === 'ar' ? item.nameAr : item.nameEn}
            </option>
          ))}
        </select>
        <input
          id={`${id}-number`}
          type="tel"
          inputMode="tel"
          required={required}
          value={number}
          onChange={(event) => changeNumber(event.target.value)}
          className={`${styles.inputControl} col-span-7`}
          dir="ltr"
          autoComplete="tel-national"
          placeholder={country === 'SA' ? '55 123 4567' : 'Mobile number'}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={sending || confirming || isVerified}
          onClick={sendCode}
          className="flex-1 py-2 rounded-lg bg-[#2e264f] border border-[#9b6682]/50 text-[#f3c4db] text-[11px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          {isVerified
            ? (language === 'ar' ? 'تم التحقق' : 'Verified')
            : (language === 'ar' ? 'تحقق من الجوال' : 'Verify Mobile')}
        </button>
        {canonical && (
          <span className="text-[9px] text-[#8e84af] font-mono" dir="ltr">
            {legacyCountryValue(country).split(' ')[1]}…{canonical.slice(-4)}
          </span>
        )}
      </div>

      {verificationId && !isVerified && (
        <div className="flex gap-2" dir="ltr">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={language === 'ar' ? 'رمز SMS' : 'SMS code'}
            className={`${styles.inputControl} flex-1`}
          />
          <button
            type="button"
            onClick={confirmCode}
            disabled={confirming || otp.length < 6}
            className="px-3 rounded-xl bg-[#9b6682] text-white text-[11px] font-semibold disabled:opacity-50"
          >
            {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : (language === 'ar' ? 'تأكيد' : 'Confirm')}
          </button>
        </div>
      )}

      <div id={`${id}-recaptcha`} />

      {error && (
        <p className="text-[10px] leading-relaxed text-rose-300 break-words" dir="ltr">
          {error}
        </p>
      )}
    </div>
  );
};
