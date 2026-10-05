import React from 'react';
import { Language } from '../types';

interface LegalFooterProps {
  language: Language;
  onNavigate?: (screen: 'privacy' | 'terms') => void;
}

export const LegalFooter: React.FC<LegalFooterProps> = ({ language, onNavigate }) => {
  const isAr = language === 'ar';

  return (
    <footer
      dir={isAr ? 'rtl' : 'ltr'}
      className="print:hidden w-full px-4 py-3 bg-[#141124] border-t border-white/10 text-center text-[10px] text-[#b6afd4] space-y-1.5 shrink-0 select-none"
    >
      <div className="flex items-center justify-center gap-3 font-medium">
        <a
          href="/privacy"
          onClick={(e) => {
            e.preventDefault();
            onNavigate?.('privacy');
          }}
          className="text-[#b6afd4] hover:text-white transition-colors underline cursor-pointer"
        >
          {isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}
        </a>
        <span className="text-white/20">•</span>
        <a
          href="/terms"
          onClick={(e) => {
            e.preventDefault();
            onNavigate?.('terms');
          }}
          className="text-[#b6afd4] hover:text-white transition-colors underline cursor-pointer"
        >
          {isAr ? 'شروط الاستخدام' : 'Terms of Service'}
        </a>
        <span className="text-white/20">•</span>
        <a
          href="mailto:rami@relationshipid.org"
          className="text-[#b6afd4] hover:text-white transition-colors underline cursor-pointer"
        >
          rami@relationshipid.org
        </a>
      </div>

      <p className="text-[9.5px] text-[#b6afd4]/80 leading-relaxed max-w-sm mx-auto">
        {isAr ? (
          <>
            هذا الموقع محمي بواسطة reCAPTCHA وتُطبق{' '}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#b6afd4] underline hover:text-white transition-colors"
            >
              سياسة الخصوصية
            </a>{' '}
            و{' '}
            <a
              href="https://policies.google.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#b6afd4] underline hover:text-white transition-colors"
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
              className="text-[#b6afd4] underline hover:text-white transition-colors"
            >
              Privacy Policy
            </a>{' '}
            and{' '}
            <a
              href="https://policies.google.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#b6afd4] underline hover:text-white transition-colors"
            >
              Terms of Service
            </a>{' '}
            apply.
          </>
        )}
      </p>

      <p className="text-[9px] text-[#b6afd4]/60">
        {isAr
          ? 'Relationship ID — سجل رقمي خاص للعلاقات'
          : 'Relationship ID — Private Relationship Registry'}
      </p>
    </footer>
  );
};
