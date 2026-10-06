import assert from 'node:assert/strict';
import test from 'node:test';
import { checkHealth, HealthCheckManager, type FirestoreProbeTarget } from '../src/utils/health';

test('checkHealth: returns HTTP 200 and status "ok" on successful Firestore probe', async () => {
  const mockDb: FirestoreProbeTarget = {
    collection: (name: string) => {
      assert.equal(name, 'users');
      return {
        limit: (n: number) => {
          assert.equal(n, 1);
          return {
            get: async () => ({ empty: false, docs: [] })
          };
        }
      };
    }
  };

  const result = await checkHealth(mockDb, 'relationship-id', 2000);

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'ok');
  assert.equal(result.body.firebaseProjectConfigured, true);
  assert.equal(result.body.firestoreConfigured, true);
  assert.equal(result.body.firestoreReachable, true);
  assert.ok(typeof result.body.timestamp === 'string');
});

test('checkHealth: returns HTTP 503 and status "unavailable" when Firestore db is not initialized', async () => {
  const result = await checkHealth(null, 'relationship-id', 2000);

  assert.equal(result.statusCode, 503);
  assert.equal(result.body.status, 'unavailable');
  assert.equal(result.body.firebaseProjectConfigured, true);
  assert.equal(result.body.firestoreConfigured, false);
  assert.equal(result.body.firestoreReachable, false);
});

test('checkHealth: returns HTTP 503 and status "unavailable" when project ID is unconfigured or placeholder', async () => {
  const mockDb: FirestoreProbeTarget = {
    collection: () => ({
      limit: () => ({
        get: async () => ({ docs: [] })
      })
    })
  };

  const emptyResult = await checkHealth(mockDb, '', 2000);
  assert.equal(emptyResult.statusCode, 503);
  assert.equal(emptyResult.body.status, 'unavailable');
  assert.equal(emptyResult.body.firebaseProjectConfigured, false);

  const placeholderResult = await checkHealth(mockDb, 'placeholder', 2000);
  assert.equal(placeholderResult.statusCode, 503);
  assert.equal(placeholderResult.body.status, 'unavailable');
  assert.equal(placeholderResult.body.firebaseProjectConfigured, false);
});

test('checkHealth: returns HTTP 503 and strips raw error when Firestore probe rejects (credential/permission/network failure)', async () => {
  const mockDb: FirestoreProbeTarget = {
    collection: () => ({
      limit: () => ({
        get: async () => {
          throw new Error('7 PERMISSION_DENIED: Missing or insufficient permissions. Internal service account secret=xyz123');
        }
      })
    })
  };

  const result = await checkHealth(mockDb, 'relationship-id', 2000);

  assert.equal(result.statusCode, 503);
  assert.equal(result.body.status, 'unavailable');
  assert.equal(result.body.firestoreReachable, false);

  // Response strictly contains only allowed non-sensitive fields
  const bodyKeys = Object.keys(result.body).sort();
  assert.deepEqual(bodyKeys, [
    'firebaseProjectConfigured',
    'firestoreConfigured',
    'firestoreReachable',
    'status',
    'timestamp'
  ]);

  const rawJson = JSON.stringify(result.body);
  assert.equal(rawJson.includes('PERMISSION_DENIED'), false);
  assert.equal(rawJson.includes('xyz123'), false);
  assert.equal(rawJson.includes('secret'), false);
  assert.equal(rawJson.includes('error'), false);
});

test('checkHealth: returns HTTP 503 on timeout without unhandled promise rejection', async () => {
  let lateRejectTriggered = false;

  const mockDb: FirestoreProbeTarget = {
    collection: () => ({
      limit: () => ({
        get: () => {
          // Probe that takes 200ms and then rejects
          return new Promise((_, reject) => {
            setTimeout(() => {
              lateRejectTriggered = true;
              reject(new Error('LATE_DATABASE_NETWORK_ERROR'));
            }, 100);
          });
        }
      })
    })
  };

  // Timeout set to 25ms, so timeout will trigger well before the 100ms late rejection
  const result = await checkHealth(mockDb, 'relationship-id', 25);

  assert.equal(result.statusCode, 503);
  assert.equal(result.body.status, 'unavailable');
  assert.equal(result.body.firestoreReachable, false);

  // Wait for the late rejection to occur to verify it does not trigger an unhandled rejection
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(lateRejectTriggered, true);
});

