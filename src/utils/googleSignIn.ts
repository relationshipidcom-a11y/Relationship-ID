import type { Auth } from 'firebase/auth';
import type { AuthPersistenceController } from './authPersistence';

export interface GoogleSignInOps<T = any> {
  popup: (auth: Auth) => Promise<T>;
  redirect?: (auth: Auth) => Promise<void>;
}

export type GoogleSignInResult<T = any> =
  | { started: false; reason: 'busy' | 'not-ready' | 'no-auth' }
  | { started: true; redirected: false; result: T };

export async function runGoogleSignIn<T = any>(
  controller: AuthPersistenceController,
  ops: GoogleSignInOps<T>
): Promise<GoogleSignInResult<T>> {
  const attempt = await controller.runAuthAttempt(async (auth: Auth) => {
    // Initiate popup directly from the user gesture; do not automatically redirect
    const result = await ops.popup(auth);
    return { redirected: false as const, result };
  });

  if (!attempt.started) {
    return { started: false, reason: attempt.reason };
  }

  return {
    started: true,
    redirected: false,
    result: attempt.result.result,
  };
}
