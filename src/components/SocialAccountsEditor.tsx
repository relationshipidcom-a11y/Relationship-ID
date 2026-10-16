import React from 'react';
import { Plus, Trash2, AtSign } from 'lucide-react';
import { Language, SocialAccount } from '../types';
import { SUPPORTED_PLATFORMS, getPlatformConfig } from '../utils/social';
import { translations } from '../i18n/translations';

interface SocialAccountsEditorProps {
  language: Language;
  accounts: SocialAccount[];
  onChange: (accounts: SocialAccount[]) => void;
  maxAccounts?: number;
}

export const SocialAccountsEditor: React.FC<SocialAccountsEditorProps> = ({
  language,
  accounts,
  onChange,
  maxAccounts = 6
}) => {
  const t = translations[language];

  const handleAdd = () => {
    if (accounts.length >= maxAccounts) return;
    // Pick first platform not yet selected, or default to instagram
    const existingPlatforms = new Set(accounts.map((a) => a.platform));
    const nextPlatform = SUPPORTED_PLATFORMS.find((p) => !existingPlatforms.has(p.id))?.id || 'instagram';
    onChange([...accounts, { platform: nextPlatform, handle: '' }]);
  };

  const handleRemove = (index: number) => {
    onChange(accounts.filter((_, i) => i !== index));
  };

  const handlePlatformChange = (index: number, newPlatform: string) => {
    const next = accounts.map((acc, i) => {
      if (i === index) {
        return { ...acc, platform: newPlatform };
      }
      return acc;
    });
    onChange(next);
  };

  const handleHandleChange = (index: number, newHandle: string) => {
    const next = accounts.map((acc, i) => {
      if (i === index) {
        return { ...acc, handle: newHandle };
      }
      return acc;
    });
    onChange(next);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-[#B7ACC8]">
          {t.socialAccountsLabel}{' '}
          <span className="text-sm text-[#B7ACC8]/60">({t.socialAccountsOptional})</span>
        </label>
        {accounts.length > 0 && accounts.length < maxAccounts && (
          <button
            type="button"
            onClick={handleAdd}
            className="text-sm text-[#E7BCD3] hover:text-white flex items-center gap-1 transition cursor-pointer font-medium min-h-[40px]"
          >
            <Plus className="w-3.5 h-3.5" /> {language === 'ar' ? 'إضافة حساب آخر' : 'Add another'}
          </button>
        )}
      </div>

      {accounts.length === 0 ? (
        <button
          type="button"
          onClick={handleAdd}
          className="w-full bg-[#141023] hover:bg-[#30264D] border border-dashed border-[#51465F] hover:border-[#E7BCD3]/50 text-[#E7BCD3] rounded-xl py-3 px-3 text-sm flex items-center justify-center gap-2 transition cursor-pointer min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span>{t.addSocialAccountBtn}</span>
        </button>
      ) : (
        <div className="space-y-2">
          {accounts.map((acc, idx) => {
            const config = getPlatformConfig(acc.platform);
            const placeholder = config
              ? `${config.placeholder} (e.g. ${config.placeholder === 'channel' ? '@MyChannel' : 'username'})`
              : t.socialHandlePlaceholder;

            return (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 rounded-xl bg-[#141023] border border-[#51465F]"
              >
                <span className="sr-only">{getPlatformConfig(acc.platform)?.nameEn || acc.platform}: {acc.handle}</span>
                {/* Platform Selector */}
                <select
                  value={acc.platform}
                  onChange={(e) => handlePlatformChange(idx, e.target.value)}
                  className="bg-[#30264D] text-white text-base rounded-lg px-2.5 py-2 border border-[#51465F] outline-none focus:border-[#E7BCD3] shrink-0 cursor-pointer font-medium"
                  aria-label={language === 'ar' ? 'المنصة' : 'Platform'}
                >
                  {SUPPORTED_PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#30264D] text-white">
                      {language === 'ar' ? p.nameAr : p.nameEn}
                    </option>
                  ))}
                  {!SUPPORTED_PLATFORMS.some((p) => p.id === acc.platform) && (
                    <option value={acc.platform} className="bg-[#30264D] text-white">
                      {language === 'ar' ? 'أخرى' : 'Other'}
                    </option>
                  )}
                </select>

                {/* Handle / URL Input */}
                <div className="relative flex-1 min-w-0">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-[#B7ACC8]/60 pointer-events-none text-sm font-mono">
                    <AtSign className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    value={acc.handle}
                    onChange={(e) => handleHandleChange(idx, e.target.value)}
                    onInput={(e: React.FormEvent<HTMLInputElement>) => handleHandleChange(idx, (e.target as HTMLInputElement).value)}
                    placeholder={placeholder}
                    className="w-full bg-[#141023] border border-[#51465F] focus:border-[#E7BCD3] text-white text-base rounded-lg pl-7 pr-2.5 py-2 outline-none transition"
                    dir="ltr"
                  />
                </div>

                {/* Delete Row Button */}
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  className="p-2 rounded-lg text-[#B7ACC8]/60 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center"
                  aria-label={language === 'ar' ? 'حذف الحساب' : 'Remove account'}
                  title={language === 'ar' ? 'حذف' : 'Remove'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
