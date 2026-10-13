import { useState, useEffect, useRef, useSyncExternalStore, useCallback } from 'react';
import type { Auth, Persistence } from 'firebase/auth';
import { browserLocalPersistence, browserSessionPersistence, setPersistence } from 'firebase/auth';

export type PersistenceStatus = 'pending' | 'ready' | 'error';

export interface AuthPersistenceState {
  status: PersistenceStatus;
  rememberMe: boolean;
  error: Error | null;
  authInFlight: boolean;
}

export interface PersistenceAdapter {
  setPersistence: (auth: Auth, persistence: Persistence) => Promise<void>;
  localPersistence: Persistence;
  sessionPersistence: Persistence;
}

export const defaultPersistenceAdapter: PersistenceAdapter = {
  setPersistence,
  localPersistence: browserLocalPersistence,
  sessionPersistence: browserSessionPersistence,
};

export type AuthAttemptOutcome<T> =
  | { started: false; reason: 'busy' | 'not-ready' | 'no-auth' }
  | { started: true; result: T };

export class AuthPersistenceController {
  private requestId = 0;
  private authInFlight = false;
  private state: AuthPersistenceState;
  private listeners: Set<(state: AuthPersistenceState) => void> = new Set();
  private auth: Auth | null;
  private adapter: PersistenceAdapter;

  constructor(
    auth: Auth | null,
    initialRememberMe = true,
    adapter: PersistenceAdapter = defaultPersistenceAdapter
  ) {
    this.auth = auth;
    this.adapter = adapter;
    this.state = {
      status: auth ? 'pending' : 'error',
      rememberMe: initialRememberMe,
      error: auth ? null : new Error('Firebase Auth is not initialized'),
      authInFlight: false,
    };
  }

  public getState(): AuthPersistenceState {
    return this.state;
  }

  public isGoogleSignInReady(loading: boolean): boolean {
    return !loading && !this.authInFlight && this.state.status === 'ready' && !!this.auth;
  }

  public subscribe(listener: (state: AuthPersistenceState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        // Safe dispatch: subscriber error must not prevent other notifications
      }
    }
  }

  public setAuth(auth: Auth | null) {
    if (this.auth === auth && this.state.status !== 'pending') {
      return;
    }
    this.auth = auth;
    void this.apply(this.state.rememberMe);
  }

  public setRememberMe(rememberMe: boolean): boolean {
    if (this.authInFlight) {
      // Prevent preference changes while an authentication attempt is in flight
      return false;
    }
    if (this.state.rememberMe === rememberMe && this.state.status === 'ready') {
      return true;
    }
    void this.apply(rememberMe);
    return true;
  }

  public retry(): Promise<boolean> {
    return this.apply(this.state.rememberMe);
  }

  public async runAuthAttempt<T>(
    fn: (auth: Auth) => Promise<T>
  ): Promise<AuthAttemptOutcome<T>> {
    // Synchronous live controller checks before any await
    if (this.authInFlight) {
      return { started: false, reason: 'busy' };
    }
    if (!this.auth) {
      return { started: false, reason: 'no-auth' };
    }
    if (this.state.status !== 'ready') {
      return { started: false, reason: 'not-ready' };
    }

    // Set lock synchronously and notify before any await
    this.authInFlight = true;
    this.state = {
      ...this.state,
      authInFlight: true,
    };
    this.notify();

    try {
      const result = await fn(this.auth);
      return { started: true, result };
    } finally {
      this.authInFlight = false;
      this.state = {
        ...this.state,
        authInFlight: false,
      };
      this.notify();
    }
  }

  public async apply(rememberMe: boolean): Promise<boolean> {
    const currentId = ++this.requestId;
    this.state = {
      ...this.state,
      status: 'pending',
      error: null,
      rememberMe,
    };
    this.notify();

    if (!this.auth) {
      this.state = {
        ...this.state,
        status: 'error',
        error: new Error('Firebase Auth is not initialized'),
      };
      this.notify();
      return false;
    }

    const targetPersistence = rememberMe
      ? this.adapter.localPersistence
      : this.adapter.sessionPersistence;

    try {
      await this.adapter.setPersistence(this.auth, targetPersistence);
      // Criterion 8: Prevent stale initialization completions from marking an outdated selection ready
      if (this.requestId !== currentId) {
        return false;
      }
      this.state = {
        ...this.state,
        status: 'ready',
        error: null,
      };
      this.notify();
      return true;
    } catch (err: unknown) {
      // Criterion 8: Prevent stale completions from overwriting state
      if (this.requestId !== currentId) {
        return false;
      }
      this.state = {
        ...this.state,
        status: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
      };
      this.notify();
      return false;
    }
  }
}

export function useAuthPersistence(
  auth: Auth | null,
  initialRememberMe = true,
  adapter?: PersistenceAdapter
) {
  const [controller] = useState(
    () => new AuthPersistenceController(auth, initialRememberMe, adapter)
  );

  // Synchronously subscribe before effects run to avoid missed synchronous notifications
  const subscribe = useCallback(
    (onStoreChange: () => void) => controller.subscribe(onStoreChange),
    [controller]
  );
  const getSnapshot = useCallback(() => controller.getState(), [controller]);
  const state = useSyncExternalStore(subscribe, getSnapshot);

  const initialMountRef = useRef(true);

  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      void controller.apply(initialRememberMe);
      return;
    }
    controller.setAuth(auth);
  }, [auth, controller, initialRememberMe]);

  return {
    persistenceStatus: state.status,
    rememberMe: state.rememberMe,
    persistenceError: state.error,
    authInFlight: state.authInFlight,
    isGoogleSignInReady: (loading: boolean) => controller.isGoogleSignInReady(loading),
    setRememberMe: (val: boolean) => controller.setRememberMe(val),
    retryPersistence: () => controller.retry(),
    runAuthAttempt: <T>(fn: (auth: Auth) => Promise<T>) => controller.runAuthAttempt(fn),
    controller,
  };
}
