import React from 'react';
import { ArrowLeft, ArrowRight, Shield, FileText } from 'lucide-react';
import { Language } from '../types';
import { legalContent } from '../content/legal';

interface LegalPageProps {
  page: 'privacy' | 'terms';
  language: Language;
  onBack: () => void;
}

export const LegalPage: React.FC<LegalPageProps> = ({ page, language, onBack }) => {
  const content = legalContent[language];
  const title = page === 'privacy' ? content.privacyTitle : content.termsTitle;
  const sections = page === 'privacy' ? content.privacySections : content.termsSections;
  const isAr = language === 'ar';

  return (
    <main className="flex-1 flex flex-col items-center justify-center py-4 px-4 w-full">
      <div className="w-full bg-[#30264D] border border-[#51465F] rounded-[20px] p-5 sm:p-6 shadow-2xl relative overflow-hidden space-y-5 sm:space-y-6">
        {/* Header with back button */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#51465F] bg-[#141023] hover:bg-white/10 text-sm font-medium text-[#B7ACC8] hover:text-white transition cursor-pointer min-h-[40px]"
          >
            {isAr ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
            <span>{isAr ? 'رجوع' : 'Back'}</span>
          </button>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#392D5A] border border-[#51465F] text-sm font-semibold tracking-wider text-[#E7BCD3] uppercase">
            {page === 'privacy' ? <Shield className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
            <span>{title}</span>
          </div>
        </div>

        {/* Page Title */}
        <div className="text-center space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-snug">
            {title}
          </h1>
        </div>

        {/* Content Sections */}
        <div className="space-y-4">
          {sections.map((sec, idx) => (
            <div
              key={idx}
              className="bg-[#141023] border border-[#51465F] rounded-xl p-4 space-y-2 text-start"
            >
              <h2 className="text-base font-bold text-white">
                {sec.heading}
              </h2>
              <p className="text-base text-[#B7ACC8] leading-relaxed whitespace-pre-line">
                {sec.body}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom Back Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onBack}
            className="w-full py-3 px-4 rounded-xl border border-[#51465F] bg-[#3D305A] hover:bg-[#4D3E70] text-[#B7ACC8] hover:text-white font-semibold text-base flex items-center justify-center gap-2 transition cursor-pointer min-h-[44px]"
          >
            {isAr ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
            <span>{isAr ? 'العودة إلى الصفحة السابقة' : 'Return to previous page'}</span>
          </button>
        </div>
      </div>
    </main>
  );
};
