import React, { useState, useEffect, useRef } from 'react';
import { Globe, LogOut, ShieldCheck, MoreVertical, Edit3, HeartOff, Trash2, Home, UserX, Download } from 'lucide-react';
import { Language, ScreenId } from '../types';
import { translations } from '../i18n/translations';

interface TopBarProps {
  language: Language;
  onToggleLanguage: () => void;
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  onOpenVerifyModal?: () => void;
  onOpenBlockedModal?: () => void;
  onDownloadMyData?: () => void;
  onSignOut?: () => void;
  onAdjustInfo?: () => void;
  onExitRelationship?: () => void;
  onDeleteAccount?: () => void;
  onHome?: () => void;
  signedIn?: boolean;
  isAtHome?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  language,
  onToggleLanguage,
  currentScreen,
  onOpenVerifyModal,
  onOpenBlockedModal,
  onDownloadMyData,
  onSignOut,
  onAdjustInfo,
  onExitRelationship,
  onDeleteAccount,
  onHome,
  signedIn = false,
  isAtHome = false
}) => {
  const t = translations[language];
  const targetLanguageLabel = language === 'ar' ? 'English' : 'العربية';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const showHomeButton = signedIn && onHome && !isAtHome;

  return (
    <header className="px-4 pt-4 pb-3 border-b border-white/10 flex items-center justify-between gap-2 relative z-30">
      <div className="flex items-center gap-1.5">
        {showHomeButton && (
          <button
            onClick={onHome}
            aria-label={language === 'ar' ? 'الرئيسية' : 'Home'}
            title={language === 'ar' ? 'الرئيسية' : 'Home'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/20 bg-[#202B52] text-sm text-[#C9CCE4] hover:text-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C1C3E6] min-h-[40px]"
            type="button"
          >
            <Home className="w-4 h-4 text-[#C1C3E6]" />
            <span className="font-medium hidden sm:inline">{t.homeBtn}</span>
          </button>
        )}
        <button
          onClick={onToggleLanguage}
          aria-label={language === 'ar' ? 'Switch to English' : 'التحويل إلى اللغة العربية'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/20 bg-[#202B52] text-sm text-[#C9CCE4] hover:text-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C1C3E6] min-h-[40px]"
          type="button"
        >
          <Globe className="w-4 h-4 text-[#C1C3E6]" />
          <span className="font-medium">{targetLanguageLabel}</span>
        </button>
      </div>

      <div className="text-center flex-1 select-none min-w-0">
        <h1 className="text-base sm:text-lg font-bold tracking-tight text-white leading-tight truncate">{t.appName}</h1>
        <p className="text-sm text-[#C9CCE4] mt-0.5 tracking-tight font-normal truncate">{t.tagline}</p>
      </div>

      <div className="flex items-center gap-1.5">
        {signedIn ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={t.accountMenuLabel}
              title={t.accountMenuLabel}
              className="w-10 h-10 rounded-full bg-[#202B52] border border-white/20 flex items-center justify-center text-[#C9CCE4] hover:text-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C1C3E6]"
              type="button"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label={t.accountMenuLabel}
                className="absolute top-full mt-2 ltr:right-0 rtl:left-0 w-64 sm:w-72 py-2 rounded-2xl bg-[#202B52] border border-white/20 shadow-2xl z-50 overflow-hidden flex flex-col text-start animate-in fade-in zoom-in-95 duration-100"
              >
                {/* 1. Adjust My Information */}
                {onAdjustInfo && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onAdjustInfo();
                    }}
                    className="w-full px-4 py-3 flex items-center gap-3 text-sm sm:text-base text-white hover:bg-white/10 transition-colors text-start cursor-pointer focus:outline-none focus:bg-white/15"
                  >
                    <Edit3 className="w-4 h-4 text-[#C1C3E6] shrink-0" />
                    <span className="font-medium">{t.adjustMyInfoMenu}</span>
                  </button>
                )}

                {/* 2. Verify Relationship */}
                {onOpenVerifyModal && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenVerifyModal();
                    }}
                    className="w-full px-4 py-3 flex items-center gap-3 text-sm sm:text-base text-white hover:bg-white/10 transition-colors text-start cursor-pointer focus:outline-none focus:bg-white/15"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#C1C3E6] shrink-0" />
                    <span className="font-medium">{t.verifyRelationshipMenu}</span>
                  </button>
                )}

                {/* Blocked People */}
                {onOpenBlockedModal && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenBlockedModal();
                    }}
                    className="w-full px-4 py-3 flex items-center gap-3 text-sm sm:text-base text-[#C9CCE4] hover:text-white hover:bg-white/10 transition-colors text-start cursor-pointer focus:outline-none focus:bg-white/15"
                  >
                    <UserX className="w-4 h-4 text-[#9FA5C7] shrink-0" />
                    <span className="font-medium">{t.blockedPeopleMenu}</span>
                  </button>
                )}

                {/* Download My Data */}
                {onDownloadMyData && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDownloadMyData();
                    }}
                    className="w-full px-4 py-3 flex items-center gap-3 text-sm sm:text-base text-[#C9CCE4] hover:text-white hover:bg-white/10 transition-colors text-start cursor-pointer focus:outline-none focus:bg-white/15"
                  >
                    <Download className="w-4 h-4 text-[#9FA5C7] shrink-0" />
                    <span className="font-medium">{t.downloadMyDataMenu}</span>
                  </button>
                )}

                {/* 3. Sign Out */}
                {onSignOut && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onSignOut();
                    }}
                    className="w-full px-4 py-3 flex items-center gap-3 text-sm sm:text-base text-[#C9CCE4] hover:text-white hover:bg-white/10 transition-colors text-start cursor-pointer focus:outline-none focus:bg-white/15"
                  >
                    <LogOut className="w-4 h-4 text-[#9FA5C7] shrink-0" />
                    <span className="font-medium">{t.signOutMenu}</span>
                  </button>
                )}

                {/* Divider */}
                {(onExitRelationship || onDeleteAccount) && (
                  <div className="my-1 border-t border-white/10" />
                )}

                {/* 4. End Relationship */}
                {onExitRelationship && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onExitRelationship();
                    }}
                    className="w-full px-4 py-3 flex items-center gap-3 text-sm sm:text-base text-amber-300 hover:bg-amber-950/40 transition-colors text-start cursor-pointer focus:outline-none focus:bg-amber-950/60"
                  >
                    <HeartOff className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="font-medium">{t.endRelationshipMenu}</span>
                  </button>
                )}

                {/* 5. End Relationship & Delete Account */}
                {onDeleteAccount && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDeleteAccount();
                    }}
                    className="w-full px-4 py-3 flex items-center gap-3 text-sm sm:text-base text-rose-400 hover:bg-rose-950/40 transition-colors text-start cursor-pointer focus:outline-none focus:bg-rose-950/60"
                  >
                    <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="font-medium">{t.endRelationshipAndDeleteAccountMenu}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="w-9" aria-hidden="true" />
        )}
      </div>
    </header>
  );
};

