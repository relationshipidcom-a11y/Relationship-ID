import React from 'react';
import { Shield, User, Heart, Lock } from 'lucide-react';
import type { Language } from '../types';

interface FormSkeletonProps {
  type: 'p1' | 'p2';
  language: Language;
}

export const FormSkeleton: React.FC<FormSkeletonProps> = ({ type, language }) => {
  const isAr = language === 'ar';
  const loadingLabel = isAr
    ? 'جاري تحميل تفاصيل السجل...'
    : 'Loading relationship details...';

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={loadingLabel}
      dir={isAr ? 'rtl' : 'ltr'}
      className="flex-1 flex flex-col justify-between px-4 py-3 animate-pulse motion-reduce:animate-none"
    >
      <span className="sr-only">{loadingLabel}</span>

      {/* Header Skeleton */}
      <section className="text-center mb-3 mt-2" aria-hidden="true">
        <div className="flex items-center justify-end mb-2">
          <div className="h-6 w-28 rounded-full bg-[#392D5A] border border-[#51465F]" />
        </div>
        <div className="h-7 w-48 sm:w-64 mx-auto rounded-lg bg-[#392D5A] mb-2" />
        <div className="h-4 w-60 sm:w-80 mx-auto rounded bg-[#392D5A]/70" />
      </section>

      <div className="flex-1 flex flex-col gap-3.5 overflow-y-auto" aria-hidden="true">
        {/* If P2: Render Partner 1 Summary Card Placeholder */}
        {type === 'p2' && (
          <section className="p-4 rounded-2xl bg-[#30264D] border border-[#51465F] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 text-[#E7BCD3]">
                <User className="w-4 h-4 text-[#E7BCD3]/60" />
                <div className="h-4 w-32 rounded bg-[#392D5A]" />
              </div>
              <div className="h-5 w-20 rounded-full bg-[#392D5A] border border-[#51465F]" />
            </div>
            <div className="grid grid-cols-2 gap-3 text-start">
              <div>
                <div className="h-3 w-16 rounded bg-[#392D5A]/80 mb-1.5" />
                <div className="h-4 w-28 rounded bg-[#392D5A]" />
              </div>
              <div>
                <div className="h-3 w-16 rounded bg-[#392D5A]/80 mb-1.5" />
                <div className="h-4 w-24 rounded bg-[#392D5A]" />
              </div>
              <div>
                <div className="h-3 w-16 rounded bg-[#392D5A]/80 mb-1.5" />
                <div className="h-4 w-36 rounded bg-[#392D5A]" />
              </div>
              <div>
                <div className="h-3 w-16 rounded bg-[#392D5A]/80 mb-1.5" />
                <div className="h-4 w-28 rounded bg-[#392D5A]" />
              </div>
            </div>
          </section>
        )}

        {/* Verified Identity Card Skeleton */}
        <section className="p-4 rounded-2xl bg-[#30264D] border border-[#51465F] space-y-3">
          <div className="flex items-center gap-2 pb-1 text-[#E7BCD3]">
            <Shield className="w-4 h-4 text-[#E7BCD3]/60" />
            <div className="h-4 w-36 rounded bg-[#392D5A]" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="h-3 w-20 rounded bg-[#392D5A]/80 mb-1.5" />
              <div className="h-10 w-full rounded-xl bg-[#221B38] border border-[#51465F]" />
            </div>
            <div>
              <div className="h-3 w-20 rounded bg-[#392D5A]/80 mb-1.5" />
              <div className="h-10 w-full rounded-xl bg-[#221B38] border border-[#51465F]" />
            </div>
          </div>
        </section>

        {/* Contact Details Card Skeleton */}
        <section className="p-4 rounded-2xl bg-[#30264D] border border-[#51465F] space-y-3">
          <div className="flex items-center gap-2 pb-1 text-[#E7BCD3]">
            <div className="h-4 w-4 rounded-full bg-[#392D5A]" />
            <div className="h-4 w-32 rounded bg-[#392D5A]" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="h-3 w-24 rounded bg-[#392D5A]/80 mb-1.5" />
              <div className="h-10 w-full rounded-xl bg-[#221B38] border border-[#51465F]" />
            </div>
            <div>
              <div className="h-3 w-28 rounded bg-[#392D5A]/80 mb-1.5" />
              <div className="h-10 w-full rounded-xl bg-[#221B38] border border-[#51465F]" />
            </div>
          </div>
        </section>

        {/* If P1: Relationship Details Card Skeleton */}
        {type === 'p1' && (
          <section className="p-4 rounded-2xl bg-[#30264D] border border-[#51465F] space-y-3">
            <div className="flex items-center gap-2 pb-1 text-[#E7BCD3]">
              <Heart className="w-4 h-4 text-[#E7BCD3]/60" />
              <div className="h-4 w-32 rounded bg-[#392D5A]" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="h-11 rounded-xl bg-[#221B38] border border-[#51465F]" />
              <div className="h-11 rounded-xl bg-[#221B38] border border-[#51465F]" />
              <div className="h-11 rounded-xl bg-[#221B38] border border-[#51465F]" />
            </div>
            <div>
              <div className="h-3 w-20 rounded bg-[#392D5A]/80 mb-1.5" />
              <div className="h-10 w-full rounded-xl bg-[#221B38] border border-[#51465F]" />
            </div>
          </section>
        )}

        {/* Legal Consent Checkbox Skeleton */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#30264D]/60 border border-[#51465F]/60">
          <div className="w-5 h-5 rounded bg-[#392D5A] shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <div className="h-3.5 w-full rounded bg-[#392D5A]/80" />
            <div className="h-3.5 w-3/4 rounded bg-[#392D5A]/60" />
          </div>
        </div>
      </div>

      {/* Action Button Skeleton */}
      <div className="pt-2 mt-2" aria-hidden="true">
        <div className="h-12 w-full rounded-xl bg-gradient-to-r from-[#804E6A]/50 to-[#8D5775]/50 border border-[#51465F]" />
      </div>
    </div>
  );
};
