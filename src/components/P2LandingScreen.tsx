import React, { useState } from 'react';
import { Shield, Clock, Heart, Lock, LogIn, X, UserX, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { Language, Invitation, ScreenId, AuthUser, InvitationAuthorization } from '../types';
import { translations } from '../i18n/translations';

interface P2LandingScreenProps {
  language: Language;
  invitation: Invitation;
  authUser?: AuthUser | null;
  invitationAuthorization?: InvitationAuthorization | null;
  onAccept: () => void;
  onDecline: (block?: boolean) => void;
  onSwitchAccount?: () => void;
  onViewCertificate?: () => void;
  onNavigate?: (screen: ScreenId) => void;
}

export const P2LandingScreen: React.FC<P2LandingScreenProps> = ({
  language,
  invitation,
  authUser,
  invitationAuthorization,
  onAccept,
  onDecline,
  onSwitchAccount,
  onViewCertificate,
  onNavigate
}) => {
  const t = translations[language];
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  const isP1 = Boolean(
    invitationAuthorization?.isP1 ||
    (authUser && invitation.p1Uid && authUser.id === invitation.p1Uid)
  );
  const isMismatch = Boolean(
    !isP1 &&
    authUser &&
    invitationAuthorization &&
    !invitationAuthorization.authorized
  );
  const isAuthorizedP2 = Boolean(
    !isP1 &&
    authUser &&
    (!invitationAuthorization || invitationAuthorization.authorized)
  );

  // If already declined
  if (invitation.status === 'declined') {
    return (
      <main className="flex-1 flex flex-col items-center justify-center py-6 px-4 w-full">
        <div className="w-full bg-[#202B52] border border-white/20 rounded-[20px] p-6 shadow-2xl relative text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300">
            <X className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">
            {language === 'ar' ? 'تم رفض الدعوة' : 'Invitation Declined'}
          </h1>
          <p className="text-base sm:text-sm text-[#C9CCE4] mb-6 leading-relaxed max-w-[280px] mx-auto">
            {language === 'ar'
              ? 'لقد تم رفض هذه الدعوة. لن يتم إنشاء أو مشاركة أي سجل ارتباط أو شهادة رقمية.'
              : 'You have declined this invitation. No relationship record or digital certificate was created.'}
          </p>
          <div className="flex items-center justify-center gap-1.5 text-sm text-[#C9CCE4]/60">
            <Shield className="w-3.5 h-3.5 text-[#C1C3E6]" />
            <span>{t.dataPrivacyAssurance}</span>
          </div>
        </div>
      </main>
    );
  }

  if (invitation.status === 'expired' || invitation.status === 'cancelled') {
    const expired = invitation.status === 'expired';
    return (
      <main className="flex-1 flex flex-col items-center justify-center py-6 px-4 w-full">
        <div className="w-full bg-[#202B52] border border-white/20 rounded-[20px] p-6 shadow-2xl relative text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#2C345F] border border-white/20 flex items-center justify-center text-[#C1C3E6]">
            <Clock className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">
            {expired
              ? (language === 'ar' ? 'انتهت صلاحية الدعوة' : 'Invitation Expired')
              : (language === 'ar' ? 'تم إلغاء الدعوة' : 'Invitation Cancelled')}
          </h1>
          <p className="text-base sm:text-sm text-[#C9CCE4] leading-relaxed max-w-[280px] mx-auto">
            {language === 'ar'
              ? 'لا يمكن قبول هذه الدعوة. اطلب من الشريك إنشاء دعوة جديدة عند الحاجة.'
              : 'This invitation can no longer be accepted. Ask the partner to create a new invitation if needed.'}
          </p>
        </div>
      </main>
    );
  }

  // If already accepted
  if (invitation.status === 'accepted') {
    return (
      <main className="flex-1 flex flex-col items-center justify-center py-6 px-4 w-full">
        <div className="w-full bg-[#202B52] border border-white/20 rounded-[20px] p-6 shadow-2xl relative text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#C1C3E6]/25 border border-[#C1C3E6]/40 flex items-center justify-center text-[#C1C3E6]">
            <Heart className="w-7 h-7 fill-current" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">
            {language === 'ar' ? 'تم قبول الدعوة وتوثيق السجل' : 'Invitation Already Accepted'}
          </h1>
          <p className="text-base sm:text-sm text-[#C9CCE4] mb-6 leading-relaxed max-w-[280px] mx-auto">
            {language === 'ar'
              ? 'تم ربط وتوثيق هذا السجل بنجاح لكلا الطرفين.'
              : 'This relationship record has already been accepted by both partners.'}
          </p>
          {onViewCertificate && (
            <button
              type="button"
              onClick={onViewCertificate}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] hover:from-[#d0d2f0] hover:to-[#b7bddf] text-[#242C55] font-semibold text-sm shadow-lg shadow-black/20 flex items-center justify-center gap-2 cursor-pointer border border-white/20"
            >
              <span>{language === 'ar' ? 'عرض شهادة العلاقة' : 'View Relationship Certificate'}</span>
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center py-4 px-4 w-full">
      {/* Special Invitation Status Badge */}
      <div className="mb-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#2C345F]/90 border border-[#C1C3E6]/30 text-[#C1C3E6] text-sm font-semibold shadow-md">
        <span className="w-2 h-2 rounded-full bg-[#C1C3E6] animate-pulse" />
        <span>{t.p2LandingBadge}</span>
        <Lock className="w-3.5 h-3.5 opacity-80" />
      </div>

      {/* Invitation Primary Card */}
      <div className="w-full bg-[#202B52] border border-white/20 rounded-[20px] p-6 shadow-2xl relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#C1C3E6]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Center Emblem: Fingerprint Heart */}
        <div className="flex items-center justify-center mb-5 relative">
          <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent to-white/20" />
          <div className="mx-4 p-3 rounded-2xl bg-[#2C345F]/60 border border-[#C1C3E6]/35 shadow-lg flex items-center justify-center">
            <svg
              className="w-12 h-12 text-[#C1C3E6]"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              viewBox="0 0 48 48"
            >
              <path d="M24 41s-16-10.4-16-22.4A9.6 9.6 0 0117.6 9c2.72 0 5.28 1.12 6.4 2.88A9.6 9.6 0 0130.4 9 9.6 9.6 0 0140 18.6C40 30.6 24 41 24 41z" />
              <path d="M24 16.5c-3 0-5.5 2.5-5.5 5.5v3" />
              <path d="M24 21a2 2 0 012 2v6c0 1.5-1 3-2.5 3.5" />
              <path d="M20 28.5v-3c0-2.2 1.8-4 4-4s4 1.8 4 4v4" />
              <path d="M16 23c0-4.4 3.6-8 8-8s8 3.6 8 8v6c0 3-2 5.5-4.5 6" />
              <path d="M24 37c-4 0-7-3-7-6.5" />
            </svg>
          </div>
          <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent to-white/20" />
        </div>

        {/* Card Title & Inviter Info */}
        <div className="text-center space-y-1.5 mb-5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-snug">
            {t.p2LandingTitle}
          </h1>
          <p className="text-[#C9CCE4] text-base sm:text-sm font-medium">
            {t.p2InvitedYouText.replace('{inviter}', invitation.inviterName)}
          </p>
        </div>

        {/* Details Box */}
        <div className="bg-[#172244]/80 border border-white/15 rounded-xl p-4 space-y-3 mb-5">
          {/* Inviter Info */}
          <div className="flex items-center justify-between text-sm py-1 border-b border-white/10">
            <div className="flex items-center gap-2 text-[#C9CCE4] font-medium">
              <span>{t.invitationFrom}</span>
              <span className="text-white font-semibold">{invitation.inviterName}</span>
            </div>
            <div className="w-7 h-7 rounded-lg bg-[#2C345F] flex items-center justify-center text-[#C9CCE4]">
              <Shield className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Requested Stage */}
          <div className="flex items-center justify-between text-sm py-1 border-b border-white/10">
            <div className="flex items-center gap-2 text-[#C9CCE4] font-medium">
              <span>{t.requestedRelationshipStage}</span>
              <span className="text-white font-semibold">
                {invitation.relationshipType === 'marriage'
                  ? t.marriage
                  : invitation.relationshipType === 'engagement'
                  ? t.engagement
                  : t.dating}
              </span>
            </div>
            <div className="w-7 h-7 rounded-lg bg-[#2C345F] flex items-center justify-center text-[#C9CCE4]">
              <Heart className="w-3.5 h-3.5 fill-current" />
            </div>
          </div>

          {/* Expiration Notice */}
          <div className="flex items-center justify-between text-sm pt-0.5">
            <div className="flex items-center gap-2 text-amber-300 font-medium">
              <span>{t.expirationNoticeText}</span>
            </div>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-300">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Account Mismatch / Recipient Status Alert */}
        {isP1 && (
          <div className="mb-5 p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-start space-y-2">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t.p1CannotAcceptOwnInviteTitle}</span>
            </div>
            <p className="text-base sm:text-sm text-amber-200/90 leading-relaxed">
              {t.p1CannotAcceptOwnInviteDesc}
            </p>
            {onSwitchAccount && (
              <button
                type="button"
                onClick={onSwitchAccount}
                className="w-full mt-1.5 py-2.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 hover:text-white font-semibold text-sm flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[40px]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t.switchAccountBtn}</span>
              </button>
            )}
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
            {onSwitchAccount && (
              <button
                type="button"
                onClick={onSwitchAccount}
                className="w-full mt-1.5 py-2.5 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-200 hover:text-white font-semibold text-sm flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[40px]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t.switchAccountBtn}</span>
              </button>
            )}
          </div>
        )}

        {isAuthorizedP2 && (
          <div className="mb-4 p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-start flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="text-sm truncate">
                <span className="text-[#C9CCE4]">{t.signedInAsP2} </span>
                <span className="text-white font-semibold">{authUser?.name || authUser?.email}</span>
              </div>
            </div>
            {onSwitchAccount && (
              <button
                type="button"
                onClick={onSwitchAccount}
                className="text-sm text-[#C1C3E6] hover:text-white underline shrink-0 cursor-pointer"
              >
                {t.switchAccountBtn}
              </button>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          {!isP1 && !isMismatch ? (
            <>
              <button
                type="button"
                onClick={onAccept}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] hover:from-[#d0d2f0] hover:to-[#b7bddf] text-[#242C55] font-semibold text-sm sm:text-base shadow-lg shadow-black/20 flex items-center justify-center gap-2 transition transform active:scale-[0.98] border border-white/20 cursor-pointer min-h-[44px]"
              >
                <LogIn className="w-4 h-4" />
                <span>{authUser ? t.reviewAndAcceptBtn : t.p2AcceptBtn}</span>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onDecline(false)}
                  className="w-full py-2.5 px-3 rounded-xl border border-[#C1C3E6]/30 bg-[#C1C3E6]/10 hover:bg-[#C1C3E6]/20 text-[#C1C3E6] hover:text-white font-medium text-sm flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer min-h-[40px]"
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
          ) : (
            /* When user is P1 or Mismatch, provide safe switch-account primary button */
            onSwitchAccount && (
              <button
                type="button"
                onClick={onSwitchAccount}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] hover:from-[#d0d2f0] hover:to-[#b7bddf] text-[#242C55] font-semibold text-sm sm:text-base shadow-lg shadow-black/20 flex items-center justify-center gap-2 transition transform active:scale-[0.98] border border-white/20 cursor-pointer min-h-[44px]"
              >
                <LogIn className="w-4 h-4" />
                <span>{t.switchAccountBtn}</span>
              </button>
            )
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
          <div className="w-full max-w-sm rounded-2xl bg-[#202B52] border border-rose-500/40 p-5 shadow-2xl relative text-start space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white tracking-wide">
                {t.declineAndBlock}
              </h3>
            </div>

            <p className="text-base sm:text-sm text-gray-300 leading-relaxed">
              {t.declineAndBlockConfirm}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowBlockConfirm(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-200 text-sm font-semibold transition-colors min-h-[40px]"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBlockConfirm(false);
                  onDecline(true);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-lg shadow-rose-900/40 transition-colors flex items-center gap-1.5 min-h-[40px]"
              >
                <UserX className="w-3.5 h-3.5" />
                <span>{t.declineAndBlock}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assurance footer */}
      <div className="mt-4 flex flex-col items-center gap-2 text-sm text-[#C9CCE4]">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-[#C1C3E6]" />
          <span>{t.dataPrivacyAssurance}</span>
        </div>
        <div className="flex items-center justify-center gap-3 text-sm text-[#C9CCE4]/70">
          <a
            href="/privacy"
            onClick={(e) => {
              e.preventDefault();
              onNavigate?.('privacy');
            }}
            className="text-[#C9CCE4]/70 hover:text-[#C1C3E6] transition-colors underline"
          >
            {t.privacyPolicy}
          </a>
          <span>•</span>
          <a
            href="/terms"
            onClick={(e) => {
              e.preventDefault();
              onNavigate?.('terms');
            }}
            className="text-[#C9CCE4]/70 hover:text-[#C1C3E6] transition-colors underline"
          >
            {t.termsOfService}
          </a>
        </div>
      </div>
    </main>
  );
};
