import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../i18n/translations';

interface LegalFooterProps {
  language: Language;
  onNavigate?: (screen: 'privacy' | 'terms') => void;
  showPreferredSource?: boolean;
}

export const LegalFooter: React.FC<LegalFooterProps> = ({
  language,
  onNavigate,
  showPreferredSource = false
}) => {
  const isAr = language === 'ar';
  const t = translations[language];

  return (
    <footer
      dir={isAr ? 'rtl' : 'ltr'}
      className="print:hidden w-full px-4 py-3.5 bg-[#131F3B] border-t border-white/10 text-center text-sm text-[#C9CCE4] space-y-2 shrink-0 select-none"
    >
      <div className="flex flex-wrap items-center justify-center gap-3 font-medium text-sm">
        <a
          href="/privacy"
          onClick={(e) => {
            e.preventDefault();
            onNavigate?.('privacy');
          }}
          className="text-[#C9CCE4] hover:text-white transition-colors underline cursor-pointer"
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
          className="text-[#C9CCE4] hover:text-white transition-colors underline cursor-pointer"
        >
          {t.termsOfUse}
        </a>
        <span className="text-white/20">•</span>
        <a
          href="mailto:customerservices@relationshipid.org"
          className="text-[#C9CCE4] hover:text-white transition-colors underline cursor-pointer break-all"
        >
          customerservices@relationshipid.org
        </a>
      </div>

      {showPreferredSource && (
        <div className="pt-0.5 flex justify-center">
          <a
            href="https://www.google.com/preferences/source?q=relationshipid.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#202B52] hover:bg-[#252F5A] text-[#C9CCE4] hover:text-white border border-white/15 hover:border-white/25 text-xs sm:text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#C1C3E6] focus:ring-offset-1 focus:ring-offset-[#131F3B] cursor-pointer"
          >
            <span>{t.addPreferredSource}</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          </a>
        </div>
      )}

      <p className="text-sm text-[#C9CCE4]/90 leading-relaxed max-w-sm mx-auto">
        {isAr ? (
          <>
            هذا الموقع محمي بواسطة reCAPTCHA وتُطبق{' '}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#C9CCE4] underline hover:text-white transition-colors"
            >
              سياسة الخصوصية
            </a>{' '}
            و{' '}
            <a
              href="https://policies.google.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#C9CCE4] underline hover:text-white transition-colors"
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
              className="text-[#C9CCE4] underline hover:text-white transition-colors"
            >
              Privacy Policy
            </a>{' '}
            and{' '}
            <a
              href="https://policies.google.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#C9CCE4] underline hover:text-white transition-colors"
            >
              Terms of Service
            </a>{' '}
            apply.
          </>
        )}
      </p>

      <p className="text-sm text-[#C9CCE4]/70">
        {isAr
          ? 'Relationship ID — سجل رقمي خاص للعلاقات'
          : 'Relationship ID — Private Relationship Registry'}
      </p>
    </footer>
  );
};
