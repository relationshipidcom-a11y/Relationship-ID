import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle, AlertCircle, X, Loader2 } from 'lucide-react';
import { Language, RelationshipRecord, RelationshipType } from '../types';
import { translations } from '../i18n/translations';

interface VerifyPortalModalProps {
  language: Language;
  isOpen: boolean;
  onClose: () => void;
  record?: RelationshipRecord;
  initialRef?: string;
}

interface PublicVerificationRecord {
  recordNumber: string;
  verificationRef: string;
  issuedDate: string;
  issuedDateAr: string;
  type: RelationshipType;
  startDate: string;
  startDateAr: string;
  partner1Name: string;
  partner2Name: string;
  partner1En?: string;
  partner2En?: string;
  status: string;
}

export const VerifyPortalModal: React.FC<VerifyPortalModalProps> = ({ language, isOpen, onClose, record, initialRef = '' }) => {
  const t = translations[language];
  const [searchRef, setSearchRef] = useState(initialRef || '');
  const [searchResult, setSearchResult] = useState<PublicVerificationRecord | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runSearch = async (rawRef: string) => {
    setHasSearched(true);
    setLoading(true);
    setError('');
    setSearchResult(null);
    try {
      const ref = rawRef.trim();
      if (!ref) throw new Error(language === 'ar' ? 'أدخل رقم التحقق.' : 'Enter a verification number.');
      const response = await fetch(`/api/verify/${encodeURIComponent(ref)}`);
      let data: any = {};
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Verification response was not JSON', parseError);
      }
      if (!response.ok || !data.found) {
        if (response.status !== 404) setError(data.message || data.error || `HTTP_${response.status}`);
        return;
      }
      setSearchResult(data.record as PublicVerificationRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification request failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const nextRef = initialRef || '';
    setSearchRef(nextRef);
    setSearchResult(null);
    setHasSearched(false);
    setError('');
    if (nextRef) void runSearch(nextRef);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialRef]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onClose();
      }
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    await runSearch(searchRef);
  };

  const getStageLabel = (type: RelationshipType) => {
    if (type === 'marriage') return language === 'ar' ? 'متزوجان' : 'Married';
    if (type === 'engagement') return language === 'ar' ? 'مخطوبان' : 'Engaged';
    return language === 'ar' ? 'في علاقة تعارف' : 'In a Relationship';
  };

  return (
    <div role="dialog" aria-modal="true" onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[420px] bg-[#1a1530] border border-white/20 rounded-2xl p-5 shadow-2xl relative text-start" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#9b6682]/30 text-[#f3c4db] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-white leading-tight">{t.verifyPortalTitle}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
              className="w-7 h-7 rounded-full bg-[#211c38] text-[#b6afd4] hover:text-white flex items-center justify-center cursor-pointer border border-white/10 focus:outline-none focus:ring-2 focus:ring-[#9b6682]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-xs text-[#b6afd4] mt-2 mb-3 leading-relaxed">
          {t.verifyPortalDesc}
        </p>

        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchRef}
            onChange={(e) => setSearchRef(e.target.value)}
            placeholder={t.verifyInputPlaceholder}
            className="flex-1 bg-[#141124] border border-white/20 text-white rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#9b6682]"
            dir="ltr"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !searchRef.trim()}
            className="px-4 py-2 bg-[#9b6682] hover:bg-[#a9718f] text-white font-semibold text-xs rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#9b6682] shrink-0"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{loading ? (language === 'ar' ? 'جاري التحقق...' : 'Verifying...') : t.verifyBtn}</span>
          </button>
        </form>

        {searchResult ? (
          searchResult.status === 'active' ? (
            <div className="p-3.5 rounded-xl bg-[#211c38] border border-[#9b6682]/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[#f3c4db] font-bold text-xs">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>{t.validRecordFound}</span>
                </div>
                <span className="text-[9px] font-mono text-[#f3c4db] bg-[#9b6682]/20 px-2 py-0.5 rounded" dir="ltr">
                  {searchResult.verificationRef}
                </span>
              </div>
              <div className="text-xs text-white pt-1 space-y-1.5 border-t border-white/10">
                <p className="font-bold text-sm text-[#f3c4db]">
                  {language === 'ar' ? searchResult.partner1Name : (searchResult.partner1En || searchResult.partner1Name)} &amp; {language === 'ar' ? searchResult.partner2Name : (searchResult.partner2En || searchResult.partner2Name)}
                </p>
                <p className="text-[11px] text-[#b6afd4]">
                  {language === 'ar' ? 'مرحلة العلاقة' : 'Stage'}:{' '}
                  <span className="text-white font-medium">{getStageLabel(searchResult.type)}</span>
                </p>
                <p className="text-[11px] text-[#b6afd4]">
                  {language === 'ar' ? 'تاريخ بداية العلاقة' : 'Start Date'}:{' '}
                  <span className="text-white font-medium">{language === 'ar' ? (searchResult.startDateAr || searchResult.startDate) : searchResult.startDate}</span>
                </p>
                <p className="text-[11px] text-[#b6afd4]">
                  {language === 'ar' ? 'الحالة' : 'Status'}:{' '}
                  <span className="text-emerald-400 font-semibold">{language === 'ar' ? 'نشطة' : 'Active'}</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-[#211c38] border border-amber-500/40 flex items-start gap-2.5 text-amber-300 text-xs">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{t.recordInactive}</span>
            </div>
          )
        ) : hasSearched && !loading ? (
          <div className="p-3.5 rounded-xl bg-[#211c38] border border-rose-500/40 flex items-start gap-2.5 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error || t.recordNotFound}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
