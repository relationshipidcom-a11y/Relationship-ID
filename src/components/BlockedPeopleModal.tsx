import React, { useEffect, useState } from 'react';
import { UserX, X, Loader2, ShieldCheck } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../i18n/translations';
import { authFetch, parseApiError, getLocalizedErrorMessage } from '../utils/api';

interface BlockedPerson {
  p1Uid: string;
  p1DisplayName: string;
  blockedAt: string | null;
}

interface BlockedPeopleModalProps {
  language: Language;
  isOpen: boolean;
  onClose: () => void;
}

export const BlockedPeopleModal: React.FC<BlockedPeopleModalProps> = ({
  language,
  isOpen,
  onClose
}) => {
  const t = translations[language];
  const [blocks, setBlocks] = useState<BlockedPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingUid, setActionLoadingUid] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchBlocks = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/blocks');
      const data = await parseApiError(res);
      if (Array.isArray(data.blocks)) {
        setBlocks(data.blocks);
      }
    } catch (err) {
      setError(getLocalizedErrorMessage(err, language));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchBlocks();
    }
  }, [isOpen, language]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !actionLoadingUid) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, actionLoadingUid, onClose]);

  const handleUnblock = async (p1Uid: string) => {
    setActionLoadingUid(p1Uid);
    setError('');
    try {
      const res = await authFetch(`/api/blocks/${p1Uid}`, {
        method: 'DELETE'
      });
      await parseApiError(res);
      setBlocks((prev) => prev.filter((b) => b.p1Uid !== p1Uid));
    } catch (err) {
      setError(getLocalizedErrorMessage(err, language));
    } finally {
      setActionLoadingUid(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !actionLoadingUid) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-[#202B52] border border-amber-500/40 p-5 shadow-2xl relative text-start space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <UserX className="w-5 h-5 text-amber-400" />
            <h3 className="text-base sm:text-lg font-bold text-white tracking-wide">
              {t.blockedPeopleTitle}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(actionLoadingUid)}
            aria-label={t.cancelBtn}
            className="w-10 h-10 rounded-full bg-[#172244] hover:bg-[#202B52] text-[#C9CCE4] hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10 disabled:opacity-50 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-950/60 border border-red-500/40 rounded-xl text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="min-h-[140px] max-h-[300px] overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
              <span className="text-sm">{t.actionLoadingText}</span>
            </div>
          ) : blocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2 text-center">
              <ShieldCheck className="w-7 h-7 text-emerald-400/60" />
              <span className="text-sm text-gray-300">{t.noBlockedPeople}</span>
            </div>
          ) : (
            blocks.map((person) => (
              <div
                key={person.p1Uid}
                className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:border-amber-500/30 transition-colors"
              >
                <div className="space-y-0.5">
                  <p className="text-sm sm:text-base font-semibold text-white">
                    {person.p1DisplayName || 'Partner'}
                  </p>
                  {person.blockedAt && (
                    <p className="text-sm text-gray-400">
                      {t.blockedAtLabel}: {new Date(person.blockedAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US')}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleUnblock(person.p1Uid)}
                  disabled={actionLoadingUid === person.p1Uid}
                  className="px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 min-h-[40px] cursor-pointer"
                >
                  {actionLoadingUid === person.p1Uid && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  {t.unblock}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="pt-2 border-t border-white/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(actionLoadingUid)}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-200 text-sm font-semibold transition-colors min-h-[44px] cursor-pointer"
          >
            {t.cancelBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
