import type { ScreenId } from '../types';
import { FIREBASE_WEB_CONFIG } from '../lib/firebase.config';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

export type AnalyticsStatus =
  | 'NOT_CONFIGURED'
  | 'AWAITING_CONSENT'
  | 'INITIALIZED'
  | 'BLOCKED';

interface ScreenMetadata {
  title: string;
  path: string;
}

const ALLOWED_SCREENS: Record<ScreenId, ScreenMetadata> = {
  auth: { title: 'Sign In', path: '/auth' },
  p1_details: { title: 'Partner 1 Details', path: '/p1/details' },
  p1_invite_create: { title: 'Create Invitation', path: '/p1/invite' },
  invite_success: { title: 'Invitation Sent', path: '/invite/sent' },
  p1_waiting: { title: 'Waiting for Partner', path: '/waiting' },
  p2_landing: { title: 'Invitation Landing', path: '/invite' },
  p2_auth: { title: 'Partner 2 Sign In', path: '/p2/auth' },
  p2_details: { title: 'Partner 2 Details', path: '/p2/details' },
  review_controls: { title: 'Review and Controls', path: '/review' },
  official_certificate: { title: 'Certificate', path: '/certificate' },
  verify_portal: { title: 'Verification Portal', path: '/verify' },
  privacy: { title: 'Privacy Policy', path: '/privacy' },
  terms: { title: 'Terms of Service', path: '/terms' },
  not_found: { title: 'Page Not Found', path: '/404' }
};

let scriptInjected = false;
let lastTrackedScreen: ScreenId | null = null;
let currentStatus: AnalyticsStatus = 'NOT_CONFIGURED';

const getEnvVar = (name: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any)?.env) {
      return String((import.meta as any).env[name] || '').trim();
    }
  } catch {
    // fallback
  }
  try {
    if (typeof process !== 'undefined' && process?.env) {
      return String(process.env[name] || '').trim();
    }
  } catch {
    // fallback
  }
  return '';
};

export const getMeasurementId = (): string => {
  const fromConfig = String(FIREBASE_WEB_CONFIG.measurementId || '').trim();
  if (fromConfig) return fromConfig;
  return getEnvVar('VITE_FIREBASE_MEASUREMENT_ID');
};

export const isValidMeasurementId = (id: string): boolean => {
  return /^G-[A-Za-z0-9]+$/i.test(id.trim());
};

export const hasAnalyticsConsent = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('rid_analytics_consent') === 'granted';
  } catch {
    return false;
  }
};

export const setAnalyticsConsent = (granted: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('rid_analytics_consent', granted ? 'granted' : 'denied');
  } catch {
    // ignore
  }
};

export const getAnalyticsStatus = (): AnalyticsStatus => {
  return currentStatus;
};

export const initGoogleAnalytics = (): AnalyticsStatus => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 'NOT_CONFIGURED';
  }

  const measurementId = getMeasurementId();
  if (!isValidMeasurementId(measurementId)) {
    currentStatus = 'NOT_CONFIGURED';
    return currentStatus;
  }

  if (!hasAnalyticsConsent()) {
    currentStatus = 'AWAITING_CONSENT';
    window[`ga-disable-${measurementId}`] = true;
    return currentStatus;
  }

  window[`ga-disable-${measurementId}`] = false;

  if (scriptInjected || document.getElementById('ga-gtag-script')) {
    currentStatus = 'INITIALIZED';
    return currentStatus;
  }

  try {
    window.dataLayer = window.dataLayer || [];
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    }
    window.gtag = gtag;

    gtag('js', new Date());
    gtag('config', measurementId, {
      send_page_view: false,
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      restricted_data_processing: true
    });

    const script = document.createElement('script');
    script.id = 'ga-gtag-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.onerror = () => {
      currentStatus = 'BLOCKED';
    };
    document.head.appendChild(script);

    scriptInjected = true;
    currentStatus = 'INITIALIZED';
    return currentStatus;
  } catch {
    currentStatus = 'BLOCKED';
    return currentStatus;
  }
};

export const trackScreenView = (screen: ScreenId): void => {
  if (lastTrackedScreen === screen) {
    return;
  }
  lastTrackedScreen = screen;

  const measurementId = getMeasurementId();
  if (!isValidMeasurementId(measurementId) || !hasAnalyticsConsent()) {
    return;
  }

  if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
    return;
  }

  const meta = ALLOWED_SCREENS[screen] || ALLOWED_SCREENS.not_found;
  const origin = window.location.origin || 'https://www.relationshipid.org';
  const sanitizedLocation = `${origin}${meta.path}`;

  try {
    window.gtag('event', 'page_view', {
      page_title: meta.title,
      page_location: sanitizedLocation,
      page_path: meta.path,
      screen_name: meta.title,
      page_referrer: origin
    });
  } catch {
    // Non-blocking fail-safe
  }
};

export function __resetAnalyticsForTesting(): void {
  scriptInjected = false;
  lastTrackedScreen = null;
  currentStatus = 'NOT_CONFIGURED';
}
