import React, { useState, useEffect } from 'react';
import { Hourglass, Copy, Check, MessageCircle, X, ExternalLink } from 'lucide-react';
import { Language, Invitation, RelationshipRecord } from '../types';
import { translations } from '../i18n/translations';
import styles from '../styles/WaitingScreen.module.css';

interface WaitingScreenProps {
  language: Language;
  invitation: Invitation;
  record: RelationshipRecord;
  onCancelInvite: () => void;
  onOpenInvitation: () => void;
}

export const WaitingScreen: React.FC<WaitingScreenProps> = ({
  language,
  invitation,
  record,
  onCancelInvite,
  onOpenInvitation
}) => {
  const t = translations[language];
  const [copied, setCopied] = useState(false);
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, new Date(invitation.expiresAt).getTime() - Date.now()));

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const inviteUrl = `${window.location.origin}/invite/${invitation.id}`;

  useEffect(() => {
    const update = () => setRemainingMs(Math.max(0, new Date(invitation.expiresAt).getTime() - Date.now()));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [invitation.expiresAt]);

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
        ? `رابط دعوة سجل علاقتنا: ${inviteUrl}`
        : `Our Relationship ID invitation link: ${inviteUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div className="px-4 pt-3 pb-4 flex-1 flex flex-col items-center">
      {/* Step Indicator Pill */}
      <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] text-[#242C55] text-[11px] font-bold tracking-wider mb-4 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-[#242C55] animate-ping" />
        <span>{t.stepP2Waiting}</span>
      </div>

      {/* Hourglass Visual Status Icon */}
      <div className="relative my-1 flex items-center justify-center">
        <div className="absolute inset-0 bg-[#C1C3E6]/20 rounded-full blur-xl scale-125" />
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-b from-[#2C345F] to-[#182849] border border-white/25 flex items-center justify-center shadow-lg">
          <Hourglass className="w-8 h-8 text-[#C1C3E6] animate-pulse" />
        </div>
      </div>

      {/* Main Headline & Subtitle */}
      <div className="text-center mt-3 mb-4 px-2">
        <h2 className="text-xl font-bold text-white mb-1.5">{t.waitingTitle}</h2>
        <p className="text-xs text-[#C9CCE4] leading-relaxed font-normal">
          {t.waitingDesc}
        </p>
      </div>

      {/* Countdown Section */}
      <section className="w-full mb-4">
        <p className="text-xs text-center text-[#C9CCE4] font-medium mb-2.5">
          {t.timeRemainingLabel}
        </p>
        <div className={styles.timerGrid} dir="rtl">
          <div className={styles.timerBlock}>
            <span className="text-lg font-bold text-[#F6F5FF] tracking-tight">{days}</span>
            <span className="text-[11px] text-[#9FA5C7] font-medium mt-0.5">{t.days}</span>
          </div>
          <div className={styles.timerBlock}>
            <span className="text-lg font-bold text-[#F6F5FF] tracking-tight">{hours}</span>
            <span className="text-[11px] text-[#9FA5C7] font-medium mt-0.5">{t.hours}</span>
          </div>
          <div className={styles.timerBlock}>
            <span className="text-lg font-bold text-[#F6F5FF] tracking-tight">{minutes}</span>
            <span className="text-[11px] text-[#9FA5C7] font-medium mt-0.5">{t.minutes}</span>
          </div>
          <div className={styles.timerBlockActive}>
            <span className="text-lg font-bold text-[#C1C3E6] tracking-tight">
              {seconds < 10 ? `0${seconds}` : seconds}
            </span>
            <span className="text-[11px] text-[#C1C3E6] font-medium mt-0.5">{t.seconds}</span>
          </div>
        </div>
      </section>

      {/* Details Card */}
      <section className="w-full bg-[#202B52] border border-white/15 rounded-2xl p-4 text-xs space-y-2.5 shadow-lg">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <span className="text-[#C9CCE4] font-medium">{t.statusLabel}</span>
          <span className="inline-flex items-center gap-1.5 text-[#C1C3E6] font-semibold text-[11px] bg-[#C1C3E6]/20 px-2.5 py-0.5 rounded-full border border-[#C1C3E6]/40">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C1C3E6] animate-ping" />
            {t.statusWaitingApproval}
          </span>
        </div>

        <div className={styles.infoRow}>
          <span className="text-[#C9CCE4]">{t.partner1Inviter}</span>
          <span className="font-bold text-white tracking-wide">{invitation.inviterName}</span>
        </div>

        <div className={styles.infoRow}>
          <span className="text-[#C9CCE4]">{t.relationshipStage}</span>
          <span className="font-medium text-[#F6F5FF]">
            {record.type === 'marriage'
              ? t.marriage
              : record.type === 'engagement'
              ? t.engagement
              : t.dating}
          </span>
        </div>

        <div className={styles.infoRow}>
          <span className="text-[#C9CCE4]">{t.startDateLabel}</span>
          <span className="text-white/90">
            {language === 'ar' ? record.startDateAr : record.startDate}
          </span>
        </div>

        <div className={styles.infoRow}>
          <span className="text-[#C9CCE4]">{t.createdDateLabel}</span>
          <span className="text-[#C9CCE4] font-mono text-[11px]">
            {new Date(invitation.createdAt).toLocaleDateString()}
          </span>
        </div>

        <div className={styles.infoRow}>
          <span className="text-[#C9CCE4]">{t.reminderCountLabel}</span>
          <span className="text-white font-bold">{invitation.reminderCount}</span>
        </div>

        {/* Copyable link input */}
        <div className="pt-2 border-t border-white/10">
          <label className="block text-[#C9CCE4] mb-1.5 text-[11px]">
            {t.shareableInviteLinkLabel}
          </label>
          <div className="flex items-center bg-[#172244] border border-white/15 rounded-xl overflow-hidden p-1 shadow-inner">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] hover:from-[#d0d2f0] hover:to-[#b7bddf] active:scale-95 text-[#242C55] font-semibold rounded-lg shadow transition-all px-3.5 py-1.5 text-xs shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? t.copiedBtn : t.copyBtn}</span>
            </button>
            <input
              type="text"
              readOnly
              value={inviteUrl}
              className="w-full bg-transparent border-0 text-[#C9CCE4] text-[11px] font-mono px-2 text-left focus:ring-0 truncate"
              dir="ltr"
            />
          </div>
        </div>
      </section>

      {/* Manual invitation test shortcut */}
      <div className="w-full mt-3 p-2 rounded-xl bg-[#202B52] border border-[#C1C3E6]/30 flex items-center justify-between text-xs">
        <span className="text-[10px] text-[#C1C3E6]">
          {language === 'ar'
            ? 'اختبار الدعوة في تبويب جديد'
            : 'Test invitation in a new tab'}
        </span>
        <button
          type="button"
          onClick={onOpenInvitation}
          className="px-2.5 py-1 rounded-lg bg-[#C1C3E6] hover:bg-[#A9AFD7] text-[#242C55] text-[10px] font-semibold transition cursor-pointer flex items-center gap-1"
        >
          <span>{language === 'ar' ? 'فتح الدعوة' : 'Open Invitation'}</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {/* Primary Action Buttons */}
      <div className="w-full mt-3 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={handleWhatsApp}
          className="w-full py-3 px-4 rounded-xl bg-[#202B52] hover:bg-[#283566] border border-white/20 text-white text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 shadow-lg active:scale-95 cursor-pointer"
        >
          <MessageCircle className="w-4 h-4 text-[#C1C3E6]" />
          <span>{t.shareWhatsAppBtn}</span>
        </button>

        <button
          type="button"
          onClick={onCancelInvite}
          className="w-full py-2.5 px-4 rounded-xl border border-[#C1C3E6]/30 bg-[#C1C3E6]/10 hover:bg-[#C1C3E6]/20 active:scale-95 text-[#C1C3E6] hover:text-white text-xs font-medium flex items-center justify-center gap-2 transition-all duration-200 shadow-sm cursor-pointer"
        >
          <X className="w-4 h-4 text-[#C1C3E6]" />
          <span>{t.cancelInviteBtn}</span>
        </button>
      </div>
    </div>
  );
};
