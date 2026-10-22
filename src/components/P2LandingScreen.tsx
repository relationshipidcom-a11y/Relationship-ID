import React, { useState, useEffect } from 'react';
import { Shield, Clock, Heart, Lock, LogIn, X, UserX, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import type { CountryCode } from 'libphonenumber-js';
import { Language, Invitation, ScreenId, AuthUser, InvitationAuthorization } from '../types';
import { translations } from '../i18n/translations';
import { evaluateP2LandingState } from '../utils/relationshipState';
import { getInvitationInstruction } from '../utils/invitationGuidance';
import { PhoneVerificationField } from './PhoneVerificationField';
import { BrandMark } from './BrandMark';
import { normalizePhoneNumber } from '../utils/phone';

interface P2LandingScreenProps {
  language: Language;
  invitation: Invitation;
  authUser?: AuthUser | null;
  invitationAuthorization?: InvitationAuthorization | null;
  invitationNotFound?: boolean;
  authInitialized?: boolean;
  invitationLoading?: boolean;
  hasAppError?: boolean;
  onAccept: () => void;
  onDecline: (block?: boolean) => void;
  onSwitchAccount?: () => void;
  onRetry?: () => void;
  onViewCertificate?: () => void;
  onNavigate?: (screen: ScreenId) => void;
  onPhoneVerified?: (e164: string) => void;
}

export const P2LandingScreen: React.FC<P2LandingScreenProps> = ({
  language,
  invitation,
  authUser,
  invitationAuthorization,
  invitationNotFound = false,
  authInitialized = true,
  invitationLoading = false,
  hasAppError = false,
  onAccept,
  onDecline,
  onSwitchAccount,
  onRetry,
  onViewCertificate,
  onNavigate,
  onPhoneVerified
}) => {
  const t = translations[language];
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>('SA');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verifiedPhoneE164, setVerifiedPhoneE164] = useState<string | null>(null);

  // Clear verification UI state when account or invitation changes
  useEffect(() => {
    setVerifiedPhoneE164(null);
    setPhoneNumber('');
  }, [authUser?.id, invitation?.id]);

  const landingOutcome = evaluateP2LandingState({
    authInitialized,
    currentUserId: authUser?.id || null,
    targetInviteId: invitation.id,
    invitationAuth: invitationAuthorization,
    invitation,
    invitationLoading,
    invitationNotFound,
    hasAppError
  });

  // 1. Server confirmed the invitation does not exist
  if (landingOutcome.state === 'not_found') {
    return (
      <main className="flex-1 flex flex-col items-center justify-center py-6 px-4 w-full">
        <div className="w-full bg-[#30264D] border border-[#51465F] rounded-[20px] p-6 shadow-2xl relative text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">
            {language === 'ar' ? 'رابط الدعوة غير صالح أو غير موجود' : 'Invitation Not Found'}
          </h1>
          <p className="text-base sm:text-sm text-[#B7ACC8] mb-6 leading-relaxed max-w-[280px] mx-auto">
            {language === 'ar'
              ? 'تعذر العثور على هذه الدعوة. يرجى التأكد من الرابط أو طلب دعوة جديدة من الشريك.'
              : 'This invitation could not be found. Please check the link or request a new invitation from your partner.'}
          </p>
          <div className="flex items-center justify-center gap-1.5 text-sm text-[#B7ACC8]/60">
            <Shield className="w-3.5 h-3.5 text-[#E7BCD3]" />
            <span>{t.dataPrivacyAssurance}</span>
          </div>
        </div>
      </main>
    );
  }

  // 2. Fatal load failure when invitation is not loaded (network or server problem)
  if (landingOutcome.state === 'load_failed') {
    return (
      <main className="flex-1 flex flex-col items-center justify-center py-6 px-4 w-full">
        <div role="alert" className="w-full bg-[#30264D] border border-[#51465F] rounded-[20px] p-6 shadow-2xl relative text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">
            {language === 'ar' ? 'تعذر تحميل الدعوة' : 'Could Not Load Invitation'}
          </h1>
          <p className="text-base sm:text-sm text-[#B7ACC8] mb-6 leading-relaxed max-w-[280px] mx-auto">
            {language === 'ar'
              ? 'تحقق من اتصالك بالإنترنت ثم أعد المحاولة.'
              : 'Check your internet connection and try again.'}
          </p>
          <button
            type="button"
            onClick={onRetry || (() => window.location.reload())}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#804E6A] hover:bg-[#8D5775] text-white text-sm font-bold min-h-[44px] cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{language === 'ar' ? 'إعادة المحاولة' : 'Try Again'}</span>
          </button>
        </div>
      </main>
    );
  }

  // 3. Invalid invitation contacts configuration (safe fail-closed state)
  if (landingOutcome.state === 'invalid_contacts') {
    return (
      <main className="flex-1 flex flex-col items-center justify-center py-6 px-4 w-full">
        <div role="alert" className="w-full bg-[#30264D] border border-amber-500/40 rounded-[20px] p-6 shadow-2xl relative text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">
            {language === 'ar' ? 'بيانات الدعوة غير صالحة' : 'Invalid Invitation Contacts'}
          </h1>
          <p className="text-base sm:text-sm text-[#B7ACC8] mb-6 leading-relaxed max-w-[280px] mx-auto">
            {language === 'ar'
              ? 'بيانات التواصل المحددة في هذه الدعوة غير مكتملة أو غير صالحة. يرجى التواصل مع الشريك لإعادة إرسال الدعوة بشكل صحيح.'
              : 'The contact details specified in this invitation are incomplete or invalid. Please ask your partner to resend the invitation.'}
          </p>
          {onSwitchAccount && (
            <button
              type="button"
              onClick={onSwitchAccount}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#3D305A] hover:bg-[#4D3E70] text-[#B7ACC8] hover:text-white text-sm font-semibold min-h-[44px] cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>{t.switchAccountBtn}</span>
            </button>
          )}
        </div>
      </main>
    );
  }

  // 4. Terminal invitation states
  if (landingOutcome.state === 'declined') {
    return (
      <main className="flex-1 flex flex-col items-center justify-center py-6 px-4 w-full">
        <div className="w-full bg-[#30264D] border border-[#51465F] rounded-[20px] p-6 shadow-2xl relative text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300">
            <X className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">
            {language === 'ar' ? 'تم رفض الدعوة' : 'Invitation Declined'}
          </h1>
          <p className="text-base sm:text-sm text-[#B7ACC8] mb-6 leading-relaxed max-w-[280px] mx-auto">
            {language === 'ar'
              ? 'لقد تم رفض هذه الدعوة. لن يتم إنشاء أو مشاركة أي سجل ارتباط أو شهادة رقمية.'
              : 'You have declined this invitation. No relationship record or digital certificate was created.'}
          </p>
          <div className="flex items-center justify-center gap-1.5 text-sm text-[#B7ACC8]/60">
            <Shield className="w-3.5 h-3.5 text-[#E7BCD3]" />
            <span>{t.dataPrivacyAssurance}</span>
          </div>
        </div>
      </main>
    );
  }

  if (landingOutcome.state === 'expired' || landingOutcome.state === 'cancelled') {
    const expired = landingOutcome.state === 'expired';
    return (
      <main className="flex-1 flex flex-col items-center justify-center py-6 px-4 w-full">
        <div className="w-full bg-[#30264D] border border-[#51465F] rounded-[20px] p-6 shadow-2xl relative text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#392D5A] border border-[#51465F] flex items-center justify-center text-[#E7BCD3]">
            <Clock className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">
            {expired
              ? (language === 'ar' ? 'انتهت صلاحية الدعوة' : 'Invitation Expired')
              : (language === 'ar' ? 'تم إلغاء الدعوة' : 'Invitation Cancelled')}
          </h1>
          <p className="text-base sm:text-sm text-[#B7ACC8] leading-relaxed max-w-[280px] mx-auto">
            {language === 'ar'
              ? 'لا يمكن قبول هذه الدعوة. اطلب من الشريك إنشاء دعوة جديدة عند الحاجة.'
              : 'This invitation can no longer be accepted. Ask the partner to create a new invitation if needed.'}
          </p>
        </div>
      </main>
    );
  }

  if (landingOutcome.state === 'accepted') {
    return (
      <main className="flex-1 flex flex-col items-center justify-center py-6 px-4 w-full">
        <div className="w-full bg-[#30264D] border border-[#51465F] rounded-[20px] p-6 shadow-2xl relative text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#E7BCD3]/15 border border-[#51465F] flex items-center justify-center text-[#E7BCD3]">
            <Heart className="w-7 h-7 fill-current" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">
            {language === 'ar' ? 'تم قبول الدعوة وتوثيق السجل' : 'Invitation Already Accepted'}
          </h1>
          <p className="text-base sm:text-sm text-[#B7ACC8] mb-6 leading-relaxed max-w-[280px] mx-auto">
            {language === 'ar'
              ? 'تم ربط وتوثيق هذا السجل بنجاح لكلا الطرفين.'
              : 'This relationship record has already been accepted by both partners.'}
          </p>
          {onViewCertificate && (
            <button
              type="button"
              onClick={onViewCertificate}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-[#804E6A] to-[#8D5775] hover:from-[#895472] hover:to-[#945E7D] text-[#F7F4FA] font-semibold text-sm shadow-lg shadow-black/20 flex items-center justify-center gap-2 cursor-pointer border border-[#51465F]"
            >
              <span>{language === 'ar' ? 'عرض شهادة العلاقة' : 'View Relationship Certificate'}</span>
            </button>
          )}
        </div>
      </main>
    );
  }

  // 5. Loading / in-flight authorization state
  if (
    landingOutcome.state === 'auth_loading' ||
    landingOutcome.state === 'authorization_pending' ||
    landingOutcome.state === 'invitation_loading'
  ) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center py-6 px-4 w-full text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#392D5A]/60 border border-[#9D6B87]/40 flex items-center justify-center shadow-lg mx-auto">
          <RefreshCw className="w-6 h-6 animate-spin text-[#E7BCD3]" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">
            {language === 'ar' ? 'جاري التحقق من تفاصيل الدعوة...' : 'Verifying invitation authorization...'}
          </p>
          <p className="text-xs text-[#B7ACC8]">
            {language === 'ar' ? 'يرجى الانتظار بينما نتحقق من صلاحية الدعوة...' : 'Please wait while we verify invitation access...'}
          </p>
        </div>
      </main>
    );
  }

  const isP1 = landingOutcome.state === 'p1_own_invitation';
  const isMismatch = landingOutcome.state === 'confirmed_mismatch';
  const isSessionNotVerified = landingOutcome.state === 'session_not_verified';
  const isVerificationRequired = landingOutcome.state === 'verification_required';
  const isAuthorizedP2 = landingOutcome.state === 'authorized';
  const isSignedOut = landingOutcome.state === 'signed_out';

  const instructionText = getInvitationInstruction(invitation.contactRequirement, language);

  return (
    <main className="flex-1 flex flex-col items-center justify-center py-4 px-4 w-full">
      {/* Special Invitation Status Badge */}
      <div className="mb-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#392D5A] border border-[#51465F] text-[#E7BCD3] text-sm font-semibold shadow-md">
        <span className="w-2 h-2 rounded-full bg-[#E7BCD3] animate-pulse" />
        <span>{t.p2LandingBadge}</span>
        <Lock className="w-3.5 h-3.5 opacity-80" />
      </div>

      {/* Invitation Primary Card */}
      <div className="w-full bg-[#30264D] border border-[#51465F] rounded-[20px] p-6 shadow-2xl relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#E7BCD3]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Center Emblem: Relationship ID Logo */}
        <div className="flex items-center justify-center mb-5 relative">
          <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent to-white/20" />
          <div className="mx-4 p-3 rounded-2xl bg-[#392D5A] border border-[#51465F] shadow-lg flex items-center justify-center">
            <BrandMark size={48} className="select-none" alt="Relationship ID" />
          </div>
          <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent to-white/20" />
        </div>

        {/* Card Title & Inviter Info */}
        <div className="text-center space-y-1.5 mb-5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-snug">
            {t.p2LandingTitle}
          </h1>
          <p className="text-[#B7ACC8] text-base sm:text-sm font-medium">
            {t.p2InvitedYouText.replace('{inviter}', invitation.inviterName)}
          </p>
        </div>

        {/* Details Box */}
        <div className="bg-[#141023] border border-[#51465F] rounded-xl p-4 space-y-3 mb-5">
          {/* Inviter Info */}
          <div className="flex items-center justify-between text-sm py-1 border-b border-white/10">
            <div className="flex items-center gap-2 text-[#B7ACC8] font-medium">
              <span>{t.invitationFrom}</span>
              <span className="text-white font-semibold">{invitation.inviterName}</span>
            </div>
            <div className="w-7 h-7 rounded-lg bg-[#392D5A] flex items-center justify-center text-[#B7ACC8]">
              <Shield className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Requested Stage */}
          <div className="flex items-center justify-between text-sm py-1 border-b border-white/10">
            <div className="flex items-center gap-2 text-[#B7ACC8] font-medium">
              <span>{t.requestedRelationshipStage}</span>
              <span className="text-white font-semibold">
                {invitation.relationshipType === 'marriage'
                  ? t.marriage
                  : invitation.relationshipType === 'engagement'
                  ? t.engagement
                  : t.dating}
              </span>
            </div>
            <div className="w-7 h-7 rounded-lg bg-[#392D5A] flex items-center justify-center text-[#B7ACC8]">
              <Heart className="w-3.5 h-3.5 fill-current" />
            </div>
          </div>

          {/* Expiration Notice */}
          <div className="flex items-center justify-between text-sm py-1 border-b border-white/10">
            <div className="flex items-center gap-2 text-amber-300 font-medium">
              <span>{t.expirationNoticeText}</span>
            </div>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-300">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Contact Requirement Guidance (never reveals actual contact details) */}
          {instructionText && (
            <div className="space-y-1 pt-1">
              <div className="text-xs font-bold text-[#E7BCD3] uppercase tracking-wider">
                {language === 'ar' ? 'طريقة القبول' : 'How to accept'}
              </div>
              <div className="flex items-start gap-2.5 text-xs sm:text-sm text-[#B7ACC8] leading-relaxed">
                <Shield className="w-4 h-4 shrink-0 mt-0.5 text-[#E7BCD3]" />
                <span>{instructionText}</span>
              </div>
            </div>
          )}
        </div>

        {/* Account Mismatch / Recipient Status Alerts */}
        {isP1 && (
          <div className="mb-5 p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-start space-y-2">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t.p1CannotAcceptOwnInviteTitle}</span>
            </div>
            <p className="text-base sm:text-sm text-amber-200/90 leading-relaxed">
              {t.p1CannotAcceptOwnInviteDesc}
            </p>
          </div>
        )}

        {isMismatch && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-start space-y-2">
            <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t.recipientMismatchTitle}</span>
            </div>
            <p className="text-base sm:text-sm text-rose-200/90 leading-relaxed">
              {t.recipientMismatchDesc.replace('{email}', authUser?.email || authUser?.id || '')}
            </p>
          </div>
        )}

        {isSessionNotVerified && (
          <div className="mb-5 p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-start space-y-2">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t.sessionNotVerifiedTitle}</span>
            </div>
            <p className="text-base sm:text-sm text-amber-200/90 leading-relaxed">
              {t.sessionNotVerifiedDesc}
            </p>
          </div>
        )}

        {/* Limited Pre-Authorization Verification Interface */}
        {isVerificationRequired && (
          <div className="mb-5 p-4 rounded-xl bg-[#392D5A]/80 border border-[#9D6B87]/50 text-start space-y-3">
            <div className="flex items-center gap-2 text-[#E7BCD3] font-bold text-sm">
              <Shield className="w-4 h-4 shrink-0" />
              <span>{language === 'ar' ? 'تأكيد الحساب مطلوب لمراجعة الدعوة' : 'Verification Required to Review Invitation'}</span>
            </div>
            <p className="text-base sm:text-sm text-[#B7ACC8] leading-relaxed">
              {instructionText ||
                (language === 'ar'
                  ? 'لإكمال مراجعة وقبول الدعوة، يرجى تأكيد ملكيتك لرقم الجوال أو البريد الإلكتروني المطلوب.'
                  : 'To review and accept this invitation, please verify ownership of the required contact.')}
            </p>

            {/* If email verification is needed */}
            {(invitation.contactRequirement === 'email' || invitation.contactRequirement === 'both') && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <p className="text-xs text-[#E7BCD3]">
                  {language === 'ar'
                    ? 'هذه الدعوة تتطلب تأكيد البريد الإلكتروني المسجل في حسابك.'
                    : 'This invitation requires verifying the email registered to your account.'}
                </p>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="px-3 py-1.5 rounded-lg bg-[#526F80] text-white text-xs font-medium hover:bg-[#627F90] cursor-pointer"
                  >
                    {language === 'ar' ? 'تحقق مرة أخرى' : 'Check Again'}
                  </button>
                )}
              </div>
            )}

            {/* If mobile verification is needed: provide existing secure Twilio WhatsApp verification */}
            {(invitation.contactRequirement === 'mobile' || invitation.contactRequirement === 'both') && (
              <div className="pt-2 border-t border-white/10">
                <PhoneVerificationField
                  id="p2-preauth-phone"
                  language={language}
                  country={phoneCountry}
                  number={phoneNumber}
                  verifiedE164={verifiedPhoneE164}
                  isWhatsappVerified={true}
                  onCountryChange={(c) => {
                    setPhoneCountry(c);
                    const newCanonical = normalizePhoneNumber(c, phoneNumber);
                    if (!newCanonical || newCanonical !== verifiedPhoneE164) {
                      setVerifiedPhoneE164(null);
                    }
                  }}
                  onNumberChange={(n) => {
                    setPhoneNumber(n);
                    const newCanonical = normalizePhoneNumber(phoneCountry, n);
                    if (!newCanonical || newCanonical !== verifiedPhoneE164) {
                      setVerifiedPhoneE164(null);
                    }
                  }}
                  onVerified={(e164) => {
                    setVerifiedPhoneE164(e164);
                    if (e164) {
                      onPhoneVerified?.(e164);
                    }
                  }}
                  label={language === 'ar' ? 'أدخل رقم جوالك لتأكيد ملكيته عبر واتساب' : 'Enter your mobile number to verify via WhatsApp'}
                />
              </div>
            )}

            {/* Exactly ONE switch account link if the user logged into the wrong account */}
            {onSwitchAccount && (
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={onSwitchAccount}
                  className="text-xs text-[#B7ACC8] hover:text-[#E7BCD3] underline cursor-pointer"
                >
                  {t.switchAccountBtn}
                </button>
              </div>
            )}
          </div>
        )}

        {isAuthorizedP2 && (
          <div className="mb-4 p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-start flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="text-sm truncate">
                <span className="text-[#B7ACC8]">{t.signedInAsP2} </span>
                <span className="text-white font-semibold">{authUser?.name || authUser?.email}</span>
              </div>
            </div>
            {onSwitchAccount && (
              <button
                type="button"
                onClick={onSwitchAccount}
                className="text-sm text-[#E7BCD3] hover:text-white underline shrink-0 cursor-pointer"
              >
                {t.switchAccountBtn}
              </button>
            )}
          </div>
        )}

        {/* Action Buttons: Unified, mutually exclusive, exactly one primary button */}
        <div className="flex flex-col gap-2.5">
          {/* Case A: Authorized P2 or Signed Out viewer */}
          {(isAuthorizedP2 || isSignedOut) && (
            <>
              <button
                type="button"
                onClick={onAccept}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#804E6A] to-[#8D5775] hover:from-[#895472] hover:to-[#945E7D] text-[#F7F4FA] font-semibold text-sm sm:text-base shadow-lg shadow-black/20 flex items-center justify-center gap-2 transition transform active:scale-[0.98] border border-[#51465F] cursor-pointer min-h-[44px]"
              >
                <LogIn className="w-4 h-4" />
                <span>{isAuthorizedP2 ? t.reviewAndAcceptBtn : t.p2AcceptBtn}</span>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onDecline(false)}
                  className="w-full py-2.5 px-3 rounded-xl border border-[#51465F] bg-[#3D305A] hover:bg-[#4D3E70] text-[#B7ACC8] hover:text-white font-medium text-sm flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer min-h-[40px]"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{t.p2DeclineBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowBlockConfirm(true)}
                  className="w-full py-2.5 px-3 rounded-xl border border-rose-500/40 bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 hover:text-rose-200 font-medium text-sm flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer min-h-[40px]"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>{t.declineAndBlock}</span>
                </button>
              </div>
            </>
          )}

          {/* Case B: P1 or Confirmed Mismatch -> exactly ONE primary switch account button */}
          {(isP1 || isMismatch) && onSwitchAccount && (
            <button
              type="button"
              onClick={onSwitchAccount}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-[#804E6A] to-[#8D5775] hover:from-[#895472] hover:to-[#945E7D] text-[#F7F4FA] font-semibold text-sm sm:text-base shadow-lg shadow-black/20 flex items-center justify-center gap-2 transition transform active:scale-[0.98] border border-[#51465F] cursor-pointer min-h-[44px]"
            >
              <LogIn className="w-4 h-4" />
              <span>{t.switchAccountBtn}</span>
            </button>
          )}

          {/* Case C: Session Not Verified -> Retry primary, Switch Account secondary */}
          {isSessionNotVerified && (
            <div className="flex flex-col gap-2">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-[#804E6A] to-[#8D5775] hover:from-[#895472] hover:to-[#945E7D] text-[#F7F4FA] font-semibold text-sm sm:text-base shadow-lg shadow-black/20 flex items-center justify-center gap-2 transition transform active:scale-[0.98] border border-[#51465F] cursor-pointer min-h-[44px]"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{t.sessionRetryBtn}</span>
                </button>
              )}
              {onSwitchAccount && (
                <button
                  type="button"
                  onClick={onSwitchAccount}
                  className="w-full py-2.5 px-3 rounded-xl border border-[#51465F] bg-[#3D305A] hover:bg-[#4D3E70] text-[#B7ACC8] hover:text-white font-medium text-sm flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer min-h-[40px]"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{t.switchAccountBtn}</span>
                </button>
              )}
            </div>
          )}

          {/* Case D: Verification Required -> If just verified, continue button; else single switch-account */}
          {isVerificationRequired && verifiedPhoneE164 && (
            <button
              type="button"
              onClick={onAccept}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-[#804E6A] to-[#8D5775] hover:from-[#895472] hover:to-[#945E7D] text-[#F7F4FA] font-semibold text-sm sm:text-base shadow-lg shadow-black/20 flex items-center justify-center gap-2 transition transform active:scale-[0.98] border border-[#51465F] cursor-pointer min-h-[44px]"
            >
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{language === 'ar' ? 'متابعة مراجعة الدعوة' : 'Continue to Review Invitation'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Decline and Block Confirmation Dialog */}
      {showBlockConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowBlockConfirm(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#30264D] border border-rose-500/40 p-5 shadow-2xl relative text-start space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white tracking-wide">
                {t.declineAndBlock}
              </h3>
            </div>
            <p className="text-sm text-[#B7ACC8] leading-relaxed">
              {t.declineAndBlockConfirm}
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowBlockConfirm(false);
                  onDecline(true);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition active:scale-[0.98] cursor-pointer min-h-[44px]"
              >
                {t.declineAndBlock}
              </button>
              <button
                type="button"
                onClick={() => setShowBlockConfirm(false)}
                className="w-full py-2.5 px-4 rounded-xl border border-[#51465F] bg-[#3D305A] hover:bg-[#4D3E70] text-[#B7ACC8] hover:text-white font-medium text-sm transition active:scale-[0.98] cursor-pointer min-h-[40px]"
              >
                {t.cancelBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
