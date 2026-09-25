import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { FIREBASE_WEB_CONFIG } from './firebase.config';

export function cleanConfigValue(val: unknown): string {
  if (typeof val !== 'string') return '';
  let str = val.trim();
  str = str.replace(/,+$/, '').trim();
  if (
    (str.startsWith("'") && str.endsWith("'")) ||
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith('`') && str.endsWith('`'))
  ) {
    str = str.slice(1, -1).trim();
  }
  str = str.replace(/,+$/, '').trim();
  return str;
}

const getEnvVar = (name: string): unknown => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any)?.env) {
      return (import.meta as any).env[name];
    }
  } catch {
    // fallback
  }
  try {
    if (typeof process !== 'undefined' && process?.env) {
      return process.env[name];
    }
  } catch {
    // fallback
  }
  return undefined;
};

const resolveValue = (configVal: string | undefined, envVal: unknown): string => {
  const cleanConfig = cleanConfigValue(configVal);
  if (cleanConfig) return cleanConfig;
  return cleanConfigValue(envVal);
};

export const firebaseConfig = {
  apiKey: resolveValue(FIREBASE_WEB_CONFIG.apiKey, getEnvVar('VITE_FIREBASE_API_KEY')),
  authDomain: resolveValue(FIREBASE_WEB_CONFIG.authDomain, getEnvVar('VITE_FIREBASE_AUTH_DOMAIN')),
  projectId: resolveValue(FIREBASE_WEB_CONFIG.projectId, getEnvVar('VITE_FIREBASE_PROJECT_ID')),
  storageBucket: resolveValue(FIREBASE_WEB_CONFIG.storageBucket, getEnvVar('VITE_FIREBASE_STORAGE_BUCKET')),
  messagingSenderId: resolveValue(FIREBASE_WEB_CONFIG.messagingSenderId, getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID')),
  appId: resolveValue(FIREBASE_WEB_CONFIG.appId, getEnvVar('VITE_FIREBASE_APP_ID')),
  ...(resolveValue(FIREBASE_WEB_CONFIG.measurementId, getEnvVar('VITE_FIREBASE_MEASUREMENT_ID'))
    ? { measurementId: resolveValue(FIREBASE_WEB_CONFIG.measurementId, getEnvVar('VITE_FIREBASE_MEASUREMENT_ID')) }
    : {})
};

export const maskedApiKey = (() => {
  const key = firebaseConfig.apiKey;
  if (!key) return '(empty)';
  if (key.length <= 10) return `${key} (${key.length} chars)`;
  return `${key.slice(0, 6)}…${key.slice(-4)} (${key.length} chars)`;
})();

console.info(`[Firebase Config] projectId: "${firebaseConfig.projectId}", apiKey: ${maskedApiKey}`);

export async function testFirebaseApiKey(): Promise<{ ok: boolean; message: string }> {
  const key = firebaseConfig.apiKey;
  const configuredProjectId = firebaseConfig.projectId;
  if (!key) {
    return { ok: false, message: '❌ Google says: API key is empty' };
  }
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(key)}`);
    const data = await res.json().catch(() => null);
    if (res.ok) {
      const responseProjectId = data?.projectId;
      if (responseProjectId === configuredProjectId || responseProjectId === firebaseConfig.messagingSenderId) {
        return { ok: true, message: `✅ Key is VALID for project ${configuredProjectId}` };
      }
      return {
        ok: false,
        message: `⚠️ Key belongs to project ${responseProjectId || 'unknown'}, config uses ${configuredProjectId}`
      };
    }
    const errMsg = data?.error?.message || res.statusText || 'Unknown error';
    return { ok: false, message: `❌ Google says: ${errMsg}` };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `❌ Google says: ${errMsg}` };
  }
}

const REQUIRED_CLIENT_CONFIG: Array<{ key: keyof typeof firebaseConfig; envVar: string }> = [
  { key: 'apiKey', envVar: 'VITE_FIREBASE_API_KEY' },
  { key: 'authDomain', envVar: 'VITE_FIREBASE_AUTH_DOMAIN' },
  { key: 'projectId', envVar: 'VITE_FIREBASE_PROJECT_ID' },
  { key: 'storageBucket', envVar: 'VITE_FIREBASE_STORAGE_BUCKET' },
  { key: 'messagingSenderId', envVar: 'VITE_FIREBASE_MESSAGING_SENDER_ID' },
  { key: 'appId', envVar: 'VITE_FIREBASE_APP_ID' }
];

const KNOWN_PLACEHOLDERS = new Set([
  'apikey',
  'authdomain',
  'projectid',
  'storagebucket',
  'messagingsenderid',
  'appid',
  'your-api-key',
  'your-auth-domain',
  'your-project-id'
]);

export function isInvalidConfigValue(val: unknown, key: string): boolean {
  if (typeof val !== 'string') return true;
  const trimmed = val.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (lower === key.toLowerCase()) return true;
  if (KNOWN_PLACEHOLDERS.has(lower)) return true;
  if (lower.startsWith('<') && lower.endsWith('>')) return true;
  if (lower.startsWith('your_') || lower.startsWith('your-')) return true;
  return false;
}

export function validateFirebaseConfig(config: Record<string, unknown>): string[] {
  return REQUIRED_CLIENT_CONFIG
    .filter(({ key }) => isInvalidConfigValue(config[key], key))
    .map(({ envVar }) => envVar);
}

export const missingFirebaseConfigKeys: string[] = validateFirebaseConfig(firebaseConfig);

export const isFirebaseConfigured = missingFirebaseConfigKeys.length === 0;

if (!isFirebaseConfigured && typeof window !== 'undefined') {
  console.warn(
    `[Firebase Client] Missing or invalid configuration for: ${missingFirebaseConfigKeys.join(', ')}. ` +
    `Ensure required variables are set in .env or the runtime environment.`
  );
}

export const firebaseApp = isFirebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

