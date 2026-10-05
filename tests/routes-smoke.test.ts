import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, __setTestDeps } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

test('routes smoke test: GET /api/health and POST /api/verify/contact response shapes', async () => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const addr = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // 1. GET /api/health
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.ok([200, 503].includes(healthRes.status), `Health returned status ${healthRes.status}`);
    const healthData = (await healthRes.json()) as any;
    assert.ok(typeof healthData === 'object' && healthData !== null);
    assert.ok('status' in healthData, 'Health payload has status field');

    // 2. POST /api/verify/contact
    const contactRes = await fetch(`${baseUrl}/api/verify/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test@example.com' })
    });
    assert.ok([200, 404, 503].includes(contactRes.status), `Contact verify returned status ${contactRes.status}`);
    const contactData = (await contactRes.json()) as any;
    assert.ok(typeof contactData === 'object' && contactData !== null);
    assert.ok('found' in contactData, 'Contact verify response has found property');
    assert.ok('stage' in contactData, 'Contact verify response has stage property');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
