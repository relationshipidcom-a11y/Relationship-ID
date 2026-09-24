import React from 'react';
import { Settings, Eye, Edit3, Shield, AtSign, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Language, RelationshipRecord, CertificateSettings } from '../types';
import { translations } from '../i18n/translations';
import styles from '../styles/Certificate.module.css';

interface ReviewControlsScreenProps {
  language: Language;
  record: RelationshipRecord;
  onUpdateSettings: (newSettings: Partial<CertificateSettings>) => void;
  onEditDetails: () => void;
  onViewCertificate: () => void;
}

export const ReviewControlsScreen: React.FC<ReviewControlsScreenProps> = ({
  language,
  record,
  onUpdateSettings,
  onEditDetails,
  onViewCertificate
}) => {
  const t = translations[language];

  return (
    <div className="flex-1 flex flex-col justify-between px-4 py-3">
      {/* Stepper Navigation */}
      <nav aria-label="Step Navigation" className="my-2">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#9b6682]/20 text-[#f3c4db] border border-[#9b6682]/50 font-semibold w-fit">
          <span className="w-4 h-4 rounded-full bg-[#9b6682] text-[10px] flex items-center justify-center text-white font-bold">
            3
          </span>
          <span className="text-xs">{t.step3Tab}</span>
        </div>
      </nav>

      {/* Page Header */}
      <section className="text-center my-1.5">
        <h2 className="text-lg font-bold text-white tracking-wide">{t.reviewHeaderTitle}</h2>
        <p className="text-xs text-[#b6afd4] mt-0.5">{t.reviewHeaderDesc}</p>
      </section>

      {/* Certificate Preview Card */}
      <div className={`${styles.certificateCard} my-2`}>
        <div className={styles.draftingGridFrame}>
          {/* Extended Corner Architectural Drafting Lines */}
          <div className={styles.cornerExtensionTL} />
          <div className={styles.cornerExtensionTR} />
          <div className={styles.cornerExtensionBL} />
          <div className={styles.cornerExtensionBR} />

          {/* Section 1: Official Registry Header */}
          <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-white/20">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-full border border-white/40 flex items-center justify-center bg-white/5 shrink-0 mt-0.5">
                <Shield className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="flex flex-col text-left" dir="ltr">
                <span className="text-white font-extrabold text-xs sm:text-sm tracking-[0.22em] leading-none uppercase">
                  RELATIONSHIP
                </span>
                <span className="text-white font-extrabold text-xs sm:text-sm tracking-[0.22em] leading-tight uppercase mt-0.5">
                  ID
                </span>
                <span className="text-[#b6afd4] text-[8.5px] sm:text-[9.5px] tracking-[0.18em] font-medium uppercase mt-0.5">
                  {t.privateRecordRegistry}
                </span>
              </div>
            </div>

            <div className="border border-white/30 rounded-md px-2 py-0.5 text-[8.5px] tracking-[0.16em] text-white font-semibold uppercase bg-white/[0.04] shrink-0" dir="ltr">
              {t.officialRegistryBadge}
            </div>
          </div>

          {/* Section 2: Statement & Names */}
          <div className="text-center pt-0.5">
            <p className="text-[9.5px] sm:text-[10px] text-[#b6afd4] tracking-[0.16em] uppercase font-medium">
              {t.commitmentStatement}
            </p>
            {language === 'ar' && (
              <p className="text-[10px] text-[#f3c4db] mt-0.5 font-medium">
                {t.commitmentStatementAr}
              </p>
            )}

            <div className="my-2">
              <h3 className="text-lg sm:text-xl text-white font-serif tracking-wide font-normal">
                {language === 'ar' ? record.partner1.fullName : (record.partner1.fullNameEn || record.partner1.fullName)}
                <span className="font-serif italic text-[#f3c4db] mx-1.5 text-base sm:text-lg">&</span>
                {language === 'ar' ? record.partner2.fullName : (record.partner2.fullNameEn || record.partner2.fullName)}
              </h3>
              {language === 'ar' && (record.partner1.fullNameEn || record.partner2.fullNameEn) && (
                <p className="text-[10px] text-[#b6afd4] font-serif tracking-wider mt-0.5" dir="ltr">
                  {record.partner1.fullNameEn || record.partner1.fullName} <span className="italic">&</span> {record.partner2.fullNameEn || record.partner2.fullName}
                </p>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 mt-1.5 mb-1">
              <span className="bg-[#9b6682] border border-[#83769c] text-white font-bold text-[8.5px] sm:text-[9.5px] px-3 py-0.5 rounded-full uppercase tracking-widest shadow-sm">
                {record.type === 'marriage' ? 'MARRIAGE' : record.type === 'engagement' ? 'ENGAGEMENT' : 'COUPLES'}
              </span>
              <span className="bg-white/10 border border-white/25 text-white font-mono font-medium text-[8.5px] sm:text-[9.5px] px-3 py-0.5 rounded-full uppercase tracking-wider">
                RECORD ID: #{record.recordNumber}
              </span>
            </div>
          </div>

          {/* Section 3: Shared Details Boxes (2 Columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <div className={styles.partnerBox}>
              <div className="text-[9px] sm:text-[9.5px] font-bold tracking-wider text-white uppercase" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                {language === 'ar' ? `${record.partner1.fullName} • ${t.sharedDetailsLabel}` : `${(record.partner1.fullNameEn || record.partner1.fullName).toUpperCase()} · ${t.sharedDetailsLabel}`}
              </div>
              <div className="text-[8.5px] sm:text-[9px] text-[#b6afd4] font-mono mt-0.5 leading-relaxed" dir="ltr">
                <span>{language === 'ar' ? 'تفاصيل الاتصال خاصة' : 'Contact details private'}</span>
              </div>
            </div>

            <div className={styles.partnerBox}>
              <div className="text-[9px] sm:text-[9.5px] font-bold tracking-wider text-white uppercase" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                {language === 'ar' ? `${record.partner2.fullName} • ${t.sharedDetailsLabel}` : `${(record.partner2.fullNameEn || record.partner2.fullName).toUpperCase()} · ${t.sharedDetailsLabel}`}
              </div>
              <div className="text-[8.5px] sm:text-[9px] text-[#b6afd4] font-mono mt-0.5 leading-relaxed" dir="ltr">
                <span>{language === 'ar' ? 'تفاصيل الاتصال خاصة' : 'Contact details private'}</span>
              </div>
            </div>
          </div>

          {/* Connected Handles (Conditional on Toggle 1) */}
          {record.settings.showSocialHandles && (record.partner1.socialHandle || record.partner2.socialHandle) && (
            <div className="flex items-center justify-center gap-2 text-[9px] sm:text-[9.5px] text-[#b6afd4] font-medium tracking-wider pt-0.5" dir="ltr">
              <span className="uppercase text-[#b6afd4] font-bold text-[8.5px] tracking-widest">{t.connectedProfiles}</span>
              {record.partner1.socialHandle && <span className="text-white font-mono">@{record.partner1.socialHandle}</span>}
              {record.partner1.socialHandle && record.partner2.socialHandle && <span className="text-white/40">·</span>}
              {record.partner2.socialHandle && <span className="text-white font-mono">@{record.partner2.socialHandle}</span>}
            </div>
          )}

          {/* Verification Bar & Seal */}
          <div className="pt-2 pb-1 border-t border-white/20 flex items-center justify-between gap-3">
            <div className={styles.concentricSeal} style={{ width: '64px', height: '64px' }}>
              <Shield className="w-4 h-4 text-white stroke-[2.2]" />
              <span className="text-[6.5px] font-black text-white tracking-[0.2em] uppercase mt-0.5">
                {t.verifiedBadgeUpper}
              </span>
            </div>

            <div className="flex-1 text-left" dir="ltr">
              <div className="text-[8.5px] sm:text-[9px] font-bold tracking-[0.16em] uppercase text-[#b6afd4]">
                {t.verificationRefLabel}
              </div>
              <div className="text-xs sm:text-sm font-mono font-bold text-white tracking-widest mt-0.5">
                {record.verificationRef}
              </div>
              <div className="text-[8.5px] text-[#b6afd4] mt-0.5">
                {t.issuedDateLabel} {language === 'ar' ? record.issuedDateAr : record.issuedDate}
              </div>
            </div>
          </div>

          {/* Scan Reference & QR Matrix (Conditional on Toggle 3) */}
          {record.settings.showQrMatrix && (
            <div className="pt-2 border-t border-white/20 flex items-center justify-between gap-3">
              <div className="text-left" dir="ltr">
                <div className="text-[8.5px] sm:text-[9px] font-bold tracking-[0.16em] uppercase text-[#b6afd4]">
                  {t.scanRefTitle}
                </div>
                <p className="text-[9px] text-[#b6afd4]/90 mt-0.5 max-w-[200px] leading-relaxed">
                  {t.scanRefDesc}
                </p>
              </div>

              <div className="shrink-0 bg-white p-1 rounded-md shadow-sm">
                <QRCodeSVG value={`${window.location.origin}/verify/${encodeURIComponent(record.verificationRef)}`} size={32} bgColor="#ffffff" fgColor="#262b51" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Control Dashboard Panel with Live Toggles */}
      <div className="my-2 w-full rounded-xl border border-white/20 p-3.5 bg-[#211c38] shadow-xl text-right">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#9b6682]/20 border border-[#f3c4db]/30 flex items-center justify-center text-[#f3c4db]">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white tracking-wide">
                {t.dashboardPanelTitle}
              </h3>
              <span className="text-[9px] text-[#b6afd4] block font-normal">
                {t.dashboardPanelDesc}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#9b6682]/20 border border-[#f3c4db]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f3c4db] animate-pulse" />
            <span className="text-[8px] font-mono font-semibold text-[#f3c4db]">
              {t.liveBadge}
            </span>
          </div>
        </div>

        {/* Toggle List */}
        <div className="flex flex-col gap-2">
          {/* Toggle 1: Social Accounts */}
          <div className={styles.toggleRow}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#9b6682]/15 flex items-center justify-center text-[#f3c4db]">
                <AtSign className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[11px] font-semibold text-white">
                  {t.toggleSocialTitle}
                </span>
                <span className="text-[8.5px] text-[#b6afd4]">
                  {t.toggleSocialDesc}
                </span>
              </div>
            </div>
            <label className={styles.toggleSwitch}>
              <input
                type="checkbox"
                checked={record.settings.showSocialHandles}
                onChange={(e) => onUpdateSettings({ showSocialHandles: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-8 h-4 rounded-full bg-[#2b273c] peer-checked:bg-[#9b6682] transition-colors relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] peer-checked:after:left-[18px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all" />
            </label>
          </div>


          {/* Toggle 3: QR Code Matrix */}
          <div className={styles.toggleRow}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#9b6682]/15 flex items-center justify-center text-[#f3c4db]">
                <QrCode className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[11px] font-semibold text-white">
                  {t.toggleQrTitle}
                </span>
                <span className="text-[8.5px] text-[#b6afd4]">
                  {t.toggleQrDesc}
                </span>
              </div>
            </div>
            <label className={styles.toggleSwitch}>
              <input
                type="checkbox"
                checked={record.settings.showQrMatrix}
                onChange={(e) => onUpdateSettings({ showQrMatrix: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-8 h-4 rounded-full bg-[#2b273c] peer-checked:bg-[#9b6682] transition-colors relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] peer-checked:after:left-[18px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all" />
            </label>
          </div>
        </div>

        {/* Action Buttons inside Dashboard */}
        <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-white/10">
          <button
            type="button"
            onClick={onEditDetails}
            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[10.5px] font-medium text-[#f3c4db] transition-colors border border-[#f3c4db]/35 bg-[#9b6682]/20 hover:bg-white/5 active:scale-[0.98] cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{t.editCertDetailsBtn}</span>
          </button>

          <button
            type="button"
            onClick={onViewCertificate}
            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[10.5px] font-medium text-slate-200 transition-colors border border-white/20 bg-[#211c38] hover:bg-white/5 active:scale-[0.98] cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-[#b6afd4]" />
            <span>{t.previewPrintBtn}</span>
          </button>
        </div>
      </div>

      {/* Main Full-Width Certificate Viewer Action */}
      <div className="mt-2 mb-1">
        <button
          type="button"
          onClick={onViewCertificate}
          className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-white font-bold text-xs shadow-lg active:scale-[0.98] transition-all bg-gradient-to-r from-[#9b6682] to-[#7d4865] border border-[#f3c4db]/30 cursor-pointer"
        >
          <Eye className="w-4 h-4" />
          <span>{t.previewAndShareCertBtn}</span>
        </button>
      </div>
    </div>
  );
};
