import React, { useState } from 'react';
import { Bell, X, Calendar, Heart, Gift } from 'lucide-react';
import { Language } from '../types';
import { OccasionItem } from '../utils/reminders';

interface ReminderBannerProps {
  language: Language;
  occasions: OccasionItem[];
  onDismiss: (occasion: OccasionItem) => Promise<void> | void;
}

export const ReminderBanner: React.FC<ReminderBannerProps> = ({
  language,
  occasions,
  onDismiss
}) => {
  const [dismissingType, setDismissingType] = useState<string | null>(null);

  if (!occasions || occasions.length === 0) return null;

  const handleDismiss = async (occ: OccasionItem) => {
    setDismissingType(occ.type);
    try {
      await onDismiss(occ);
    } finally {
      setDismissingType(null);
    }
  };

  return (
    <div className="w-full space-y-2 mb-3 px-1" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {occasions.map((occ, idx) => {
        const title = language === 'ar' ? occ.titleAr : occ.titleEn;
        const message = language === 'ar' ? occ.messageAr : occ.messageEn;
        const isDismissing = dismissingType === occ.type;

        return (
          <div
            key={`${occ.type}-${idx}`}
            className="p-3.5 rounded-2xl bg-gradient-to-r from-[#3D2F5B] to-[#463668] border border-[#E7BCD3]/40 shadow-lg flex items-start justify-between gap-3 text-start transition-all"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-[#E7BCD3]/20 border border-[#E7BCD3]/30 shrink-0 mt-0.5 text-[#E7BCD3]">
                {occ.type === 'relationship_anniversary' ? (
                  <Heart className="w-5 h-5 text-[#E7BCD3] fill-[#E7BCD3]/30" />
                ) : occ.type === 'user_birthday' ? (
                  <Gift className="w-5 h-5 text-[#E7BCD3]" />
                ) : (
                  <Calendar className="w-5 h-5 text-[#E7BCD3]" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="inline-block px-2 py-0.5 text-[11px] font-bold rounded-full bg-[#E7BCD3]/20 text-[#E7BCD3] border border-[#E7BCD3]/30 uppercase tracking-wider">
                    {language === 'ar' ? 'تذكير مناسبة' : 'Occasion Reminder'}
                  </span>
                </div>
                <h4 className="text-sm sm:text-base font-extrabold text-white mt-1 leading-snug">
                  {title}
                </h4>
                <p className="text-xs sm:text-sm text-[#B7ACC8] mt-0.5 leading-relaxed">
                  {message}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isDismissing}
              onClick={() => void handleDismiss(occ)}
              aria-label={language === 'ar' ? 'إخفاء التذكير' : 'Dismiss reminder'}
              title={language === 'ar' ? 'إخفاء التذكير' : 'Dismiss reminder'}
              className="p-2 rounded-xl hover:bg-white/10 text-[#B7ACC8] hover:text-white transition cursor-pointer shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#E7BCD3]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
