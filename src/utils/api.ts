import { auth } from '../lib/firebase';

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (!auth?.currentUser) {
    throw new Error('AUTH_REQUIRED');
  }

  const token = await auth.currentUser.getIdToken(true);
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}
