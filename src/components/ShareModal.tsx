import React, { useState } from 'react';
import { Share2, X, Check, Copy, MessageCircle, Send, Smartphone, Download, QrCode } from 'lucide-react';
import { Language, RelationshipRecord } from '../types';
import { translations } from '../i18n/translations';
import styles from '../styles/ShareModal.module.css';

interface ShareModalProps {
  language: Language;
  isOpen: boolean;
  onClose: () => void;
  record: RelationshipRecord;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  language,
  isOpen,
  onClose,
  record
}) => {
  const t = translations[language];
  const [copied, setCopied] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);

  if (!isOpen) return null;

  const certShareUrl = `${window.location.origin}/verify/${encodeURIComponent(record.verificationRef)}`;

  const triggerToast = (msg: string) => {
    setToastText(msg);
    setTimeout(() => setToastText(null), 2500);
  };

  const handleCopyLink = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(certShareUrl);
      setCopied(true);
      triggerToast(language === 'ar' ? 'تم نسخ رابط التحقق بنجاح.' : 'Verification link copied.');
      setTimeout(() => setCopied(false), 2200);
    } catch (error) {
      console.error('Unable to copy verification link', error);
      window.prompt(language === 'ar' ? 'انسخ رابط التحقق:' : 'Copy verification link:', certShareUrl);
    }
  };

  const handleChannelShare = (channelName: string) => {
    const shareText = encodeURIComponent(
      language === 'ar'
        ? `شهادة سجل العلاقة الرقمية لـ ${record.partner1.fullName} و ${record.partner2.fullName} (المرجع: ${record.verificationRef}): ${certShareUrl}`
        : `Relationship Certificate for ${record.partner1.fullName} & ${record.partner2.fullName} (Ref: ${record.verificationRef}): ${certShareUrl}`
    );

    if (channelName === 'whatsapp') {
      window.open(`https://wa.me/?text=${shareText}`, '_blank');
    } else if (channelName === 'x') {
      window.open(`https://twitter.com/intent/tweet?text=${shareText}`, '_blank');
    } else if (channelName === 'telegram') {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(certShareUrl)}&text=${shareText}`, '_blank');
    } else if (channelName === 'sms') {
      window.location.href = `sms:?&body=${shareText}`;
    } else if (navigator.share) {
      navigator.share({
        title: language === 'ar' ? 'شهادة سجل العلاقة' : 'Relationship Certificate',
        text: decodeURIComponent(shareText),
        url: certShareUrl
      }).catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Native share failed', error);
        triggerToast(language === 'ar' ? 'تعذر فتح المشاركة. انسخ الرابط بدلاً من ذلك.' : 'Share failed. Copy the link instead.');
      });
    } else {
      handleCopyLink();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className={styles.modalBackdrop}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={styles.modalSheet}
        dir={language === 'ar' ? 'rtl' : 'ltr'}
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between pb-3.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#9b6682]/30 text-[#f3c4db] flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white">
              {t.shareModalTitle}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-[#211c38] hover:bg-[#2e264f] text-[#b6afd4] hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Certificate Preview Badge Inside Modal */}
        <div className="mt-4 p-3 rounded-2xl bg-[#211c38] border border-white/15 flex items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#9a7b2c] via-[#e2bd59] to-[#bf953f] p-0.5 shrink-0 flex items-center justify-center">
              <div className="w-full h-full rounded-[10px] bg-[#1a1530] flex items-center justify-center text-[#e2bd59] font-bold text-xs">
                RID
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-bold text-white truncate">
                  {record.partner1.fullName} &amp; {record.partner2.fullName}
                </p>
              </div>
              <p className="font-mono text-[10px] text-[#f3c4db] mt-0.5 tracking-wider truncate">
                {record.verificationRef}
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
            {t.officialRecord}
          </span>
        </div>

        {/* Direct Share Channels */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold text-[#b6afd4] mb-2">
            {t.shareChannelsTitle}
          </p>
          <div className={styles.channelGrid}>
            {/* WhatsApp */}
            <button
              type="button"
              onClick={() => handleChannelShare('whatsapp')}
              className={styles.channelBtn}
            >
              <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <MessageCircle className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-medium text-slate-200">{t.whatsappChannel}</span>
            </button>

            {/* X / Twitter */}
            <button
              type="button"
              onClick={() => handleChannelShare('x')}
              className={styles.channelBtn}
            >
              <div className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center font-bold text-xs">
                𝕏
              </div>
              <span className="text-[10px] font-medium text-slate-200">{t.xChannel}</span>
            </button>

            {/* Telegram */}
            <button
              type="button"
              onClick={() => handleChannelShare('telegram')}
              className={styles.channelBtn}
            >
              <div className="w-9 h-9 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center">
                <Send className="w-4 h-4 ml-0.5" />
              </div>
              <span className="text-[10px] font-medium text-slate-200">{t.telegramChannel}</span>
            </button>

            {/* Instagram */}
            <button
              type="button"
              onClick={() => handleChannelShare('instagram')}
              className={styles.channelBtn}
            >
              <div className="w-9 h-9 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center">
                <Share2 className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-medium text-slate-200">{t.instagramChannel}</span>
            </button>

            {/* SMS */}
            <button
              type="button"
              onClick={() => handleChannelShare('sms')}
              className={styles.channelBtn}
            >
              <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
                <Smartphone className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-medium text-slate-200">{t.smsChannel}</span>
            </button>
          </div>
        </div>

        {/* Copy Link Section */}
        <div className="mt-4">
          <label className="block text-[11px] font-semibold text-[#b6afd4] mb-1.5" htmlFor="certShareLink">
            {t.secureCertLinkLabel}
          </label>
          <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-[#141124] border border-white/15 focus-within:border-[#f3c4db]">
            <input
              id="certShareLink"
              type="text"
              readOnly
              value={certShareUrl}
              className="bg-transparent text-xs text-white font-mono w-full border-0 focus:ring-0 p-1 truncate text-left"
              dir="ltr"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[#9b6682] hover:bg-[#a9718f] text-white font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? t.copiedBtn : t.copyCertLinkBtn}</span>
            </button>
          </div>
        </div>

        {/* Download & QR Quick Actions */}
        <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-[#211c38] hover:bg-[#2e264f] text-white text-xs font-medium border border-white/15 transition-all active:scale-95 cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#f3c4db]" />
            <span>{language === 'ar' ? 'طباعة / حفظ PDF' : 'Print / Save PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-[#211c38] hover:bg-[#2e264f] text-white text-xs font-medium border border-white/15 transition-all active:scale-95 cursor-pointer"
          >
            <QrCode className="w-4 h-4 text-[#f3c4db]" />
            <span>{language === 'ar' ? 'نسخ رابط التحقق' : 'Copy Verify Link'}</span>
          </button>
        </div>

        {/* Floating Toast Notification */}
        {toastText && (
          <div className="mt-3 p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs text-center">
            {toastText}
          </div>
        )}
      </div>
    </div>
  );
};
