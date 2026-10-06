import React, { useState, useEffect } from 'react';
import { Settings, Eye, Edit3, Shield, AtSign, QrCode, Clock, CheckCircle2, HeartOff } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Language, RelationshipRecord, CertificateSettings, ChangeRequest, SocialAccount } from '../types';
import { translations } from '../i18n/translations';
import { ChangeRequestModal } from './ChangeRequestModal';
import { authFetch, parseApiError } from '../utils/api';
import { getDisplaySocialAccounts } from '../utils/social';
import styles from '../styles/Certificate.module.css';

interface ReviewControlsScreenProps {
  language: Language;
  record: RelationshipRecord;
  currentUserId?: string;
  onUpdateSettings: (newSettings: Partial<CertificateSettings>) => void;
  onEditDetails: () => void;
  onViewCertificate: () => void;
  onRecordUpdated?: (newRecord: RelationshipRecord) => void;
  onExitRelationship?: () => void;
}

export const ReviewControlsScreen: React.FC<ReviewControlsScreenProps> = ({
  language,
  record,
  currentUserId,
  onUpdateSettings,
  onEditDetails,
  onViewCertificate,
  onRecordUpdated,
  onExitRelationship
}) => {
  const t = translations[language];
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const fetchChangeRequests = async () => {
    try {
      setLoadingRequests(true);
      const res = await authFetch('/api/change-requests');
      const data = await parseApiError(res);
      if (Array.isArray(data.changeRequests)) {
        setChangeRequests(data.changeRequests);
      }
    } catch (err) {
      console.error('Failed to fetch change requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    void fetchChangeRequests();
  }, [record.id]);

  const handleSubmitChangeRequest = async (field: string, proposedValue: string) => {
    const res = await authFetch('/api/change-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, proposedValue })
    });
    const data = await parseApiError(res);
    if (data.changeRequest) {
      setChangeRequests((prev) => [data.changeRequest, ...prev.filter((c) => c.id !== data.changeRequest.id)]);
    }
  };

  const handleSavePersonalInfo = async (personalData: {
    socialHandle?: string;
    socialAccounts?: SocialAccount[];
    fullNameEn?: string;
    whatsappNumber?: string;
    whatsappCountry?: string;
  }) => {
    const res = await authFetch('/api/profile/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(personalData)
    });
    const data = await parseApiError(res);
    if (data.record && onRecordUpdated) {
      onRecordUpdated(data.record);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    const res = await authFetch(`/api/change-requests/${requestId}/approve`, {
      method: 'POST'
    });
    const data = await parseApiError(res);
    if (data.record && onRecordUpdated) {
      onRecordUpdated(data.record);
    }
    if (data.changeRequest) {
      setChangeRequests((prev) => prev.map((c) => (c.id === requestId ? data.changeRequest : c)));
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    const res = await authFetch(`/api/change-requests/${requestId}/decline`, {
      method: 'POST'
    });
    const data = await parseApiError(res);
    if (data.changeRequest) {
      setChangeRequests((prev) => prev.map((c) => (c.id === requestId ? data.changeRequest : c)));
    }
  };

  const pendingRequestsForMe = changeRequests.filter(
    (cr) => cr.status === 'pending' && currentUserId && cr.approverUid === currentUserId
  );
  const pendingRequestsByMe = changeRequests.filter(
    (cr) => cr.status === 'pending' && currentUserId && cr.requesterUid === currentUserId
  );

  return (
    <div className="flex-1 flex flex-col justify-between px-4 py-3">
      {/* Stepper Navigation */}
      <nav aria-label="Step Navigation" className="my-2 flex items-center justify-end">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C1C3E6]/20 text-[#C1C3E6] border border-[#C1C3E6]/40 font-semibold w-fit">
          <span className="w-4 h-4 rounded-full bg-[#C1C3E6] text-[10px] flex items-center justify-center text-[#242C55] font-bold">
            3
          </span>
          <span className="text-xs">{t.step3Tab}</span>
        </div>
      </nav>

      {/* Page Header */}
      <section className="text-center my-1.5">
        <h2 className="text-lg font-bold text-white tracking-wide">{t.reviewHeaderTitle}</h2>
        <p className="text-xs text-[#C9CCE4] mt-0.5">{t.reviewHeaderDesc}</p>
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
                <span className="text-[#C9CCE4] text-[8.5px] sm:text-[9.5px] tracking-[0.18em] font-medium uppercase mt-0.5">
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
            <p className="text-[9.5px] sm:text-[10px] text-[#C9CCE4] tracking-[0.16em] uppercase font-medium">
              {t.commitmentStatement}
            </p>
            {language === 'ar' && (
              <p className="text-[10px] text-[#C1C3E6] mt-0.5 font-medium">
                {t.commitmentStatementAr}
              </p>
            )}

            <div className="my-2">
              <h3 className="text-lg sm:text-xl text-white font-serif tracking-wide font-normal">
                {language === 'ar' ? record.partner1.fullName : (record.partner1.fullNameEn || record.partner1.fullName)}
                <span className="font-serif italic text-[#C1C3E6] mx-1.5 text-base sm:text-lg">&</span>
                {language === 'ar' ? record.partner2.fullName : (record.partner2.fullNameEn || record.partner2.fullName)}
              </h3>
              {language === 'ar' && (record.partner1.fullNameEn || record.partner2.fullNameEn) && (
                <p className="text-[10px] text-[#C9CCE4] font-serif tracking-wider mt-0.5" dir="ltr">
                  {record.partner1.fullNameEn || record.partner1.fullName} <span className="italic">&</span> {record.partner2.fullNameEn || record.partner2.fullName}
                </p>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 mt-1.5 mb-1">
              <span className="bg-[#2C345F] border border-[#C1C3E6]/40 text-[#C1C3E6] font-bold text-[8.5px] sm:text-[9.5px] px-3 py-0.5 rounded-full uppercase tracking-widest shadow-sm">
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
              <div className="text-[8.5px] sm:text-[9px] text-[#C9CCE4] font-mono mt-0.5 leading-relaxed" dir="ltr">
                <span>{language === 'ar' ? 'تفاصيل الاتصال خاصة' : 'Contact details private'}</span>
              </div>
            </div>

            <div className={styles.partnerBox}>
              <div className="text-[9px] sm:text-[9.5px] font-bold tracking-wider text-white uppercase" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                {language === 'ar' ? `${record.partner2.fullName} • ${t.sharedDetailsLabel}` : `${(record.partner2.fullNameEn || record.partner2.fullName).toUpperCase()} · ${t.sharedDetailsLabel}`}
              </div>
              <div className="text-[8.5px] sm:text-[9px] text-[#C9CCE4] font-mono mt-0.5 leading-relaxed" dir="ltr">
                <span>{language === 'ar' ? 'تفاصيل الاتصال خاصة' : 'Contact details private'}</span>
              </div>
            </div>
          </div>

          {/* Connected Handles (Conditional on Toggle 1) */}
          {(() => {
            const p1Accounts = getDisplaySocialAccounts(record.partner1);
            const p2Accounts = getDisplaySocialAccounts(record.partner2);
            const hasSocial = p1Accounts.length > 0 || p2Accounts.length > 0;
            if (!record.settings.showSocialHandles || !hasSocial) return null;

            return (
              <div className="flex flex-wrap items-center justify-center gap-2 text-[9px] sm:text-[9.5px] text-[#C9CCE4] font-medium tracking-wider pt-0.5" dir="ltr">
                <span className="uppercase text-[#C9CCE4] font-bold text-[8.5px] tracking-widest">{t.connectedProfiles}</span>
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

          {/* Verification Bar & Seal */}
          <div className="pt-2 pb-1 border-t border-white/20 flex items-center justify-between gap-3">
            <div className={styles.concentricSeal} style={{ width: '64px', height: '64px' }}>
              <Shield className="w-4 h-4 text-white stroke-[2.2]" />
              <span className="text-[6.5px] font-black text-white tracking-[0.2em] uppercase mt-0.5">
                {t.verifiedBadgeUpper}
              </span>
            </div>

            <div className="flex-1 text-left" dir="ltr">
              <div className="text-[8.5px] sm:text-[9px] font-bold tracking-[0.16em] uppercase text-[#C9CCE4]">
                {t.verificationRefLabel}
              </div>
              <div className="text-xs sm:text-sm font-mono font-bold text-white tracking-widest mt-0.5">
                {record.verificationRef}
              </div>
              <div className="text-[8.5px] text-[#C9CCE4] mt-0.5">
                {t.issuedDateLabel} {language === 'ar' ? record.issuedDateAr : record.issuedDate}
              </div>
            </div>
          </div>

          {/* Scan Reference & QR Matrix (Conditional on Toggle 3) */}
          {record.settings.showQrMatrix && (
            <div className="pt-2 border-t border-white/20 flex items-center justify-between gap-3">
              <div className="text-left" dir="ltr">
                <div className="text-[8.5px] sm:text-[9px] font-bold tracking-[0.16em] uppercase text-[#C9CCE4]">
                  {t.scanRefTitle}
                </div>
                <p className="text-[9px] text-[#C9CCE4]/90 mt-0.5 max-w-[200px] leading-relaxed">
                  {t.scanRefDesc}
                </p>
              </div>

              <div className="shrink-0 bg-white p-1 rounded-md shadow-sm">
                <QRCodeSVG value={`${window.location.origin}/verify/${encodeURIComponent(record.verificationRef)}`} size={32} bgColor="#ffffff" fgColor="#182849" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Control Dashboard Panel with Live Toggles */}
      <div className="my-2 w-full rounded-xl border border-white/20 p-3.5 bg-[#202B52] shadow-xl text-right">
        {/* Header */}
        <div className="flex items-center pb-2 mb-2.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#2C345F] border border-[#C1C3E6]/30 flex items-center justify-center text-[#C1C3E6]">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white tracking-wide">
                {t.dashboardPanelTitle}
              </h3>
              <span className="text-[9px] text-[#C9CCE4] block font-normal">
                {t.dashboardPanelDesc}
              </span>
            </div>
          </div>
        </div>

        {/* Toggle List */}
        <div className="flex flex-col gap-2">
          {/* Toggle 1: Social Accounts */}
          <div className={styles.toggleRow}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#2C345F] flex items-center justify-center text-[#C1C3E6]">
                <AtSign className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[11px] font-semibold text-white">
                  {t.toggleSocialTitle}
                </span>
                <span className="text-[8.5px] text-[#C9CCE4]">
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
              <div className="w-8 h-4 rounded-full bg-[#172244] peer-checked:bg-[#C1C3E6] transition-colors relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] peer-checked:after:left-[18px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all" />
            </label>
          </div>


          {/* Toggle: Public Contact Search Consent */}
          <div className={styles.toggleRow}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#2C345F] flex items-center justify-center text-[#C1C3E6]">
                <Settings className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[11px] font-semibold text-white">
                  {t.toggleContactSearchTitle}
                </span>
                <span className="text-[8.5px] text-[#C9CCE4]">
                  {t.toggleContactSearchDesc}
                </span>
              </div>
            </div>
            <label className={styles.toggleSwitch}>
              <input
                type="checkbox"
                checked={
                  record.p1Uid === currentUserId
                    ? Boolean(record.settings.publicContactSearchP1)
                    : Boolean(record.settings.publicContactSearchP2)
                }
                onChange={(e) => {
                  const isP1 = record.p1Uid === currentUserId;
                  onUpdateSettings(
                    isP1
                      ? { publicContactSearchP1: e.target.checked }
                      : { publicContactSearchP2: e.target.checked }
                  );
                }}
                className="sr-only peer"
              />
              <div className="w-8 h-4 rounded-full bg-[#172244] peer-checked:bg-[#C1C3E6] transition-colors relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] peer-checked:after:left-[18px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all" />
            </label>
          </div>

          {/* Toggle 3: QR Code Matrix */}
          <div className={styles.toggleRow}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#2C345F] flex items-center justify-center text-[#C1C3E6]">
                <QrCode className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[11px] font-semibold text-white">
                  {t.toggleQrTitle}
                </span>
                <span className="text-[8.5px] text-[#C9CCE4]">
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
              <div className="w-8 h-4 rounded-full bg-[#172244] peer-checked:bg-[#C1C3E6] transition-colors relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] peer-checked:after:left-[18px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all" />
            </label>
          </div>
        </div>

        {/* Action Buttons inside Dashboard */}
        <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-white/10">
          <button
            type="button"
            onClick={() => setShowChangeModal(true)}
            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[10.5px] font-medium text-[#C1C3E6] transition-colors border border-[#C1C3E6]/35 bg-[#C1C3E6]/15 hover:bg-[#C1C3E6]/25 active:scale-[0.98] cursor-pointer relative"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{t.requestChangeBtn}</span>
            {pendingRequestsForMe.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping absolute top-1 right-1" />
            )}
          </button>

          <button
            type="button"
            onClick={onViewCertificate}
            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[10.5px] font-medium text-slate-200 transition-colors border border-white/20 bg-[#172244] hover:bg-white/5 active:scale-[0.98] cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-[#C9CCE4]" />
            <span>{t.previewPrintBtn}</span>
          </button>
        </div>

        {/* Secondary Destructive Action: End Relationship */}
        {onExitRelationship && (
          <div className="mt-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onExitRelationship}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[10.5px] font-medium text-amber-300 hover:text-amber-200 bg-amber-950/20 hover:bg-amber-950/35 border border-amber-500/25 transition-colors cursor-pointer active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              aria-label={language === 'ar' ? 'إنهاء العلاقة' : 'End Relationship'}
            >
              <HeartOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{t.endRelationshipMenu}</span>
            </button>
          </div>
        )}
      </div>

      {/* Pending Approval Notice if any */}
      {pendingRequestsForMe.length > 0 && (
        <div className="my-1.5 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-center justify-between gap-2 shadow-sm text-right">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-300 shrink-0" />
            <div className="text-[11px]">
              <span className="text-amber-200 font-bold block">{t.pendingRequestsTitle}</span>
              <span className="text-amber-100/80 text-[10px]">
                {language === 'ar' ? 'لديك طلب تعديل معلق من شريكك بانتظار قرارك' : 'You have a pending change request from your partner'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowChangeModal(true)}
            className="py-1 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-[10.5px] font-semibold cursor-pointer shrink-0 transition"
          >
            {language === 'ar' ? 'مراجعة الطلب' : 'Review'}
          </button>
        </div>
      )}

      {pendingRequestsByMe.length > 0 && pendingRequestsForMe.length === 0 && (
        <div className="my-1.5 p-2.5 rounded-xl bg-[#202B52] border border-white/10 flex items-center justify-between gap-2 text-right">
          <div className="flex items-center gap-2 text-[10.5px] text-[#C9CCE4]">
            <Clock className="w-3.5 h-3.5 text-[#C1C3E6] shrink-0" />
            <span>
              {language === 'ar'
                ? 'تم إرسال طلب التعديل وهو بانتظار موافقة الشريك.'
                : 'Change request submitted and awaiting partner approval.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowChangeModal(true)}
            className="text-[10px] text-[#C1C3E6] underline hover:text-white cursor-pointer bg-transparent border-none p-0 shrink-0"
          >
            {language === 'ar' ? 'عرض السجل' : 'View'}
          </button>
        </div>
      )}

      {/* Main Full-Width Certificate Viewer Action */}
      <div className="mt-2 mb-1">
        <button
          type="button"
          onClick={onViewCertificate}
          className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-[#242C55] font-bold text-xs shadow-lg active:scale-[0.98] transition-all bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] hover:from-[#d0d2f0] hover:to-[#b7bddf] border border-white/20 cursor-pointer"
        >
          <Eye className="w-4 h-4" />
          <span>{t.previewAndShareCertBtn}</span>
        </button>
      </div>

      {showChangeModal && (
        <ChangeRequestModal
          language={language}
          record={record}
          currentUserId={currentUserId}
          changeRequests={changeRequests}
          onClose={() => setShowChangeModal(false)}
          onSubmitChangeRequest={handleSubmitChangeRequest}
          onSavePersonalInfo={handleSavePersonalInfo}
          onApproveRequest={handleApproveRequest}
          onDeclineRequest={handleDeclineRequest}
        />
      )}
    </div>
  );
};
