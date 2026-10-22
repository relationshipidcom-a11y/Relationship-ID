import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Loader2, MessageSquare } from 'lucide-react';
import { auth } from '../lib/firebase';
import type { CountryCode } from 'libphonenumber-js';
import { legacyCountryValue, normalizePhoneNumber, supportedCountries } from '../utils/phone';
import { Language } from '../types';
import { authFetch } from '../utils/api';
import styles from '../styles/RegistryForm.module.css';

interface PhoneVerificationFieldProps {
  id: string;
  language: Language;
  country: CountryCode;
  number: string;
  verifiedE164?: string | null;
  isWhatsappVerified?: boolean;
  onCountryChange: (country: CountryCode) => void;
  onNumberChange: (number: string) => void;
  onVerified: (e164: string | null) => void;
  required?: boolean;
  label?: string;
}

export const PhoneVerificationField: React.FC<PhoneVerificationFieldProps> = ({
  id,
  language,
  country,
  number,
  verifiedE164,
  isWhatsappVerified = true,
  onCountryChange,
  onNumberChange,
  onVerified,
  required = true,
  label
}) => {
  const [codeSent, setCodeSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const canonical = useMemo(() => normalizePhoneNumber(country, number), [country, number]);
  const isVerified = Boolean(canonical && verifiedE164 === canonical);

  // Track current canonical in a ref to check against live state, not closure-captured variables
  const currentCanonicalRef = useRef<string | null>(canonical);
  currentCanonicalRef.current = canonical;

  // Track previous canonical to detect genuine number changes vs formatting-only edits
  const prevCanonicalRef = useRef<string | null>(canonical);

  // Track current authenticated user UID
  const currentUid = auth?.currentUser?.uid || null;
  const prevUidRef = useRef<string | null>(currentUid);

  // Monotonically increasing operation generation counter to reject obsolete responses
  const operationGenRef = useRef(0);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      operationGenRef.current += 1;
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownTimerRef.current = setTimeout(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, [resendCooldown]);

  // Handle external or internal changes to canonical phone number
  useEffect(() => {
    if (canonical !== prevCanonicalRef.current) {
      // Canonical number changed or became invalid: invalidate operations & clear pending session
      operationGenRef.current += 1;
      setSending(false);
      setConfirming(false);
      setCodeSent(false);
      setOtp('');
      setError('');
      setResendCooldown(0);
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      if (verifiedE164 && verifiedE164 !== canonical) {
        onVerified(null);
      }
      prevCanonicalRef.current = canonical;
    }
  }, [canonical, verifiedE164, onVerified]);

  // Handle changes to authenticated account
  useEffect(() => {
    const nowUid = auth?.currentUser?.uid || null;
    if (nowUid !== prevUidRef.current) {
      operationGenRef.current += 1;
      setSending(false);
      setConfirming(false);
      setCodeSent(false);
      setOtp('');
      setError('');
      setResendCooldown(0);
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      prevUidRef.current = nowUid;
    }
  }, [currentUid]);

  const isOpCurrent = (opId: number, opCanonical: string, opUid: string | null): boolean => {
    if (!isMountedRef.current) return false;
    if (operationGenRef.current !== opId) return false;
    if (!currentCanonicalRef.current || currentCanonicalRef.current !== opCanonical) return false;
    const nowUid = auth?.currentUser?.uid || null;
    if (nowUid !== opUid) return false;
    return true;
  };

  const handleCountryChange = (newCountry: string) => {
    onCountryChange(newCountry as CountryCode);
    const newCanonical = normalizePhoneNumber(newCountry as CountryCode, number);
    if (newCanonical !== currentCanonicalRef.current) {
      operationGenRef.current += 1;
      setSending(false);
      setConfirming(false);
      setCodeSent(false);
      setOtp('');
      setError('');
      setResendCooldown(0);
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      if (verifiedE164 && verifiedE164 !== newCanonical) {
        onVerified(null);
      }
      prevCanonicalRef.current = newCanonical;
      currentCanonicalRef.current = newCanonical;
    }
  };

  const handleNumberChange = (newNumber: string) => {
    onNumberChange(newNumber);
    const newCanonical = normalizePhoneNumber(country, newNumber);
    if (newCanonical !== currentCanonicalRef.current) {
      operationGenRef.current += 1;
      setSending(false);
      setConfirming(false);
      setCodeSent(false);
      setOtp('');
      setError('');
      setResendCooldown(0);
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      if (verifiedE164 && verifiedE164 !== newCanonical) {
        onVerified(null);
      }
      prevCanonicalRef.current = newCanonical;
      currentCanonicalRef.current = newCanonical;
    }
  };

  const sendCode = async () => {
    if (sending || confirming) return;
    setError('');
    const requestCanonical = canonical;
    if (!requestCanonical) {
      setError(language === 'ar' ? 'أدخل رقم جوال صالحاً.' : 'Enter a valid mobile number.');
      return;
    }
    const currentUid = auth?.currentUser?.uid || null;
    if (!currentUid) {
      setError(
        language === 'ar'
          ? 'سجّل الدخول أولاً للتحقق من الجوال عبر واتساب.'
          : 'Sign in before verifying your mobile number via WhatsApp.'
      );
      return;
    }

    const opId = ++operationGenRef.current;
    setSending(true);

    try {
      const res = await authFetch('/api/whatsapp/verify/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: legacyCountryValue(country),
          number
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!isOpCurrent(opId, requestCanonical, currentUid)) return;

      if (!res.ok) {
        if (res.status === 429) {
          setError(
            language === 'ar'
              ? 'محاولات تحقق كثيرة جداً. يرجى الانتظار ساعة قبل المحاولة مرة أخرى.'
              : 'Too many verification attempts. Please wait an hour before trying again.'
          );
        } else if (res.status === 503) {
          setError(
            language === 'ar'
              ? 'خدمة التحقق عبر واتساب غير متاحة حالياً.'
              : 'WhatsApp verification is currently unavailable.'
          );
        } else if (res.status === 502) {
          setError(
            language === 'ar'
              ? 'تعذر تسليم رمز واتساب أو الرقم غير مسجل في واتساب. تأكد من وجود حساب واتساب نشط على هذا الرقم، أو حاول لاحقاً.'
              : 'WhatsApp delivery failed or number not reachable on WhatsApp. Ensure this number has an active WhatsApp account, or try again later.'
          );
        } else if (res.status === 400) {
          setError(
            language === 'ar'
              ? (data.messageAr || 'رقم الجوال غير صالح.')
              : (data.messageEn || 'Invalid mobile phone number.')
          );
        } else {
          setError(
            language === 'ar'
              ? (data.messageAr || 'فشل إرسال رمز التحقق عبر واتساب.')
              : (data.messageEn || 'Failed to send WhatsApp verification code.')
          );
        }
        return;
      }

      setCodeSent(true);
      setResendCooldown(60);
    } catch {
      if (isOpCurrent(opId, requestCanonical, currentUid)) {
        setError(
          language === 'ar'
            ? 'حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.'
            : 'Network error. Please try again.'
        );
      }
    } finally {
      if (isOpCurrent(opId, requestCanonical, currentUid)) {
        setSending(false);
      }
    }
  };

  const confirmCode = async () => {
    if (sending || confirming) return;
    setError('');
    const requestCanonical = canonical;
    if (otp.trim().length !== 6) {
      setError(language === 'ar' ? 'أدخل رمز التحقق المكون من 6 أرقام.' : 'Enter the 6-digit verification code.');
      return;
    }
    const currentUid = auth?.currentUser?.uid || null;
    if (!currentUid || !requestCanonical) {
      setError(language === 'ar' ? 'جلسة التحقق غير صالحة.' : 'Verification session is not valid.');
      return;
    }

    const opId = ++operationGenRef.current;
    setConfirming(true);

    try {
      const res = await authFetch('/api/whatsapp/verify/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: legacyCountryValue(country),
          number,
          code: otp.trim()
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!isOpCurrent(opId, requestCanonical, currentUid)) return;

      if (!res.ok) {
        setError(
          language === 'ar'
            ? (data.messageAr || 'رمز التحقق غير صالح أو منتهي الصلاحية.')
            : (data.messageEn || 'Invalid or expired verification code.')
        );
        return;
      }

      if (data.success && data.whatsappTrusted) {
        onVerified(requestCanonical);
        setCodeSent(false);
        setOtp('');
      } else {
        setError(language === 'ar' ? 'فشل التحقق من الرمز.' : 'Verification check failed.');
      }
    } catch {
      if (isOpCurrent(opId, requestCanonical, currentUid)) {
        setError(language === 'ar' ? 'حدث خطأ في الاتصال أثناء التحقق من الرمز.' : 'Network error while verifying code.');
      }
    } finally {
      if (isOpCurrent(opId, requestCanonical, currentUid)) {
        setConfirming(false);
      }
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${id}-number`} className="block text-sm font-medium text-[#B7ACC8]">
          {label || (language === 'ar' ? 'رقم الهاتف المحمول' : 'Mobile Phone Number')}
        </label>
        {isVerified ? (
          <span className="text-sm px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 inline-flex items-center gap-1 font-medium">
            <CheckCircle className="w-3.5 h-3.5" />
            {isWhatsappVerified
              ? (language === 'ar' ? 'موثوق عبر واتساب ✓' : 'Verified via WhatsApp ✓')
              : (language === 'ar' ? 'رقم موثوق ✓' : 'Verified Phone ✓')}
          </span>
        ) : (
          <span className="text-sm text-[#B7ACC8]/70 font-medium">
            {language === 'ar' ? 'غير موثوق' : 'Not verified'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-12 gap-2" dir="ltr">
        <select
          aria-label={language === 'ar' ? 'رمز الدولة' : 'Country code'}
          value={country}
          onChange={(event) => handleCountryChange(event.target.value)}
          onInput={(event: React.FormEvent<HTMLSelectElement>) => handleCountryChange((event.target as HTMLSelectElement).value)}
          className="col-span-5 bg-[#141023] border border-[#51465F] text-white rounded-xl px-2 py-3 text-base outline-none focus:border-[#E7BCD3]"
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
          onChange={(event) => handleNumberChange(event.target.value)}
          onInput={(event: React.FormEvent<HTMLInputElement>) => handleNumberChange((event.target as HTMLInputElement).value)}
          className={`${styles.inputControl} col-span-7`}
          dir="ltr"
          autoComplete="tel-national"
          placeholder={country === 'SA' ? '55 123 4567' : 'Mobile number'}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={sending || confirming || isVerified || resendCooldown > 0}
          onClick={sendCode}
          className="flex-1 py-2.5 px-3 rounded-xl bg-[#30264D] border border-[#51465F] text-[#E7BCD3] text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#3D305A] transition min-h-[40px]"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isVerified ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : (
            <MessageSquare className="w-4 h-4" />
          )}
          {isVerified
            ? (isWhatsappVerified
                ? (language === 'ar' ? 'تم التحقق عبر واتساب ✓' : 'Verified via WhatsApp ✓')
                : (language === 'ar' ? 'تم التحقق من الرقم ✓' : 'Verified Phone ✓'))
            : (codeSent
              ? (resendCooldown > 0
                ? (language === 'ar' ? `إعادة الإرسال بعد ${resendCooldown} ث` : `Resend in ${resendCooldown}s`)
                : (language === 'ar' ? 'إعادة إرسال رمز واتساب' : 'Resend WhatsApp code'))
              : (language === 'ar' ? 'التحقق عبر واتساب' : 'Verify via WhatsApp'))}
        </button>
        {canonical && (
          <span className="text-sm text-[#B7ACC8]/70 font-mono shrink-0" dir="ltr">
            {legacyCountryValue(country).split(' ')[1]}…{canonical.slice(-4)}
          </span>
        )}
      </div>

      {codeSent && !isVerified && (
        <div className="space-y-1.5">
          <div className="flex gap-2" dir="ltr">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              onInput={(event: React.FormEvent<HTMLInputElement>) => setOtp((event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6))}
              placeholder={language === 'ar' ? 'رمز واتساب (6 أرقام)' : '6-digit WhatsApp code'}
              className={`${styles.inputControl} flex-1`}
            />
            <button
              type="button"
              onClick={confirmCode}
              disabled={confirming || otp.trim().length !== 6}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#804E6A] to-[#8D5775] hover:from-[#895472] hover:to-[#945E7D] text-[#F7F4FA] text-sm font-semibold disabled:opacity-50 cursor-pointer min-h-[40px] flex items-center gap-1.5"
            >
              {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : (language === 'ar' ? 'تحقق من الرمز' : 'Verify')}
            </button>
          </div>
          <p className="text-xs text-[#B7ACC8]/80">
            {language === 'ar'
              ? 'يصلك رمز التحقق المكون من 6 أرقام في رسالة عبر تطبيق واتساب.'
              : 'Your 6-digit verification code arrives in a message via WhatsApp.'}
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm leading-relaxed text-rose-300 break-words" dir={language === 'ar' ? 'rtl' : 'ltr'}>
          {error}
        </p>
      )}
    </div>
  );
};
