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
      <div className="w-full bg-[#202B52] border border-white/20 rounded-[20px] p-6 shadow-2xl relative overflow-hidden space-y-6">
        {/* Header with back button */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-[#C9CCE4] hover:text-white transition cursor-pointer"
          >
            {isAr ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
            <span>{isAr ? 'رجوع' : 'Back'}</span>
          </button>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2C345F]/60 border border-[#C1C3E6]/30 text-[10px] font-semibold tracking-wider text-[#C1C3E6] uppercase">
            {page === 'privacy' ? <Shield className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
            <span>{title}</span>
          </div>
        </div>

        {/* Page Title */}
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-white leading-snug">
            {title}
          </h1>
        </div>

        {/* Content Sections */}
        <div className="space-y-4">
          {sections.map((sec, idx) => (
            <div
              key={idx}
              className="bg-[#172244]/80 border border-white/15 rounded-xl p-4 space-y-2 text-start"
            >
              <h2 className="text-sm font-semibold text-white">
                {sec.heading}
              </h2>
              <p className="text-xs text-[#C9CCE4] leading-relaxed">
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
            className="w-full py-2.5 px-4 rounded-xl border border-white/20 bg-[#2C345F]/70 hover:bg-[#343E70] text-[#C9CCE4] hover:text-white font-medium text-xs flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {isAr ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
            <span>{isAr ? 'العودة إلى الصفحة السابقة' : 'Return to previous page'}</span>
          </button>
        </div>
      </div>
    </main>
  );
};