test('checkHealth: response payload contains zero sensitive tokens, keys, or stack traces', async () => {
  const mockDb: FirestoreProbeTarget = {
    collection: () => ({
      limit: () => ({
        get: async () => ({ docs: [] })
      })
    })
  };

  const okResult = await checkHealth(mockDb, 'relationship-id', 1000);
  const keys = Object.keys(okResult.body);
  const forbiddenKeys = ['stack', 'error', 'details', 'token', 'key', 'secret', 'password', 'uid'];

  for (const fk of forbiddenKeys) {
    assert.equal(keys.includes(fk), false, `Sensitive key "${fk}" must not be in health response`);
  }
});

test('HealthCheckManager: caches successful health check for 30 seconds and avoids redundant probes', async () => {
  let probeCount = 0;
  const mockDb: FirestoreProbeTarget = {
    collection: () => ({
      limit: () => ({
        get: async () => {
          probeCount++;
          return { docs: [] };
        }
      })
    })
  };

  const manager = new HealthCheckManager(30000);
  const t0 = 1000000;

  // First call at t0 -> executes probe
  const res1 = await manager.getHealth(mockDb, 'relationship-id', 1000, t0);
  assert.equal(res1.statusCode, 200);
  assert.equal(probeCount, 1);

  // Second call at t0 + 15000 (15s later) -> returns cached result without re-probing
  const res2 = await manager.getHealth(mockDb, 'relationship-id', 1000, t0 + 15000);
  assert.equal(res2.statusCode, 200);
  assert.equal(probeCount, 1, 'Probe count must remain 1 within TTL');
  assert.equal(res2.body.timestamp, res1.body.timestamp);
});

test('HealthCheckManager: expires cache after 30 seconds and re-probes Firestore', async () => {
  let probeCount = 0;
  const mockDb: FirestoreProbeTarget = {
    collection: () => ({
      limit: () => ({
        get: async () => {
          probeCount++;
          return { docs: [] };
        }
      })
    })
  };

  const manager = new HealthCheckManager(30000);
  const t0 = 1000000;

  await manager.getHealth(mockDb, 'relationship-id', 1000, t0);
  assert.equal(probeCount, 1);

  // Call after 30,001ms (expired) -> executes fresh probe
  const resExpired = await manager.getHealth(mockDb, 'relationship-id', 1000, t0 + 30001);
  assert.equal(resExpired.statusCode, 200);
  assert.equal(probeCount, 2, 'Probe count must increment to 2 after TTL expires');
});

test('HealthCheckManager: returns HTTP 503 upon cache expiry if database becomes unavailable (never fabricates success)', async () => {
  let isDbAlive = true;
  const mockDb: FirestoreProbeTarget = {
    collection: () => ({
      limit: () => ({
        get: async () => {
          if (!isDbAlive) {
            throw new Error('DATABASE_CONNECTION_LOST');
          }
          return { docs: [] };
        }
      })
    })
  };

  const manager = new HealthCheckManager(30000);
  const t0 = 1000000;

  // t0: DB alive -> 200
  const resInitial = await manager.getHealth(mockDb, 'relationship-id', 1000, t0);
  assert.equal(resInitial.statusCode, 200);

  // DB goes down during the cache window
  isDbAlive = false;

  // Within TTL: cached 200
  const resCached = await manager.getHealth(mockDb, 'relationship-id', 1000, t0 + 10000);
  assert.equal(resCached.statusCode, 200);

  // After TTL: must NOT fabricate success -> fresh probe detects outage and returns 503
  const resPostExpiry = await manager.getHealth(mockDb, 'relationship-id', 1000, t0 + 30001);
  assert.equal(resPostExpiry.statusCode, 503);
  assert.equal(resPostExpiry.body.status, 'unavailable');
  assert.equal(resPostExpiry.body.firestoreReachable, false);
});

test('HealthCheckManager: does not cache 503 failures so recovery is detected promptly', async () => {
  let isDbAlive = false;
  let probeCount = 0;
  const mockDb: FirestoreProbeTarget = {
    collection: () => ({
      limit: () => ({
        get: async () => {
          probeCount++;
          if (!isDbAlive) {
            throw new Error('OUTAGE');
          }
          return { docs: [] };
        }
      })
    })
  };

  const manager = new HealthCheckManager(30000);
  const t0 = 1000000;

  // Initial failure -> 503
  const resFail = await manager.getHealth(mockDb, 'relationship-id', 1000, t0);
  assert.equal(resFail.statusCode, 503);
  assert.equal(probeCount, 1);

  // DB recovers immediately 5 seconds later
  isDbAlive = true;
  const resRecovered = await manager.getHealth(mockDb, 'relationship-id', 1000, t0 + 5000);
  assert.equal(resRecovered.statusCode, 200);
  assert.equal(probeCount, 2, 'Must not serve cached 503 when DB recovers');
});

