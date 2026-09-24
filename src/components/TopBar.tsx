import React from 'react';
import { Globe, LogOut, ShieldCheck } from 'lucide-react';
import { Language, ScreenId } from '../types';
import { translations } from '../i18n/translations';

interface TopBarProps {
  language: Language;
  onToggleLanguage: () => void;
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  onOpenVerifyModal?: () => void;
  onSignOut?: () => void;
  signedIn?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  language,
  onToggleLanguage,
  onOpenVerifyModal,
  onSignOut,
  signedIn = false
}) => {
  const t = translations[language];

  return (
    <header className="px-4 pt-4 pb-3 border-b border-white/10 flex items-center justify-between gap-2 relative z-30">
      <button
        onClick={onToggleLanguage}
        aria-label={t.languageLabel}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-white/20 bg-[#211c38] text-xs text-[#b6afd4] hover:text-white transition-colors cursor-pointer"
        type="button"
      >
        <Globe className="w-3.5 h-3.5 text-[#f3c4db]" />
        <span className="font-medium">{t.languageLabel}</span>
      </button>

      <div className="text-center flex-1 select-none">
        <h1 className="text-sm font-bold tracking-tight text-white leading-none">{t.appName}</h1>
        <p className="text-[9.5px] text-[#b6afd4] mt-0.5 tracking-tight font-normal">{t.tagline}</p>
      </div>

      <div className="flex items-center gap-1.5">
        {signedIn && onSignOut && (
          <button
            onClick={onSignOut}
            title={language === 'ar' ? 'تسجيل الخروج' : 'Sign out'}
            aria-label={language === 'ar' ? 'تسجيل الخروج' : 'Sign out'}
            className="w-9 h-9 rounded-full bg-[#211c38] border border-white/20 flex items-center justify-center text-[#b6afd4] hover:text-white transition-colors cursor-pointer"
            type="button"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
        {onOpenVerifyModal ? (
          <button
            onClick={onOpenVerifyModal}
            title={language === 'ar' ? 'التحقق من شهادة' : 'Verify a certificate'}
            aria-label={language === 'ar' ? 'التحقق من شهادة' : 'Verify a certificate'}
            className="w-9 h-9 rounded-full bg-[#211c38] border border-white/20 flex items-center justify-center text-[#f3c4db] hover:text-white transition-colors cursor-pointer"
            type="button"
          >
            <ShieldCheck className="w-4 h-4" />
          </button>
        ) : <div className="w-9" />}
      </div>
    </header>
  );
};
