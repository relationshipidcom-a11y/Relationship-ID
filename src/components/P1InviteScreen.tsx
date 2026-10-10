import React, { useState } from 'react';
import { ArrowLeft, Mail, Phone, Sparkles, User } from 'lucide-react';
import type { CountryCode } from 'libphonenumber-js';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const normalizedPhone = partnerPhone.trim() ? normalizePhoneNumber(phoneCountry, partnerPhone) : undefined;
    const email = partnerEmail.trim();

    if (!email && !normalizedPhone) {
      setError(language === 'ar' ? 'أدخل بريد الشريك أو رقم الجوال واحداً على الأقل.' : 'Enter at least one partner contact: email or mobile phone.');
      return;
    }
    if (partnerPhone.trim() && !normalizedPhone) {
      setError(language === 'ar' ? 'رقم جوال الشريك غير صالح.' : 'Partner mobile number is invalid.');
      return;
    }

    setSubmitting(true);
    try {
      await onCreateInvite({
        partner2Name: partnerName.trim(),
        partner2Email: email || undefined,
        partner2Phone: normalizedPhone || undefined,
        partner2PhoneCountry: normalizedPhone ? legacyCountryValue(phoneCountry) : undefined,
        partner2Whatsapp: normalizedPhone || undefined,
        partner2WhatsappCountry: normalizedPhone ? legacyCountryValue(phoneCountry) : undefined
      });
    } catch (err) {
      setError(getLocalizedErrorMessage(err, language));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 px-4 py-3 flex flex-col justify-between">
      <section className="mb-4 flex items-center justify-end">
        <div className="inline-flex items-center gap-1 bg-[#202B52] border border-white/10 rounded-full px-3 py-1 text-sm text-[#C9CCE4]">
          <span className="w-4 h-4 rounded-full bg-[#172244] text-sm flex items-center justify-center font-bold">1</span>
          <span className="text-sm">{t.step1Tab}</span>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#C1C3E6] text-[#242C55] rounded-full shadow-md font-semibold ml-1">
            <span className="w-4 h-4 rounded-full bg-[#242C55] text-[#C1C3E6] text-sm flex items-center justify-center font-bold">2</span>
            <span className="text-sm">{t.step2Tab}</span>
          </div>
        </div>
      </section>

      <div className="text-center mb-4 px-1">
        <h2 className="text-xl font-bold text-white mb-1">{t.p1InviteTitle}</h2>
        <p className="text-base sm:text-sm text-[#C9CCE4] leading-relaxed max-w-[340px] mx-auto">{t.p1InviteDesc}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-[#202B52] border border-white/20 rounded-2xl p-4 shadow-xl space-y-4">
          <div>
            <label className="flex items-center gap-1.5 text-sm text-[#C9CCE4] font-medium mb-1.5" htmlFor="partner-name"><User className="w-3.5 h-3.5 text-[#C1C3E6]" /> {t.partnerFullNameLabel}</label>
            <input id="partner-name" type="text" required value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder={t.partnerNamePlaceholder} className={styles.inputControl} />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm text-[#C9CCE4] font-medium mb-1.5" htmlFor="partner-email"><Mail className="w-3.5 h-3.5 text-[#C1C3E6]" /> {t.partnerEmailLabel}</label>
            <input id="partner-email" type="email" value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} placeholder="example@mail.com" className={styles.inputControl} dir="ltr" />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm text-[#C9CCE4] font-medium mb-1.5" htmlFor="partner-phone"><Phone className="w-3.5 h-3.5 text-[#C1C3E6]" /> {t.partnerPhoneLabel}</label>
            <div className="grid grid-cols-12 gap-2" dir="ltr">
              <select value={phoneCountry} onChange={(e) => setPhoneCountry(e.target.value as CountryCode)} className="col-span-5 bg-[#172244] border border-white/20 text-white rounded-xl px-2 py-3 text-base outline-none focus:border-[#C1C3E6]">
                {supportedCountries.map((item) => <option key={item.iso} value={item.iso}>{item.flag} {item.dialCode} {language === 'ar' ? item.nameAr : item.nameEn}</option>)}
              </select>
              <input id="partner-phone" type="tel" value={partnerPhone} onChange={(e) => setPartnerPhone(e.target.value)} placeholder="55 123 4567" className={`${styles.inputControl} col-span-7`} />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-rose-300 leading-relaxed">{error}</p>}

        <div className="mt-4 flex flex-col gap-2.5">
          <button type="submit" disabled={submitting} className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] hover:from-[#d0d2f0] hover:to-[#b7bddf] active:scale-[0.99] text-[#242C55] font-semibold text-base flex items-center justify-center gap-2 shadow-lg shadow-black/20 border border-white/20 transition-all cursor-pointer disabled:opacity-50 min-h-[44px]">
            <Sparkles className="w-4 h-4" />
            <span>{submitting ? '...' : t.createInviteBtn}</span>
          </button>
          {onBackToP1 && (
            <button
              type="button"
              onClick={onBackToP1}
              className="w-full py-3 px-4 rounded-xl border border-white/20 bg-transparent hover:bg-white/5 active:scale-[0.99] text-[#C9CCE4] hover:text-white font-medium text-sm flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[44px]"
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
