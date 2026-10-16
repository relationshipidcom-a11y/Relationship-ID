import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { createApp, __setTestDeps, getPublicStaticDir } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

test('Production static serving and artifact disclosure protection suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  const staticDir = getPublicStaticDir();
  const app = createApp({ staticDir });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  // Read backend bundle and sourcemap if present on disk for body comparison proof
  const backendBundlePath = path.join(process.cwd(), 'dist', 'server.cjs');
  const backendBundleContent = fs.existsSync(backendBundlePath) ? fs.readFileSync(backendBundlePath, 'utf8') : '';

  try {
    // 1. Plain and encoded backend bundle/source-map paths return 404 for GET and HEAD
    await t.test('1. Plain and encoded backend bundle/source-map paths return 404 for GET and HEAD', async () => {
      const blockedPaths = [
        '/server.cjs',
        '/server%2ecjs',
        '/server%2Ecjs',
        '/server.cjs.map',
        '/server.cjs%2emap',
        '/server%2ecjs%2emap',
        '/server%2Ecjs%2Emap'
      ];

      for (const p of blockedPaths) {
        // GET check
        const getRes = await fetch(`${baseUrl}${p}`);
        assert.equal(getRes.status, 404, `GET ${p} should return 404, got ${getRes.status}`);
        const getText = await getRes.text();
        assert.equal(getText.includes('Relationship ID server'), false, `GET ${p} body disclosed backend bundle`);
        if (backendBundleContent) {
          assert.notEqual(getText, backendBundleContent, `GET ${p} body matched server.cjs artifact exactly`);
        }

        // HEAD check
        const headRes = await fetch(`${baseUrl}${p}`, { method: 'HEAD' });
        assert.equal(headRes.status, 404, `HEAD ${p} should return 404, got ${headRes.status}`);
      }
    });

    // 2. Encoded separators and traversal variants cannot expose backend artifacts
    await t.test('2. Encoded separators and traversal variants cannot expose backend artifacts', async () => {
      const traversalPaths = [
        '/assets/%2e%2e/server.cjs',
        '/assets/%2e%2e/server%2ecjs',
        '/assets/%2E%2E/server%2Ecjs',
        '/assets/%2e%2e%2fserver%2ecjs',
        '/assets/%2e%2e/server.cjs.map',
        '/assets/%2e%2e/server.cjs%2emap',
        '/assets/%2e%2e/server%2ecjs%2emap',
        '/%2e%2e/server.cjs',
        '/%2e%2e%2fserver.cjs',
        '/brand/%2e%2e/server.cjs',
        '/assets/..%2fserver.cjs',
        '/%2e%2e/%2e%2e/dist/server.cjs'
      ];

      for (const p of traversalPaths) {
        const res = await fetch(`${baseUrl}${p}`);
        assert.equal(res.status, 404, `Traversal path ${p} should return 404, got ${res.status}`);
        const text = await res.text();
        assert.equal(text.includes('Relationship ID server'), false, `Traversal path ${p} disclosed backend bundle`);
        if (backendBundleContent) {
          assert.notEqual(text, backendBundleContent, `Traversal path ${p} body matched server.cjs artifact`);
        }
      }
    });

    // 3. Malformed URL escapes cannot cause an uncaught error
    await t.test('3. Malformed URL escapes cannot cause an uncaught error', async () => {
      const malformedPaths = [
        '/%c0%af',
        '/test%zz',
        '/%ff',
        '/%',
        '/assets/%2',
        '/test%E0%A0'
      ];

      for (const p of malformedPaths) {
        const res = await fetch(`${baseUrl}${p}`);
        assert.ok([400, 404].includes(res.status), `Malformed escape ${p} returned ${res.status}, expected 400 or 404 without crashing`);
      }

      // Confirm server is still healthy and responsive
      const healthRes = await fetch(`${baseUrl}/api/health`);
      assert.ok([200, 503].includes(healthRes.status), 'Server remains alive after malformed URL escape attacks');
    });

    // 4. Browser JavaScript, CSS, brand SVG, home page, and SPA deep links still work
    await t.test('4. Browser JavaScript, CSS, brand SVG, home page, and SPA deep links work', async () => {
      // Home page
      const homeRes = await fetch(`${baseUrl}/`);
      assert.equal(homeRes.status, 200, 'Home page should return 200');
      assert.ok(homeRes.headers.get('content-type')?.includes('text/html'), 'Home page should have text/html content-type');
      const homeHtml = await homeRes.text();
      assert.ok(homeHtml.includes('<div id="root"></div>') || homeHtml.includes('<!DOCTYPE html>'), 'Home page should serve index.html');

      // SPA deep links
      const spaLinks = ['/about', '/privacy', '/terms', '/this-page-does-not-exist', '/invite/test-id-123'];
      for (const link of spaLinks) {
        const res = await fetch(`${baseUrl}${link}`);
        assert.equal(res.status, 200, `SPA route ${link} should return 200 with index.html fallback`);
        assert.ok(res.headers.get('content-type')?.includes('text/html'), `SPA route ${link} should return text/html`);
      }

      // robots.txt static file
      const robotsRes = await fetch(`${baseUrl}/robots.txt`);
      assert.equal(robotsRes.status, 200, 'robots.txt should return 200');
      assert.ok(robotsRes.headers.get('content-type')?.includes('text/plain'), 'robots.txt has text/plain content-type');
      const robotsTxt = await robotsRes.text();
      assert.ok(robotsTxt.includes('User-agent: *'), 'robots.txt contains User-agent directive');
      assert.ok(robotsTxt.includes('Sitemap:'), 'robots.txt specifies sitemap location');

      // sitemap.xml static file
      const sitemapRes = await fetch(`${baseUrl}/sitemap.xml`);
      assert.equal(sitemapRes.status, 200, 'sitemap.xml should return 200');
      assert.ok(sitemapRes.headers.get('content-type')?.includes('xml'), 'sitemap.xml has xml content-type');
      const sitemapXml = await sitemapRes.text();
      assert.ok(sitemapXml.includes('<loc>https://www.relationshipid.org/</loc>'), 'sitemap contains homepage');
      assert.ok(sitemapXml.includes('<loc>https://www.relationshipid.org/about</loc>'), 'sitemap contains about page');
      assert.equal(sitemapXml.includes('/invite/'), false, 'sitemap must not contain invite URLs');
      assert.equal(sitemapXml.includes('/cert'), false, 'sitemap must not contain certificate URLs');

      // Brand SVG
      const svgRes = await fetch(`${baseUrl}/brand/relationship-id-logo.svg`);
      if (svgRes.status === 200) {
        assert.ok(svgRes.headers.get('content-type')?.includes('svg'), 'Brand SVG has image/svg+xml content-type');
      }

      // Built asset JS & CSS files in dist/client/assets
      const assetsDir = path.join(staticDir, 'assets');
      if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir);
        const jsFile = files.find((f) => f.endsWith('.js'));
        const cssFile = files.find((f) => f.endsWith('.css'));

        if (jsFile) {
          const jsRes = await fetch(`${baseUrl}/assets/${jsFile}`);
          assert.equal(jsRes.status, 200, `JavaScript asset ${jsFile} should return 200`);
          assert.ok(jsRes.headers.get('content-type')?.includes('javascript'), 'JavaScript asset has javascript content-type');
        }

        if (cssFile) {
          const cssRes = await fetch(`${baseUrl}/assets/${cssFile}`);
          assert.equal(cssRes.status, 200, `CSS asset ${cssFile} should return 200`);
          assert.ok(cssRes.headers.get('content-type')?.includes('css'), 'CSS asset has text/css content-type');
        }
      }
    });

    // 5. Missing assets cannot return sensitive files or index.html
    await t.test('5. Missing assets cannot return sensitive files or SPA fallback', async () => {
      const missingAssets = [
        '/assets/nonexistent.js',
        '/assets/missing-style.css',
        '/assets/chunk-missing.map',
        '/brand/nonexistent-logo.png',
        '/missing-script.js',
        '/nonexistent-image.jpg'
      ];

      for (const p of missingAssets) {
        const res = await fetch(`${baseUrl}${p}`);
        assert.equal(res.status, 404, `Missing asset ${p} must return 404, not 200 SPA fallback`);
        const text = await res.text();
        assert.equal(text.includes('<!DOCTYPE html>'), false, `Missing asset ${p} returned index.html fallback`);
        assert.equal(text.includes('Relationship ID server'), false, `Missing asset ${p} disclosed backend bundle`);
      }
    });

    // 6. Unsupported app-host Firebase auth helper routes return 404 and never proxy or serve SPA
    await t.test('6. Unsupported app-host Firebase auth helper routes return 404 and never proxy or serve SPA', async () => {
      const authHelperPaths = [
        '/__/auth/handler',
        '/__/auth/experiments.js',
        '/__/auth/iframe',
        '/__/firebase/init.js',
        '/__/firebase/init.json',
        '/__%2fauth/handler',
        '/__%2ffirebase/init.js'
      ];

      for (const p of authHelperPaths) {
        const res = await fetch(`${baseUrl}${p}`);
        assert.equal(res.status, 404, `Auth helper route ${p} should return 404, got ${res.status}`);
        const text = await res.text();
        assert.equal(text.includes('<!DOCTYPE html>'), false, `Auth helper route ${p} returned index.html SPA fallback`);
      }
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
