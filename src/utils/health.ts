export interface HealthStatus {
  status: 'ok' | 'unavailable';
  firebaseProjectConfigured: boolean;
  firestoreConfigured: boolean;
  firestoreReachable: boolean;
  timestamp: string;
}

export interface HealthCheckResult {
  statusCode: 200 | 503;
  body: HealthStatus;
}

export interface FirestoreProbeTarget {
  collection(name: string): {
    limit(n: number): {
      get(): Promise<unknown>;
    };
  };
}

/**
 * Performs an accurate, bounded, and privacy-safe readiness check of the Firestore database.
 * 
 * - Returns HTTP 200 and status: "ok" only when the required read-only probe succeeds.
 * - Returns HTTP 503 and status: "unavailable" when unconfigured, disconnected, timed out, or failing.
 * - Prevents unhandled promise rejections if a timed-out probe rejects after the timeout fires.
 * - Strictly strips all raw error messages, credentials, tokens, and stack traces from the response.
 */
export async function checkHealth(
  db: FirestoreProbeTarget | null | undefined,
  configuredProjectId: string | null | undefined,
  timeoutMs = 5000
): Promise<HealthCheckResult> {
  const isProjectConfigured = Boolean(
    configuredProjectId &&
    configuredProjectId !== 'projectId' &&
    configuredProjectId !== 'placeholder'
  );
  const isDbConfigured = Boolean(db);

  if (!isProjectConfigured || !isDbConfigured || !db) {
    return {
      statusCode: 503,
      body: {
        status: 'unavailable',
        firebaseProjectConfigured: isProjectConfigured,
        firestoreConfigured: isDbConfigured,
        firestoreReachable: false,
        timestamp: new Date().toISOString()
      }
    };
  }

  let firestoreReachable = false;

  try {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('PROBE_TIMEOUT'));
      }, timeoutMs);
    });

    // Bounded read-only probe against users collection
    const probePromise = Promise.resolve(db.collection('users').limit(1).get());

    // Attach catch handler to probePromise to prevent unhandled rejection if it rejects
    // after the timeout has already triggered.
    probePromise.catch(() => {});

    await Promise.race([probePromise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    firestoreReachable = true;
  } catch (err) {
    firestoreReachable = false;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'PROBE_TIMEOUT') {
      console.warn(`[Readiness Probe] Firestore health check timed out after ${timeoutMs}ms`);
    } else {
      console.warn('[Readiness Probe] Firestore health check probe failed');
    }
  }

  const statusCode = firestoreReachable ? 200 : 503;
  return {
    statusCode,
    body: {
      status: firestoreReachable ? 'ok' : 'unavailable',
      firebaseProjectConfigured: isProjectConfigured,
      firestoreConfigured: isDbConfigured,
      firestoreReachable,
      timestamp: new Date().toISOString()
    }
  };
}
