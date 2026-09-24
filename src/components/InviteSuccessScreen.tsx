import React, { useState } from 'react';
import { Check, Copy, Share2, Mail, MessageCircle, ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Language, Invitation } from '../types';
import { translations } from '../i18n/translations';

interface InviteSuccessScreenProps {
  language: Language;
  invitation: Invitation;
  onGoToWaiting: () => void;
  onCancelInvite: () => void;
  onOpenInvitation: () => void;
}

export const InviteSuccessScreen: React.FC<InviteSuccessScreenProps> = ({
  language,
  invitation,
  onGoToWaiting,
  onCancelInvite,
  onOpenInvitation
}) => {
  const t = translations[language];
  const [copied, setCopied] = useState(false);

  const inviteUrl = `${window.location.origin}/invite/${invitation.id}`;

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Unable to copy invitation link', error);
      window.prompt(language === 'ar' ? 'انسخ رابط الدعوة:' : 'Copy invitation link:', inviteUrl);
    }
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(
      language === 'ar'
        ? `مرحباً ${invitation.partner2Name}، أدعوك لتوثيق سجل ارتباطنا الرقمي عبر Relationship ID: ${inviteUrl}`
        : `Hi ${invitation.partner2Name}, please join me in confirming our relationship record on Relationship ID: ${inviteUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(
      language === 'ar'
        ? 'دعوة لتوثيق شهادة الارتباط الرقمية'
        : 'Invitation to verify our Relationship Certificate'
    );
    const body = encodeURIComponent(
      language === 'ar'
        ? `مرحباً ${invitation.partner2Name}،\n\nأدعوك لتأكيد سجل علاقتنا الرقمية:\n${inviteUrl}\n\nRelationship ID`
        : `Hello ${invitation.partner2Name},\n\nPlease join me to confirm our relationship record:\n${inviteUrl}\n\nRelationship ID`
    );
    window.location.href = `mailto:${invitation.partner2Email || ''}?subject=${subject}&body=${body}`;
  };

  return (
    <section className="flex flex-col items-center flex-1 justify-center py-4 px-4 relative z-10">
      {/* Celebration Badge with Stars */}
      <div className="relative flex items-center justify-center w-36 h-36 mb-4">
        {/* Decorative Particles */}
        <span className="absolute w-1.5 h-1.5 bg-[#f3c4db] top-2 right-8 rounded-full opacity-80 animate-pulse" />
        <span className="absolute w-1 h-1 bg-[#e8bad0] top-8 right-2 rounded-full opacity-60" />
        <span className="absolute w-2 h-2 bg-[#9b6682] bottom-6 right-5 rounded-full opacity-70" />
        <span className="absolute w-1.5 h-1.5 bg-[#f3b5d4] bottom-3 left-9 rounded-full opacity-85" />
        <span className="absolute w-2 h-2 bg-[#9b6682] top-10 left-3 rounded-full opacity-90 animate-pulse" />

        {/* Ambient glow */}
        <div className="absolute inset-0 rounded-full blur-xl bg-[#9b6682]/25" />
        <div className="absolute w-28 h-28 rounded-full border border-[#f3c4db]/40 animate-ping opacity-20" />

        {/* Central Medal */}
        <div className="relative w-24 h-24 rounded-full p-[3px] shadow-2xl flex items-center justify-center bg-gradient-to-tr from-[#f3c4db] via-[#9b6682] to-[#5e3c4f]">
          <div className="w-full h-full rounded-full flex items-center justify-center shadow-inner bg-gradient-to-b from-[#9b6682] to-[#5e3c4f] border border-white/30">
            <Check className="w-12 h-12 text-white stroke-[3.5]" />
          </div>
        </div>
      </div>

      {/* Headline & Subtitle */}
      <div className="text-center px-4 mb-4">
        <h2 className="text-xl font-bold text-white mb-1.5 tracking-tight">
          {t.inviteSuccessTitle}
        </h2>
        <p className="text-xs text-[#b6afd4] leading-relaxed max-w-[280px] mx-auto font-normal">
          {t.inviteSuccessDesc}
        </p>
      </div>

      {/* Link Box Card */}
      <div className="w-full bg-[#211c38] border border-white/20 rounded-2xl p-3.5 mb-3 shadow-xl">
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <span className="text-xs font-semibold text-[#f3c4db]">{t.invitationLinkLabel}</span>
          <span className="text-[10px] text-[#b6afd4] font-mono">
            {invitation.partner2Name}
          </span>
        </div>

        <div className="flex items-center justify-between bg-[#141124] border border-[#83769c]/50 rounded-xl px-2.5 py-1.5">
          <div className="overflow-hidden mr-1 flex-1">
            <p className="text-[11px] font-mono text-[#b6afd4] truncate text-left" dir="ltr">
              {inviteUrl}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 flex items-center gap-1 px-3 py-1 bg-[#9b6682] hover:bg-[#a9718f] border border-white/20 rounded-lg text-xs font-medium text-white transition-all active:scale-95 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="text-[11px]">{copied ? t.copiedBtn : t.copyBtn}</span>
          </button>
        </div>
      </div>

      {/* Quick Action Share Buttons */}
      <div className="w-full grid grid-cols-3 gap-2 mb-4">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-xl py-2.5 px-1.5 flex flex-col items-center justify-center gap-1.5 transition-all bg-[#211c38] border border-white/20 hover:bg-[#2e264f] active:scale-95 shadow-md cursor-pointer"
        >
          <Copy className="w-5 h-5 text-[#f3c4db]" />
          <span className="text-[10px] font-medium text-white/95 text-center leading-tight">
            {copied ? t.copiedBtn : t.copyLinkMainBtn}
          </span>
        </button>

        <button
          type="button"
          onClick={handleWhatsApp}
          className="rounded-xl py-2.5 px-1.5 flex flex-col items-center justify-center gap-1.5 transition-all bg-[#211c38] border border-white/20 hover:bg-[#2e264f] active:scale-95 shadow-md cursor-pointer"
        >
          <MessageCircle className="w-5 h-5 text-emerald-400" />
          <span className="text-[10px] font-medium text-white/95 text-center leading-tight">
            {t.shareWhatsAppBtn}
          </span>
        </button>

        <button
          type="button"
          onClick={handleEmail}
          className="rounded-xl py-2.5 px-1.5 flex flex-col items-center justify-center gap-1.5 transition-all bg-[#211c38] border border-white/20 hover:bg-[#2e264f] active:scale-95 shadow-md cursor-pointer"
        >
          <Mail className="w-5 h-5 text-[#f3c4db]" />
          <span className="text-[10px] font-medium text-white/95 text-center leading-tight">
            {t.shareEmailBtn}
          </span>
        </button>
      </div>

      {/* Manual test helper: open invitation in a new tab */}
      <div className="w-full mb-3 p-2 rounded-xl bg-[#2e264f]/70 border border-[#f3c4db]/30 flex items-center justify-between text-xs">
        <div className="text-right">
          <span className="text-[10.5px] text-[#f3c4db] font-bold block">
            {language === 'ar' ? 'اختبار رابط الدعوة:' : 'Test real invitation:'}
          </span>
          <span className="text-[9.5px] text-[#b6afd4]">
            {language === 'ar' ? 'افتح رابط الدعوة في تبويب جديد' : 'Open this invitation in a new tab'}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenInvitation}
          className="px-2.5 py-1 rounded-lg bg-[#9b6682] text-white text-[10px] font-semibold hover:bg-[#a9718f] transition-all cursor-pointer"
        >
          {language === 'ar' ? 'فتح الدعوة' : 'Open Invitation'}
        </button>
      </div>

      {/* Secondary Actions */}
      <div className="w-full space-y-2">
        <button
          type="button"
          onClick={onGoToWaiting}
          className="w-full py-3 px-4 bg-[#9b6682] hover:bg-[#a9718f] text-white font-semibold rounded-xl shadow-lg border border-white/20 transition-all flex items-center justify-center gap-2 text-xs active:scale-95 cursor-pointer"
        >
          <span>{t.returnToDashboardBtn}</span>
          {language === 'ar' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onCancelInvite}
          className="w-full py-2.5 px-4 rounded-xl bg-[#211c38] hover:bg-[#2e264f] border border-[#9b6682]/40 text-[#e8bad0] hover:text-white flex items-center justify-center gap-1.5 text-xs font-medium transition-all active:scale-95 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          <span>{t.cancelInviteBtn}</span>
        </button>
      </div>
    </section>
  );
};
