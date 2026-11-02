import React, { useState, useEffect } from 'react';
import { Bookmark, X, Monitor, Smartphone, Compass } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../i18n/translations';

interface LegalFooterProps {
  language: Language;
  onNavigate?: (screen: 'privacy' | 'terms' | 'about') => void;
  showPreferredSource?: boolean;
}

export const LegalFooter: React.FC<LegalFooterProps> = ({
  language,
  onNavigate,
  showPreferredSource = false
}) => {
  const isAr = language === 'ar';
  const t = translations[language];
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  return (
    <footer
      dir={isAr ? 'rtl' : 'ltr'}
      className="print:hidden w-full px-4 py-3.5 bg-[#252D52] border-t border-white/10 text-center text-sm text-[#D6DAED] space-y-2 shrink-0 select-none"
    >
      <div className="flex flex-wrap items-center justify-center gap-3 font-medium text-sm">
        <a
          href="/about"
          onClick={(e) => {
            e.preventDefault();
            onNavigate?.('about');
          }}
          className="text-[#D6DAED] hover:text-white transition-colors underline cursor-pointer"
        >
          {t.aboutPlatform}
        </a>
        <span className="text-white/20">•</span>
        <a
          href="/privacy"
          onClick={(e) => {
            e.preventDefault();
            onNavigate?.('privacy');
          }}
          className="text-[#D6DAED] hover:text-white transition-colors underline cursor-pointer"
        >
          {t.privacyPolicy}
        </a>
        <span className="text-white/20">•</span>
        <a
          href="/terms"
          onClick={(e) => {
            e.preventDefault();
            onNavigate?.('terms');
          }}
          className="text-[#D6DAED] hover:text-white transition-colors underline cursor-pointer"
        >
          {t.termsOfUse}
        </a>
        <span className="text-white/20">•</span>
        <a
          href="mailto:customerservices@relationshipid.org"
          className="text-[#D6DAED] hover:text-white transition-colors underline cursor-pointer break-all"
        >
          customerservices@relationshipid.org
        </a>
      </div>

      {showPreferredSource && (
        <div className="pt-0.5 flex justify-center">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            aria-haspopup="dialog"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#414A75] hover:bg-[#39436D] text-[#D6DAED] hover:text-white border border-[#A0A9D1] text-xs sm:text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#D3D8FF] focus:ring-offset-1 focus:ring-offset-[#252D52] cursor-pointer shadow-sm"
          >
            <Bookmark className="w-3.5 h-3.5 text-[#B8BCE6] shrink-0" aria-hidden="true" />
            <span>{t.saveThisWebsite}</span>
          </button>
        </div>
      )}

      {/* Save Website Instructions Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-website-modal-title"
          onClick={() => setIsModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#252D52] border border-[#A0A9D1] p-5 sm:p-6 text-start shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#39436D] text-[#B8BCE6] flex items-center justify-center shrink-0">
                  <Bookmark className="w-4 h-4" />
                </div>
                <h3 id="save-website-modal-title" className="text-base sm:text-lg font-bold text-white">
                  {t.saveWebsiteModalTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label={isAr ? 'إغلاق' : 'Close'}
                className="w-9 h-9 rounded-full bg-[#252D52] hover:bg-[#414A75] text-[#D6DAED] hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-[#A0A9D1]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs sm:text-sm text-[#D6DAED] leading-relaxed">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-[#252D52]/60 border border-white/5">
                <Monitor className="w-4 h-4 text-[#B8BCE6] shrink-0 mt-0.5" aria-hidden="true" />
                <p>{t.saveWebsiteDesktop}</p>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-[#252D52]/60 border border-white/5">
                <Smartphone className="w-4 h-4 text-[#B8BCE6] shrink-0 mt-0.5" aria-hidden="true" />
                <p>{t.saveWebsiteIos}</p>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-[#252D52]/60 border border-white/5">
                <Smartphone className="w-4 h-4 text-[#B8BCE6] shrink-0 mt-0.5" aria-hidden="true" />
                <p>{t.saveWebsiteAndroid}</p>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-[#252D52]/60 border border-white/5">
                <Compass className="w-4 h-4 text-[#B8BCE6] shrink-0 mt-0.5" aria-hidden="true" />
                <p>{t.saveWebsiteOther}</p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#414A75] hover:bg-[#39436D] text-white text-xs sm:text-sm font-medium border border-[#A0A9D1] transition-colors cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-sm text-[#D6DAED]/90 leading-relaxed max-w-sm mx-auto">
        {isAr ? (
          <>
            هذا الموقع محمي بواسطة reCAPTCHA وتُطبق{' '}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#D6DAED] underline hover:text-white transition-colors"
            >
              سياسة الخصوصية
            </a>{' '}
            و{' '}
            <a
              href="https://policies.google.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#D6DAED] underline hover:text-white transition-colors"
            >
              بنود الخدمة
            </a>{' '}
            من Google.
          </>
        ) : (
          <>
            This site is protected by reCAPTCHA and the Google{' '}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#D6DAED] underline hover:text-white transition-colors"
            >
              Privacy Policy
            </a>{' '}
            and{' '}
            <a
              href="https://policies.google.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#D6DAED] underline hover:text-white transition-colors"
            >
              Terms of Service
            </a>{' '}
            apply.
          </>
        )}
      </p>

      <p className="text-sm text-[#D6DAED]/70">
        {isAr
          ? 'Relationship ID — سجل رقمي خاص للعلاقات'
          : 'Relationship ID — Private Relationship Registry'}
      </p>
    </footer>
  );
};
