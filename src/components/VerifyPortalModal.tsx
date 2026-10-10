import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle, AlertCircle, X, Loader2, Search, QrCode } from 'lucide-react';
import { Language, RelationshipRecord, RelationshipType } from '../types';
import { translations } from '../i18n/translations';
import { withAppCheckHeaders } from '../utils/api';

interface VerifyPortalModalProps {
  language: Language;
  isOpen: boolean;
  onClose: () => void;
  record?: RelationshipRecord;
  initialRef?: string;
}

interface PublicVerificationRecord {
  recordNumber?: string;
  verificationRef?: string;
  issuedDate?: string;
  issuedDateAr?: string;
  type?: RelationshipType;
  stage?: string;
  startDate?: string;
  startDateAr?: string;
  partner1Name?: string;
  partner2Name?: string;
  partner1En?: string;
  partner2En?: string;
  status?: string;
}

export const VerifyPortalModal: React.FC<VerifyPortalModalProps> = ({ language, isOpen, onClose, record, initialRef = '' }) => {
  const t = translations[language];
  const [searchMode, setSearchMode] = useState<'ref' | 'contact'>('ref');
  const [searchRef, setSearchRef] = useState(initialRef || '');
  const [searchResult, setSearchResult] = useState<PublicVerificationRecord | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runSearch = async (rawInput: string, mode: 'ref' | 'contact') => {
    setHasSearched(true);
    setLoading(true);
    setError('');
    setSearchResult(null);
    try {
      const query = rawInput.trim();
      if (!query) {
        throw new Error(language === 'ar' ? 'أدخل معلومات البحث.' : 'Enter search information.');
      }

      if (mode === 'ref') {
        const headers = await withAppCheckHeaders();
        const response = await fetch(`/api/verify/${encodeURIComponent(query)}`, { headers });
        let data: any = {};
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('Verification response was not JSON', parseError);
        }
        if (!response.ok || !data.found) {
          if (response.status !== 404) {
            setError(data.message || data.error || `HTTP_${response.status}`);
          } else {
            setError(language === 'ar' ? 'لا يوجد سجل نشط متاح للبحث العام' : 'No publicly searchable active record');
          }
          return;
        }
        setSearchResult(data.record as PublicVerificationRecord);
      } else {
        const headers = await withAppCheckHeaders({ 'Content-Type': 'application/json' });
        const response = await fetch('/api/verify/contact', {
          method: 'POST',
          headers,
          body: JSON.stringify({ query })
        });
        let data: any = {};
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('Contact verification response was not JSON', parseError);
        }
        if (response.status === 429) {
          setError(
            language === 'ar'
              ? 'طلبات كثيرة جداً. يرجى المحاولة لاحقاً.'
              : 'Too many requests. Please try again later.'
          );
          return;
        }
        if (response.status === 503) {
          setError(
            language === 'ar'
              ? 'الخدمة غير متوفرة مؤقتاً. يرجى المحاولة لاحقاً.'
              : 'Service temporarily unavailable. Please try again later.'
          );
          return;
        }
        if (!response.ok || !data.found || !data.stage) {
          setError(
            language === 'ar'
              ? 'لا يوجد سجل نشط متاح للبحث العام'
              : 'No publicly searchable active record'
          );
          return;
        }
        setSearchResult({ stage: data.stage, status: 'active' });
      }
    } catch (err) {
      setError(
        language === 'ar'
          ? 'الخدمة غير متوفرة مؤقتاً. يرجى المحاولة لاحقاً.'
          : 'Service temporarily unavailable. Please try again later.'
      );
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
    setSearchMode('ref');
    if (nextRef) void runSearch(nextRef, 'ref');
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
    await runSearch(searchRef, searchMode);
  };

  const getStageLabel = (type?: RelationshipType) => {
    if (!type) return '';
    if (type === 'marriage') return language === 'ar' ? 'متزوجان (Married)' : 'Married';
    if (type === 'engagement') return language === 'ar' ? 'مخطوبان (Engaged)' : 'Engaged';
    return language === 'ar' ? 'في علاقة تعارف (Dating)' : 'Dating';
  };

  return (
    <div role="dialog" aria-modal="true" onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[420px] bg-[#202B52] border border-white/20 rounded-2xl p-5 shadow-2xl relative text-start" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#2C345F] text-[#C1C3E6] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white leading-tight">{t.verifyPortalTitle}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
              className="w-10 h-10 rounded-full bg-[#172244] text-[#C9CCE4] hover:text-white flex items-center justify-center cursor-pointer border border-white/10 focus:outline-none focus:ring-2 focus:ring-[#C1C3E6]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-base sm:text-sm text-[#C9CCE4] mt-2 mb-3 leading-relaxed">
          {t.verifyPortalDesc}
        </p>

        {/* Search Mode Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#172244] rounded-xl border border-white/10 mb-3">
          <button
            type="button"
            onClick={() => {
              setSearchMode('ref');
              setSearchResult(null);
              setHasSearched(false);
              setError('');
            }}
            className={`py-2 px-2.5 rounded-lg text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              searchMode === 'ref'
                ? 'bg-[#C1C3E6] text-[#242C55] shadow'
                : 'text-[#C9CCE4] hover:text-white bg-transparent'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>{t.searchByRefTab}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchMode('contact');
              setSearchResult(null);
              setHasSearched(false);
              setError('');
            }}
            className={`py-2 px-2.5 rounded-lg text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              searchMode === 'contact'
                ? 'bg-[#C1C3E6] text-[#242C55] shadow'
                : 'text-[#C9CCE4] hover:text-white bg-transparent'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>{t.searchByContactTab}</span>
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchRef}
            onChange={(e) => setSearchRef(e.target.value)}
            placeholder={searchMode === 'ref' ? t.verifyInputPlaceholder : t.verifyContactInputPlaceholder}
            className="flex-1 bg-[#172244] border border-white/20 text-white rounded-xl px-3 py-2 text-base font-mono focus:outline-none focus:ring-2 focus:ring-[#C1C3E6]"
            dir={searchMode === 'ref' ? 'ltr' : 'auto'}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !searchRef.trim()}
            className="px-4 py-2 bg-gradient-to-r from-[#C1C3E6] to-[#A9AFD7] hover:from-[#d0d2f0] hover:to-[#b7bddf] text-[#242C55] font-semibold text-sm rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#C1C3E6] shrink-0"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{loading ? (language === 'ar' ? 'جاري التحقق...' : 'Verifying...') : t.verifyBtn}</span>
          </button>
        </form>

        {searchResult ? (
          searchMode === 'contact' ? (
            <div className="p-4 rounded-xl bg-[#172244] border border-white/20 text-center space-y-1.5">
              <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-bold text-sm">
                <CheckCircle className="w-4 h-4" />
                <span>{language === 'ar' ? 'تم العثور على علاقة نشطة' : 'Active Relationship Found'}</span>
              </div>
              <p className="text-sm text-[#C9CCE4]">
                {language === 'ar' ? 'مرحلة العلاقة' : 'Relationship Stage'}
              </p>
              <p className="text-base font-bold text-[#C1C3E6]">
                {searchResult.stage}
              </p>
            </div>
          ) : searchResult.status === 'active' ? (
            <div className="p-3.5 rounded-xl bg-[#172244] border border-white/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[#C1C3E6] font-bold text-sm">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>{t.validRecordFound}</span>
                </div>
                <span className="text-sm font-mono text-[#C1C3E6] bg-[#2C345F] px-2 py-0.5 rounded border border-[#C1C3E6]/30" dir="ltr">
                  {searchResult.verificationRef}
                </span>
              </div>
              <div className="text-sm text-white pt-1 space-y-1.5 border-t border-white/10">
                <p className="font-bold text-sm sm:text-base text-[#C1C3E6]">
                  {language === 'ar' ? searchResult.partner1Name : (searchResult.partner1En || searchResult.partner1Name)} &amp; {language === 'ar' ? searchResult.partner2Name : (searchResult.partner2En || searchResult.partner2Name)}
                </p>
                <p className="text-sm text-[#C9CCE4]">
                  {language === 'ar' ? 'مرحلة العلاقة' : 'Relationship Stage'}:{' '}
                  <span className="text-white font-medium">{getStageLabel(searchResult.type)}</span>
                </p>
                <p className="text-sm text-[#C9CCE4]">
                  {language === 'ar' ? 'تاريخ بداية العلاقة' : 'Start Date'}:{' '}
                  <span className="text-white font-medium">{language === 'ar' ? (searchResult.startDateAr || searchResult.startDate) : searchResult.startDate}</span>
                </p>
                <p className="text-sm text-[#C9CCE4]">
                  {language === 'ar' ? 'الحالة' : 'Status'}:{' '}
                  <span className="text-emerald-400 font-semibold">{language === 'ar' ? 'نشطة (Active)' : 'Active'}</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-[#172244] border border-amber-500/40 flex items-start gap-2.5 text-amber-300 text-sm">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{t.recordInactive}</span>
            </div>
          )
        ) : hasSearched && !loading ? (
          <div className="p-3.5 rounded-xl bg-[#172244] border border-rose-500/40 flex items-start gap-2.5 text-rose-300 text-sm">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error || (language === 'ar' ? 'لا يوجد سجل نشط متاح للبحث العام' : 'No publicly searchable active record')}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
