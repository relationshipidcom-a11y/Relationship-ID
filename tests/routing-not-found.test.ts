import assert from 'node:assert/strict';
import test from 'node:test';
import { getRouteState } from '../src/utils/routing';

test('Routing and 404 Route State Suite', async (t) => {
  await t.test('1. Unknown URLs resolve to not_found screen', () => {
    const unknownPaths = [
      '/this-page-does-not-exist',
      '/non-existent-page',
      '/unknown',
      '/foo/bar/baz',
      '/404',
      '/settings/admin',
      '/auth/login'
    ];

    for (const path of unknownPaths) {
      const state = getRouteState(path);
      assert.equal(state.screen, 'not_found', `Expected ${path} to resolve to not_found, got ${state.screen}`);
    }
  });

  await t.test('2. Valid application routes resolve correctly', () => {
    // Root / home
    assert.equal(getRouteState('/').screen, 'auth');
    assert.equal(getRouteState('').screen, 'auth');

    // Legal and informational routes
    assert.equal(getRouteState('/about').screen, 'about');
    assert.equal(getRouteState('/privacy').screen, 'privacy');
    assert.equal(getRouteState('/terms').screen, 'terms');

    // Registration and workflow routes
    assert.equal(getRouteState('/review').screen, 'review_controls');
    assert.equal(getRouteState('/waiting').screen, 'p1_waiting');
    assert.equal(getRouteState('/p2').screen, 'p2_details');

    // Certificate and verify routes
    assert.equal(getRouteState('/cert').screen, 'official_certificate');
    assert.equal(getRouteState('/certificate').screen, 'official_certificate');
    const certWithRef = getRouteState('/certificate/RID-2026-TEST');
    assert.equal(certWithRef.screen, 'official_certificate');
    assert.equal(certWithRef.certRef, 'RID-2026-TEST');

    assert.equal(getRouteState('/verify').screen, 'verify_portal');
    const verifyWithRef = getRouteState('/verify/RID-2026-XYZ');
    assert.equal(verifyWithRef.screen, 'verify_portal');
    assert.equal(verifyWithRef.certRef, 'RID-2026-XYZ');

    // Partner 2 invitation routes
    const p2Landing = getRouteState('/invite/INV-12345');
    assert.equal(p2Landing.screen, 'p2_landing');
    assert.equal(p2Landing.inviteId, 'INV-12345');

    const p2Auth = getRouteState('/invite/INV-12345/auth');
    assert.equal(p2Auth.screen, 'p2_auth');
    assert.equal(p2Auth.inviteId, 'INV-12345');

    const p2Details = getRouteState('/invite/INV-12345/details');
    assert.equal(p2Details.screen, 'p2_details');
    assert.equal(p2Details.inviteId, 'INV-12345');
  });
});
