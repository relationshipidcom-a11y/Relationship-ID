import React, { useState } from 'react';
import { Shield, Lock, CheckCircle2, XCircle, Clock, AlertCircle, Send, User, Users, History, Save, X } from 'lucide-react';
import { Language, RelationshipRecord, ChangeRequest, RelationshipType, SocialAccount } from '../types';
import { translations } from '../i18n/translations';
import { SocialAccountsEditor } from './SocialAccountsEditor';

interface ChangeRequestModalProps {
  language: Language;
  record: RelationshipRecord;
  currentUserId?: string;
  changeRequests: ChangeRequest[];
  onClose: () => void;
  onSubmitChangeRequest: (field: string, proposedValue: string) => Promise<void>;
  onSavePersonalInfo: (personalData: {
    socialHandle?: string;
    socialAccounts?: SocialAccount[];
    fullNameEn?: string;
    whatsappNumber?: string;
    whatsappCountry?: string;
  }) => Promise<void>;
  onApproveRequest: (requestId: string) => Promise<void>;
  onDeclineRequest: (requestId: string) => Promise<void>;
}

export const ChangeRequestModal: React.FC<ChangeRequestModalProps> = ({
  language,
  record,
  currentUserId,
  changeRequests,
  onClose,
  onSubmitChangeRequest,
  onSavePersonalInfo,
  onApproveRequest,
  onDeclineRequest
}) => {
  const t = translations[language];
  const isP1 = currentUserId ? record.p1Uid === currentUserId : true;
  const isP2 = currentUserId ? record.p2Uid === currentUserId : false;

  const myData = isP1 ? record.partner1 : record.partner2;
  const partnerData = isP1 ? record.partner2 : record.partner1;
  const partnerLabel = isP1 ? (language === 'ar' ? 'الشريك الثاني' : 'Partner 2') : (language === 'ar' ? 'الشريك الأول' : 'Partner 1');

  const [activeTab, setActiveTab] = useState<'my_info' | 'shared_info' | 'history'>('my_info');

  // Personal Info form state
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>(() => {
    if (Array.isArray(myData.socialAccounts) && myData.socialAccounts.length > 0) {
      return myData.socialAccounts;
    }
    if (myData.socialHandle && myData.socialHandle.trim()) {
      return [{ platform: 'instagram', handle: myData.socialHandle.trim().replace(/^@/, '') }];
    }
    return [];
  });
  const [fullNameEn, setFullNameEn] = useState(myData.fullNameEn || '');
  const [whatsappNumber, setWhatsappNumber] = useState(myData.whatsappNumber || '');
  const [whatsappCountry, setWhatsappCountry] = useState(myData.whatsappCountry || 'SA +966');
  const [personalSaving, setPersonalSaving] = useState(false);
  const [personalSuccess, setPersonalSuccess] = useState('');
  const [personalError, setPersonalError] = useState('');

  // Shared Change Request form state
  const [selectedField, setSelectedField] = useState<'type' | 'startDate' | 'myName'>('type');
  const [proposedType, setProposedType] = useState<RelationshipType>(record.type);
  const [proposedStartDate, setProposedStartDate] = useState(record.startDateIso || '');
  const [proposedName, setProposedName] = useState(myData.fullName);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState('');
  const [requestError, setRequestError] = useState('');

  // Action loading states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setPersonalError('');
    setPersonalSuccess('');
    setPersonalSaving(true);
    try {
      const cleanedSocialAccounts = socialAccounts
        .map((a) => ({ platform: a.platform, handle: a.handle.trim() }))
        .filter((a) => a.handle.length > 0);

      await onSavePersonalInfo({
        socialAccounts: cleanedSocialAccounts,
        socialHandle: cleanedSocialAccounts.length > 0 ? cleanedSocialAccounts[0].handle.replace(/^@/, '') : undefined,
        fullNameEn,
        whatsappNumber,
        whatsappCountry
      });
      setPersonalSuccess(t.personalInfoSaved);
      setTimeout(() => setPersonalSuccess(''), 4000);
    } catch (err) {
      setPersonalError(err instanceof Error ? err.message : 'Unable to save personal information');
    } finally {
      setPersonalSaving(false);
    }
  };

  const handleSubmitShared = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError('');
    setRequestSuccess('');
    setRequestSubmitting(true);
    try {
      let fieldKey = 'type';
      let value = '';

      if (selectedField === 'type') {
        fieldKey = 'type';
        value = proposedType;
      } else if (selectedField === 'startDate') {
        fieldKey = 'startDate';
        value = proposedStartDate;
      } else if (selectedField === 'myName') {
        fieldKey = isP1 ? 'partner1FullName' : 'partner2FullName';
        value = proposedName.trim();
      }

      await onSubmitChangeRequest(fieldKey, value);
      setRequestSuccess(t.changeRequestSubmitted);
      setTimeout(() => setRequestSuccess(''), 5000);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Unable to submit change request');
    } finally {
      setRequestSubmitting(false);
    }
  };

  const handleApprove = async (id: string) => {
    setActionLoadingId(id);
    try {
      await onApproveRequest(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error approving request');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDecline = async (id: string) => {
    setActionLoadingId(id);
    try {
      await onDeclineRequest(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error declining request');
    } finally {
      setActionLoadingId(null);
    }
  };

  const pendingRequestsForMe = changeRequests.filter(
    (cr) => cr.status === 'pending' && currentUserId && cr.approverUid === currentUserId
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-request-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#202B52] border border-[#4E5A8E]/40 p-4 sm:p-5 shadow-2xl relative text-start space-y-4 max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#C1C3E6]/20 border border-[#C1C3E6]/40 flex items-center justify-center text-[#C1C3E6] shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 id="change-request-modal-title" className="text-sm sm:text-base font-bold text-white leading-tight">
                {t.requestChangeBtn}
              </h3>
              <p className="text-[10px] text-[#C9CCE4] mt-0.5">
                {language === 'ar' ? 'إدارة وتعديل بيانات السجل والشهادة' : 'Manage & update record and certificate details'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
              className="p-1.5 rounded-lg text-[#C9CCE4] hover:text-white hover:bg-white/10 transition-colors cursor-pointer bg-transparent border-none"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Pending Requests Banner for Approver */}
        {pendingRequestsForMe.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-2 shrink-0">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
              <Clock className="w-4 h-4 shrink-0" />
              <span>{t.partnerRequestedChange}</span>
            </div>
            {pendingRequestsForMe.map((cr) => (
              <div key={cr.id} className="bg-black/30 p-2.5 rounded-lg border border-amber-500/20 text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px] text-[#C9CCE4]">
                  <span className="font-semibold text-white">{language === 'ar' ? cr.fieldLabelAr : cr.fieldLabelEn}</span>
                  <span className="text-[10px] text-amber-300 font-mono">
                    {new Date(cr.requestedAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-white/5 p-1.5 rounded">
                    <span className="text-[9px] text-[#9FA5C7] block">{language === 'ar' ? 'القيمة الحالية:' : 'Current:'}</span>
                    <span className="text-white font-medium">{language === 'ar' ? (cr.oldValueDisplayAr || cr.oldValue) : (cr.oldValueDisplayEn || cr.oldValue)}</span>
                  </div>
                  <div className="bg-[#C1C3E6]/20 p-1.5 rounded border border-[#C1C3E6]/30">
                    <span className="text-[9px] text-[#C1C3E6] block">{language === 'ar' ? 'القيمة المقترحة:' : 'Proposed:'}</span>
                    <span className="text-white font-semibold">{language === 'ar' ? (cr.proposedValueDisplayAr || cr.proposedValue) : (cr.proposedValueDisplayEn || cr.proposedValue)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={actionLoadingId === cr.id}
                    onClick={() => void handleApprove(cr.id)}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{actionLoadingId === cr.id ? '...' : t.approveBtn}</span>
                  </button>
                  <button
                    type="button"
                    disabled={actionLoadingId === cr.id}
                    onClick={() => void handleDecline(cr.id)}
                    className="py-1.5 px-3 rounded-lg bg-rose-900/60 hover:bg-rose-900 border border-rose-500/40 text-rose-100 text-xs transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{t.declineBtn}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex items-center p-1 rounded-xl bg-[rgba(193,195,230,0.08)] border border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('my_info')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'my_info' ? 'bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] text-[#242C55] shadow-sm' : 'text-[#C9CCE4] hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>{t.myInformationTitle}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('shared_info')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'shared_info' ? 'bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] text-[#242C55] shadow-sm' : 'text-[#C9CCE4] hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{t.sharedInfoTitle}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'history' ? 'bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] text-[#242C55] shadow-sm' : 'text-[#C9CCE4] hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>{t.changeHistoryTitle}</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-4">
          {/* TAB 1: My Information */}
          {activeTab === 'my_info' && (
            <div className="space-y-4">
              {/* Partner Read-Only Banner */}
              <div className="p-3 rounded-xl bg-[#252F5A] border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-white font-semibold">
                    <Lock className="w-3.5 h-3.5 text-[#C1C3E6]" />
                    <span>{partnerLabel} ({partnerData.fullName})</span>
                  </div>
                  <span className="text-[10px] text-[#9FA5C7] bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                    {language === 'ar' ? 'للقراءة فقط • محمي' : 'Read-only • Protected'}
                  </span>
                </div>
                <p className="text-[10px] text-[#C9CCE4]">
                  {t.partnerInfoReadOnly}
                </p>
              </div>

              {/* My Personal Fields Form */}
              <form onSubmit={handleSavePersonal} className="space-y-3">
                <div className="p-3 rounded-xl bg-[#252F5A] border border-white/10 space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#C1C3E6]" />
                    <span>{language === 'ar' ? 'تعديل بياناتي الشخصية المسموحة' : 'Edit My Allowed Profile Information'}</span>
                  </h4>

                  <div>
                    <label className="block text-[11px] font-medium text-[#C9CCE4] mb-1">
                      {language === 'ar' ? 'الاسم باللغة الإنجليزية (للعرض بالشهادة الإنجليزية)' : 'Full Name in English (For English Certificate)'}
                    </label>
                    <input
                      type="text"
                      value={fullNameEn}
                      onChange={(e) => setFullNameEn(e.target.value)}
                      placeholder="e.g. Rami Khalil"
                      className="w-full px-3 py-2 rounded-xl bg-[rgba(193,195,230,0.08)] border border-white/20 text-xs text-white placeholder:text-[#9FA5C7] focus:outline-none focus:border-[#C1C3E6]"
                      dir="ltr"
                    />
                  </div>

                  <SocialAccountsEditor
                    language={language}
                    accounts={socialAccounts}
                    onChange={setSocialAccounts}
                    maxAccounts={6}
                  />

                  <div>
                    <label className="block text-[11px] font-medium text-[#C9CCE4] mb-1">
                      {language === 'ar' ? 'رقم واتساب للتواصل' : 'WhatsApp Contact Number'}
                    </label>
                    <input
                      type="tel"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      placeholder="05XXXXXXXX"
                      className="w-full px-3 py-2 rounded-xl bg-[rgba(193,195,230,0.08)] border border-white/20 text-xs text-white placeholder:text-[#9FA5C7] focus:outline-none focus:border-[#C1C3E6]"
                      dir="ltr"
                    />
                  </div>

                  {/* Security Note on Verified Phone */}
                  <div className="pt-2 border-t border-white/10 flex items-start gap-2 text-[10px] text-[#9FA5C7]">
                    <Shield className="w-3.5 h-3.5 text-[#C1C3E6] shrink-0 mt-0.5" />
                    <span>
                      {language === 'ar'
                        ? `رقم الجوال الأساسي الموثق (${myData.phoneE164 || myData.phoneNumber}) والبريد الإلكتروني مرتبطان بهويتك الأمنية ولا يمكن تغييرهما إلا عبر مسار إعادة التحقق.`
                        : `Verified phone (${myData.phoneE164 || myData.phoneNumber}) and email are bound to your security identity and cannot be edited without full reverification.`}
                    </span>
                  </div>
                </div>

                {personalError && (
                  <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs">
                    {personalError}
                  </div>
                )}

                {personalSuccess && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{personalSuccess}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={personalSaving}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] hover:from-[#D0D2ED] hover:to-[#B5BBE2] text-[#242C55] font-semibold text-xs transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{personalSaving ? '...' : t.saveMyInfoBtn}</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: Shared Certificate Information */}
          {activeTab === 'shared_info' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-[#252F5A] border border-white/10 space-y-1 text-xs">
                <div className="flex items-center gap-1.5 text-white font-semibold">
                  <AlertCircle className="w-4 h-4 text-[#C1C3E6]" />
                  <span>{language === 'ar' ? 'شرط موافقة الطرفين' : 'Mutual Approval Requirement'}</span>
                </div>
                <p className="text-[10.5px] text-[#C9CCE4] leading-relaxed">
                  {t.approvalRequiredNotice}
                </p>
              </div>

              <form onSubmit={handleSubmitShared} className="space-y-3">
                <div className="p-3 rounded-xl bg-[#252F5A] border border-white/10 space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#C9CCE4] mb-1">
                      {language === 'ar' ? 'اختر الحقل المراد طلب تعديله:' : 'Select field to change:'}
                    </label>
                    <select
                      value={selectedField}
                      onChange={(e) => setSelectedField(e.target.value as 'type' | 'startDate' | 'myName')}
                      className="w-full px-3 py-2 rounded-xl bg-[rgba(193,195,230,0.08)] border border-white/20 text-xs text-white focus:outline-none focus:border-[#C1C3E6] cursor-pointer"
                    >
                      <option value="type">{language === 'ar' ? 'مرحلة الارتباط (زواج / خطوبة / تعارف)' : 'Relationship Stage (Marriage / Engagement / Dating)'}</option>
                      <option value="startDate">{language === 'ar' ? 'تاريخ بداية الارتباط' : 'Relationship Start Date'}</option>
                      <option value="myName">{language === 'ar' ? 'اسمي الكامل المعتمد بالشهادة' : 'My Certified Name on Certificate'}</option>
                    </select>
                  </div>

                  {/* Field Specific Inputs */}
                  {selectedField === 'type' && (
                    <div className="space-y-2">
                      <div className="text-[11px] text-[#9FA5C7]">
                        {language === 'ar' ? 'الحالة الحالية:' : 'Current Stage:'}{' '}
                        <span className="text-white font-semibold">
                          {record.type === 'marriage' ? (language === 'ar' ? 'زواج' : 'Marriage') : record.type === 'engagement' ? (language === 'ar' ? 'خطوبة' : 'Engagement') : (language === 'ar' ? 'تعارف' : 'Dating')}
                        </span>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#C9CCE4] mb-1">
                          {language === 'ar' ? 'الحالة المقترحة الجديدة:' : 'Proposed New Stage:'}
                        </label>
                        <select
                          value={proposedType}
                          onChange={(e) => setProposedType(e.target.value as RelationshipType)}
                          className="w-full px-3 py-2 rounded-xl bg-[rgba(193,195,230,0.08)] border border-white/20 text-xs text-white focus:outline-none focus:border-[#C1C3E6] cursor-pointer"
                        >
                          <option value="dating">{language === 'ar' ? 'تعارف (Dating)' : 'Dating'}</option>
                          <option value="engagement">{language === 'ar' ? 'خطوبة (Engagement)' : 'Engagement'}</option>
                          <option value="marriage">{language === 'ar' ? 'زواج رسمي (Marriage)' : 'Marriage'}</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {selectedField === 'startDate' && (
                    <div className="space-y-2">
                      <div className="text-[11px] text-[#9FA5C7]">
                        {language === 'ar' ? 'تاريخ البداية الحالي:' : 'Current Start Date:'}{' '}
                        <span className="text-white font-semibold">
                          {language === 'ar' ? record.startDateAr : record.startDate}
                        </span>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#C9CCE4] mb-1">
                          {language === 'ar' ? 'تاريخ البداية المقترح الجديد:' : 'Proposed New Start Date:'}
                        </label>
                        <input
                          type="date"
                          required
                          max={new Date().toISOString().slice(0, 10)}
                          value={proposedStartDate}
                          onChange={(e) => setProposedStartDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-[rgba(193,195,230,0.08)] border border-white/20 text-xs text-white focus:outline-none focus:border-[#C1C3E6]"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  )}

                  {selectedField === 'myName' && (
                    <div className="space-y-2">
                      <div className="text-[11px] text-[#9FA5C7]">
                        {language === 'ar' ? 'اسمك الحالي بالشهادة:' : 'Your Current Name on Certificate:'}{' '}
                        <span className="text-white font-semibold">{myData.fullName}</span>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#C9CCE4] mb-1">
                          {language === 'ar' ? 'الاسم المقترح الجديد بالشهادة:' : 'Proposed New Name on Certificate:'}
                        </label>
                        <input
                          type="text"
                          required
                          value={proposedName}
                          onChange={(e) => setProposedName(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-[rgba(193,195,230,0.08)] border border-white/20 text-xs text-white focus:outline-none focus:border-[#C1C3E6]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {requestError && (
                  <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs">
                    {requestError}
                  </div>
                )}

                {requestSuccess && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{requestSuccess}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={requestSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] hover:from-[#D0D2ED] hover:to-[#B5BBE2] text-[#242C55] font-semibold text-xs transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{requestSubmitting ? '...' : t.submitChangeRequestBtn}</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: Change History / Audit */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {changeRequests.length === 0 ? (
                <div className="text-center py-6 text-xs text-[#9FA5C7]">
                  {t.noChangeRequests}
                </div>
              ) : (
                changeRequests.map((cr) => {
                  const isRequester = currentUserId === cr.requesterUid;
                  const isApprover = currentUserId === cr.approverUid;

                  return (
                    <div
                      key={cr.id}
                      className={`p-3 rounded-xl border text-xs space-y-2 ${
                        cr.status === 'pending'
                          ? 'bg-amber-950/20 border-amber-500/30'
                          : cr.status === 'approved'
                          ? 'bg-emerald-950/20 border-emerald-500/30'
                          : 'bg-rose-950/20 border-rose-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">
                          {language === 'ar' ? cr.fieldLabelAr : cr.fieldLabelEn}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            cr.status === 'pending'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : cr.status === 'approved'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          {cr.status === 'pending'
                            ? (language === 'ar' ? 'معلق • بانتظار الموافقة' : 'Pending')
                            : cr.status === 'approved'
                            ? (language === 'ar' ? 'معتمد وموافق عليه' : 'Approved')
                            : (language === 'ar' ? 'مرفوض' : 'Declined')}
                        </span>
                      </div>

                      <div className="text-[11px] text-[#C9CCE4] flex items-center justify-between">
                        <span>
                          {language === 'ar' ? `مقدم الطلب: ${cr.requesterName}` : `Requester: ${cr.requesterName}`}
                        </span>
                        <span className="text-[10px] font-mono text-[#9FA5C7]">
                          {new Date(cr.requestedAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US')}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                        <div className="bg-black/30 p-2 rounded">
                          <span className="text-[9px] text-[#9FA5C7] block">{language === 'ar' ? 'السابق:' : 'Previous:'}</span>
                          <span className="text-white">{language === 'ar' ? (cr.oldValueDisplayAr || cr.oldValue) : (cr.oldValueDisplayEn || cr.oldValue)}</span>
                        </div>
                        <div className="bg-black/30 p-2 rounded">
                          <span className="text-[9px] text-[#C1C3E6] block">{language === 'ar' ? 'المقترح:' : 'Proposed:'}</span>
                          <span className="text-white font-semibold">{language === 'ar' ? (cr.proposedValueDisplayAr || cr.proposedValue) : (cr.proposedValueDisplayEn || cr.proposedValue)}</span>
                        </div>
                      </div>

                      {/* Action buttons if this request is pending and current user is approver */}
                      {cr.status === 'pending' && isApprover && (
                        <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                          <button
                            type="button"
                            disabled={actionLoadingId === cr.id}
                            onClick={() => void handleApprove(cr.id)}
                            className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t.approveBtn}</span>
                          </button>
                          <button
                            type="button"
                            disabled={actionLoadingId === cr.id}
                            onClick={() => void handleDecline(cr.id)}
                            className="py-1.5 px-3 rounded-lg bg-rose-900/60 hover:bg-rose-900 border border-rose-500/40 text-rose-100 text-xs transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{t.declineBtn}</span>
                          </button>
                        </div>
                      )}

                      {cr.status === 'pending' && isRequester && (
                        <div className="text-[10.5px] text-amber-300/90 pt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{t.awaitingPartnerDecision}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
