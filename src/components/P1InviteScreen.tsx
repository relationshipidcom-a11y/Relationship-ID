import React, { useState } from 'react';
import { Mail, Phone, Sparkles, User } from 'lucide-react';
import type { CountryCode } from 'libphonenumber-js';
import { Language } from '../types';
import { translations } from '../i18n/translations';
import { legacyCountryValue, normalizePhoneNumber, supportedCountries } from '../utils/phone';
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
  onBackToP1: () => void;
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
  const [whatsappCountry, setWhatsappCountry] = useState<CountryCode>('SA');
  const [partnerWhatsapp, setPartnerWhatsapp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const normalizedPhone = partnerPhone.trim() ? normalizePhoneNumber(phoneCountry, partnerPhone) : undefined;
    const normalizedWhatsapp = partnerWhatsapp.trim() ? normalizePhoneNumber(whatsappCountry, partnerWhatsapp) : undefined;
    const email = partnerEmail.trim();

    if (!email && !normalizedPhone && !normalizedWhatsapp) {
      setError(language === 'ar' ? 'أدخل بريد الشريك أو الجوال أو واتساب واحداً على الأقل.' : 'Enter at least one partner contact: email, mobile, or WhatsApp.');
      return;
    }
    if (partnerPhone.trim() && !normalizedPhone) {
      setError(language === 'ar' ? 'رقم جوال الشريك غير صالح.' : 'Partner mobile number is invalid.');
      return;
    }
    if (partnerWhatsapp.trim() && !normalizedWhatsapp) {
      setError(language === 'ar' ? 'رقم واتساب الشريك غير صالح.' : 'Partner WhatsApp number is invalid.');
      return;
    }

    setSubmitting(true);
    try {
      await onCreateInvite({
        partner2Name: partnerName.trim(),
        partner2Email: email || undefined,
        partner2Phone: normalizedPhone || undefined,
        partner2PhoneCountry: normalizedPhone ? legacyCountryValue(phoneCountry) : undefined,
        partner2Whatsapp: normalizedWhatsapp || undefined,
        partner2WhatsappCountry: normalizedWhatsapp ? legacyCountryValue(whatsappCountry) : undefined
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create invitation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 px-4 py-3 flex flex-col justify-between">
      <section className="mb-4 flex justify-center">
        <div className="inline-flex items-center gap-1 bg-[#1a1530] border border-white/10 rounded-full px-3 py-1 text-xs text-[#b6afd4]">
          <span className="w-4 h-4 rounded-full bg-[#2a2447] text-[11px] flex items-center justify-center font-bold">1</span>
          <span className="text-[11px]">{t.step1Tab}</span>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#9b6682] text-white rounded-full shadow-md font-semibold ml-1">
            <span className="w-4 h-4 rounded-full bg-white text-[#9b6682] text-[11px] flex items-center justify-center font-bold">2</span>
            <span className="text-[11px]">{t.step2Tab}</span>
          </div>
        </div>
      </section>

      <div className="text-center mb-4 px-1">
        <h2 className="text-lg font-bold text-white mb-1">{t.p1InviteTitle}</h2>
        <p className="text-xs text-[#b6afd4] leading-relaxed max-w-[320px] mx-auto">{t.p1InviteDesc}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-[#211c38] border border-white/20 rounded-2xl p-4 shadow-xl space-y-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs text-[#b6afd4] font-medium mb-1" htmlFor="partner-name"><User className="w-3.5 h-3.5 text-[#f3c4db]" /> {t.partnerFullNameLabel}</label>
            <input id="partner-name" type="text" required value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder={t.partnerNamePlaceholder} className={styles.inputControl} />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs text-[#b6afd4] font-medium mb-1" htmlFor="partner-email"><Mail className="w-3.5 h-3.5 text-[#f3c4db]" /> {t.partnerEmailLabel}</label>
            <input id="partner-email" type="email" value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} placeholder="example@mail.com" className={styles.inputControl} dir="ltr" />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs text-[#b6afd4] font-medium mb-1" htmlFor="partner-phone"><Phone className="w-3.5 h-3.5 text-[#f3c4db]" /> {t.partnerPhoneLabel}</label>
            <div className="grid grid-cols-12 gap-2" dir="ltr">
              <select value={phoneCountry} onChange={(e) => setPhoneCountry(e.target.value as CountryCode)} className="col-span-5 bg-[#141124] border border-white/20 text-white rounded-xl px-2 py-3 text-[11px]">
                {supportedCountries.map((item) => <option key={item.iso} value={item.iso}>{item.flag} {item.dialCode} {language === 'ar' ? item.nameAr : item.nameEn}</option>)}
              </select>
              <input id="partner-phone" type="tel" value={partnerPhone} onChange={(e) => setPartnerPhone(e.target.value)} placeholder="55 123 4567" className={`${styles.inputControl} col-span-7`} />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs text-[#b6afd4] font-medium mb-1" htmlFor="partner-whatsapp"><Phone className="w-3.5 h-3.5 text-[#f3c4db]" /> {language === 'ar' ? 'واتساب الشريك (اختياري)' : 'Partner WhatsApp (optional)'}</label>
            <div className="grid grid-cols-12 gap-2" dir="ltr">
              <select value={whatsappCountry} onChange={(e) => setWhatsappCountry(e.target.value as CountryCode)} className="col-span-5 bg-[#141124] border border-white/20 text-white rounded-xl px-2 py-3 text-[11px]">
                {supportedCountries.map((item) => <option key={item.iso} value={item.iso}>{item.flag} {item.dialCode} {language === 'ar' ? item.nameAr : item.nameEn}</option>)}
              </select>
              <input id="partner-whatsapp" type="tel" value={partnerWhatsapp} onChange={(e) => setPartnerWhatsapp(e.target.value)} placeholder="55 123 4567" className={`${styles.inputControl} col-span-7`} />
            </div>
            <p className="text-[9px] text-[#8e84af] mt-1">{language === 'ar' ? 'هذا رقم دعوة فقط ولا يعتبر إثبات ملكية واتساب.' : 'This is an invitation contact only; it is not WhatsApp ownership proof.'}</p>
          </div>
        </div>

        {error && <p className="text-[10.5px] text-rose-300 leading-relaxed">{error}</p>}

        <div className="mt-4 flex flex-col gap-2.5">
          <button type="submit" disabled={submitting} className="w-full py-3.5 px-4 rounded-xl bg-[#9b6682] hover:bg-[#a9718f] active:scale-[0.99] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#9b6682]/35 border border-white/20 transition-all cursor-pointer disabled:opacity-50">
            <Sparkles className="w-4 h-4" />
            <span>{submitting ? '...' : t.createInviteBtn}</span>
          </button>
          <button type="button" onClick={onBackToP1} className="w-full py-3 px-4 rounded-xl bg-[#211c38] hover:bg-[#2e264f] border border-white/20 text-white font-medium text-xs cursor-pointer">{t.backToYourDataBtn}</button>
        </div>
      </form>
    </div>
  );
};
