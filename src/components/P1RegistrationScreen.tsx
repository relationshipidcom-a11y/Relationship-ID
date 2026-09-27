import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle, Heart, Mail, Phone, Plus, Shield, Lock, User, Edit3, Sliders } from 'lucide-react';
import type { CountryCode } from 'libphonenumber-js';
import { Language, PartnerData, RelationshipRecord, RelationshipType } from '../types';
import { translations } from '../i18n/translations';
import { PhoneVerificationField } from './PhoneVerificationField';
import { auth } from '../lib/firebase';
import {
  countryFromLegacyValue,
  legacyCountryValue,
  normalizePhoneNumber,
  supportedCountries
} from '../utils/phone';
import styles from '../styles/RegistryForm.module.css';

interface P1RegistrationScreenProps {
  language: Language;
  initialData: PartnerData;
  relationshipType: RelationshipType;
  initialStartDate?: string;
  onSaveAndNext: (p1: PartnerData, type: RelationshipType, startDate: string) => void;
  onBack?: () => void;
  isActive?: boolean;
  record?: RelationshipRecord;
  onRequestChange?: () => void;
  onViewControls?: () => void;
}

const isoFromParts = (year?: string, month?: string, day?: string) => {
  if (!year || !month || !day) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const isAtLeast18 = (isoDate: string) => {
  const dob = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return false;
  const today = new Date();
  const threshold = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  return dob <= threshold;
};

export const P1RegistrationScreen: React.FC<P1RegistrationScreenProps> = ({
  language,
  initialData,
  relationshipType: initialRelType,
  initialStartDate = '',
  onSaveAndNext,
  isActive = false,
  record,
  onRequestChange,
  onViewControls
}) => {
  const t = translations[language];

  // When relationship is active, display both P1 and P2 details as read-only
  if (isActive && record) {
    const stageLabel = record.type === 'marriage' ? t.marriage : record.type === 'engagement' ? t.engagement : t.dating;
    const p1BirthDate = isoFromParts(record.partner1.birthYear, record.partner1.birthMonth, record.partner1.birthDay);
    const p2BirthDate = isoFromParts(record.partner2.birthYear, record.partner2.birthMonth, record.partner2.birthDay);

    return (
      <div className="flex-1 flex flex-col justify-between px-4 py-3" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <section className="text-center mb-3 mt-2">
          <div className="flex items-center justify-between mb-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>{language === 'ar' ? 'سجل علاقة نشط' : 'Active Relationship Record'}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3b335c]/50 border border-[#83769c] text-[10px] font-semibold tracking-widest text-[#f3c4db] uppercase">
              <Shield className="w-3.5 h-3.5" /> #{record.recordNumber || record.verificationRef}
            </div>
          </div>
          <h2 className="text-lg font-extrabold text-white tracking-tight">
            {language === 'ar' ? 'سجل العلاقة المعتمد (الطرف الأول والثاني)' : 'Verified Relationship Record (P1 & P2)'}
          </h2>
          <p className="text-[11px] text-[#b6afd4] mt-0.5">
            {language === 'ar' ? 'بيانات السجل مقفلة للقراءة فقط لحماية موثوقية السجل' : 'Record details are locked as read-only to preserve record integrity'}
          </p>
        </section>

        <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
          {/* Partner 1 Read-only Card */}
          <section className="p-3.5 rounded-2xl bg-[#211c38] border border-white/15 space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 text-[#f3c4db]">
                <User className="w-4 h-4" />
                <h3 className="text-xs font-bold text-white">{language === 'ar' ? 'بيانات الشريك الأول (P1)' : 'Partner 1 Details (P1)'}</h3>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#9b6682]/20 border border-[#9b6682]/40 text-[#f3c4db] font-medium flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> {language === 'ar' ? 'للقراءة فقط' : 'Read-only'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-start">
              <div>
                <p className="text-[10px] text-[#b6afd4]">{t.fullNameLabel}</p>
                <p className="text-xs font-semibold text-white">{record.partner1.fullName}</p>
                {record.partner1.fullNameEn && <p className="text-[10px] text-[#b6afd4]">{record.partner1.fullNameEn}</p>}
              </div>
              <div>
                <p className="text-[10px] text-[#b6afd4]">{t.birthdateLabel}</p>
                <p className="text-xs font-semibold text-white">{p1BirthDate || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#b6afd4]">{t.emailLabel}</p>
                <p className="text-xs font-semibold text-white truncate" dir="ltr">{record.partner1.email || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#b6afd4]">{t.phoneLabel}</p>
                <p className="text-xs font-semibold text-white" dir="ltr">{record.partner1.phoneE164 || record.partner1.phoneNumber || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#b6afd4]">{t.whatsappLabel}</p>
                <p className="text-xs font-semibold text-white" dir="ltr">{record.partner1.whatsappNumber || record.partner1.phoneNumber || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#b6afd4]">{t.socialAccountsLabel}</p>
                <p className="text-xs font-semibold text-white truncate" dir="ltr">{record.partner1.socialHandle || '—'}</p>
              </div>
            </div>
          </section>

          {/* Partner 2 Read-only Card */}
          <section className="p-3.5 rounded-2xl bg-[#211c38] border border-white/15 space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 text-[#f3c4db]">
                <User className="w-4 h-4" />
                <h3 className="text-xs font-bold text-white">{language === 'ar' ? 'بيانات الشريك الثاني (P2)' : 'Partner 2 Details (P2)'}</h3>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#9b6682]/20 border border-[#9b6682]/40 text-[#f3c4db] font-medium flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> {language === 'ar' ? 'للقراءة فقط' : 'Read-only'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-start">
              <div>
                <p className="text-[10px] text-[#b6afd4]">{t.fullNameLabel}</p>
                <p className="text-xs font-semibold text-white">{record.partner2.fullName}</p>
                {record.partner2.fullNameEn && <p className="text-[10px] text-[#b6afd4]">{record.partner2.fullNameEn}</p>}
              </div>
              <div>
                <p className="text-[10px] text-[#b6afd4]">{t.birthdateLabel}</p>
                <p className="text-xs font-semibold text-white">{p2BirthDate || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#b6afd4]">{t.emailLabel}</p>
                <p className="text-xs font-semibold text-white truncate" dir="ltr">{record.partner2.email || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#b6afd4]">{t.phoneLabel}</p>
                <p className="text-xs font-semibold text-white" dir="ltr">{record.partner2.phoneE164 || record.partner2.phoneNumber || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#b6afd4]">{t.whatsappLabel}</p>
                <p className="text-xs font-semibold text-white" dir="ltr">{record.partner2.whatsappNumber || record.partner2.phoneNumber || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#b6afd4]">{t.socialAccountsLabel}</p>
                <p className="text-xs font-semibold text-white truncate" dir="ltr">{record.partner2.socialHandle || '—'}</p>
              </div>
            </div>
          </section>

          {/* Relationship Stage & Date */}
          <section className="p-3.5 rounded-2xl bg-[#211c38] border border-white/15 flex items-center justify-between text-start">
            <div>
              <p className="text-[10px] text-[#b6afd4]">{t.relationshipDetailsTitle}</p>
              <p className="text-xs font-bold text-white">{stageLabel}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#b6afd4]">{t.startDateLabel}</p>
              <p className="text-xs font-semibold text-white">{language === 'ar' ? record.startDateAr : record.startDate}</p>
            </div>
          </section>

          {/* Lock & Authorized Change Notice */}
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-start flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10.5px] text-amber-200/90 leading-relaxed">
              {language === 'ar'
                ? 'جميع البيانات أعلاه معتمدة ومقفلة ضد التعديل المباشر. لتعديل أي بيانات، يرجى تقديم طلب تعديل رسمي للمراجعة والموافقة من الشريك.'
                : 'All details above are locked against direct editing to ensure record validity. Use the official change request process for updates.'}
            </p>
          </div>
        </div>

        {/* Action Buttons for Active Relationship */}
        <div className="mt-3 flex flex-col gap-2 pt-2 border-t border-white/10">
          {onRequestChange && (
            <button
              type="button"
              onClick={onRequestChange}
              className="w-full py-3 px-4 rounded-xl bg-[#9b6682] hover:bg-[#a9718f] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.99] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#9b6682]"
            >
              <Edit3 className="w-4 h-4" />
              <span>{t.requestChangeBtn}</span>
            </button>
          )}
          {onViewControls && (
            <button
              type="button"
              onClick={onViewControls}
              className="w-full py-2.5 px-4 rounded-xl bg-[#211c38] hover:bg-[#2e264f] border border-white/20 text-[#b6afd4] hover:text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#9b6682]"
            >
              <Sliders className="w-3.5 h-3.5 text-[#f3c4db]" />
              <span>{language === 'ar' ? 'عرض الشهادة ولوحة التحكم' : 'View Certificate & Controls'}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const [fullName, setFullName] = useState(initialData.fullName || '');
  const [birthDate, setBirthDate] = useState(isoFromParts(initialData.birthYear, initialData.birthMonth, initialData.birthDay));
  const [email, setEmail] = useState(initialData.email || auth?.currentUser?.email || '');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(countryFromLegacyValue(initialData.phoneCountry));
  const [phoneNumber, setPhoneNumber] = useState(initialData.phoneNumber || '');
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(
    initialData.phoneVerified && initialData.phoneE164 ? initialData.phoneE164 : auth?.currentUser?.phoneNumber || null
  );
  const initialSameWhatsapp = Boolean(
    !initialData.whatsappNumber ||
      (initialData.phoneNumber && initialData.whatsappNumber === initialData.phoneNumber && initialData.whatsappCountry === initialData.phoneCountry)
  );
  const [sameWhatsapp, setSameWhatsapp] = useState(initialSameWhatsapp);
  const [whatsappCountry, setWhatsappCountry] = useState<CountryCode>(countryFromLegacyValue(initialData.whatsappCountry || initialData.phoneCountry));
  const [whatsappNumber, setWhatsappNumber] = useState(initialData.whatsappNumber || '');
  const [socialHandle, setSocialHandle] = useState(initialData.socialHandle || '');
  const [showSocialField, setShowSocialField] = useState(Boolean(initialData.socialHandle));
  const [relType, setRelType] = useState<RelationshipType>(initialRelType || 'dating');
  const [startDate, setStartDate] = useState(initialStartDate.match(/^\d{4}-\d{2}-\d{2}$/) ? initialStartDate : '');
  const [error, setError] = useState('');

  const canonicalPhone = useMemo(() => normalizePhoneNumber(phoneCountry, phoneNumber), [phoneCountry, phoneNumber]);
  const phoneIsVerified = Boolean(canonicalPhone && verifiedPhone === canonicalPhone);
  const todayIso = new Date().toISOString().slice(0, 10);

  const handlePhoneVerified = (e164: string | null) => {
    setVerifiedPhone(e164);
    if (e164 && sameWhatsapp) {
      setWhatsappCountry(phoneCountry);
      setWhatsappNumber(phoneNumber);
    }
  };

  const toggleSameWhatsapp = (checked: boolean) => {
    setSameWhatsapp(checked);
    if (checked) {
      setWhatsappCountry(phoneCountry);
      setWhatsappNumber(phoneNumber);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!birthDate || !isAtLeast18(birthDate)) {
      setError(language === 'ar' ? 'يجب أن يكون العمر 18 سنة أو أكثر.' : 'You must be at least 18 years old.');
      return;
    }
    if (!startDate || startDate > todayIso) {
      setError(language === 'ar' ? 'اختر تاريخ بداية صالحاً وليس في المستقبل.' : 'Choose a valid relationship start date that is not in the future.');
      return;
    }
    if (!canonicalPhone || !phoneIsVerified) {
      setError(language === 'ar' ? 'يجب التحقق من رقم الجوال أولاً.' : 'Verify your mobile number before continuing.');
      return;
    }

    const [birthYear, birthMonth, birthDay] = birthDate.split('-');
    const whatsappE164 = sameWhatsapp ? canonicalPhone : normalizePhoneNumber(whatsappCountry, whatsappNumber) || undefined;

    onSaveAndNext(
      {
        fullName: fullName.trim(),
        birthDay,
        birthMonth,
        birthYear,
        email: email.trim(),
        phoneCountry: legacyCountryValue(phoneCountry),
        phoneNumber,
        phoneE164: canonicalPhone,
        phoneVerified: true,
        whatsappCountry: legacyCountryValue(sameWhatsapp ? phoneCountry : whatsappCountry),
        whatsappNumber: sameWhatsapp ? phoneNumber : whatsappNumber,
        whatsappE164,
        whatsappTrusted: sameWhatsapp,
        socialHandle: socialHandle.trim() || undefined
      },
      relType,
      startDate
    );
  };

  return (
    <div className="flex-1 flex flex-col justify-between px-4 py-3">
      <section className="text-center mb-3 mt-2">
        <div className="flex items-center justify-end mb-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3b335c]/50 border border-[#83769c] text-[10px] font-semibold tracking-widest text-[#f3c4db] uppercase">
            <Shield className="w-3.5 h-3.5" /> P1 • 2/5
          </div>
        </div>
        <h2 className="text-lg font-extrabold text-white tracking-tight">{t.p1FormTitle}</h2>
        <p className="text-[11px] text-[#b6afd4] mt-0.5">{t.p1FormDesc}</p>
      </section>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-3.5">
        <section className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div className="flex items-center gap-2 text-[#f3c4db]">
              <Shield className="w-4 h-4" />
              <div>
                <h3 className="text-xs font-bold text-white leading-tight">{t.verifiedIdentityTitle}</h3>
                <p className="text-[10px] text-[#b6afd4] mt-0.5">{language === 'ar' ? 'أدخل بياناتك الحقيقية لإكمال السجل.' : 'Enter your real information to continue.'}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-medium text-[#b6afd4] mb-1" htmlFor="p1-name">{t.fullNameLabel}</label>
              <input id="p1-name" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className={styles.inputControl} placeholder={t.fullNamePlaceholder} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-[#b6afd4]" htmlFor="p1-dob">{t.birthdateLabel}</label>
                {birthDate && isAtLeast18(birthDate) && <span className="text-[9px] text-[#f3c4db]">18+ ✓</span>}
              </div>
              <input id="p1-dob" type="date" required max={todayIso} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={styles.inputControl} dir="ltr" />
            </div>
          </div>
        </section>

        <section className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-[#f3c4db]" />
              <div>
                <h3 className="text-xs font-bold text-white leading-tight">{t.contactDetailsTitle}</h3>
                <p className="text-[10px] text-[#b6afd4] mt-0.5">{language === 'ar' ? 'الجوال يحتاج تحقق حقيقي عبر Firebase.' : 'Mobile requires real Firebase verification.'}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="p1-email" className="block text-[11px] font-medium text-[#b6afd4] mb-1">{t.emailLabel}</label>
              <input id="p1-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={styles.inputControl} dir="ltr" />
            </div>

            <PhoneVerificationField
              id="p1-mobile"
              language={language}
              country={phoneCountry}
              number={phoneNumber}
              verifiedE164={verifiedPhone}
              onCountryChange={(value) => {
                setPhoneCountry(value);
                if (sameWhatsapp) setWhatsappCountry(value);
              }}
              onNumberChange={(value) => {
                setPhoneNumber(value);
                if (sameWhatsapp) setWhatsappNumber(value);
              }}
              onVerified={handlePhoneVerified}
              label={t.phoneLabel}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-[#b6afd4]">
                  <Phone className="w-3.5 h-3.5 text-[#f3c4db]" /> {t.whatsappLabel}
                </label>
                <label className="flex items-center gap-1.5 text-[10px] text-[#f3c4db] cursor-pointer">
                  <input type="checkbox" checked={sameWhatsapp} onChange={(e) => toggleSameWhatsapp(e.target.checked)} className="accent-[#9b6682]" />
                  {language === 'ar' ? 'نفس رقم الجوال' : 'Same as mobile'}
                </label>
              </div>

              {sameWhatsapp ? (
                <div className="rounded-xl border border-[#9b6682]/45 bg-[#141124] px-3 py-2.5 flex items-center justify-between" dir="ltr">
                  <span className="text-xs text-white font-mono">{canonicalPhone || (language === 'ar' ? 'تحقق من الجوال أولاً' : 'Verify mobile first')}</span>
                  <span className="text-[9px] text-[#f3c4db]">{phoneIsVerified ? (language === 'ar' ? 'موثوق' : 'Trusted') : (language === 'ar' ? 'بانتظار التحقق' : 'Pending')}</span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-12 gap-2" dir="ltr">
                    <select value={whatsappCountry} onChange={(e) => setWhatsappCountry(e.target.value as CountryCode)} className="col-span-5 bg-[#141124] border border-white/20 text-white rounded-xl px-2 py-2.5 text-[11px]">
                      {supportedCountries.map((item) => <option key={item.iso} value={item.iso}>{item.flag} {item.dialCode} {language === 'ar' ? item.nameAr : item.nameEn}</option>)}
                    </select>
                    <input type="tel" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} className={`${styles.inputControl} col-span-7`} dir="ltr" placeholder="WhatsApp" />
                  </div>
                  <p className="text-[9.5px] text-amber-300">{language === 'ar' ? 'رقم واتساب المختلف غير موثوق حتى يتوفر تحقق حقيقي لواتساب.' : 'A different WhatsApp number remains unverified until genuine WhatsApp ownership proof is configured.'}</p>
                </>
              )}
            </div>

            <div>
              <div className="flex justify-between items-center text-[11px] font-medium text-[#b6afd4] mb-1">
                <span>{t.socialAccountsLabel}</span>
                <span className="text-[9px] text-[#8e84af]">{t.socialAccountsOptional}</span>
              </div>
              {showSocialField ? (
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-[#8e84af] text-xs font-mono">@</span>
                  <input type="text" value={socialHandle} onChange={(e) => setSocialHandle(e.target.value)} placeholder={t.socialHandlePlaceholder} className={`${styles.inputControl} pl-8 text-left`} dir="ltr" />
                </div>
              ) : (
                <button type="button" onClick={() => setShowSocialField(true)} className="w-full bg-[#141124] hover:bg-[#1a1530] border border-dashed border-white/20 text-[#f3c4db] rounded-xl py-2 px-3 text-xs flex items-center justify-center gap-2 transition cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> {t.addSocialAccountBtn}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div className="flex items-center gap-2 text-[#f3c4db]">
              <Heart className="w-4 h-4 fill-current" />
              <div>
                <h3 className="text-xs font-bold text-white">{t.relationshipDetailsTitle}</h3>
                <p className="text-[10px] text-[#b6afd4] mt-0.5">{t.relationshipDetailsDesc}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['dating', 'engagement', 'marriage'] as RelationshipType[]).map((type) => (
              <button key={type} type="button" onClick={() => setRelType(type)} className={relType === type ? styles.activeTypeBtn : styles.inactiveTypeBtn}>
                {relType === type && <CheckCircle className="w-3.5 h-3.5" />}
                <span>{type === 'marriage' ? t.marriage : type === 'engagement' ? t.engagement : t.dating}</span>
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="relationship-start" className="flex items-center gap-1.5 text-[11px] font-medium text-[#b6afd4] mb-1">
              <Calendar className="w-3.5 h-3.5 text-[#f3c4db]" />
              {t.startDateLabel}
            </label>
            <input id="relationship-start" type="date" required max={todayIso} value={startDate} onChange={(e) => setStartDate(e.target.value)} className={styles.inputControl} dir="ltr" />
          </div>
        </section>

        {error && <p className="text-[10.5px] text-rose-300 leading-relaxed">{error}</p>}

        <div className="pt-2">
          <button type="submit" className={styles.primaryCta}>
            <span>{t.continueToPartnerBtn}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
