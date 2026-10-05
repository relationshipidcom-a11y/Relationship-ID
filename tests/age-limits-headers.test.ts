import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAtLeast18,
  limiter,
  rateLimitMap,
  getSecurityHeaders,
  securityHeadersMiddleware
} from '../server';

test('isAtLeast18: 17y364d -> false; exactly 18 today -> true; future date -> false; invalid date 31/02 -> false', () => {
  // Reference date: 2026-09-29T12:00:00Z
  const refDate = new Date(Date.UTC(2026, 8, 29, 12, 0, 0));

  // 1. Exactly 18 today: born 2008-09-29 -> true
  assert.equal(isAtLeast18('2008', '09', '29', refDate), true);
  assert.equal(isAtLeast18(2008, 9, 29, refDate), true);

  // 2. 17y 364d: born 2008-09-30 (turns 18 tomorrow) -> false
  assert.equal(isAtLeast18('2008', '09', '30', refDate), false);
  assert.equal(isAtLeast18(2008, 9, 30, refDate), false);

  // 3. Future date: born 2027-01-01 -> false
  assert.equal(isAtLeast18('2027', '01', '01', refDate), false);
  assert.equal(isAtLeast18(2027, 1, 1, refDate), false);

  // 4. Invalid date: 31/02 (Feb 31 does not exist in any calendar) -> false
  assert.equal(isAtLeast18('2000', '02', '31', refDate), false);
  assert.equal(isAtLeast18(2000, 2, 31, refDate), false);
});

test('limiter: allows exactly the limit, blocks the next, allows again after the window (use the "now" parameter)', () => {
  const key = `test_rate_limiter_${Date.now()}`;
  const limit = 5;
  const windowMs = 60000;
  const baseTime = 1000000;

  // 1. Allows exactly the limit (5 calls)
  for (let i = 0; i < limit; i++) {
    const allowed = limiter(key, limit, windowMs, baseTime);
    assert.equal(allowed, true, `Call #${i + 1} should be allowed within limit`);
  }

  // 2. Blocks the next (6th) call
  const blocked = limiter(key, limit, windowMs, baseTime + 5000);
  assert.equal(blocked, false, 'Call #6 should be blocked when limit is reached');

  // 3. Allows again after the window (baseTime + 60001)
  const allowedAfterWindow = limiter(key, limit, windowMs, baseTime + 60001);
  assert.equal(allowedAfterWindow, true, 'Call after window expiration should be allowed');
});

test('headers: assert the 4 always-on headers exist, and CSP/HSTS appear only when NODE_ENV is production', () => {
  // Test development environment
  const devHeaders = getSecurityHeaders('development');
  assert.equal(devHeaders['X-Content-Type-Options'], 'nosniff');
  assert.equal(devHeaders['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(devHeaders['X-Frame-Options'], 'DENY');
  assert.equal(devHeaders['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
  assert.equal(devHeaders['Strict-Transport-Security'], undefined);
  assert.equal(devHeaders['Content-Security-Policy'], undefined);

  // Test test environment
  const testHeaders = getSecurityHeaders('test');
  assert.equal(testHeaders['X-Content-Type-Options'], 'nosniff');
  assert.equal(testHeaders['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(testHeaders['X-Frame-Options'], 'DENY');
  assert.equal(testHeaders['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
  assert.equal(testHeaders['Strict-Transport-Security'], undefined);
  assert.equal(testHeaders['Content-Security-Policy'], undefined);

  // Test production environment
  const prodHeaders = getSecurityHeaders('production');
  assert.equal(prodHeaders['X-Content-Type-Options'], 'nosniff');
  assert.equal(prodHeaders['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(prodHeaders['X-Frame-Options'], 'DENY');
  assert.equal(prodHeaders['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
  assert.equal(prodHeaders['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
  
  const csp = prodHeaders['Content-Security-Policy'];
  assert.ok(csp, 'Content-Security-Policy must be set in production');
  assert.ok(csp.includes("default-src 'self'"), 'CSP includes default-src self');
  assert.ok(csp.includes("object-src 'none'"), 'CSP includes object-src none');
  assert.ok(csp.includes("base-uri 'self'"), 'CSP includes base-uri self');
  assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP includes frame-ancestors none');
  assert.ok(csp.includes("form-action 'self'"), 'CSP includes form-action self');
  assert.ok(csp.includes('https://apis.google.com'), 'CSP includes apis.google.com');
  assert.ok(csp.includes('https://accounts.google.com'), 'CSP includes accounts.google.com');
  assert.ok(csp.includes('https://www.google.com'), 'CSP includes www.google.com');
  assert.ok(csp.includes('https://www.gstatic.com'), 'CSP includes www.gstatic.com');
  assert.ok(csp.includes('https://fonts.googleapis.com'), 'CSP includes fonts.googleapis.com');
  assert.ok(csp.includes('https://fonts.gstatic.com'), 'CSP includes fonts.gstatic.com');
  assert.ok(csp.includes('https://*.googleapis.com'), 'CSP includes *.googleapis.com');
  assert.ok(csp.includes('https://*.firebaseapp.com'), 'CSP includes *.firebaseapp.com');
  assert.ok(!csp.includes("'unsafe-eval'"), 'CSP must NOT include unsafe-eval');

  // Assert middleware behavior
  const mockReq = {} as any;
  const setHeaders: Record<string, string> = {};
  const mockRes = {
    setHeader: (name: string, value: string) => {
      setHeaders[name] = value;
    }
  } as any;
  let nextCalled = false;
  securityHeadersMiddleware(mockReq, mockRes, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(setHeaders['X-Content-Type-Options'], 'nosniff');
  assert.equal(setHeaders['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(setHeaders['X-Frame-Options'], 'DENY');
  assert.equal(setHeaders['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
});
