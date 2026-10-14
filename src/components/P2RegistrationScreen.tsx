import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Lock, Mail, Phone, Shield, User, Edit3, Sliders } from 'lucide-react';
import type { CountryCode } from 'libphonenumber-js';
import { Language, PartnerData, RelationshipRecord, SocialAccount } from '../types';
import { translations } from '../i18n/translations';
import { PhoneVerificationField } from './PhoneVerificationField';
import { SocialAccountsEditor } from './SocialAccountsEditor';
import { FormSkeleton } from './FormSkeleton';
import { getDisplaySocialAccounts } from '../utils/social';
import { auth } from '../lib/firebase';
import { authFetch, getLocalizedErrorMessage } from '../utils/api';
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
  onOpenPrivacy?: () => void;
  onOpenTerms?: () => void;
  loading?: boolean;
  loadingError?: string | null;
  onRetryLoading?: () => void;
  initialProfile?: PartnerData | null;
  onDraftChange?: (draft: Partial<PartnerData>) => void;
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
  onViewControls,
  onOpenPrivacy,
  onOpenTerms,
  loading = false,
  loadingError = null,
  onRetryLoading,
  initialProfile = null,
  onDraftChange
}) => {
  const t = translations[language];

  // Effective initial values combining P2's saved personal profile with invitation record defaults
  const effectivePartner2 = useMemo(() => ({
    ...initialProfile,
    ...record.partner2,
    fullName: record.partner2.fullName || initialProfile?.fullName || auth?.currentUser?.displayName || '',
    email: record.partner2.email || initialProfile?.email || auth?.currentUser?.email || '',
    birthYear: record.partner2.birthYear || initialProfile?.birthYear || '',
    birthMonth: record.partner2.birthMonth || initialProfile?.birthMonth || '',
    birthDay: record.partner2.birthDay || initialProfile?.birthDay || '',
    phoneNumber: record.partner2.phoneNumber || initialProfile?.phoneNumber || '',
    phoneCountry: record.partner2.phoneCountry || initialProfile?.phoneCountry || 'SA +966',
    phoneE164: record.partner2.phoneE164 || initialProfile?.phoneE164,
    whatsappE164: record.partner2.whatsappE164 || initialProfile?.whatsappE164,
    whatsappTrusted: record.partner2.whatsappTrusted ?? initialProfile?.whatsappTrusted,
    phoneVerified: record.partner2.phoneVerified ?? initialProfile?.phoneVerified,
    socialAccounts: record.partner2.socialAccounts || initialProfile?.socialAccounts,
    socialHandle: record.partner2.socialHandle || initialProfile?.socialHandle
  }), [record.partner2, initialProfile]);

  // Unconditional hook declarations at the top of the component
  const [fullName, setFullName] = useState(effectivePartner2.fullName);
  const [birthDate, setBirthDate] = useState(isoFromParts(effectivePartner2.birthYear, effectivePartner2.birthMonth, effectivePartner2.birthDay));
  const [email, setEmail] = useState(effectivePartner2.email);
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(countryFromLegacyValue(effectivePartner2.phoneCountry));
  const [phoneNumber, setPhoneNumber] = useState(effectivePartner2.phoneNumber);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(
    (effectivePartner2.whatsappTrusted && effectivePartner2.whatsappE164)
      ? effectivePartner2.whatsappE164
      : (effectivePartner2.phoneVerified && effectivePartner2.phoneE164 ? effectivePartner2.phoneE164 : auth?.currentUser?.phoneNumber || null)
  );
  const [isWhatsappVerified, setIsWhatsappVerified] = useState<boolean>(
    Boolean(effectivePartner2.whatsappTrusted && effectivePartner2.whatsappE164)
  );
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>(() => {
    if (Array.isArray(effectivePartner2.socialAccounts) && effectivePartner2.socialAccounts.length > 0) {
      return effectivePartner2.socialAccounts;
    }
    if (effectivePartner2.socialHandle && effectivePartner2.socialHandle.trim()) {
      return [{ platform: 'instagram', handle: effectivePartner2.socialHandle.trim().replace(/^@/, '') }];
    }
    return [];
  });
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const editedFieldsRef = useRef<Set<string>>(new Set());
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (effectivePartner2.fullName && !editedFieldsRef.current.has('fullName')) {
      setFullName(effectivePartner2.fullName);
    }
    const dob = isoFromParts(effectivePartner2.birthYear, effectivePartner2.birthMonth, effectivePartner2.birthDay);
    if (dob && !editedFieldsRef.current.has('birthDate')) {
      setBirthDate(dob);
    }
    if (effectivePartner2.email && !editedFieldsRef.current.has('email')) {
      setEmail(effectivePartner2.email);
    }
    if (effectivePartner2.phoneCountry && !editedFieldsRef.current.has('phoneCountry')) {
      setPhoneCountry(countryFromLegacyValue(effectivePartner2.phoneCountry));
    }
    if (effectivePartner2.phoneNumber && !editedFieldsRef.current.has('phoneNumber')) {
      setPhoneNumber(effectivePartner2.phoneNumber);
    }
    const preverified = (effectivePartner2.whatsappTrusted && effectivePartner2.whatsappE164)
      ? effectivePartner2.whatsappE164
      : (effectivePartner2.phoneVerified && effectivePartner2.phoneE164 ? effectivePartner2.phoneE164 : auth?.currentUser?.phoneNumber || null);
    if (preverified && !editedFieldsRef.current.has('verifiedPhone')) {
      setVerifiedPhone(preverified);
    }
    if (effectivePartner2.whatsappTrusted && effectivePartner2.whatsappE164 && !editedFieldsRef.current.has('isWhatsappVerified')) {
      setIsWhatsappVerified(true);
    }
    if (Array.isArray(effectivePartner2.socialAccounts) && effectivePartner2.socialAccounts.length > 0 && !editedFieldsRef.current.has('socialAccounts')) {
      setSocialAccounts(effectivePartner2.socialAccounts);
    }
  }, [effectivePartner2]);

  // Keep parent draft updated for temporary navigation (like reading terms/privacy)
  useEffect(() => {
    onDraftChange?.({
      fullName,
      birthDay: birthDate.split('-')[2] || '',
      birthMonth: birthDate.split('-')[1] || '',
      birthYear: birthDate.split('-')[0] || '',
      email,
      phoneCountry: legacyCountryValue(phoneCountry),
      phoneNumber,
      socialAccounts
    });
  }, [fullName, birthDate, email, phoneCountry, phoneNumber, socialAccounts, onDraftChange]);

  const canonicalPhone = useMemo(() => normalizePhoneNumber(phoneCountry, phoneNumber), [phoneCountry, phoneNumber]);
  const phoneIsVerified = Boolean(canonicalPhone && verifiedPhone === canonicalPhone);
  const todayIso = new Date().toISOString().slice(0, 10);

  const handleVerified = async (e164: string | null) => {
    editedFieldsRef.current.add('verifiedPhone');
    editedFieldsRef.current.add('isWhatsappVerified');
    setVerifiedPhone(e164);
    setIsWhatsappVerified(Boolean(e164));

    if (e164) {
      try {
        const res = await authFetch('/api/profile/sync-verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneE164: e164 })
        });
        if (!res.ok) {
          setError(language === 'ar' ? 'تعذر مزامنة التحقق مع الخادم.' : 'Failed to sync phone verification with server.');
        }
      } catch {
        setError(language === 'ar' ? 'خطأ في شبكة الاتصال أثناء مزامنة التحقق.' : 'Network error while syncing verification.');
      }
    }
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
    if (!canonicalPhone || !phoneIsVerified) {
      setError(language === 'ar' ? 'يجب التحقق من رقم الجوال عبر واتساب قبل قبول العلاقة.' : 'Verify your mobile number via WhatsApp before accepting the relationship.');
      return;
    }

    const [birthYear, birthMonth, birthDay] = birthDate.split('-');
    const cleanedSocialAccounts = socialAccounts
      .map((a) => ({ platform: a.platform, handle: a.handle.trim() }))
      .filter((a) => a.handle.length > 0);

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
      sameWhatsapp: true,
      whatsappCountry: legacyCountryValue(phoneCountry),
      whatsappNumber: phoneNumber,
      whatsappE164: canonicalPhone,
      whatsappTrusted: isWhatsappVerified,
      whatsappVerifiedAt: isWhatsappVerified ? new Date().toISOString() : undefined,
      socialAccounts: cleanedSocialAccounts.length > 0 ? cleanedSocialAccounts : undefined,
      socialHandle: cleanedSocialAccounts.length > 0 ? cleanedSocialAccounts[0].handle.replace(/^@/, '') : undefined
    };

    isSubmittingRef.current = true;
    setSubmitting(true);
    try {
      await onAcceptRelationship(partner2);
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

  // State 2: Loading skeleton while waiting for invitation and profile authorization
  if (loading) {
    return <FormSkeleton type="p2" language={language} />;
  }

  // State 3: When relationship is active, display P2's authorized primary record view with read-only fields
  if (record.status === 'active') {
    const stageLabel = record.type === 'marriage' ? t.marriage : record.type === 'engagement' ? t.engagement : t.dating;
    const p1BirthDate = isoFromParts(record.partner1.birthYear, record.partner1.birthMonth, record.partner1.birthDay);
    const p2BirthDate = isoFromParts(record.partner2.birthYear, record.partner2.birthMonth, record.partner2.birthDay);

    return (
      <div className="flex-1 flex flex-col justify-between px-4 py-3" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <section className="text-center mb-3 mt-2">
          <div className="flex items-center justify-between mb-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm font-semibold">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>{language === 'ar' ? 'سجل علاقة نشط' : 'Active Relationship Record'}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#392D5A] border border-[#51465F] text-sm font-semibold tracking-widest text-[#E7BCD3] uppercase">
              <Shield className="w-3.5 h-3.5" /> #{record.recordNumber || record.verificationRef}
            </div>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            {language === 'ar' ? 'سجل العلاقة المعتمد (الطرف الثاني)' : 'Verified Relationship Record (Partner 2)'}
          </h1>
          <p className="text-sm text-[#B7ACC8] mt-0.5">
            {language === 'ar' ? 'بيانات السجل مقفلة للقراءة فقط لحماية موثوقية السجل' : 'Record details are locked as read-only to preserve record integrity'}
          </p>
        </section>

        <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
          {/* Partner 2 Read-only Card */}
          <section className="p-4 rounded-2xl bg-[#30264D] border border-[#51465F] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 text-[#E7BCD3]">
                <User className="w-4 h-4" />
                <h2 className="text-sm sm:text-base font-bold text-white">{language === 'ar' ? 'بيانات الشريك الثاني (P2)' : 'Partner 2 Details (P2)'}</h2>
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

          {/* Partner 1 Read-only Card */}
          <section className="p-4 rounded-2xl bg-[#30264D] border border-[#51465F] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 text-[#E7BCD3]">
                <User className="w-4 h-4" />
                <h2 className="text-sm sm:text-base font-bold text-white">{language === 'ar' ? 'بيانات الشريك الأول' : 'Partner 1 Details'}</h2>
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
            <p className="text-sm text-amber-200/90 leading-relaxed">
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

  // State 4: Editable P2 acceptance form
  return (
    <div className="flex-1 flex flex-col justify-between px-4 py-3">
      <div className="flex items-center justify-end mb-3 mt-2">
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#392D5A] border border-[#51465F] text-sm font-semibold text-[#E7BCD3] ${language === 'ar' ? 'font-sans tracking-normal' : 'tracking-wider uppercase'}`}>
          <Shield className="w-3.5 h-3.5" />
          <span>{language === 'ar' ? 'الخطوة 2 من 3' : 'Step 2 of 3'}</span>
        </div>
      </div>
      <div className="text-center mb-3">
        <h1 className="text-xl font-bold text-white tracking-tight">{t.p2FormTitle}</h1>
        <p className="text-base text-[#B7ACC8] leading-relaxed">{t.p2FormDesc}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-3.5">
        <section className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div className="flex items-center gap-2 text-[#E7BCD3]">
              <Shield className="w-4 h-4" />
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white leading-tight">{t.verifiedIdentityTitle}</h2>
                <p className="text-sm text-[#B7ACC8] mt-0.5">{language === 'ar' ? 'أدخل بياناتك أنت، وليس بيانات الشريك.' : 'Enter your own information.'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[#B7ACC8] mb-1.5" htmlFor="p2-fullname">{t.fullNameLabel}</label>
              <input
                id="p2-fullname"
                type="text"
                required
                value={fullName}
                onChange={(e) => {
                  editedFieldsRef.current.add('fullName');
                  setFullName(e.target.value);
                }}
                className={styles.inputControl}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#B7ACC8] mb-1.5" htmlFor="p2-dob">{t.birthdateLabel}</label>
              <input
                id="p2-dob"
                type="date"
                required
                max={todayIso}
                value={birthDate}
                onChange={(e) => {
                  editedFieldsRef.current.add('birthDate');
                  setBirthDate(e.target.value);
                }}
                className={styles.inputControl}
                dir="ltr"
              />
            </div>
          </div>
        </section>

        <section className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-[#E7BCD3]" />
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white leading-tight">{t.contactDetailsTitle}</h2>
                <p className="text-sm text-[#B7ACC8] mt-0.5">{language === 'ar' ? 'يتم التحقق من رقم الجوال عبر رسالة رمز تحقق في تطبيق واتساب.' : 'Mobile number is verified with a verification code via WhatsApp.'}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="p2-email" className="block text-sm font-medium text-[#B7ACC8] mb-1.5">{t.emailLabel}</label>
              <input
                id="p2-email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  editedFieldsRef.current.add('email');
                  setEmail(e.target.value);
                }}
                className={styles.inputControl}
                dir="ltr"
              />
            </div>

            <PhoneVerificationField
              id="p2-mobile"
              language={language}
              country={phoneCountry}
              number={phoneNumber}
              verifiedE164={verifiedPhone}
              isWhatsappVerified={isWhatsappVerified}
              onCountryChange={(value) => {
                editedFieldsRef.current.add('phoneCountry');
                setPhoneCountry(value);
              }}
              onNumberChange={(value) => {
                editedFieldsRef.current.add('phoneNumber');
                setPhoneNumber(value);
              }}
              onVerified={handleVerified}
              label={t.phoneLabel}
            />

            <SocialAccountsEditor
              language={language}
              accounts={socialAccounts}
              onChange={(accs) => {
                editedFieldsRef.current.add('socialAccounts');
                setSocialAccounts(accs);
              }}
              maxAccounts={6}
            />
          </div>
        </section>

        <section className="p-4 rounded-2xl bg-[#30264D] border border-[#51465F] shadow-md flex flex-col gap-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-1.5 text-[#E7BCD3]">
              <Lock className="w-4 h-4" />
              <h2 className="text-sm sm:text-base font-bold text-white">{t.lockedDetailsTitle}</h2>
            </div>
            <span className="text-sm px-2.5 py-0.5 rounded-full bg-[#E7BCD3]/15 border border-[#51465F] text-[#E7BCD3] font-medium">🔒 {t.lockedLabel}</span>
          </div>

          <div className="p-3 rounded-xl bg-[#141023] border border-[#51465F] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle className="w-4 h-4 text-[#E7BCD3]" />
              <span className="text-sm sm:text-base font-bold text-white">{record.type === 'marriage' ? t.marriage : record.type === 'engagement' ? t.engagement : t.dating}</span>
            </div>
            <Lock className="w-3.5 h-3.5 text-[#E7BCD3]" />
          </div>

          <div className="p-3 rounded-xl bg-[#141023] border border-[#51465F] flex items-center justify-between">
            <div>
              <p className="text-sm text-[#B7ACC8]">{t.startDateLabel}</p>
              <p className="text-sm sm:text-base font-semibold text-white">{language === 'ar' ? record.startDateAr : record.startDate}</p>
            </div>
            <Lock className="w-3.5 h-3.5 text-[#E7BCD3]" />
          </div>
        </section>

        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#141023] border border-[#51465F] text-sm text-[#B7ACC8]">
          <input
            id="p2-legal-consent"
            type="checkbox"
            checked={acceptedLegal}
            onChange={(e) => setAcceptedLegal(e.target.checked)}
            required
            className="mt-0.5 rounded border-[#51465F] bg-[#141023] text-[#85516F] focus:ring-[#E7BCD3] cursor-pointer"
          />
          <label htmlFor="p2-legal-consent" className="cursor-pointer text-sm leading-relaxed select-none">
            {language === 'ar' ? (
              <>
                أؤكد أن عمري 18 سنة أو أكثر، وأوافق على{' '}
                <a
                  href="/terms"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenTerms?.();
                  }}
                  className="text-[#E7BCD3] underline hover:text-white"
                >
                  شروط الاستخدام
                </a>{' '}
                و
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
                I confirm I am 18 or older, and I agree to the{' '}
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

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="submit"
            disabled={!acceptedLegal || submitting}
            className={`${styles.primaryCta} disabled:opacity-50`}
          >
            <span>
              {submitting
                ? (language === 'ar' ? 'جارٍ الحفظ...' : 'Saving...')
                : (language === 'ar' ? 'التالي: عرض الشهادة' : 'Next: View Certificate')}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};
