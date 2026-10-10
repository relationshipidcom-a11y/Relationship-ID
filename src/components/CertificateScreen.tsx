import React, { useState } from 'react';
import { Shield, Share2, Download, CheckCircle, Sliders, Home, Info, X, ShieldCheck, Fingerprint, Lock, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Language, RelationshipRecord } from '../types';
import { translations } from '../i18n/translations';
import { ShareModal } from './ShareModal';
import { getDisplaySocialAccounts } from '../utils/social';
import styles from '../styles/Certificate.module.css';

interface CertificateScreenProps {
  language: Language;
  record: RelationshipRecord;
  onHome: () => void;
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
    <QRCodeSVG value={value} size={68} level="M" bgColor="#ffffff" fgColor="#182849" includeMargin={false} />
  </div>
);

export const CertificateScreen: React.FC<CertificateScreenProps> = ({
  language,
  record,
  onHome
}) => {
  const t = translations[language];
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

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
          onClick={onHome}
          aria-label={language === 'ar' ? 'الرئيسية' : 'Home'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#202B52] hover:bg-[#252F5A] border border-white/15 text-sm text-[#C9CCE4] hover:text-white transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C1C3E6] min-h-[40px]"
        >
          <Home className="w-3.5 h-3.5 text-[#C1C3E6]" />
          <span>{t.homeBtn}</span>
        </button>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm font-semibold">
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
          <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-white/20">
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
                <span className="text-[#C9CCE4] text-sm sm:text-[10px] tracking-[0.18em] font-medium uppercase mt-1">
                  {t.privateRecordRegistry}
                </span>
              </div>
            </div>

            <div className="border border-white/30 rounded-md px-2.5 py-1 text-sm sm:text-[9.5px] tracking-[0.16em] text-white font-semibold uppercase bg-white/[0.04] shrink-0" dir="ltr">
              {language === 'ar' ? 'سجل علاقة خاص' : 'PRIVATE RELATIONSHIP RECORD'}
            </div>
          </div>

          {/* Section 2: Solemn Commitment Declaration */}
          <div className="text-center pt-1">
            <p className="text-sm sm:text-[11px] text-[#C9CCE4] tracking-[0.18em] uppercase font-medium">
              {t.commitmentStatement}
            </p>
            {language === 'ar' && (
              <p className="text-sm sm:text-[11px] text-[#C1C3E6] mt-0.5 font-medium">
                {t.commitmentStatementAr}
              </p>
            )}

            {/* Couple Names in Elegant Serif Display */}
            <div className="my-2.5">
              <h2 className="text-xl sm:text-2xl text-white font-serif tracking-wide font-normal break-words">
                {partner1DisplayName}
                <span className="font-serif italic text-[#C1C3E6] mx-2 text-lg sm:text-xl">&</span>
                {partner2DisplayName}
              </h2>
              {language === 'ar' && (record.partner1.fullNameEn || record.partner2.fullNameEn) && (
                <p className="text-sm sm:text-[11px] text-[#C9CCE4] font-serif tracking-wider mt-0.5 break-words" dir="ltr">
                  {record.partner1.fullNameEn || record.partner1.fullName} <span className="italic">&</span> {record.partner2.fullNameEn || record.partner2.fullName}
                </p>
              )}
            </div>

            {/* Badges: Relationship Type & Record ID */}
            <div className="flex items-center justify-center gap-2.5 mt-2 mb-1 flex-wrap">
              <span className="bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] text-[#242C55] font-bold text-sm sm:text-[10px] px-3.5 py-1 rounded-full uppercase tracking-widest shadow-sm">
                {record.type === 'marriage' ? 'MARRIAGE' : record.type === 'engagement' ? 'ENGAGEMENT' : 'COUPLES'}
              </span>
              <span className="bg-white/10 border border-white/25 text-white font-mono font-medium text-sm sm:text-[10px] px-3.5 py-1 rounded-full uppercase tracking-wider">
                RECORD ID: #{record.recordNumber}
              </span>
            </div>
          </div>

          {/* Section 3: Shared Details Boxes (2 Columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {/* Partner 1 Box */}
            <div className={styles.partnerBox}>
              <div className="text-sm sm:text-[10px] font-bold tracking-wider text-white uppercase break-words" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                {partner1DetailsLabel}
              </div>
            </div>

            {/* Partner 2 Box */}
            <div className={styles.partnerBox}>
              <div className="text-sm sm:text-[10px] font-bold tracking-wider text-white uppercase break-words" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                {partner2DetailsLabel}
              </div>
            </div>
          </div>

          {/* Connected Profiles Row */}
          {(() => {
            const p1Accounts = getDisplaySocialAccounts(record.partner1);
            const p2Accounts = getDisplaySocialAccounts(record.partner2);
            const hasSocial = p1Accounts.length > 0 || p2Accounts.length > 0;
            if (!record.settings.showSocialHandles || !hasSocial) return null;

            return (
              <div className="flex flex-wrap items-center justify-center gap-2.5 text-sm sm:text-[10px] text-[#C9CCE4] font-medium tracking-wider pt-0.5" dir="ltr">
                <span className="uppercase text-[#C9CCE4] font-bold text-sm sm:text-[9px] tracking-widest">
                  {t.connectedProfiles}
                </span>
                {p1Accounts.map((acc, i) => (
                  <span key={`p1-${i}`} className="text-white font-mono">{acc.display}</span>
                ))}
                {p1Accounts.length > 0 && p2Accounts.length > 0 && <span className="text-white/40">·</span>}
                {p2Accounts.map((acc, i) => (
                  <span key={`p2-${i}`} className="text-white font-mono">{acc.display}</span>
                ))}
              </div>
            );
          })()}

          {/* Section 4: Verification Reference & Concentric Seal */}
          <div className="pt-2 pb-1 border-t border-white/20 flex items-center justify-between gap-4">
            {/* Left: Concentric Seal */}
            <div className={`${styles.concentricSeal} shrink-0`}>
              <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-white stroke-[2.2]" />
              <span className="text-sm sm:text-[7.5px] font-black text-white tracking-wider sm:tracking-[0.2em] uppercase mt-0.5 sm:mt-1 text-center">
                {t.verifiedBadgeUpper}
              </span>
            </div>

            {/* Right: Verification Details */}
            <div className="flex-1 text-left" dir="ltr">
              <div className="text-sm sm:text-[10px] font-bold tracking-[0.16em] uppercase text-[#C9CCE4]">
                {t.verificationRefLabel}
              </div>
              <div className="text-sm sm:text-base font-mono font-bold text-white tracking-widest mt-0.5 break-all">
                {record.verificationRef}
              </div>
              <div className="text-sm sm:text-[9.5px] text-[#C9CCE4] mt-0.5">
                {t.issuedDateLabel} {language === 'ar' ? record.issuedDateAr : record.issuedDate}
              </div>
            </div>
          </div>

          {/* Section 5: Scan Reference & QR Matrix */}
          <div className="pt-2 border-t border-white/20 flex items-center justify-between gap-4">
            <div className="text-left" dir="ltr">
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="text-sm sm:text-[10px] font-bold tracking-[0.16em] uppercase text-[#C9CCE4]">
                  {t.scanRefTitle}
                </div>
                <button
                  type="button"
                  onClick={() => setShowDetails((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-sm sm:text-[11px] text-[#C1C3E6] hover:text-white bg-white/10 hover:bg-white/15 px-2 py-0.5 rounded-full border border-white/20 transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#C1C3E6] print:hidden"
                  aria-label={t.certDetailsToggleBtn}
                  aria-expanded={showDetails}
                >
                  <Info className="w-3.5 h-3.5 text-[#C1C3E6]" />
                  <span>{t.certDetailsToggleBtn}</span>
                </button>
              </div>
              <p className="text-sm sm:text-[10.5px] text-[#C9CCE4]/90 mt-1 max-w-full sm:max-w-[220px] leading-relaxed">
                {t.scanRefDesc}
              </p>
            </div>

            <QrMatrixBlock value={`${window.location.origin}/verify/${encodeURIComponent(record.verificationRef)}`} />
          </div>
        </div>
      </article>

      {/* Certificate Details Section */}
      {showDetails && (
        <section
          aria-label={t.certDetailsTitle}
          className="mt-3 p-4 sm:p-5 rounded-2xl bg-[#1B264A] border border-[#C1C3E6]/25 shadow-xl space-y-3.5 print:hidden transition-all duration-200"
          dir={language === 'ar' ? 'rtl' : 'ltr'}
        >
          <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#2C345F] text-[#C1C3E6] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-[#C1C3E6]" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                {t.certDetailsTitle}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowDetails(false)}
              className="w-10 h-10 rounded-full bg-[#172244] hover:bg-[#202B52] text-[#C9CCE4] hover:text-white flex items-center justify-center border border-white/10 cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-[#C1C3E6] shrink-0"
              aria-label={t.certDetailsCloseBtn}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-base sm:text-sm text-[#C9CCE4] leading-relaxed">
            {t.certDetailsIntro}
          </p>

          <div className="space-y-2.5 text-start">
            {/* 1. Cryptographically Unique */}
            <div className="p-3 rounded-xl bg-[#202B52] border border-white/10 flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Fingerprint className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-sm sm:text-base font-bold text-white">
                  {t.certDetailsUniqueTitle}
                </h4>
                <p className="text-base sm:text-sm text-[#C9CCE4] leading-relaxed">
                  {t.certDetailsUniqueDesc}
                </p>
              </div>
            </div>

            {/* 2. Permanent & Static Lifespan */}
            <div className="p-3 rounded-xl bg-[#202B52] border border-white/10 flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-sm sm:text-base font-bold text-white">
                  {t.certDetailsStaticTitle}
                </h4>
                <p className="text-base sm:text-sm text-[#C9CCE4] leading-relaxed">
                  {t.certDetailsStaticDesc}
                </p>
              </div>
            </div>

            {/* 3. Live Real-Time Dynamic Verification */}
            <div className="p-3 rounded-xl bg-[#202B52] border border-white/10 flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                <QrCode className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-sm sm:text-base font-bold text-white">
                  {t.certDetailsDynamicVerifyTitle}
                </h4>
                <p className="text-base sm:text-sm text-[#C9CCE4] leading-relaxed">
                  {t.certDetailsDynamicVerifyDesc}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Download notice feedback */}
      {downloadNotice && (
        <div className="my-2 p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-sm text-center font-medium">
          {downloadNotice}
        </div>
      )}

      {/* Bottom Actions Bar */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setIsShareModalOpen(true)}
          className="flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] hover:from-[#D0D2ED] hover:to-[#B5BBE2] text-[#242C55] font-bold text-sm shadow-lg transition-all active:scale-95 cursor-pointer border border-white/20 min-h-[44px]"
        >
          <Share2 className="w-4 h-4 shrink-0" />
          <span className="truncate">{t.shareCertActionBtn}</span>
        </button>

        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-[#202B52] hover:bg-[#252F5A] text-white font-medium text-sm border border-white/15 transition-all active:scale-95 cursor-pointer min-h-[44px]"
        >
          <Download className="w-4 h-4 text-[#C1C3E6] shrink-0" />
          <span className="truncate">{t.downloadCertBtn}</span>
        </button>

        <button
          type="button"
          onClick={onHome}
          aria-label={language === 'ar' ? 'الرئيسية' : 'Home'}
          className="flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-[#202B52] hover:bg-[#252F5A] text-[#C9CCE4] hover:text-white font-medium text-sm border border-white/15 transition-all active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C1C3E6] min-h-[44px]"
        >
          <Home className="w-4 h-4 text-[#C1C3E6] shrink-0" />
          <span className="truncate">{t.homeBtn}</span>
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
