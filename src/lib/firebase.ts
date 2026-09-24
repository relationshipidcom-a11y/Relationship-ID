import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  ...(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
    ? { measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID }
    : {})
};

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
