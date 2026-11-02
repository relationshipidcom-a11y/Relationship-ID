import React, { useRef, useState } from 'react';
import { ArrowLeft, Loader2, Mail, Phone, Sparkles, User } from 'lucide-react';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { Language } from '../types';
import { translations } from '../i18n/translations';
import { legacyCountryValue, normalizePhoneNumber, supportedCountries } from '../utils/phone';
import { getLocalizedErrorMessage } from '../utils/api';
import styles from '../styles/RegistryForm.module.css';

interface P1InviteScreenProps {
  language: Language;
  defaultPartnerName?: string;
  defaultPartnerEmail?: string;
  defaultPartnerPhone?: string;
  onCreateInvite: (partner2Data: {
    partner2Name: string;
    partner2Email?: string;
    partner2Phone?: string;
    partner2PhoneCountry?: string;
    partner2Whatsapp?: string;
    partner2WhatsappCountry?: string;
  }) => Promise<void> | void;
  onBackToP1?: () => void;
}

export const P1InviteScreen: React.FC<P1InviteScreenProps> = ({
  language,
  defaultPartnerName = '',
  defaultPartnerEmail = '',
  defaultPartnerPhone = '',
  onCreateInvite,
  onBackToP1
}) => {
  const t = translations[language];
  const [partnerName, setPartnerName] = useState(defaultPartnerName);
  const [partnerEmail, setPartnerEmail] = useState(defaultPartnerEmail);
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>('SA');
  const [partnerPhone, setPartnerPhone] = useState(defaultPartnerPhone);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isSubmittingLocalRef = useRef(false);
  const errorRef = useRef<HTMLDivElement | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingLocalRef.current || submitting) return;

    setError('');

    // Synchronize values from state with fallback to live DOM inputs in case of mobile autofill lag
    const form = e.currentTarget as HTMLFormElement;
    const nameEl = form.elements.namedItem('partner-name') as HTMLInputElement | null;
    const emailEl = form.elements.namedItem('partner-email') as HTMLInputElement | null;
    const phoneEl = form.elements.namedItem('partner-phone') as HTMLInputElement | null;

    const rawName = (partnerName || nameEl?.value || '').trim();
    const rawEmail = (partnerEmail || emailEl?.value || '').trim();
    const rawPhone = (partnerPhone || phoneEl?.value || '').trim();

    if (!rawName) {
      const msg = language === 'ar' ? 'أدخل الاسم الكامل للشريك.' : 'Enter your partner’s full name.';
      setError(msg);
      setTimeout(() => {
        if (typeof errorRef.current?.scrollIntoView === 'function') {
          errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
      return;
    }

    const normalizedPhone = rawPhone ? normalizePhoneNumber(phoneCountry, rawPhone) : undefined;

    if (!rawEmail && !rawPhone) {
      const msg = language === 'ar'
        ? 'أدخل وسيلة اتصال واحدة للشريك على الأقل: البريد الإلكتروني أو رقم الجوال.'
        : 'Enter at least one partner contact: email or mobile phone.';
      setError(msg);
      setTimeout(() => {
        if (typeof errorRef.current?.scrollIntoView === 'function') {
          errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
      return;
    }

    if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      const msg = language === 'ar' ? 'صيغة البريد الإلكتروني غير صالحة.' : 'Partner email format is invalid.';
      setError(msg);
      setTimeout(() => {
        if (typeof errorRef.current?.scrollIntoView === 'function') {
          errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
      return;
    }

    if (rawPhone && !normalizedPhone) {
      const msg = language === 'ar' ? 'رقم جوال الشريك غير صالح.' : 'Partner mobile number is invalid.';
      setError(msg);
      setTimeout(() => {
        if (typeof errorRef.current?.scrollIntoView === 'function') {
          errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
      return;
    }

    // Resolve country accurately if an explicit international dialing code was provided
    let resolvedCountry = phoneCountry;
    if (normalizedPhone) {
      const parsed = parsePhoneNumberFromString(normalizedPhone);
      if (parsed?.country && parsed.country !== phoneCountry) {
        resolvedCountry = parsed.country;
        setPhoneCountry(resolvedCountry);
      }
    }

    isSubmittingLocalRef.current = true;
    setSubmitting(true);

    try {
      await onCreateInvite({
        partner2Name: rawName,
        partner2Email: rawEmail || undefined,
        partner2Phone: normalizedPhone || undefined,
        partner2PhoneCountry: normalizedPhone ? legacyCountryValue(resolvedCountry) : undefined,
        partner2Whatsapp: normalizedPhone || undefined,
        partner2WhatsappCountry: normalizedPhone ? legacyCountryValue(resolvedCountry) : undefined
      });
    } catch (err: any) {
      if (err?.message === 'SUBMISSION_IN_PROGRESS') {
        return;
      }
      const msg = getLocalizedErrorMessage(err, language);
      setError(msg);
      setTimeout(() => {
        if (typeof errorRef.current?.scrollIntoView === 'function') {
          errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    } finally {
      isSubmittingLocalRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 px-4 py-3 flex flex-col justify-between">
      <section className="mb-4 flex items-center justify-end">
        <div className="inline-flex items-center gap-1 bg-[#414A75] border border-[#A0A9D1] rounded-full px-3 py-1 text-sm text-[#D6DAED]">
          <span className="w-4 h-4 rounded-full bg-[#252D52] text-sm flex items-center justify-center font-bold">1</span>
          <span className="text-sm">{t.step1Tab}</span>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-[#B8BCE6] to-[#B8BCE6] text-[#202747] rounded-full shadow-md font-semibold ml-1">
            <span className="w-4 h-4 rounded-full bg-[#414A75] text-[#F7F8FC] text-sm flex items-center justify-center font-bold">2</span>
            <span className="text-sm">{t.step2Tab}</span>
          </div>
        </div>
      </section>

      <div className="text-center mb-4 px-1">
        <h2 className="text-xl font-bold text-white mb-1">{t.p1InviteTitle}</h2>
        <p className="text-base sm:text-sm text-[#D6DAED] leading-relaxed max-w-[340px] mx-auto">{t.p1InviteDesc}</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="bg-[#414A75] border border-[#A0A9D1] rounded-2xl p-4 shadow-xl space-y-4">
          <div>
            <label className="flex items-center gap-1.5 text-sm text-[#D6DAED] font-medium mb-1.5" htmlFor="partner-name">
              <User className="w-3.5 h-3.5 text-[#B8BCE6]" /> {t.partnerFullNameLabel}
            </label>
            <input
              id="partner-name"
              name="partner-name"
              type="text"
              required
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              onInput={(e: React.FormEvent<HTMLInputElement>) => setPartnerName((e.target as HTMLInputElement).value)}
              placeholder={t.partnerNamePlaceholder}
              className={styles.inputControl}
              autoComplete="name"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm text-[#D6DAED] font-medium mb-1.5" htmlFor="partner-email">
              <Mail className="w-3.5 h-3.5 text-[#B8BCE6]" /> {t.partnerEmailLabel}
            </label>
            <input
              id="partner-email"
              name="partner-email"
              type="email"
              value={partnerEmail}
              onChange={(e) => setPartnerEmail(e.target.value)}
              onInput={(e: React.FormEvent<HTMLInputElement>) => setPartnerEmail((e.target as HTMLInputElement).value)}
              placeholder="example@mail.com"
              className={styles.inputControl}
              dir="ltr"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm text-[#D6DAED] font-medium mb-1.5" htmlFor="partner-phone">
              <Phone className="w-3.5 h-3.5 text-[#B8BCE6]" /> {t.partnerPhoneLabel}
            </label>
            <div className="grid grid-cols-12 gap-2" dir="ltr">
              <select
                aria-label={language === 'ar' ? 'رمز الدولة' : 'Country code'}
                value={phoneCountry}
                onChange={(e) => setPhoneCountry(e.target.value as CountryCode)}
                className="col-span-5 bg-[#252D52] border border-[#A0A9D1] text-white rounded-xl px-2 py-3 text-base outline-none focus:border-[#B8BCE6]"
              >
                {supportedCountries.map((item) => (
                  <option key={item.iso} value={item.iso}>
                    {item.flag} {item.dialCode} {language === 'ar' ? item.nameAr : item.nameEn}
                  </option>
                ))}
              </select>
              <input
                id="partner-phone"
                name="partner-phone"
                type="tel"
                value={partnerPhone}
                onChange={(e) => setPartnerPhone(e.target.value)}
                onInput={(e: React.FormEvent<HTMLInputElement>) => setPartnerPhone((e.target as HTMLInputElement).value)}
                placeholder="55 123 4567"
                className={`${styles.inputControl} col-span-7`}
                autoComplete="tel"
              />
            </div>
          </div>
        </div>

        {error && (
          <div
            ref={errorRef}
            id="p1-invite-error"
            role="alert"
            aria-live="assertive"
            className="p-3.5 rounded-xl border border-rose-400/30 bg-rose-500/15 text-rose-200 text-sm leading-relaxed break-words"
            dir={language === 'ar' ? 'rtl' : 'ltr'}
          >
            {error}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2.5">
          <button
            type="submit"
            disabled={submitting}
            aria-describedby={error ? 'p1-invite-error' : undefined}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#B8BCE6] to-[#B8BCE6] hover:from-[#C5C9EC] hover:to-[#C5C9EC] active:scale-[0.99] text-[#202747] font-semibold text-base flex items-center justify-center gap-2 shadow-lg shadow-black/20 border border-[#A0A9D1] transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>
              {submitting
                ? (language === 'ar' ? 'جارٍ إنشاء الدعوة...' : 'Creating Invitation...')
                : t.createInviteBtn}
            </span>
          </button>
          {onBackToP1 && (
            <button
              type="button"
              disabled={submitting}
              onClick={onBackToP1}
              className="w-full py-3 px-4 rounded-xl border border-[#A0A9D1] bg-transparent hover:bg-white/5 active:scale-[0.99] text-[#D6DAED] hover:text-white font-medium text-sm flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[44px] disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
              <span>{language === 'ar' ? 'تعديل تفاصيل السجل' : 'Edit Relationship Details'}</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
