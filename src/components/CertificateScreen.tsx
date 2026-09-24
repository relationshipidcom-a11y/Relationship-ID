import React, { useState } from 'react';
import { Shield, Share2, Download, CheckCircle, Sliders, ArrowLeft, ArrowRight } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Language, RelationshipRecord } from '../types';
import { translations } from '../i18n/translations';
import { ShareModal } from './ShareModal';
import styles from '../styles/Certificate.module.css';

interface CertificateScreenProps {
  language: Language;
  record: RelationshipRecord;
  onBackToControls: () => void;
}

const getMonthName = (monthStr: string, lang: Language): string => {
  const monthsEn = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthsAr = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  const idx = parseInt(monthStr, 10) - 1;
  if (idx >= 0 && idx < 12) {
    return lang === 'ar' ? monthsAr[idx] : monthsEn[idx];
  }
  return monthStr;
};

const QrMatrixBlock: React.FC<{ value: string }> = ({ value }) => (
  <div className="bg-white p-2 rounded-lg shadow-sm flex items-center justify-center shrink-0">
    <QRCodeSVG value={value} size={68} level="M" bgColor="#ffffff" fgColor="#262b51" includeMargin={false} />
  </div>
);

export const CertificateScreen: React.FC<CertificateScreenProps> = ({
  language,
  record,
  onBackToControls
}) => {
  const t = translations[language];
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  const handleDownload = () => {
    setDownloadNotice(
      language === 'ar'
        ? 'تم فتح نسخة الطباعة/الحفظ بصيغة PDF من المتصفح.'
        : 'Print/save-as-PDF view opened in your browser.'
    );
    setTimeout(() => {
      window.print();
      setDownloadNotice(null);
    }, 1000);
  };

  const partner1DisplayName = language === 'ar' 
    ? record.partner1.fullName 
    : (record.partner1.fullNameEn || record.partner1.fullName);

  const partner2DisplayName = language === 'ar' 
    ? record.partner2.fullName 
    : (record.partner2.fullNameEn || record.partner2.fullName);

  const partner1DetailsLabel = language === 'ar'
    ? `${record.partner1.fullName} • ${t.sharedDetailsLabel}`
    : `${(record.partner1.fullNameEn || record.partner1.fullName).toUpperCase()} · ${t.sharedDetailsLabel}`;

  const partner2DetailsLabel = language === 'ar'
    ? `${record.partner2.fullName} • ${t.sharedDetailsLabel}`
    : `${(record.partner2.fullNameEn || record.partner2.fullName).toUpperCase()} · ${t.sharedDetailsLabel}`;

  return (
    <div className="flex-1 flex flex-col justify-between px-3 sm:px-4 py-3 max-w-[480px] mx-auto w-full">
      {/* Top Floating Certificate Status Pill */}
      <div className="flex items-center justify-between mb-2 px-1">
        <button
          type="button"
          onClick={onBackToControls}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#211c38] hover:bg-[#2e264f] border border-white/15 text-xs text-[#b6afd4] hover:text-white transition-all cursor-pointer"
        >
          {language === 'ar' ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
          <span>{t.controlPanelBtn}</span>
        </button>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          <span>{language === 'ar' ? 'سجل نشط' : 'Active Record'}</span>
        </div>
      </div>

      {/* Master Certificate Document */}
      <article
        id="printable-cert"
        className={styles.certificateCard}
      >
        {/* Inner Blueprint / Drafting Grid Frame */}
        <div className={styles.draftingGridFrame}>
          {/* Extended Corner Architectural Drafting Lines */}
          <div className={styles.cornerExtensionTL} />
          <div className={styles.cornerExtensionTR} />
          <div className={styles.cornerExtensionBL} />
          <div className={styles.cornerExtensionBR} />

          {/* Certificate header */}
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/20">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full border border-white/40 flex items-center justify-center bg-white/5 shrink-0 mt-0.5">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <div className="flex flex-col text-left" dir="ltr">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-white font-extrabold text-sm sm:text-base tracking-[0.22em] leading-none uppercase">
                    RELATIONSHIP
                  </span>
                </div>
                <span className="text-white font-extrabold text-sm sm:text-base tracking-[0.22em] leading-tight uppercase mt-0.5">
                  ID
                </span>
                <span className="text-[#b6afd4] text-[9px] sm:text-[10px] tracking-[0.18em] font-medium uppercase mt-1">
                  {t.privateRecordRegistry}
                </span>
              </div>
            </div>

            <div className="border border-white/30 rounded-md px-2.5 py-1 text-[9px] sm:text-[9.5px] tracking-[0.16em] text-white font-semibold uppercase bg-white/[0.04] shrink-0" dir="ltr">
              {language === 'ar' ? 'سجل علاقة خاص' : 'PRIVATE RELATIONSHIP RECORD'}
            </div>
          </div>

          {/* Section 2: Solemn Commitment Declaration */}
          <div className="text-center pt-1">
            <p className="text-[10px] sm:text-[11px] text-[#b6afd4] tracking-[0.18em] uppercase font-medium">
              {t.commitmentStatement}
            </p>
            {language === 'ar' && (
              <p className="text-[11px] text-[#f3c4db] mt-0.5 font-medium">
                {t.commitmentStatementAr}
              </p>
            )}

            {/* Couple Names in Elegant Serif Display */}
            <div className="my-2.5">
              <h2 className="text-xl sm:text-2xl text-white font-serif tracking-wide font-normal">
                {partner1DisplayName}
                <span className="font-serif italic text-[#f3c4db] mx-2 text-lg sm:text-xl">&</span>
                {partner2DisplayName}
              </h2>
              {language === 'ar' && (record.partner1.fullNameEn || record.partner2.fullNameEn) && (
                <p className="text-[11px] text-[#b6afd4] font-serif tracking-wider mt-0.5" dir="ltr">
                  {record.partner1.fullNameEn || record.partner1.fullName} <span className="italic">&</span> {record.partner2.fullNameEn || record.partner2.fullName}
                </p>
              )}
            </div>

            {/* Badges: Relationship Type & Record ID */}
            <div className="flex items-center justify-center gap-2.5 mt-2 mb-1">
              <span className="bg-[#9b6682] border border-[#83769c] text-white font-bold text-[9px] sm:text-[10px] px-3.5 py-1 rounded-full uppercase tracking-widest shadow-sm">
                {record.type === 'marriage' ? 'MARRIAGE' : record.type === 'engagement' ? 'ENGAGEMENT' : 'COUPLES'}
              </span>
              <span className="bg-white/10 border border-white/25 text-white font-mono font-medium text-[9px] sm:text-[10px] px-3.5 py-1 rounded-full uppercase tracking-wider">
                RECORD ID: #{record.recordNumber}
              </span>
            </div>
          </div>

          {/* Section 3: Shared Details Boxes (2 Columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {/* Partner 1 Box */}
            <div className={styles.partnerBox}>
              <div className="text-[9.5px] sm:text-[10px] font-bold tracking-wider text-white uppercase" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                {partner1DetailsLabel}
              </div>
            </div>

            {/* Partner 2 Box */}
            <div className={styles.partnerBox}>
              <div className="text-[9.5px] sm:text-[10px] font-bold tracking-wider text-white uppercase" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                {partner2DetailsLabel}
              </div>
            </div>
          </div>

          {/* Connected Profiles Row */}
          {record.settings.showSocialHandles && (record.partner1.socialHandle || record.partner2.socialHandle) && (
            <div className="flex items-center justify-center gap-2.5 text-[9.5px] sm:text-[10px] text-[#b6afd4] font-medium tracking-wider pt-0.5" dir="ltr">
              <span className="uppercase text-[#b6afd4] font-bold text-[9px] tracking-widest">
                {t.connectedProfiles}
              </span>
              <span className="text-white font-mono">{record.partner1.socialHandle ? `@${record.partner1.socialHandle}` : ''}</span>
              <span className="text-white/40">·</span>
              <span className="text-white font-mono">{record.partner2.socialHandle ? `@${record.partner2.socialHandle}` : ''}</span>
            </div>
          )}

          {/* Section 4: Verification Reference & Concentric Seal */}
          <div className="pt-2 pb-1 border-t border-white/20 flex items-center justify-between gap-4">
            {/* Left: Concentric Seal */}
            <div className={styles.concentricSeal}>
              <Shield className="w-5 h-5 text-white stroke-[2.2]" />
              <span className="text-[7.5px] font-black text-white tracking-[0.2em] uppercase mt-1">
                {t.verifiedBadgeUpper}
              </span>
            </div>

            {/* Right: Verification Details */}
            <div className="flex-1 text-left" dir="ltr">
              <div className="text-[9px] sm:text-[10px] font-bold tracking-[0.16em] uppercase text-[#b6afd4]">
                {t.verificationRefLabel}
              </div>
              <div className="text-sm sm:text-base font-mono font-bold text-white tracking-widest mt-0.5">
                {record.verificationRef}
              </div>
              <div className="text-[9.5px] text-[#b6afd4] mt-0.5">
                {t.issuedDateLabel} {language === 'ar' ? record.issuedDateAr : record.issuedDate}
              </div>
            </div>
          </div>

          {/* Section 5: Scan Reference & QR Matrix */}
          <div className="pt-2 border-t border-white/20 flex items-center justify-between gap-4">
            <div className="text-left" dir="ltr">
              <div className="text-[9.5px] sm:text-[10px] font-bold tracking-[0.16em] uppercase text-[#b6afd4]">
                {t.scanRefTitle}
              </div>
              <p className="text-[10px] sm:text-[10.5px] text-[#b6afd4]/90 mt-1 max-w-[220px] leading-relaxed">
                {t.scanRefDesc}
              </p>
            </div>

            <QrMatrixBlock value={`${window.location.origin}/verify/${encodeURIComponent(record.verificationRef)}`} />
          </div>
        </div>
      </article>

      {/* Download notice feedback */}
      {downloadNotice && (
        <div className="my-2 p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs text-center font-medium">
          {downloadNotice}
        </div>
      )}

      {/* Bottom Actions Bar */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setIsShareModalOpen(true)}
          className="flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-gradient-to-r from-[#9b6682] to-[#814f6a] hover:from-[#a9718f] hover:to-[#9b6682] text-white font-bold text-xs shadow-lg transition-all active:scale-95 cursor-pointer border border-white/20"
        >
          <Share2 className="w-4 h-4" />
          <span>{t.shareCertActionBtn}</span>
        </button>

        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-[#211c38] hover:bg-[#2e264f] text-white font-medium text-xs border border-white/15 transition-all active:scale-95 cursor-pointer"
        >
          <Download className="w-4 h-4 text-[#f3c4db]" />
          <span>{t.downloadCertBtn}</span>
        </button>

        <button
          type="button"
          onClick={onBackToControls}
          className="flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-[#211c38] hover:bg-[#2e264f] text-[#b6afd4] hover:text-white font-medium text-xs border border-white/15 transition-all active:scale-95 cursor-pointer"
        >
          <Sliders className="w-4 h-4 text-[#f3c4db]" />
          <span>{t.controlPanelBtn}</span>
        </button>
      </div>

      {/* Share Modal */}
      <ShareModal
        language={language}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        record={record}
      />
    </div>
  );
};
