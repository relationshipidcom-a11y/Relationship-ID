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
      <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#9b6682] text-white text-[11px] font-bold tracking-wider mb-4 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
        <span>{t.stepP2Waiting}</span>
      </div>

      {/* Hourglass Visual Status Icon */}
      <div className="relative my-1 flex items-center justify-center">
        <div className="absolute inset-0 bg-[#9b6682]/20 rounded-full blur-xl scale-125" />
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-b from-[#2e264f] to-[#1e1936] border border-white/25 flex items-center justify-center shadow-lg">
          <Hourglass className="w-8 h-8 text-[#f3c4db] animate-pulse" />
        </div>
      </div>

      {/* Main Headline & Subtitle */}
      <div className="text-center mt-3 mb-4 px-2">
        <h2 className="text-xl font-bold text-white mb-1.5">{t.waitingTitle}</h2>
        <p className="text-xs text-[#b6afd4] leading-relaxed font-normal">
          {t.waitingDesc}
        </p>
      </div>

      {/* Countdown Section */}
      <section className="w-full mb-4">
        <p className="text-xs text-center text-[#b6afd4] font-medium mb-2.5">
          {t.timeRemainingLabel}
        </p>
        <div className={styles.timerGrid} dir="rtl">
          <div className={styles.timerBlock}>
            <span className="text-lg font-bold text-[#c9c2e8] tracking-tight">{days}</span>
            <span className="text-[11px] text-[#8e84af] font-medium mt-0.5">{t.days}</span>
          </div>
          <div className={styles.timerBlock}>
            <span className="text-lg font-bold text-[#c9c2e8] tracking-tight">{hours}</span>
            <span className="text-[11px] text-[#8e84af] font-medium mt-0.5">{t.hours}</span>
          </div>
          <div className={styles.timerBlock}>
            <span className="text-lg font-bold text-[#c9c2e8] tracking-tight">{minutes}</span>
            <span className="text-[11px] text-[#8e84af] font-medium mt-0.5">{t.minutes}</span>
          </div>
          <div className={styles.timerBlockActive}>
            <span className="text-lg font-bold text-[#f3c4db] tracking-tight">
              {seconds < 10 ? `0${seconds}` : seconds}
            </span>
            <span className="text-[11px] text-[#f3c4db] font-medium mt-0.5">{t.seconds}</span>
          </div>
        </div>
      </section>

      {/* Details Card */}
      <section className="w-full bg-[#211c38] border border-white/15 rounded-2xl p-4 text-xs space-y-2.5 shadow-lg">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <span className="text-[#b6afd4] font-medium">{t.statusLabel}</span>
          <span className="inline-flex items-center gap-1.5 text-[#f3c4db] font-semibold text-[11px] bg-[#9b6682]/25 px-2.5 py-0.5 rounded-full border border-[#9b6682]/50">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f3c4db] animate-ping" />
            {t.statusWaitingApproval}
          </span>
        </div>

        <div className={styles.infoRow}>
          <span className="text-[#b6afd4]">{t.partner1Inviter}</span>
          <span className="font-bold text-white tracking-wide">{invitation.inviterName}</span>
        </div>

        <div className={styles.infoRow}>
          <span className="text-[#b6afd4]">{t.relationshipStage}</span>
          <span className="font-medium text-[#c9c2e8]">
            {record.type === 'marriage'
              ? t.marriage
              : record.type === 'engagement'
              ? t.engagement
              : t.dating}
          </span>
        </div>

        <div className={styles.infoRow}>
          <span className="text-[#b6afd4]">{t.startDateLabel}</span>
          <span className="text-white/90">
            {language === 'ar' ? record.startDateAr : record.startDate}
          </span>
        </div>

        <div className={styles.infoRow}>
          <span className="text-[#b6afd4]">{t.createdDateLabel}</span>
          <span className="text-[#b6afd4] font-mono text-[11px]">
            {new Date(invitation.createdAt).toLocaleDateString()}
          </span>
        </div>

        <div className={styles.infoRow}>
          <span className="text-[#b6afd4]">{t.reminderCountLabel}</span>
          <span className="text-white font-bold">{invitation.reminderCount}</span>
        </div>

        {/* Copyable link input */}
        <div className="pt-2 border-t border-white/10">
          <label className="block text-[#b6afd4] mb-1.5 text-[11px]">
            {t.shareableInviteLinkLabel}
          </label>
          <div className="flex items-center bg-[#141124] border border-white/15 rounded-xl overflow-hidden p-1 shadow-inner">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 bg-[#9b6682] hover:bg-[#a9718f] active:scale-95 text-white font-semibold rounded-lg shadow transition-all px-3.5 py-1.5 text-xs shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? t.copiedBtn : t.copyBtn}</span>
            </button>
            <input
              type="text"
              readOnly
              value={inviteUrl}
              className="w-full bg-transparent border-0 text-[#b6afd4] text-[11px] font-mono px-2 text-left focus:ring-0 truncate"
              dir="ltr"
            />
          </div>
        </div>
      </section>

      {/* Manual invitation test shortcut */}
      <div className="w-full mt-3 p-2 rounded-xl bg-[#2e264f]/70 border border-[#f3c4db]/30 flex items-center justify-between text-xs">
        <span className="text-[10px] text-[#f3c4db]">
          {language === 'ar'
            ? 'اختبار الدعوة في تبويب جديد'
            : 'Test invitation in a new tab'}
        </span>
        <button
          type="button"
          onClick={onOpenInvitation}
          className="px-2.5 py-1 rounded-lg bg-[#9b6682] text-white text-[10px] font-semibold hover:bg-[#a9718f] transition cursor-pointer flex items-center gap-1"
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
          className="w-full py-3 px-4 rounded-xl bg-[#2e264f] hover:bg-[#39305f] border border-white/20 text-white text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 shadow-lg active:scale-95 cursor-pointer"
        >
          <MessageCircle className="w-4 h-4 text-[#f3c4db]" />
          <span>{t.shareWhatsAppBtn}</span>
        </button>

        <button
          type="button"
          onClick={onCancelInvite}
          className="w-full py-2.5 px-4 rounded-xl border border-[#9b6682]/40 bg-[#9b6682]/10 hover:bg-[#9b6682]/20 active:scale-95 text-[#e8bad0] hover:text-white text-xs font-medium flex items-center justify-center gap-2 transition-all duration-200 shadow-sm cursor-pointer"
        >
          <X className="w-4 h-4 text-[#e8bad0]" />
          <span>{t.cancelInviteBtn}</span>
        </button>
      </div>
    </div>
  );
};
