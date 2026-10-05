import React, { useState, useEffect } from 'react';
import { Settings, Eye, Edit3, Shield, AtSign, QrCode, Clock, CheckCircle2, HeartOff } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Language, RelationshipRecord, CertificateSettings, ChangeRequest } from '../types';
import { translations } from '../i18n/translations';
import { ChangeRequestModal } from './ChangeRequestModal';
import { authFetch, parseApiError } from '../utils/api';
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

  const handleSavePersonalInfo = async (personalData: { socialHandle?: string; fullNameEn?: string; whatsappNumber?: string; whatsappCountry?: string }) => {
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
        <div className="flex items-center pb-2 mb-2.5 border-b border-white/10">
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


          {/* Toggle: Public Contact Search Consent */}
          <div className={styles.toggleRow}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#9b6682]/15 flex items-center justify-center text-[#f3c4db]">
                <Settings className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[11px] font-semibold text-white">
                  {t.toggleContactSearchTitle}
                </span>
                <span className="text-[8.5px] text-[#b6afd4]">
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
            onClick={() => setShowChangeModal(true)}
            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[10.5px] font-medium text-[#f3c4db] transition-colors border border-[#f3c4db]/35 bg-[#9b6682]/20 hover:bg-[#9b6682]/35 active:scale-[0.98] cursor-pointer relative"
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
            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[10.5px] font-medium text-slate-200 transition-colors border border-white/20 bg-[#211c38] hover:bg-white/5 active:scale-[0.98] cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-[#b6afd4]" />
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
        <div className="my-1.5 p-2.5 rounded-xl bg-[#211c38] border border-white/10 flex items-center justify-between gap-2 text-right">
          <div className="flex items-center gap-2 text-[10.5px] text-[#b6afd4]">
            <Clock className="w-3.5 h-3.5 text-[#f3c4db] shrink-0" />
            <span>
              {language === 'ar'
                ? 'تم إرسال طلب التعديل وهو بانتظار موافقة الشريك.'
                : 'Change request submitted and awaiting partner approval.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowChangeModal(true)}
            className="text-[10px] text-[#f3c4db] underline hover:text-white cursor-pointer bg-transparent border-none p-0 shrink-0"
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
          className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-white font-bold text-xs shadow-lg active:scale-[0.98] transition-all bg-gradient-to-r from-[#9b6682] to-[#7d4865] border border-[#f3c4db]/30 cursor-pointer"
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
