import { Language, SocialAccount, SocialPlatform } from '../types';

export interface PlatformConfig {
  id: SocialPlatform;
  nameEn: string;
  nameAr: string;
  placeholder: string;
  prefix: string;
}

export const SUPPORTED_PLATFORMS: PlatformConfig[] = [
  { id: 'instagram', nameEn: 'Instagram', nameAr: 'إنستغرام', placeholder: 'username', prefix: 'instagram.com/' },
  { id: 'tiktok', nameEn: 'TikTok', nameAr: 'تيك توك', placeholder: 'username', prefix: 'tiktok.com/@' },
  { id: 'x', nameEn: 'X (Twitter)', nameAr: 'إكس (تويتر)', placeholder: 'username', prefix: 'x.com/' },
  { id: 'facebook', nameEn: 'Facebook', nameAr: 'فيسبوك', placeholder: 'username / profile', prefix: 'facebook.com/' },
  { id: 'snapchat', nameEn: 'Snapchat', nameAr: 'سناب شات', placeholder: 'username', prefix: 'snapchat.com/add/' },
  { id: 'youtube', nameEn: 'YouTube', nameAr: 'يوتيوب', placeholder: 'channel / @handle', prefix: 'youtube.com/@' }
];

export function getPlatformConfig(platformId: string): PlatformConfig | undefined {
  const norm = (platformId || '').toLowerCase().trim();
  return SUPPORTED_PLATFORMS.find((p) => p.id === norm);
}

export function getPlatformName(platformId: string, language: Language = 'ar'): string {
  const config = getPlatformConfig(platformId);
  if (config) {
    return language === 'ar' ? config.nameAr : config.nameEn;
  }
  return platformId || (language === 'ar' ? 'أخرى' : 'Other');
}

/**
 * Validates that the input is not dangerous (blocks executable schemes, scripts, etc.)
 */
export function isSafeSocialHandleOrUrl(input: unknown): boolean {
  if (typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return false;

  const lower = trimmed.toLowerCase();
  // Disallow executable or dangerous URL schemes, tags, and injection payloads
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.includes('<') ||
    lower.includes('>') ||
    lower.includes('"') ||
    lower.includes("'") ||
    lower.includes('onload=') ||
    lower.includes('onerror=') ||
    lower.includes('onclick=') ||
    lower.includes('javascript:')
  ) {
    return false;
  }

  // If a URL scheme is provided, ensure it is http or https
  if (lower.includes('://')) {
    if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
      return false;
    }
  }

  return true;
}

/**
 * Sanitizes and cleans a single social account entry.
 */
export function sanitizeSocialAccount(raw: unknown): SocialAccount | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const platform = typeof record.platform === 'string' ? record.platform.trim().toLowerCase().slice(0, 30) : 'instagram';
  const handle = typeof record.handle === 'string' ? record.handle.trim().slice(0, 200) : '';

  if (!handle || !isSafeSocialHandleOrUrl(handle)) {
    return null;
  }

  return {
    platform: platform || 'instagram',
    handle
  };
}

/**
 * Sanitizes an array of social accounts, filtering out invalid or dangerous items.
 */
export function sanitizeSocialAccounts(raw: unknown): SocialAccount[] {
  if (!Array.isArray(raw)) return [];
  const results: SocialAccount[] = [];
  for (const item of raw) {
    const clean = sanitizeSocialAccount(item);
    if (clean) {
      results.push(clean);
      if (results.length >= 10) break; // Limit to max 10
    }
  }
  return results;
}

/**
 * Formats a handle for display (e.g. "@username" or platform-prefixed).
 */
export function formatSocialHandleDisplay(account: SocialAccount): string {
  const handle = account.handle.trim();
  if (handle.startsWith('http://') || handle.startsWith('https://')) {
    try {
      const url = new URL(handle);
      return url.pathname.replace(/^\/+/, '') || handle;
    } catch {
      return handle;
    }
  }
  return handle.startsWith('@') ? handle : `@${handle}`;
}

/**
 * Returns a formatted list of social accounts (or legacy handle) for summaries and certificates.
 */
export function getDisplaySocialAccounts(partner: {
  socialAccounts?: SocialAccount[];
  socialHandle?: string;
}): Array<{ platform: string; handle: string; display: string }> {
  const accounts: Array<{ platform: string; handle: string; display: string }> = [];

  if (Array.isArray(partner.socialAccounts) && partner.socialAccounts.length > 0) {
    for (const acc of partner.socialAccounts) {
      if (acc && acc.handle && isSafeSocialHandleOrUrl(acc.handle)) {
        accounts.push({
          platform: acc.platform,
          handle: acc.handle,
          display: formatSocialHandleDisplay(acc)
        });
      }
    }
  }

  // If no socialAccounts but legacy socialHandle exists, preserve it
  if (accounts.length === 0 && partner.socialHandle && partner.socialHandle.trim()) {
    const handle = partner.socialHandle.trim();
    if (isSafeSocialHandleOrUrl(handle)) {
      accounts.push({
        platform: 'other',
        handle,
        display: handle.startsWith('@') ? handle : `@${handle}`
      });
    }
  }

  return accounts;
}

export type SocialAccountsValidationResult =
  | {
      valid: true;
      sanitized?: SocialAccount[];
      error?: never;
    }
  | {
      valid: false;
      error: 'FIELD_TOO_LONG' | 'INVALID_INPUT' | 'UNSAFE_INPUT' | 'INVALID_PLATFORM';
      sanitized?: never;
    };

/**
 * Validates an array of social accounts for server routes and client forms.
 * Rejects unsafe input, invalid platforms, excessive length, or more than 6 accounts.
 */
export function validateSocialAccounts(accounts: unknown): SocialAccountsValidationResult {
  if (accounts === null || accounts === undefined) {
    return { valid: true, sanitized: undefined };
  }
  if (!Array.isArray(accounts)) {
    return { valid: false, error: 'INVALID_INPUT' };
  }
  if (accounts.length > 6) {
    return { valid: false, error: 'FIELD_TOO_LONG' };
  }

  const validPlatforms = new Set(['instagram', 'tiktok', 'x', 'facebook', 'snapchat', 'youtube', 'other']);
  const sanitized: SocialAccount[] = [];

  for (const item of accounts) {
    if (!item || typeof item !== 'object') {
      return { valid: false, error: 'INVALID_INPUT' };
    }
    const raw = item as Record<string, unknown>;
    if (typeof raw.platform !== 'string' || typeof raw.handle !== 'string') {
      return { valid: false, error: 'INVALID_INPUT' };
    }

    const platform = raw.platform.trim().toLowerCase();
    if (!validPlatforms.has(platform)) {
      return { valid: false, error: 'INVALID_PLATFORM' };
    }

    const trimmedHandle = raw.handle.trim();
    if (trimmedHandle.length === 0) {
      return { valid: false, error: 'INVALID_INPUT' };
    }
    if (trimmedHandle.length > 100) {
      return { valid: false, error: 'FIELD_TOO_LONG' };
    }

    if (!isSafeSocialHandleOrUrl(trimmedHandle)) {
      return { valid: false, error: 'UNSAFE_INPUT' };
    }

    sanitized.push({
      platform: platform as SocialPlatform,
      handle: trimmedHandle
    });
  }

  return { valid: true, sanitized };
}
