import React, { useMemo, useState } from 'react';
import { CheckCircle, Lock, Mail, Phone, Shield, User, Edit3, Sliders } from 'lucide-react';
import type { CountryCode } from 'libphonenumber-js';
import { Language, PartnerData, RelationshipRecord } from '../types';
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

interface P2RegistrationScreenProps {
  language: Language;
  record: RelationshipRecord;
  onAcceptRelationship: (partner2Data: PartnerData) => Promise<void> | void;
  onBackToInvite?: () => void;
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

export const P2RegistrationScreen: React.FC<P2RegistrationScreenProps> = ({
  language,
  record,
  onAcceptRelationship,
  onRequestChange,
  onViewControls
}) => {
  const t = translations[language];

  // When relationship is active, display P2's authorized primary record view with read-only fields
  if (record.status === 'active') {
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
          <h1 className="text-lg font-extrabold text-white tracking-tight">
            {language === 'ar' ? 'سجل العلاقة المعتمد (الطرف الثاني)' : 'Verified Relationship Record (Partner 2)'}
          </h1>
          <p className="text-[11px] text-[#b6afd4] mt-0.5">
            {language === 'ar' ? 'بيانات السجل مقفلة للقراءة فقط لحماية موثوقية السجل' : 'Record details are locked as read-only to preserve record integrity'}
          </p>
        </section>

        <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
          {/* Partner 2 (Current User) Read-only Card */}
          <section className="p-3.5 rounded-2xl bg-[#211c38] border border-white/15 space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 text-[#f3c4db]">
                <User className="w-4 h-4" />
                <h2 className="text-xs font-bold text-white">{language === 'ar' ? 'بياناتك الموثقة (الطرف الثاني - P2)' : 'Your Verified Details (Partner 2 - P2)'}</h2>
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

          {/* Partner 1 Read-only Card */}
          <section className="p-3.5 rounded-2xl bg-[#211c38] border border-white/15 space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 text-[#f3c4db]">
                <User className="w-4 h-4" />
                <h2 className="text-xs font-bold text-white">{language === 'ar' ? 'بيانات الشريك (الطرف الأول - P1)' : 'Partner Details (Partner 1 - P1)'}</h2>
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

  const [fullName, setFullName] = useState(record.partner2.fullName || auth?.currentUser?.displayName || '');
  const [birthDate, setBirthDate] = useState(isoFromParts(record.partner2.birthYear, record.partner2.birthMonth, record.partner2.birthDay));
  const [email, setEmail] = useState(record.partner2.email || auth?.currentUser?.email || '');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(countryFromLegacyValue(record.partner2.phoneCountry));
  const [phoneNumber, setPhoneNumber] = useState(record.partner2.phoneNumber || '');
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(
    record.partner2.phoneVerified && record.partner2.phoneE164 ? record.partner2.phoneE164 : auth?.currentUser?.phoneNumber || null
  );
  const [sameWhatsapp, setSameWhatsapp] = useState(true);
  const [whatsappCountry, setWhatsappCountry] = useState<CountryCode>(countryFromLegacyValue(record.partner2.whatsappCountry || record.partner2.phoneCountry));
  const [whatsappNumber, setWhatsappNumber] = useState(record.partner2.whatsappNumber || record.partner2.phoneNumber || '');
  const [socialHandle, setSocialHandle] = useState(record.partner2.socialHandle || '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canonicalPhone = useMemo(() => normalizePhoneNumber(phoneCountry, phoneNumber), [phoneCountry, phoneNumber]);
  const phoneIsVerified = Boolean(canonicalPhone && verifiedPhone === canonicalPhone);
  const todayIso = new Date().toISOString().slice(0, 10);

  const handleVerified = (e164: string | null) => {
    setVerifiedPhone(e164);
    if (e164 && sameWhatsapp) {
      setWhatsappCountry(phoneCountry);
      setWhatsappNumber(phoneNumber);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!birthDate || !isAtLeast18(birthDate)) {
      setError(language === 'ar' ? 'يجب أن يكون العمر 18 سنة أو أكثر.' : 'You must be at least 18 years old.');
      return;
    }
    if (!canonicalPhone || !phoneIsVerified) {
      setError(language === 'ar' ? 'يجب التحقق من رقم الجوال قبل قبول العلاقة.' : 'Verify your mobile number before accepting the relationship.');
      return;
    }

    const [birthYear, birthMonth, birthDay] = birthDate.split('-');
    const whatsappE164 = sameWhatsapp ? canonicalPhone : normalizePhoneNumber(whatsappCountry, whatsappNumber) || undefined;

    const partner2: PartnerData = {
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
    };

    setSubmitting(true);
    try {
      await onAcceptRelationship(partner2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to accept invitation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between px-4 py-3">
      <div className="flex items-center justify-end mb-3 mt-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3b335c]/50 border border-[#83769c] text-[10px] font-semibold tracking-widest text-[#f3c4db] uppercase">
          <Shield className="w-3.5 h-3.5" /> P2 • 2/3
        </div>
      </div>
      <div className="text-center mb-3">
        <h1 className="text-lg font-bold text-white tracking-tight">{t.p2FormTitle}</h1>
        <p className="text-xs text-[#b6afd4] leading-relaxed">{t.p2FormDesc}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-3.5">
        <section className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div className="flex items-center gap-2 text-[#f3c4db]">
              <Shield className="w-4 h-4" />
              <div>
                <h2 className="text-xs font-bold text-white leading-tight">{t.verifiedIdentityTitle}</h2>
                <p className="text-[10px] text-[#b6afd4] mt-0.5">{language === 'ar' ? 'أدخل بياناتك أنت، وليس بيانات الشريك.' : 'Enter your own information.'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-medium text-[#b6afd4] mb-1" htmlFor="p2-fullname">{t.fullNameLabel}</label>
              <input id="p2-fullname" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className={styles.inputControl} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#b6afd4] mb-1" htmlFor="p2-dob">{t.birthdateLabel}</label>
              <input id="p2-dob" type="date" required max={todayIso} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={styles.inputControl} dir="ltr" />
            </div>
          </div>
        </section>

        <section className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-[#f3c4db]" />
              <div>
                <h2 className="text-xs font-bold text-white leading-tight">{t.contactDetailsTitle}</h2>
                <p className="text-[10px] text-[#b6afd4] mt-0.5">{language === 'ar' ? 'تحقق حقيقي من الجوال مطلوب.' : 'Real mobile verification is required.'}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="p2-email" className="block text-[11px] font-medium text-[#b6afd4] mb-1">{t.emailLabel}</label>
              <input id="p2-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={styles.inputControl} dir="ltr" />
            </div>

            <PhoneVerificationField
              id="p2-mobile"
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
              onVerified={handleVerified}
              label={t.phoneLabel}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-[#b6afd4]">
                  <Phone className="w-3.5 h-3.5 text-[#f3c4db]" /> {t.whatsappLabel}
                </label>
                <label className="flex items-center gap-1.5 text-[10px] text-[#f3c4db] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameWhatsapp}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSameWhatsapp(checked);
                      if (checked) {
                        setWhatsappCountry(phoneCountry);
                        setWhatsappNumber(phoneNumber);
                      }
                    }}
                    className="accent-[#9b6682]"
                  />
                  {language === 'ar' ? 'نفس رقم الجوال' : 'Same as mobile'}
                </label>
              </div>

              {sameWhatsapp ? (
                <div className="rounded-xl border border-[#9b6682]/45 bg-[#141124] px-3 py-2.5 flex items-center justify-between" dir="ltr">
                  <span className="text-xs text-white font-mono">{canonicalPhone || (language === 'ar' ? 'تحقق من الجوال' : 'Verify mobile')}</span>
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
                  <p className="text-[9.5px] text-amber-300">{language === 'ar' ? 'رقم واتساب المختلف يبقى غير موثوق حتى التحقق الحقيقي.' : 'Different WhatsApp remains unverified until genuine ownership proof.'}</p>
                </>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#b6afd4] mb-1">{t.socialAccountsLabel} <span className="text-[9px] text-[#8e84af]">({t.socialAccountsOptional})</span></label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-[#8e84af] text-xs font-mono">@</span>
                <input type="text" value={socialHandle} onChange={(e) => setSocialHandle(e.target.value)} className={`${styles.inputControl} pl-8 text-left`} dir="ltr" />
              </div>
            </div>
          </div>
        </section>

        <section className="p-4 rounded-2xl bg-[#251e3b] border border-[#9b6682]/45 shadow-md flex flex-col gap-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-1.5 text-[#f3c4db]">
              <Lock className="w-4 h-4" />
              <h2 className="text-sm font-bold text-white">{t.lockedDetailsTitle}</h2>
            </div>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#9b6682]/15 border border-[#9b6682]/30 text-[#f3c4db] font-medium">🔒 {t.lockedLabel}</span>
          </div>

          <div className="p-3 rounded-xl bg-[#1a1530] border border-[#9b6682] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle className="w-4 h-4 text-[#f3c4db]" />
              <span className="text-xs font-bold text-white">{record.type === 'marriage' ? t.marriage : record.type === 'engagement' ? t.engagement : t.dating}</span>
            </div>
            <Lock className="w-3.5 h-3.5 text-[#f3c4db]" />
          </div>

          <div className="p-2.5 rounded-xl bg-[#141124] border border-white/10 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-[#b6afd4]">{t.startDateLabel}</p>
              <p className="text-xs font-semibold text-white">{language === 'ar' ? record.startDateAr : record.startDate}</p>
            </div>
            <Lock className="w-3.5 h-3.5 text-[#f3c4db]" />
          </div>
        </section>

        {error && <p className="text-[10.5px] text-rose-300 leading-relaxed">{error}</p>}

        <div className="flex flex-col gap-2 pt-2">
          <button type="submit" disabled={submitting} className={`${styles.primaryCta} disabled:opacity-50`}>
            <span>{submitting ? '...' : (language === 'ar' ? 'التالي: عرض الشهادة' : 'Next: View Certificate')}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
