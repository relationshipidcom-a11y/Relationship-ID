import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, __setTestDeps, getPublicStaticDir } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

function makeRequest(
  baseUrl: string,
  reqPath: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  const base = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port,
        path: reqPath,
        method: options.method || 'GET',
        headers: options.headers || {}
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body
          });
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

test('Canonical apex domain redirect suite (relationshipid.org -> https://www.relationshipid.org)', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth, 'relationship-id');

  const staticDir = getPublicStaticDir();
  const app = createApp({ staticDir });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // 1. Apex domain redirect: GET and HEAD on relationshipid.org return HTTP 301 to https://www.relationshipid.org/
  await t.test('1. Apex domain GET and HEAD return HTTP 301 to https://www.relationshipid.org/', async () => {
    const getRes = await makeRequest(baseUrl, '/', {
      method: 'GET',
      headers: { Host: 'relationshipid.org' }
    });
    assert.equal(getRes.status, 301, `GET / on relationshipid.org must return 301, got ${getRes.status}`);
    assert.equal(getRes.headers.location, 'https://www.relationshipid.org/');

    const headRes = await makeRequest(baseUrl, '/', {
      method: 'HEAD',
      headers: { Host: 'relationshipid.org' }
    });
    assert.equal(headRes.status, 301, `HEAD / on relationshipid.org must return 301, got ${headRes.status}`);
    assert.equal(headRes.headers.location, 'https://www.relationshipid.org/');
  });

  // 2. Full path and query string preservation on apex redirect
  await t.test('2. Preserves full path and query string across redirects', async () => {
    const testCases = [
      { path: '/about', expected: 'https://www.relationshipid.org/about' },
      { path: '/privacy', expected: 'https://www.relationshipid.org/privacy' },
      { path: '/terms', expected: 'https://www.relationshipid.org/terms' },
      { path: '/about?lang=ar', expected: 'https://www.relationshipid.org/about?lang=ar' },
      { path: '/invite/abc-token-12345?ref=partner-456&src=qr', expected: 'https://www.relationshipid.org/invite/abc-token-12345?ref=partner-456&src=qr' },
      { path: '/verify/rel-uuid-789?lang=ar&source=share', expected: 'https://www.relationshipid.org/verify/rel-uuid-789?lang=ar&source=share' }
    ];

    for (const { path: reqPath, expected } of testCases) {
      const res = await makeRequest(baseUrl, reqPath, {
        method: 'GET',
        headers: { Host: 'relationshipid.org' }
      });
      assert.equal(res.status, 301, `GET ${reqPath} must return 301, got ${res.status}`);
      assert.equal(res.headers.location, expected, `Location header for ${reqPath} must match fixed destination`);
    }
  });

  // 3. www.relationshipid.org must not redirect to itself (no loops)
  await t.test('3. www.relationshipid.org does not redirect to itself', async () => {
    const getRes = await makeRequest(baseUrl, '/', {
      method: 'GET',
      headers: { Host: 'www.relationshipid.org' }
    });
    assert.notEqual(getRes.status, 301, `www.relationshipid.org / must not return 301, got ${getRes.status}`);
    assert.equal(getRes.status, 200, `www.relationshipid.org / must serve 200, got ${getRes.status}`);

    const aboutRes = await makeRequest(baseUrl, '/about', {
      method: 'GET',
      headers: { Host: 'www.relationshipid.org' }
    });
    assert.notEqual(aboutRes.status, 301, `www.relationshipid.org /about must not return 301, got ${aboutRes.status}`);
    assert.equal(aboutRes.status, 200, `www.relationshipid.org /about must serve 200, got ${aboutRes.status}`);
  });

  // 4. Preview hosts, localhost, and Cloud Run / AI Studio hosts are unaffected
  await t.test('4. Preview, localhost, and run.app hosts are unaffected', async () => {
    const nonApexHosts = [
      'localhost:3000',
      'localhost',
      '127.0.0.1',
      'ais-dev-trdgv4hjf5d3tnun7bdurf-920442970136.europe-west2.run.app',
      'ais-pre-trdgv4hjf5d3tnun7bdurf-920442970136.europe-west2.run.app',
      '27089af6-fc5f-42e9-a765-9f1c97cf384d.aistudio.google.com'
    ];

    for (const h of nonApexHosts) {
      const res = await makeRequest(baseUrl, '/about', {
        method: 'GET',
        headers: { Host: h }
      });
      assert.notEqual(res.status, 301, `Host ${h} must not return 301 redirect`);
      assert.equal(res.status, 200, `Host ${h} should serve 200 for public page`);
    }
  });

  // 5. API requests, health checks, and POST requests on apex domain are unaffected
  await t.test('5. API requests, health checks, and POST requests are unaffected', async () => {
    // Health check GET
    const healthRes = await makeRequest(baseUrl, '/api/health', {
      method: 'GET',
      headers: { Host: 'relationshipid.org' }
    });
    assert.notEqual(healthRes.status, 301, `/api/health on relationshipid.org must not redirect`);
    assert.equal(healthRes.status, 200, `/api/health must return 200`);

    // POST request on apex domain must not redirect
    const postRes = await makeRequest(baseUrl, '/api/error-report', {
      method: 'POST',
      headers: {
        Host: 'relationshipid.org',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ errorCategory: 'unknown' })
    });
    assert.notEqual(postRes.status, 301, `POST /api/error-report on relationshipid.org must not return 301`);

    // Non-API POST request must not redirect
    const postRootRes = await makeRequest(baseUrl, '/about', {
      method: 'POST',
      headers: { Host: 'relationshipid.org' }
    });
    assert.notEqual(postRootRes.status, 301, `POST /about on relationshipid.org must not return 301`);
  });

  // 6. Authentication callbacks and internal endpoints are unaffected
  await t.test('6. Authentication callbacks and internal endpoints are unaffected', async () => {
    const authRes = await makeRequest(baseUrl, '/__/auth/handler', {
      method: 'GET',
      headers: { Host: 'relationshipid.org' }
    });
    assert.notEqual(authRes.status, 301, `/__/auth/handler on relationshipid.org must not redirect`);
    assert.equal(authRes.status, 404, `/__/auth/handler must return 404`);

    const firebaseRes = await makeRequest(baseUrl, '/__/firebase/init.json', {
      method: 'GET',
      headers: { Host: 'relationshipid.org' }
    });
    assert.notEqual(firebaseRes.status, 301, `/__/firebase/init.json on relationshipid.org must not redirect`);
    assert.equal(firebaseRes.status, 404, `/__/firebase/init.json must return 404`);
  });

  // 7. Port variants on apex domain (e.g., relationshipid.org:80 / :443) are correctly matched
  await t.test('7. Port variants on apex domain redirect to https://www.relationshipid.org', async () => {
    const res80 = await makeRequest(baseUrl, '/about', {
      method: 'GET',
      headers: { Host: 'relationshipid.org:80' }
    });
    assert.equal(res80.status, 301, `relationshipid.org:80 must return 301`);
    assert.equal(res80.headers.location, 'https://www.relationshipid.org/about');

    const res443 = await makeRequest(baseUrl, '/about', {
      method: 'GET',
      headers: { Host: 'relationshipid.org:443' }
    });
    assert.equal(res443.status, 301, `relationshipid.org:443 must return 301`);
    assert.equal(res443.headers.location, 'https://www.relationshipid.org/about');
  });

  // 8. Open-redirect attack mitigation: target hostname is fixed and protocol-relative paths are sanitized
  await t.test('8. Open-redirect attack mitigation: target hostname is fixed and protocol-relative paths are sanitized', async () => {
    // Protocol-relative attempt: //attacker.com
    const protoRes = await makeRequest(baseUrl, '//attacker.com/test', {
      method: 'GET',
      headers: { Host: 'relationshipid.org' }
    });
    assert.equal(protoRes.status, 301);
    const loc = protoRes.headers.location;
    assert.equal(loc, 'https://www.relationshipid.org/attacker.com/test');
    assert.equal(loc?.startsWith('https://www.relationshipid.org/'), true);

    // Spoofed X-Forwarded-Host when connecting to localhost must not redirect
    const spoofRes = await makeRequest(baseUrl, '/about', {
      method: 'GET',
      headers: {
        Host: 'localhost',
        'X-Forwarded-Host': 'attacker.com'
      }
    });
    assert.notEqual(spoofRes.status, 301, `Spoofed host must not redirect`);
    assert.equal(spoofRes.status, 200);
  });
});
