export interface Diagnostics {
  localStorage: 'available' | 'blocked' | 'failed' | 'unsupported';
  sessionStorage: 'available' | 'blocked' | 'failed' | 'unsupported';
  secureContext: 'yes' | 'no' | 'unknown';
  indexedDB: 'not tested';
}

const classifyStorageError = (e: unknown): 'blocked' | 'failed' => {
  try {
    const name = (e as any)?.name;
    if (name === 'SecurityError') {
      return 'blocked';
    }
  } catch {
    // Reading name threw; treat as generic failure
  }
  return 'failed';
};

export const runDiagnostics = (): Diagnostics => {
  const checkStorage = (storageType: 'localStorage' | 'sessionStorage'): 'available' | 'blocked' | 'failed' | 'unsupported' => {
    if (typeof window === 'undefined') return 'unsupported';
    
    let storage: Storage;
    try {
      storage = window[storageType];
      if (!storage) return 'unsupported';
    } catch (e) {
      return classifyStorageError(e);
    }

    const key = `__probe_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    try {
      storage.setItem(key, '1');
      const value = storage.getItem(key);
      const readMatch = value === '1';
      
      try {
        storage.removeItem(key);
        return readMatch ? 'available' : 'failed';
      } catch {
        return 'failed';
      }
    } catch (e: unknown) {
      try {
        storage.removeItem(key);
      } catch {}
      
      return classifyStorageError(e);
    }
  };

  let secureContext: 'yes' | 'no' | 'unknown' = 'unknown';
  try {
    if (typeof window !== 'undefined' && typeof window.isSecureContext === 'boolean') {
      secureContext = window.isSecureContext ? 'yes' : 'no';
    }
  } catch {
    secureContext = 'unknown';
  }

  return {
    localStorage: checkStorage('localStorage'),
    sessionStorage: checkStorage('sessionStorage'),
    secureContext,
    indexedDB: 'not tested',
  };
};
