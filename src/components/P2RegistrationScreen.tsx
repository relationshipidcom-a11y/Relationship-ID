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
  draft?: (Partial<PartnerData> & { editedFields?: string[] }) | null;
  draftEditedFields?: string[];
  onDraftChange?: (draft: Partial<PartnerData>, editedFields?: string[]) => void;
  onPhoneVerified?: (e164: string) => void;
  serverVerification?: { whatsappTrusted?: boolean; whatsappE164?: string | null } | null;
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
  draft = null,
  draftEditedFields,
  onDraftChange,
  onPhoneVerified,
  serverVerification = null
}) => {
  const t = translations[language];

  const editedFieldsRef = useRef<Set<string>>(
    new Set(draft?.editedFields || draftEditedFields || [])
  );
  const isSubmittingRef = useRef(false);

  // Compute resolved initial values ensuring saved profile takes precedence over unedited defaults
  const resolvedInitialValues = useMemo(() => {
    // Full Name
    let initFullName = '';
    if (editedFieldsRef.current.has('fullName') && draft?.fullName !== undefined) {
      initFullName = draft.fullName;
    } else if (initialProfile?.fullName) {
      initFullName = initialProfile.fullName;
    } else if (record.partner2?.fullName) {
      initFullName = record.partner2.fullName;
    } else if (auth?.currentUser?.displayName) {
      initFullName = auth.currentUser.displayName;
    }

    // DOB
    let initBirthDate = '';
    if (editedFieldsRef.current.has('birthDate') && draft) {
      initBirthDate = isoFromParts(draft.birthYear, draft.birthMonth, draft.birthDay);
    } else if (initialProfile?.birthYear && initialProfile?.birthMonth && initialProfile?.birthDay) {
      initBirthDate = isoFromParts(initialProfile.birthYear, initialProfile.birthMonth, initialProfile.birthDay);
    } else if (record.partner2?.birthYear && record.partner2?.birthMonth && record.partner2?.birthDay) {
      initBirthDate = isoFromParts(record.partner2.birthYear, record.partner2.birthMonth, record.partner2.birthDay);
    }

    // Email
    let initEmail = '';
    if (editedFieldsRef.current.has('email') && draft?.email !== undefined) {
      initEmail = draft.email;
    } else if (initialProfile?.email) {
      initEmail = initialProfile.email;
    } else if (record.partner2?.email) {
      initEmail = record.partner2.email;
    } else if (auth?.currentUser?.email) {
      initEmail = auth.currentUser.email;
    }

    // Phone Country - saved profile must override untouched default SA +966
    let initCountryLegacy = 'SA +966';
    if (editedFieldsRef.current.has('phoneCountry') && draft?.phoneCountry !== undefined) {
      initCountryLegacy = draft.phoneCountry;
    } else if (initialProfile?.phoneCountry) {
      initCountryLegacy = initialProfile.phoneCountry;
    } else if (record.partner2?.phoneCountry && record.partner2.phoneCountry !== 'SA +966') {
      initCountryLegacy = record.partner2.phoneCountry;
    } else if (record.partner2?.phoneCountry) {
      initCountryLegacy = record.partner2.phoneCountry;
    }

    // Phone Number
    let initPhoneNumber = '';
    if (editedFieldsRef.current.has('phoneNumber') && draft?.phoneNumber !== undefined) {
      initPhoneNumber = draft.phoneNumber;
    } else if (initialProfile?.phoneNumber) {
      initPhoneNumber = initialProfile.phoneNumber;
    } else if (record.partner2?.phoneNumber) {
      initPhoneNumber = record.partner2.phoneNumber;
    }

    // Social Accounts - saved profile must override untouched empty array
    let initSocial: SocialAccount[] = [];
    if (editedFieldsRef.current.has('socialAccounts') && draft?.socialAccounts !== undefined) {
      initSocial = draft.socialAccounts;
    } else if (Array.isArray(initialProfile?.socialAccounts) && initialProfile.socialAccounts.length > 0) {
      initSocial = initialProfile.socialAccounts;
    } else if (initialProfile?.socialHandle && initialProfile.socialHandle.trim()) {
      initSocial = [{ platform: 'instagram', handle: initialProfile.socialHandle.trim().replace(/^@/, '') }];
    } else if (Array.isArray(record.partner2?.socialAccounts) && record.partner2.socialAccounts.length > 0) {
      initSocial = record.partner2.socialAccounts;
    } else if (record.partner2?.socialHandle && record.partner2.socialHandle.trim()) {
      initSocial = [{ platform: 'instagram', handle: record.partner2.socialHandle.trim().replace(/^@/, '') }];
    }

    // Verification - ONLY from authenticated server-confirmed ownership for exact canonical number
    let initVerifiedPhone: string | null = null;
    let initIsWhatsappVerified = false;
    const serverConfirmedWa = (serverVerification?.whatsappTrusted && serverVerification?.whatsappE164)
      || (initialProfile?.whatsappTrusted && initialProfile?.whatsappE164)
      || (record.partner2?.whatsappTrusted && record.partner2?.whatsappE164)
      || null;
    const canonical = normalizePhoneNumber(countryFromLegacyValue(initCountryLegacy), initPhoneNumber);
    if (serverConfirmedWa && canonical && canonical === serverConfirmedWa) {
      initVerifiedPhone = serverConfirmedWa;
      initIsWhatsappVerified = true;
    }

    return {
      fullName: initFullName,
      birthDate: initBirthDate,
      email: initEmail,
      phoneCountry: countryFromLegacyValue(initCountryLegacy),
      phoneNumber: initPhoneNumber,
      socialAccounts: initSocial,
      verifiedPhone: initVerifiedPhone,
      isWhatsappVerified: initIsWhatsappVerified
    };
  }, [initialProfile, serverVerification, record.partner2, draft]);

  // Unconditional hook declarations at the top of the component
  const [fullName, setFullName] = useState(resolvedInitialValues.fullName);
  const [birthDate, setBirthDate] = useState(resolvedInitialValues.birthDate);
  const [email, setEmail] = useState(resolvedInitialValues.email);
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(resolvedInitialValues.phoneCountry);
  const [phoneNumber, setPhoneNumber] = useState(resolvedInitialValues.phoneNumber);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(resolvedInitialValues.verifiedPhone);
  const [isWhatsappVerified, setIsWhatsappVerified] = useState<boolean>(resolvedInitialValues.isWhatsappVerified);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>(resolvedInitialValues.socialAccounts);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Late profile hydration effect: updates unedited fields without overwriting user edits
  useEffect(() => {
    if (loading) return;

    if (!editedFieldsRef.current.has('fullName')) {
      const resolvedName = initialProfile?.fullName || record.partner2?.fullName || auth?.currentUser?.displayName || '';
      if (resolvedName) setFullName(resolvedName);
    }

    if (!editedFieldsRef.current.has('birthDate')) {
      const profileDob = isoFromParts(initialProfile?.birthYear, initialProfile?.birthMonth, initialProfile?.birthDay);
      const recordDob = isoFromParts(record.partner2?.birthYear, record.partner2?.birthMonth, record.partner2?.birthDay);
      const resolvedDob = profileDob || recordDob || '';
      if (resolvedDob) setBirthDate(resolvedDob);
    }

    if (!editedFieldsRef.current.has('email')) {
      const resolvedEmail = initialProfile?.email || record.partner2?.email || auth?.currentUser?.email || '';
      if (resolvedEmail) setEmail(resolvedEmail);
    }

    if (!editedFieldsRef.current.has('phoneCountry')) {
      const resolvedCountry = initialProfile?.phoneCountry
        || (record.partner2?.phoneCountry && record.partner2.phoneCountry !== 'SA +966' ? record.partner2.phoneCountry : (initialProfile?.phoneCountry || record.partner2?.phoneCountry || 'SA +966'));
      setPhoneCountry(countryFromLegacyValue(resolvedCountry));
    }

    if (!editedFieldsRef.current.has('phoneNumber')) {
      const resolvedNumber = initialProfile?.phoneNumber || record.partner2?.phoneNumber || '';
      if (resolvedNumber) setPhoneNumber(resolvedNumber);
    }

    if (!editedFieldsRef.current.has('socialAccounts')) {
      if (Array.isArray(initialProfile?.socialAccounts) && initialProfile.socialAccounts.length > 0) {
        setSocialAccounts(initialProfile.socialAccounts);
      } else if (initialProfile?.socialHandle && initialProfile.socialHandle.trim()) {
        setSocialAccounts([{ platform: 'instagram', handle: initialProfile.socialHandle.trim().replace(/^@/, '') }]);
      } else if (Array.isArray(record.partner2?.socialAccounts) && record.partner2.socialAccounts.length > 0) {
        setSocialAccounts(record.partner2.socialAccounts);
      } else if (record.partner2?.socialHandle && record.partner2.socialHandle.trim()) {
        setSocialAccounts([{ platform: 'instagram', handle: record.partner2.socialHandle.trim().replace(/^@/, '') }]);
      }
    }

    const currentCountry = (editedFieldsRef.current.has('phoneCountry') && draft?.phoneCountry)
      ? countryFromLegacyValue(draft.phoneCountry)
      : phoneCountry;
    const currentNumber = (editedFieldsRef.current.has('phoneNumber') && draft?.phoneNumber)
      ? draft.phoneNumber
      : phoneNumber;
    const currentCanonical = normalizePhoneNumber(currentCountry, currentNumber);
    const serverConfirmedWa = (serverVerification?.whatsappTrusted && serverVerification?.whatsappE164)
      || (initialProfile?.whatsappTrusted && initialProfile?.whatsappE164)
      || (record.partner2?.whatsappTrusted && record.partner2?.whatsappE164)
      || null;

    if (serverConfirmedWa && currentCanonical && currentCanonical === serverConfirmedWa) {
      setVerifiedPhone(serverConfirmedWa);
      setIsWhatsappVerified(true);
    } else {
      setVerifiedPhone(null);
      setIsWhatsappVerified(false);
    }
  }, [loading, initialProfile, serverVerification, record.partner2, phoneCountry, phoneNumber, draft]);

  // Keep parent draft updated for temporary navigation (like reading terms/privacy)
  // Guard: NEVER emit while loading skeleton is visible, and only emit when user has edited fields
  useEffect(() => {
    if (loading) return;
    if (editedFieldsRef.current.size === 0) return;

    onDraftChange?.({
      fullName,
      birthDay: birthDate.split('-')[2] || '',
      birthMonth: birthDate.split('-')[1] || '',
      birthYear: birthDate.split('-')[0] || '',
      email,
      phoneCountry: legacyCountryValue(phoneCountry),
      phoneNumber,
      socialAccounts
    }, Array.from(editedFieldsRef.current));
  }, [loading, fullName, birthDate, email, phoneCountry, phoneNumber, socialAccounts, onDraftChange]);

  const canonicalPhone = useMemo(() => normalizePhoneNumber(phoneCountry, phoneNumber), [phoneCountry, phoneNumber]);
  const phoneIsVerified = Boolean(canonicalPhone && verifiedPhone === canonicalPhone);
  const todayIso = new Date().toISOString().slice(0, 10);

  const handleVerified = async (e164: string | null) => {
    editedFieldsRef.current.add('verifiedPhone');
    editedFieldsRef.current.add('isWhatsappVerified');
    setVerifiedPhone(e164);
    setIsWhatsappVerified(Boolean(e164));

    if (e164) {
      onPhoneVerified?.(e164);
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

  // State 1: Pure loading error (initial load failure before any data or edits exist) -> centered error with Retry
  const hasExistingData = Boolean(
    initialProfile ||
    editedFieldsRef.current.size > 0 ||
    record.partner2?.fullName ||
    record.partner2?.phoneNumber
  );

  if (loadingError && !hasExistingData) {
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

      {loadingError && (
        <div className="mb-3 p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 flex items-center justify-between gap-3 text-start">
          <p className="text-xs sm:text-sm text-rose-200 font-medium leading-relaxed">{loadingError}</p>
          {onRetryLoading && (
            <button
              type="button"
              onClick={onRetryLoading}
              className="px-3 py-1.5 rounded-lg bg-rose-800/60 hover:bg-rose-700/60 border border-rose-400/30 text-rose-100 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors"
            >
              {language === 'ar' ? 'إعادة المحاولة' : 'Retry'}
            </button>
          )}
        </div>
      )}

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
                onInput={(e: React.FormEvent<HTMLInputElement>) => {
                  editedFieldsRef.current.add('fullName');
                  setFullName((e.target as HTMLInputElement).value);
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
                onInput={(e: React.FormEvent<HTMLInputElement>) => {
                  editedFieldsRef.current.add('email');
                  setEmail((e.target as HTMLInputElement).value);
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
                editedFieldsRef.current.add('phoneNumber');
                editedFieldsRef.current.add('verifiedPhone');
                editedFieldsRef.current.add('isWhatsappVerified');
                setPhoneCountry(value);
                setVerifiedPhone(null);
                setIsWhatsappVerified(false);
              }}
              onNumberChange={(value) => {
                editedFieldsRef.current.add('phoneNumber');
                editedFieldsRef.current.add('verifiedPhone');
                editedFieldsRef.current.add('isWhatsappVerified');
                setPhoneNumber(value);
                setVerifiedPhone(null);
                setIsWhatsappVerified(false);
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
