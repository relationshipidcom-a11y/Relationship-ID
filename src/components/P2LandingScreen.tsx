import React from 'react';
import { Shield, Clock, Heart, Calendar, Lock, LogIn, X } from 'lucide-react';
import { Language, Invitation } from '../types';
import { translations } from '../i18n/translations';

interface P2LandingScreenProps {
  language: Language;
  invitation: Invitation;
  onAccept: () => void;
  onDecline: () => void;
  onViewCertificate?: () => void;
}

export const P2LandingScreen: React.FC<P2LandingScreenProps> = ({
  language,
  invitation,
  onAccept,
  onDecline,
  onViewCertificate
}) => {
  const t = translations[language];

  // If already declined
  if (invitation.status === 'declined') {
    return (
      <main className="flex-1 flex flex-col items-center justify-center py-6 px-4 w-full">
        <div className="w-full bg-[#1a1530] border border-white/20 rounded-[20px] p-6 shadow-2xl relative text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300">
            <X className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">
            {language === 'ar' ? 'تم رفض الدعوة' : 'Invitation Declined'}
          </h1>
          <p className="text-xs text-[#b6afd4] mb-6 leading-relaxed max-w-[280px] mx-auto">
            {language === 'ar'
              ? 'لقد تم رفض هذه الدعوة. لن يتم إنشاء أو مشاركة أي سجل ارتباط أو شهادة رقمية.'
              : 'You have declined this invitation. No relationship record or digital certificate was created.'}
          </p>
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#8e84af]">
            <Shield className="w-3.5 h-3.5 text-[#f3c4db]" />
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
        <div className="w-full bg-[#1a1530] border border-white/20 rounded-[20px] p-6 shadow-2xl relative text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#2e264f] border border-white/20 flex items-center justify-center text-[#f3c4db]">
            <Clock className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">
            {expired
              ? (language === 'ar' ? 'انتهت صلاحية الدعوة' : 'Invitation Expired')
              : (language === 'ar' ? 'تم إلغاء الدعوة' : 'Invitation Cancelled')}
          </h1>
          <p className="text-xs text-[#b6afd4] leading-relaxed max-w-[280px] mx-auto">
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
        <div className="w-full bg-[#1a1530] border border-white/20 rounded-[20px] p-6 shadow-2xl relative text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#9b6682]/25 border border-[#83769c] flex items-center justify-center text-[#f3c4db]">
            <Heart className="w-7 h-7 fill-current" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">
            {language === 'ar' ? 'تم قبول الدعوة وتوثيق السجل' : 'Invitation Already Accepted'}
          </h1>
          <p className="text-xs text-[#b6afd4] mb-6 leading-relaxed max-w-[280px] mx-auto">
            {language === 'ar'
              ? 'تم ربط وتوثيق هذا السجل بنجاح لكلا الطرفين.'
              : 'This relationship record has already been accepted by both partners.'}
          </p>
          {onViewCertificate && (
            <button
              type="button"
              onClick={onViewCertificate}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-[#9b6682] to-[#814f6a] text-white font-semibold text-sm shadow-lg shadow-[#9b6682]/40 flex items-center justify-center gap-2 cursor-pointer border border-white/20"
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
      <div className="mb-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#2a2447]/90 border border-[#83769c] text-[#f3c4db] text-xs font-semibold shadow-md">
        <span className="w-2 h-2 rounded-full bg-[#f3c4db] animate-pulse" />
        <span>{t.p2LandingBadge}</span>
        <Lock className="w-3.5 h-3.5 opacity-80" />
      </div>

      {/* Invitation Primary Card */}
      <div className="w-full bg-[#1a1530] border border-white/20 rounded-[20px] p-6 shadow-2xl relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#9b6682]/20 rounded-full blur-3xl pointer-events-none" />

        {/* Center Emblem: Fingerprint Heart */}
        <div className="flex items-center justify-center mb-5 relative">
          <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent to-white/20" />
          <div className="mx-4 p-3 rounded-2xl bg-[#312952]/60 border border-[#f3c4db]/35 shadow-lg flex items-center justify-center">
            {/* Elegant Fingerprint Heart Vector */}
            <svg
              className="w-12 h-12 text-[#f3c4db]"
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
          <h1 className="text-xl font-bold tracking-tight text-white leading-snug">
            {t.p2LandingTitle}
          </h1>
          <p className="text-[#b6afd4] text-xs font-medium">
            {t.p2InvitedYouText.replace('{inviter}', invitation.inviterName)}
          </p>
        </div>

        {/* Details Box */}
        <div className="bg-[#141124]/75 border border-white/15 rounded-xl p-4 space-y-3 mb-5">
          {/* Stage */}
          <div className="flex items-center justify-between text-xs py-1 border-b border-white/10">
            <div className="flex items-center gap-2 text-[#b6afd4] font-medium">
              <span>{t.relationshipStage}</span>
              <span className="text-white font-semibold">
                {invitation.relationshipType === 'marriage'
                  ? t.marriage
                  : invitation.relationshipType === 'engagement'
                  ? t.engagement
                  : t.dating}
              </span>
            </div>
            <div className="w-7 h-7 rounded-lg bg-[#2e264f] flex items-center justify-center text-[#b6afd4]">
              <Heart className="w-3.5 h-3.5 fill-current" />
            </div>
          </div>

          {/* Start Date */}
          <div className="flex items-center justify-between text-xs py-1 border-b border-white/10">
            <div className="flex items-center gap-2 text-[#b6afd4] font-medium">
              <span>{t.startDateLabel}</span>
              <span className="text-white font-semibold">
                {language === 'ar' ? invitation.startDateAr : invitation.startDate}
              </span>
            </div>
            <div className="w-7 h-7 rounded-lg bg-[#2e264f] flex items-center justify-center text-[#b6afd4]">
              <Calendar className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Expiration Notice */}
          <div className="flex items-center justify-between text-xs pt-0.5">
            <div className="flex items-center gap-2 text-amber-300 font-medium">
              <span>{t.expirationNoticeText}</span>
            </div>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-300">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onAccept}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-[#9b6682] to-[#814f6a] hover:from-[#a9718f] hover:to-[#9b6682] text-white font-semibold text-sm shadow-lg shadow-[#9b6682]/40 flex items-center justify-center gap-2 transition transform active:scale-[0.98] border border-white/20 cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>{t.p2AcceptBtn}</span>
          </button>

          <button
            type="button"
            onClick={onDecline}
            className="w-full py-2.5 px-4 rounded-xl border border-[#9b6682]/45 bg-[#5e3c4f]/20 hover:bg-[#5e3c4f]/35 text-[#e8bad0] hover:text-white font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>{t.p2DeclineBtn}</span>
          </button>
        </div>
      </div>

      {/* Assurance footer */}
      <div className="mt-4 flex items-center gap-1.5 text-[11px] text-[#b6afd4]">
        <Shield className="w-3.5 h-3.5 text-[#f3c4db]" />
        <span>{t.dataPrivacyAssurance}</span>
      </div>
    </main>
  );
};
