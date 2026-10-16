import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, CheckCircle, Heart, Mail, Phone, Plus, Shield, Lock, User, Edit3, Sliders } from 'lucide-react';
import type { CountryCode } from 'libphonenumber-js';
import { Language, PartnerData, RelationshipRecord, RelationshipType, SocialAccount } from '../types';
import { translations } from '../i18n/translations';
import { PhoneVerificationField } from './PhoneVerificationField';
import { SocialAccountsEditor } from './SocialAccountsEditor';
import { FormSkeleton } from './FormSkeleton';
import { getDisplaySocialAccounts } from '../utils/social';
import { auth } from '../lib/firebase';
import { getLocalizedErrorMessage } from '../utils/api';
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
  onSaveAndNext: (p1: PartnerData, type: RelationshipType, startDate: string) => Promise<void> | void;
  onBack?: () => void;
  isActive?: boolean;
  record?: RelationshipRecord;
  onRequestChange?: () => void;
  onViewControls?: () => void;
  onOpenPrivacy?: () => void;
  onOpenTerms?: () => void;
  loading?: boolean;
  loadingError?: string | null;
  onRetryLoading?: () => void;
  onDraftChange?: (draft: Partial<PartnerData> & { relationshipType?: RelationshipType; startDate?: string }) => void;
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
  onViewControls,
  onOpenPrivacy,
  onOpenTerms,
  loading = false,
  loadingError = null,
  onRetryLoading,
  onDraftChange
}) => {
  const t = translations[language];

  // Unconditional hook declarations at the top of the component
  const [fullName, setFullName] = useState(initialData.fullName || '');
  const [birthDate, setBirthDate] = useState(isoFromParts(initialData.birthYear, initialData.birthMonth, initialData.birthDay));
  const [email, setEmail] = useState(initialData.email || auth?.currentUser?.email || '');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(countryFromLegacyValue(initialData.phoneCountry));
  const [phoneNumber, setPhoneNumber] = useState(initialData.phoneNumber || '');
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(
    initialData.whatsappTrusted && initialData.whatsappE164
      ? initialData.whatsappE164
      : (initialData.phoneVerified && initialData.phoneE164 ? initialData.phoneE164 : auth?.currentUser?.phoneNumber || null)
  );
  const [isWhatsappVerified, setIsWhatsappVerified] = useState<boolean>(
    Boolean(initialData.whatsappTrusted && initialData.whatsappE164)
  );
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>(() => {
    if (Array.isArray(initialData.socialAccounts) && initialData.socialAccounts.length > 0) {
      return initialData.socialAccounts;
    }
    if (initialData.socialHandle && initialData.socialHandle.trim()) {
      return [{ platform: 'instagram', handle: initialData.socialHandle.trim().replace(/^@/, '') }];
    }
    return [];
  });
  const [relType, setRelType] = useState<RelationshipType>(initialRelType || 'dating');
  const [startDate, setStartDate] = useState(initialStartDate.match(/^\d{4}-\d{2}-\d{2}$/) ? initialStartDate : '');
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const editedFieldsRef = useRef<Set<string>>(new Set());
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (initialData.fullName && !editedFieldsRef.current.has('fullName')) {
      setFullName(initialData.fullName);
    }
    const dob = isoFromParts(initialData.birthYear, initialData.birthMonth, initialData.birthDay);
    if (dob && !editedFieldsRef.current.has('birthDate')) {
      setBirthDate(dob);
    }
    if (initialData.email && !editedFieldsRef.current.has('email')) {
      setEmail(initialData.email);
    }
    if (initialData.phoneCountry && !editedFieldsRef.current.has('phoneCountry')) {
      setPhoneCountry(countryFromLegacyValue(initialData.phoneCountry));
    }
    if (initialData.phoneNumber && !editedFieldsRef.current.has('phoneNumber')) {
      setPhoneNumber(initialData.phoneNumber);
    }
    const preverified = (initialData.whatsappTrusted && initialData.whatsappE164)
      ? initialData.whatsappE164
      : (initialData.phoneVerified && initialData.phoneE164 ? initialData.phoneE164 : auth?.currentUser?.phoneNumber || null);
    if (preverified && !editedFieldsRef.current.has('verifiedPhone')) {
      setVerifiedPhone(preverified);
    }
    if (initialData.whatsappTrusted && initialData.whatsappE164 && !editedFieldsRef.current.has('isWhatsappVerified')) {
      setIsWhatsappVerified(true);
    }
    if (!editedFieldsRef.current.has('socialAccounts')) {
      if (Array.isArray(initialData.socialAccounts) && initialData.socialAccounts.length > 0) {
        setSocialAccounts(initialData.socialAccounts);
      } else if (initialData.socialHandle && initialData.socialHandle.trim()) {
        setSocialAccounts([{ platform: 'instagram', handle: initialData.socialHandle.trim().replace(/^@/, '') }]);
      }
    }
  }, [initialData]);

  // Keep parent draft updated for seamless Back/Forward and Terms/Privacy navigation
  useEffect(() => {
    onDraftChange?.({
      fullName,
      birthDay: birthDate.split('-')[2] || '',
      birthMonth: birthDate.split('-')[1] || '',
      birthYear: birthDate.split('-')[0] || '',
      email,
      phoneCountry: legacyCountryValue(phoneCountry),
      phoneNumber,
      socialAccounts,
      relationshipType: relType,
      startDate
    });
  }, [fullName, birthDate, email, phoneCountry, phoneNumber, socialAccounts, relType, startDate, onDraftChange]);

  const canonicalPhone = useMemo(() => normalizePhoneNumber(phoneCountry, phoneNumber), [phoneCountry, phoneNumber]);
  const phoneIsVerified = Boolean(canonicalPhone && verifiedPhone === canonicalPhone);
  const todayIso = new Date().toISOString().slice(0, 10);

  const handlePhoneVerified = (e164: string | null) => {
    editedFieldsRef.current.add('verifiedPhone');
    editedFieldsRef.current.add('isWhatsappVerified');
    setVerifiedPhone(e164);
    setIsWhatsappVerified(Boolean(e164));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || submitting) return;

    setError('');
    if (!acceptedLegal) {
      setError(language === 'ar' ? 'يرجى الموافقة على شروط الاستخدام وسياسة الخصوصية للمتابعة.' : 'Please accept the Terms of Service and Privacy Policy to continue.');
      return;
    }
    if (!birthDate || !isAtLeast18(birthDate)) {
      setError(language === 'ar' ? 'يجب أن يكون العمر 18 سنة أو أكثر.' : 'You must be at least 18 years old.');
      return;
    }
    if (!startDate || startDate > todayIso) {
      setError(language === 'ar' ? 'اختر تاريخ بداية صالحاً وليس في المستقبل.' : 'Choose a valid relationship start date that is not in the future.');
      return;
    }
    if (!canonicalPhone || !phoneIsVerified) {
      setError(language === 'ar' ? 'يجب التحقق من رقم الجوال عبر واتساب أولاً.' : 'Verify your mobile number via WhatsApp before continuing.');
      return;
    }

    const [birthYear, birthMonth, birthDay] = birthDate.split('-');
    const cleanedSocialAccounts = socialAccounts
      .map((a) => ({ platform: a.platform, handle: a.handle.trim() }))
      .filter((a) => a.handle.length > 0);

    isSubmittingRef.current = true;
    setSubmitting(true);
    try {
      await onSaveAndNext(
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
          sameWhatsapp: true,
          whatsappCountry: legacyCountryValue(phoneCountry),
          whatsappNumber: phoneNumber,
          whatsappE164: canonicalPhone,
          whatsappTrusted: isWhatsappVerified,
          whatsappVerifiedAt: isWhatsappVerified ? new Date().toISOString() : undefined,
          socialAccounts: cleanedSocialAccounts.length > 0 ? cleanedSocialAccounts : undefined,
          socialHandle: cleanedSocialAccounts.length > 0 ? cleanedSocialAccounts[0].handle.replace(/^@/, '') : undefined
        },
        relType,
        startDate
      );
    } catch (err) {
      setError(getLocalizedErrorMessage(err, language));
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  // State 1: Loading error -> display actionable error with Retry
  if (loadingError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <div className="p-5 max-w-md w-full rounded-2xl bg-[#30264D] border border-rose-500/40 text-center space-y-4 shadow-xl">
          <p className="text-sm sm:text-base text-rose-200 font-semibold leading-relaxed">{loadingError}</p>
          {onRetryLoading && (
            <button
              type="button"
              onClick={onRetryLoading}
              className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-[#804E6A] to-[#8D5775] hover:from-[#895472] hover:to-[#945E7D] text-[#F7F4FA] font-semibold text-sm shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#E7BCD3]"
            >
              {language === 'ar' ? 'إعادة المحاولة' : 'Retry'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // State 2: Genuinely loading -> render loading skeleton
  if (loading) {
    return <FormSkeleton type="p1" language={language} />;
  }

  // State 3: Active relationship -> display both P1 and P2 details as read-only
  if (isActive && record) {
    const stageLabel = record.type === 'marriage' ? t.marriage : record.type === 'engagement' ? t.engagement : t.dating;
    const p1BirthDate = isoFromParts(record.partner1.birthYear, record.partner1.birthMonth, record.partner1.birthDay);
    const p2BirthDate = isoFromParts(record.partner2.birthYear, record.partner2.birthMonth, record.partner2.birthDay);

    return (
      <div className="flex-1 flex flex-col justify-between px-4 py-3" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <section className="text-center mb-3 mt-2">
          <div className="flex items-center justify-between mb-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm font-semibold">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{language === 'ar' ? 'سجل علاقة نشط' : 'Active Relationship Record'}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#392D5A] border border-[#51465F] text-sm font-semibold tracking-wider text-[#E7BCD3] uppercase">
              <Shield className="w-4 h-4" /> #{record.recordNumber || record.verificationRef}
            </div>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            {language === 'ar' ? 'سجل العلاقة المعتمد (الطرف الأول والثاني)' : 'Verified Relationship Record (Partner 1 & Partner 2)'}
          </h2>
          <p className="text-base sm:text-sm text-[#B7ACC8] mt-1 leading-relaxed">
            {language === 'ar' ? 'بيانات السجل مقفلة للقراءة فقط لحماية موثوقية السجل' : 'Record details are locked as read-only to preserve record integrity'}
          </p>
        </section>

        <div className="flex-1 flex flex-col gap-3.5 overflow-y-auto">
          {/* Partner 1 Read-only Card */}
          <section className="p-4 rounded-2xl bg-[#30264D] border border-[#51465F] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 text-[#E7BCD3]">
                <User className="w-4 h-4" />
                <h3 className="text-sm sm:text-base font-bold text-white">{language === 'ar' ? 'بيانات الشريك الأول' : 'Partner 1 Details'}</h3>
              </div>
              <span className="text-sm px-2.5 py-0.5 rounded-full bg-[#E7BCD3]/15 border border-[#51465F] text-[#E7BCD3] font-medium flex items-center gap-1">
                <Lock className="w-3 h-3" /> {language === 'ar' ? 'للقراءة فقط' : 'Read-only'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-start">
              <div>
                <p className="text-sm text-[#B7ACC8]">{t.fullNameLabel}</p>
                <p className="text-sm sm:text-base font-semibold text-white">{record.partner1.fullName}</p>
                {record.partner1.fullNameEn && <p className="text-sm text-[#B7ACC8]">{record.partner1.fullNameEn}</p>}
              </div>
              <div>
                <p className="text-sm text-[#B7ACC8]">{t.birthdateLabel}</p>
                <p className="text-sm sm:text-base font-semibold text-white">{p1BirthDate || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-[#B7ACC8]">{t.emailLabel}</p>
                <p className="text-sm sm:text-base font-semibold text-white truncate" dir="ltr">{record.partner1.email || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-[#B7ACC8]">{t.phoneLabel}</p>
                <p className="text-sm sm:text-base font-semibold text-white" dir="ltr">{record.partner1.phoneE164 || record.partner1.phoneNumber || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-[#B7ACC8]">{t.socialAccountsLabel}</p>
                {(() => {
                  const accounts = getDisplaySocialAccounts(record.partner1);
                  return accounts.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-0.5" dir="ltr">
                      {accounts.map((a, i) => (
                        <span key={i} className="text-sm font-semibold text-white font-mono">
                          {a.display}{i < accounts.length - 1 ? ' ·' : ''}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm sm:text-base font-semibold text-white truncate" dir="ltr">—</p>
                  );
                })()}
              </div>
            </div>
          </section>

          {/* Partner 2 Read-only Card */}
          <section className="p-4 rounded-2xl bg-[#30264D] border border-[#51465F] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 text-[#E7BCD3]">
                <User className="w-4 h-4" />
                <h3 className="text-sm sm:text-base font-bold text-white">{language === 'ar' ? 'بيانات الشريك الثاني (P2)' : 'Partner 2 Details (P2)'}</h3>
              </div>
              <span className="text-sm px-2.5 py-0.5 rounded-full bg-[#E7BCD3]/15 border border-[#51465F] text-[#E7BCD3] font-medium flex items-center gap-1">
                <Lock className="w-3 h-3" /> {language === 'ar' ? 'للقراءة فقط' : 'Read-only'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-start">
              <div>
                <p className="text-sm text-[#B7ACC8]">{t.fullNameLabel}</p>
                <p className="text-sm sm:text-base font-semibold text-white">{record.partner2.fullName}</p>
                {record.partner2.fullNameEn && <p className="text-sm text-[#B7ACC8]">{record.partner2.fullNameEn}</p>}
              </div>
              <div>
                <p className="text-sm text-[#B7ACC8]">{t.birthdateLabel}</p>
                <p className="text-sm sm:text-base font-semibold text-white">{p2BirthDate || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-[#B7ACC8]">{t.emailLabel}</p>
                <p className="text-sm sm:text-base font-semibold text-white truncate" dir="ltr">{record.partner2.email || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-[#B7ACC8]">{t.phoneLabel}</p>
                <p className="text-sm sm:text-base font-semibold text-white" dir="ltr">{record.partner2.phoneE164 || record.partner2.phoneNumber || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-[#B7ACC8]">{t.socialAccountsLabel}</p>
                {(() => {
                  const accounts = getDisplaySocialAccounts(record.partner2);
                  return accounts.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-0.5" dir="ltr">
                      {accounts.map((a, i) => (
                        <span key={i} className="text-sm font-semibold text-white font-mono">
                          {a.display}{i < accounts.length - 1 ? ' ·' : ''}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm sm:text-base font-semibold text-white truncate" dir="ltr">—</p>
                  );
                })()}
              </div>
            </div>
          </section>

          {/* Relationship Stage & Date */}
          <section className="p-4 rounded-2xl bg-[#30264D] border border-[#51465F] flex items-center justify-between text-start">
            <div>
              <p className="text-sm text-[#B7ACC8]">{t.relationshipDetailsTitle}</p>
              <p className="text-sm sm:text-base font-bold text-white">{stageLabel}</p>
            </div>
            <div>
              <p className="text-sm text-[#B7ACC8]">{t.startDateLabel}</p>
              <p className="text-sm sm:text-base font-semibold text-white">{language === 'ar' ? record.startDateAr : record.startDate}</p>
            </div>
          </section>

          {/* Lock & Authorized Change Notice */}
          <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-start flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-base sm:text-sm text-amber-200/90 leading-relaxed">
              {language === 'ar'
                ? 'جميع البيانات أعلاه معتمدة ومقفلة ضد التعديل المباشر. لتعديل أي بيانات، يرجى تقديم طلب تعديل رسمي للمراجعة والموافقة من الشريك.'
                : 'All details above are locked against direct editing to ensure record validity. Use the official change request process for updates.'}
            </p>
          </div>
        </div>

        {/* Action Buttons for Active Relationship */}
        <div className="mt-3 flex flex-col gap-2.5 pt-2 border-t border-white/10">
          {onRequestChange && (
            <button
              type="button"
              onClick={onRequestChange}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#804E6A] to-[#8D5775] hover:from-[#895472] hover:to-[#945E7D] text-[#F7F4FA] font-semibold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg border border-[#51465F] transition-all active:scale-[0.99] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#E7BCD3]"
            >
              <Edit3 className="w-4 h-4" />
              <span>{t.requestChangeBtn}</span>
            </button>
          )}
          {onViewControls && (
            <button
              type="button"
              onClick={onViewControls}
              className="w-full py-3 px-4 rounded-xl bg-[#3D305A] hover:bg-[#4D3E70] border border-[#51465F] text-[#B7ACC8] hover:text-white font-medium text-sm sm:text-base flex items-center justify-center gap-2 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#E7BCD3]"
            >
              <Sliders className="w-4 h-4 text-[#E7BCD3]" />
              <span>{language === 'ar' ? 'عرض الشهادة ولوحة التحكم' : 'View Certificate & Controls'}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // State 4: Editable Form
  return (
    <div className="flex-1 flex flex-col justify-between px-4 py-3">
      <section className="text-center mb-3 mt-2">
        <div className="flex items-center justify-end mb-2">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#392D5A] border border-[#51465F] text-sm font-semibold text-[#E7BCD3] ${language === 'ar' ? 'font-sans tracking-normal' : 'tracking-wider uppercase'}`}>
            <Shield className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'الخطوة 2 من 5' : 'Step 2 of 5'}</span>
          </div>
        </div>
        <h2 className="text-xl font-extrabold text-white tracking-tight">{t.p1FormTitle}</h2>
        <p className="text-base text-[#B7ACC8] mt-0.5 leading-relaxed">{t.p1FormDesc}</p>
      </section>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-3.5">
        {/* Verified Identity Section */}
        <section className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div className="flex items-center gap-2 text-[#E7BCD3]">
              <Shield className="w-4 h-4" />
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white leading-tight">{t.verifiedIdentityTitle}</h3>
                <p className="text-sm text-[#B7ACC8] mt-0.5">{language === 'ar' ? 'أدخل بياناتك الحقيقية لإكمال السجل.' : 'Enter your real information to continue.'}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[#B7ACC8] mb-1.5" htmlFor="p1-name">{t.fullNameLabel}</label>
              <input
                id="p1-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => {
                  editedFieldsRef.current.add('fullName');
                  setFullName(e.target.value);
                }}
                onInput={(e: React.FormEvent<HTMLInputElement>) => {
                  editedFieldsRef.current.add('fullName');
                  setFullName((e.target as HTMLInputElement).value);
                }}
                className={styles.inputControl}
                placeholder={t.fullNamePlaceholder}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-[#B7ACC8]" htmlFor="p1-dob">{t.birthdateLabel}</label>
                {birthDate && isAtLeast18(birthDate) && <span className="text-sm text-[#E7BCD3] font-medium">18+ ✓</span>}
              </div>
              <input
                id="p1-dob"
                type="date"
                required
                max={todayIso}
                value={birthDate}
                onChange={(e) => {
                  editedFieldsRef.current.add('birthDate');
                  setBirthDate(e.target.value);
                }}
                onInput={(e: React.FormEvent<HTMLInputElement>) => {
                  editedFieldsRef.current.add('birthDate');
                  setBirthDate((e.target as HTMLInputElement).value);
                }}
                className={styles.inputControl}
                dir="ltr"
              />
            </div>
          </div>
        </section>

        {/* Contact Details Section */}
        <section className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div className="flex items-center gap-2 text-[#E7BCD3]">
              <Mail className="w-4 h-4" />
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white leading-tight">{t.contactDetailsTitle}</h3>
                <p className="text-sm text-[#B7ACC8] mt-0.5">{language === 'ar' ? 'بيانات التواصل لتأكيد السجل واستلام الإشعارات.' : 'Used to confirm your relationship and deliver updates.'}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[#B7ACC8] mb-1.5" htmlFor="p1-email">{t.emailLabel}</label>
              <input
                id="p1-email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  editedFieldsRef.current.add('email');
                  setEmail(e.target.value);
                }}
                onInput={(e: React.FormEvent<HTMLInputElement>) => {
                  editedFieldsRef.current.add('email');
                  setEmail((e.target as HTMLInputElement).value);
                }}
                className={styles.inputControl}
                placeholder="name@example.com"
                dir="ltr"
              />
            </div>
            <div>
              <PhoneVerificationField
                id="p1-mobile"
                language={language}
                country={phoneCountry}
                number={phoneNumber}
                verifiedE164={verifiedPhone}
                isWhatsappVerified={isWhatsappVerified}
                onCountryChange={(code) => {
                  editedFieldsRef.current.add('phoneCountry');
                  editedFieldsRef.current.add('phoneNumber');
                  editedFieldsRef.current.add('verifiedPhone');
                  editedFieldsRef.current.add('isWhatsappVerified');
                  setPhoneCountry(code);
                  setVerifiedPhone(null);
                  setIsWhatsappVerified(false);
                }}
                onNumberChange={(val) => {
                  editedFieldsRef.current.add('phoneNumber');
                  editedFieldsRef.current.add('verifiedPhone');
                  editedFieldsRef.current.add('isWhatsappVerified');
                  setPhoneNumber(val);
                  setVerifiedPhone(null);
                  setIsWhatsappVerified(false);
                }}
                onVerified={handlePhoneVerified}
                label={t.phoneLabel}
              />
            </div>
          </div>
        </section>

        {/* Social Accounts Section */}
        <section className={styles.cardSection}>
          <SocialAccountsEditor
            language={language}
            accounts={socialAccounts}
            onChange={(accs) => {
              editedFieldsRef.current.add('socialAccounts');
              setSocialAccounts(accs);
            }}
          />
        </section>

        {/* Relationship Details Section */}
        <section className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div className="flex items-center gap-2 text-[#E7BCD3]">
              <Heart className="w-4 h-4" />
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white leading-tight">{t.relationshipDetailsTitle}</h3>
                <p className="text-sm text-[#B7ACC8] mt-0.5">{t.relationshipDetailsDesc}</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[#B7ACC8] mb-1.5">{t.relationshipStage}</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'dating', label: t.dating },
                  { id: 'engagement', label: t.engagement },
                  { id: 'marriage', label: t.marriage }
                ].map((stage) => (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setRelType(stage.id as RelationshipType)}
                    className={`py-2 px-3 rounded-xl border text-sm font-semibold transition-all ${
                      relType === stage.id
                        ? 'bg-[#804E6A] border-[#E7BCD3] text-[#F7F4FA] shadow-md'
                        : 'bg-[#221B38] border-[#51465F] text-[#B7ACC8] hover:border-[#8E82A3]'
                    }`}
                  >
                    {stage.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#B7ACC8] mb-1.5" htmlFor="p1-start-date">{t.startDateLabel}</label>
              <input
                id="p1-start-date"
                type="date"
                required
                max={todayIso}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={styles.inputControl}
                dir="ltr"
              />
            </div>
          </div>
        </section>

        {/* Legal Consent Checkbox */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#30264D]/60 border border-[#51465F]/60">
          <input
            id="p1-terms"
            type="checkbox"
            checked={acceptedLegal}
            onChange={(e) => setAcceptedLegal(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-[#51465F] bg-[#221B38] text-[#804E6A] focus:ring-[#E7BCD3] cursor-pointer"
          />
          <label htmlFor="p1-terms" className="text-sm text-[#B7ACC8] leading-relaxed cursor-pointer select-none">
            {language === 'ar' ? (
              <>
                أوافق على{' '}
                <a
                  href="/terms"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenTerms?.();
                  }}
                  className="text-[#E7BCD3] underline hover:text-white"
                >
                  شروط الخدمة
                </a>{' '}
                و{' '}
                <a
                  href="/privacy"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenPrivacy?.();
                  }}
                  className="text-[#E7BCD3] underline hover:text-white"
                >
                  سياسة الخصوصية
                </a>
                .
              </>
            ) : (
              <>
                I agree to the{' '}
                <a
                  href="/terms"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenTerms?.();
                  }}
                  className="text-[#E7BCD3] underline hover:text-white"
                >
                  Terms of Service
                </a>{' '}
                and{' '}
                <a
                  href="/privacy"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenPrivacy?.();
                  }}
                  className="text-[#E7BCD3] underline hover:text-white"
                >
                  Privacy Policy
                </a>
                .
              </>
            )}
          </label>
        </div>

        {error && <p className="text-sm text-rose-300 leading-relaxed">{error}</p>}

        <div className="pt-2">
          <button
            type="submit"
            disabled={!acceptedLegal || submitting}
            className={`${styles.primaryCta} disabled:opacity-50`}
          >
            <span>
              {submitting
                ? (language === 'ar' ? 'جارٍ الحفظ...' : 'Saving...')
                : t.continueToPartnerBtn}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};
