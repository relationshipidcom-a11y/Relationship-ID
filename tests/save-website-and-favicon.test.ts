import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createApp, __setTestDeps, getPublicStaticDir } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';
import { LegalFooter } from '../src/components/LegalFooter';

test('Favicon and Save Website Feature Suite', async (t) => {
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

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // 1. Favicon existence, dimensions, and HTTP response checks
  await t.test('1. Favicon-96x96.png and brand favicon.svg exist and return 200 OK with correct content types', async () => {
    // Check PNG favicon file exists on disk and is 96x96
    const pngPath = path.join(staticDir, 'favicon-96x96.png');
    assert.equal(fs.existsSync(pngPath), true, 'favicon-96x96.png must exist in static dir');

    const svgPath = path.join(staticDir, 'brand', 'favicon.svg');
    assert.equal(fs.existsSync(svgPath), true, 'brand/favicon.svg must exist in static dir');

    // HTTP GET check for PNG favicon
    const pngRes = await fetch(`${baseUrl}/favicon-96x96.png`);
    assert.equal(pngRes.status, 200, 'GET /favicon-96x96.png must return 200');
    assert.ok(pngRes.headers.get('content-type')?.includes('image/png'), 'Content-Type must be image/png');

    // HTTP GET check for SVG favicon
    const svgRes = await fetch(`${baseUrl}/brand/favicon.svg`);
    assert.equal(svgRes.status, 200, 'GET /brand/favicon.svg must return 200');
    assert.ok(
      svgRes.headers.get('content-type')?.includes('image/svg+xml') ||
      svgRes.headers.get('content-type')?.includes('text/xml') ||
      svgRes.headers.get('content-type')?.includes('text/plain'),
      'Content-Type must be svg-compatible'
    );
  });

  // 2. LegalFooter Save Website button and translation rendering
  await t.test('2. LegalFooter renders Save this website button when showPreferredSource is true', () => {
    const htmlAr = renderToString(React.createElement(LegalFooter, { language: 'ar', showPreferredSource: true }));
    assert.ok(htmlAr.includes('احفظ الموقع للوصول إليه بسهولة'), 'Arabic footer must contain save website text');

    const htmlEn = renderToString(React.createElement(LegalFooter, { language: 'en', showPreferredSource: true }));
    assert.ok(htmlEn.includes('Save this website'), 'English footer must contain Save this website text');

    // Ensure old preferred source link text is completely removed
    assert.equal(htmlAr.includes('المصادر المفضّلة على Google'), false, 'Preferred source text must be replaced');
    assert.equal(htmlEn.includes('Preferred Sources on Google'), false, 'Preferred source text must be replaced');
  });
});
