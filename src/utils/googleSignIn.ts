import type { Auth } from 'firebase/auth';
import type { AuthPersistenceController } from './authPersistence';
import { getAuthErrorCode } from './authErrors';

export interface GoogleSignInOps<T = any> {
  popup: (auth: Auth) => Promise<T>;
  redirect: (auth: Auth) => Promise<void>;
}

export type GoogleSignInResult<T = any> =
  | { started: false; reason: 'busy' | 'not-ready' | 'no-auth' }
  | { started: true; redirected: false; result: T }
  | { started: true; redirected: true; result?: undefined };

export async function runGoogleSignIn<T = any>(
  controller: AuthPersistenceController,
  ops: GoogleSignInOps<T>
): Promise<GoogleSignInResult<T>> {
  const attempt = await controller.runAuthAttempt(async (auth: Auth) => {
    try {
      const result = await ops.popup(auth);
      return { redirected: false as const, result };
    } catch (popupErr: unknown) {
      const code =
        getAuthErrorCode(popupErr) ||
        (popupErr && typeof popupErr === 'object' && 'code' in popupErr
          ? String((popupErr as { code: unknown }).code)
          : '');

      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        await ops.redirect(auth);
        return { redirected: true as const };
      }

      throw popupErr;
    }
  });

  if (!attempt.started) {
    return { started: false, reason: attempt.reason };
  }

  if (attempt.result.redirected) {
    return { started: true, redirected: true };
  }

  return {
    started: true,
    redirected: false,
    result: attempt.result.result,
  };
}
