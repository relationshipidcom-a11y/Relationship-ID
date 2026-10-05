import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, HeartOff, X, Loader2 } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../i18n/translations';

interface AccountActionModalsProps {
  language: Language;
  showExitModal: boolean;
  showDeleteModal: boolean;
  loading: boolean;
  hasActiveRelationship?: boolean;
  error?: string;
  onCloseExitModal: () => void;
  onCloseDeleteModal: () => void;
  onConfirmExitRelationship: () => Promise<void>;
  onConfirmDeleteAccount: () => Promise<void>;
}

export const AccountActionModals: React.FC<AccountActionModalsProps> = ({
  language,
  showExitModal,
  showDeleteModal,
  loading,
  hasActiveRelationship = false,
  error,
  onCloseExitModal,
  onCloseDeleteModal,
  onConfirmExitRelationship,
  onConfirmDeleteAccount
}) => {
  const t = translations[language];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        if (showExitModal) onCloseExitModal();
        if (showDeleteModal) onCloseDeleteModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showExitModal, showDeleteModal, loading, onCloseExitModal, onCloseDeleteModal]);

  if (!showExitModal && !showDeleteModal) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          if (showExitModal) onCloseExitModal();
          if (showDeleteModal) onCloseDeleteModal();
        }
      }}
    >
      {/* EXIT RELATIONSHIP CONFIRMATION DIALOG */}
      {showExitModal && (
        <div className="w-full max-w-sm rounded-2xl bg-[#1a1530] border border-amber-500/40 p-5 shadow-2xl relative text-start space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                <HeartOff className="w-4 h-4" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                {t.exitRelationshipTitle}
              </h3>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={onCloseExitModal}
              className="p-1 text-[#b6afd4] hover:text-white rounded-lg bg-transparent border-none cursor-pointer disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-[#b6afd4] leading-relaxed whitespace-pre-line">
            {t.exitRelationshipDesc}
          </p>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              disabled={loading}
              onClick={onCloseExitModal}
              className="flex-1 py-2 px-3 rounded-xl border border-white/20 bg-[#211c38] text-xs font-semibold text-[#b6afd4] hover:text-white transition cursor-pointer disabled:opacity-50"
            >
              {t.cancelBtn}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void onConfirmExitRelationship()}
              className="flex-1 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{loading ? t.actionLoadingText : t.confirmExitRelationshipBtn}</span>
            </button>
          </div>
        </div>
      )}

      {/* DELETE MY ACCOUNT DESTRUCTIVE CONFIRMATION DIALOG */}
      {showDeleteModal && (
        <div className="w-full max-w-sm rounded-2xl bg-[#1a1530] border border-rose-500/40 p-5 shadow-2xl relative text-start space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                {t.deleteAccountTitle}
              </h3>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={onCloseDeleteModal}
              className="p-1 text-[#b6afd4] hover:text-white rounded-lg bg-transparent border-none cursor-pointer disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-[#b6afd4] leading-relaxed whitespace-pre-line">
            {hasActiveRelationship ? t.deleteAccountDesc : t.deleteAccountDescNoRelationship}
          </p>

          <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            <span className="font-semibold">{language === 'ar' ? 'لا يمكن التراجع عن هذا الإجراء.' : 'This cannot be undone.'}</span>
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              disabled={loading}
              onClick={onCloseDeleteModal}
              className="flex-1 py-2 px-3 rounded-xl border border-white/20 bg-[#211c38] text-xs font-semibold text-[#b6afd4] hover:text-white transition cursor-pointer disabled:opacity-50"
            >
              {t.cancelBtn}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void onConfirmDeleteAccount()}
              className="flex-1 py-2 px-3 rounded-xl bg-rose-700 hover:bg-rose-600 text-xs font-semibold text-white transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{loading ? t.actionLoadingText : t.confirmDeleteAccountBtn}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
