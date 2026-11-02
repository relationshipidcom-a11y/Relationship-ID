import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer as createViteServer } from 'vite';
import { createApp, __setTestDeps, getPublicStaticDir } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

test('Vite development client environment module accessibility and security boundary suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  // 1. When Vite development serving is enabled, the exact required module is accessible with valid JavaScript Content-Type
  await t.test('1. Exact required Vite client module is accessible with valid JavaScript Content-Type when dev serving is enabled', async () => {
    const app = createApp({ isDev: true });

    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'spa'
    });
    app.use(vite.middlewares);

    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    const addr = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const res = await fetch(`${baseUrl}/node_modules/vite/dist/client/env.mjs`);
      assert.equal(res.status, 200, 'Exact Vite client env module should return 200 in development serving mode');
      const contentType = res.headers.get('content-type') || '';
      assert.ok(
        contentType.includes('javascript'),
        `Expected javascript Content-Type for env.mjs, got ${contentType}`
      );
      const body = await res.text();
      assert.ok(body.includes('const context =') && body.includes('const defines ='), 'Response body should contain Vite environment defines logic');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await vite.close();
    }
  });

  // 2. Production still rejects the internal path
  await t.test('2. Production rejects the internal /node_modules/vite/dist/client/env.mjs path', async () => {
    const staticDir = getPublicStaticDir();
    const prodApp = createApp({ staticDir, isDev: false });

    const server: Server = await new Promise((resolve) => {
      const s = prodApp.listen(0, '127.0.0.1', () => resolve(s));
    });

    const addr = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const res = await fetch(`${baseUrl}/node_modules/vite/dist/client/env.mjs`);
      assert.equal(res.status, 404, 'Production must reject /node_modules/vite/dist/client/env.mjs with 404');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  // 3. Test or undefined NODE_ENV alone without isDev does not enable the module exception
  await t.test('3. Test or undefined NODE_ENV alone without isDev does not enable the exception', async () => {
    // Default createApp in test environment without isDev option
    const testApp = createApp();

    const server: Server = await new Promise((resolve) => {
      const s = testApp.listen(0, '127.0.0.1', () => resolve(s));
    });

    const addr = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const res = await fetch(`${baseUrl}/node_modules/vite/dist/client/env.mjs`);
      assert.equal(res.status, 404, 'Test environment alone without isDev must reject env.mjs with 404');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }

    // Explicit check when process.env.NODE_ENV is temporarily unset / undefined
    const originalEnv = process.env.NODE_ENV;
    try {
      delete (process.env as any).NODE_ENV;
      const unassignedEnvApp = createApp();
      const srv: Server = await new Promise((resolve) => {
        const s = unassignedEnvApp.listen(0, '127.0.0.1', () => resolve(s));
      });
      const srvAddr = srv.address() as AddressInfo;
      try {
        const res = await fetch(`http://127.0.0.1:${srvAddr.port}/node_modules/vite/dist/client/env.mjs`);
        assert.equal(res.status, 404, 'Undefined NODE_ENV without isDev must reject env.mjs with 404');
      } finally {
        await new Promise<void>((resolve, reject) => {
          srv.close((err) => (err ? reject(err) : resolve()));
        });
      }
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // 4. In development serving mode, unrelated .mjs files, server artifacts, .env, sourcemaps, and traversal remain blocked
  await t.test('4. Unrelated .mjs files, server artifacts, .env, sourcemaps, and traversal variants remain blocked', async () => {
    const app = createApp({ isDev: true });

    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    const addr = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const blockedPaths = [
      // Unrelated .mjs files
      '/other.mjs',
      '/test.mjs',
      '/server.mjs',
      '/node_modules/vite/dist/client/other.mjs',
      '/node_modules/vite/dist/client/client.mjs',
      '/node_modules/another-pkg/index.mjs',
      // Server source and artifacts
      '/server.ts',
      '/server.cjs',
      '/server.cjs.map',
      '/package.json',
      '/package-lock.json',
      '/tsconfig.json',
      // Environment files
      '/.env',
      '/.env.local',
      '/.env.production',
      // Sourcemaps
      '/node_modules/vite/dist/client/env.mjs.map',
      // Path traversal attempts
      '/node_modules/vite/dist/client/%2e%2e/%2e%2e/%2e%2e/server.cjs',
      '/node_modules/vite/dist/client/..%2f..%2f..%2fserver.ts',
      '/%2e%2e/server.cjs'
    ];

    try {
      for (const p of blockedPaths) {
        const res = await fetch(`${baseUrl}${p}`);
        assert.equal(res.status, 404, `Path ${p} must be blocked with 404, got ${res.status}`);
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
