import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { createApp, __setTestDeps, getPublicStaticDir } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

test('Compression and Google Fonts suite', async (t) => {
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

  const assetsDir = path.join(staticDir, 'assets');
  const files = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
  const jsFile = files.find((f) => f.endsWith('.js'));
  assert.ok(jsFile, 'A built JavaScript asset file must exist in assetsDir');

  // 1. GET a built JS file under /assets/ with "Accept-Encoding: gzip" -> response header content-encoding is gzip AND Cache-Control is still "public, max-age=31536000, immutable".
  await t.test('1. GET a built JS file under /assets/ with Accept-Encoding: gzip returns content-encoding gzip and immutable Cache-Control', async () => {
    const res = await fetch(`${baseUrl}/assets/${jsFile}`, {
      headers: { 'Accept-Encoding': 'gzip' }
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-encoding'), 'gzip', 'content-encoding must be gzip');
    assert.equal(
      res.headers.get('cache-control'),
      'public, max-age=31536000, immutable',
      'Cache-Control must remain public, max-age=31536000, immutable'
    );
  });

  // 2. Same request WITHOUT Accept-Encoding -> no content-encoding header, body identical to the file.
  await t.test('2. Same request WITHOUT Accept-Encoding returns no content-encoding header and identical body', async () => {
    const { statusCode, headers, body } = await new Promise<{
      statusCode: number;
      headers: http.IncomingHttpHeaders;
      body: Buffer;
    }>((resolve, reject) => {
      http.get(`${baseUrl}/assets/${jsFile}`, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
        res.on('error', reject);
      });
    });

    assert.equal(statusCode, 200);
    assert.equal(headers['content-encoding'], undefined, 'No content-encoding header when request has no Accept-Encoding');
    assert.equal(
      headers['cache-control'],
      'public, max-age=31536000, immutable',
      'Cache-Control must remain public, max-age=31536000, immutable'
    );

    const fileContent = fs.readFileSync(path.join(assetsDir, jsFile));
    assert.ok(body.equals(fileContent), 'Response body without Accept-Encoding must be byte-for-byte identical to the file');
  });

  // 3. GET the SPA fallback (/) with gzip -> content-encoding gzip AND Cache-Control still "no-cache".
  await t.test('3. GET the SPA fallback (/) with gzip returns content-encoding gzip and Cache-Control no-cache', async () => {
    const res = await fetch(`${baseUrl}/`, {
      headers: { 'Accept-Encoding': 'gzip' }
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-encoding'), 'gzip', 'content-encoding must be gzip');
    assert.equal(res.headers.get('cache-control'), 'no-cache', 'Cache-Control must remain no-cache');
  });

  // 4. GET /brand/og-image.jpg with gzip -> NOT gzip-encoded.
  await t.test('4. GET /brand/og-image.jpg with gzip is NOT gzip-encoded', async () => {
    const res = await fetch(`${baseUrl}/brand/og-image.jpg`, {
      headers: { 'Accept-Encoding': 'gzip' }
    });

    assert.equal(res.status, 200);
    const encoding = res.headers.get('content-encoding');
    assert.ok(!encoding || encoding === 'identity', `og-image.jpg must not be gzip-encoded, got: ${encoding}`);
  });

  // 5. index.html contains "family=Tajawal:wght@400;500;700" and does NOT contain Cinzel, Playfair, Space+Mono, Cairo or IBM+Plex.
  await t.test('5. index.html contains family=Tajawal:wght@400;500;700 and does NOT contain unused fonts', async () => {
    const indexPath = path.join(process.cwd(), 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');

    assert.ok(
      indexHtml.includes('family=Tajawal:wght@400;500;700'),
      'index.html must contain family=Tajawal:wght@400;500;700'
    );

    const forbiddenFontPatterns = [/Cinzel/i, /Playfair/i, /Space\+Mono/i, /Cairo/i, /IBM\+Plex/i];
    for (const pattern of forbiddenFontPatterns) {
      assert.ok(
        !pattern.test(indexHtml),
        `index.html must not contain ${pattern.toString()}`
      );
    }
  });
});
