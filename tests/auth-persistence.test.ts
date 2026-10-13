import assert from 'node:assert/strict';
import test from 'node:test';
import type { Auth, Persistence } from 'firebase/auth';
import {
  AuthPersistenceController,
  type PersistenceAdapter
} from '../src/utils/authPersistence';
import { runGoogleSignIn } from '../src/utils/googleSignIn';

function createMockPersistence(name: string): Persistence {
  return { type: name } as unknown as Persistence;
}

const mockLocalPersistence = createMockPersistence('LOCAL');
const mockSessionPersistence = createMockPersistence('SESSION');

function createMockAuth(): Auth {
  return { currentUser: null } as unknown as Auth;
}

test('AuthPersistenceController regression test suite', async (t) => {
  await t.test('1. Pending initialization prevents Google authentication', () => {
    const mockAuth = createMockAuth();
    let resolvePersistence: () => void = () => {};
    const persistencePromise = new Promise<void>((res) => {
      resolvePersistence = res;
    });

    const adapter: PersistenceAdapter = {
      localPersistence: mockLocalPersistence,
      sessionPersistence: mockSessionPersistence,
      setPersistence: () => persistencePromise,
    };

    const controller = new AuthPersistenceController(mockAuth, true, adapter);

    // Initial state is pending
    assert.equal(controller.getState().status, 'pending');
    // Pending status MUST prevent Google sign-in
    assert.equal(controller.isGoogleSignInReady(false), false);

    // Resolving persistence marks status as ready
    resolvePersistence();
  });

  await t.test('2. Successful initialization enables Google authentication', async () => {
    const mockAuth = createMockAuth();
    let setPersistenceCalled = false;

    const adapter: PersistenceAdapter = {
      localPersistence: mockLocalPersistence,
      sessionPersistence: mockSessionPersistence,
      setPersistence: async () => {
        setPersistenceCalled = true;
      },
    };

    const controller = new AuthPersistenceController(mockAuth, true, adapter);
    const ready = await controller.apply(true);

    assert.equal(ready, true);
    assert.equal(setPersistenceCalled, true);
    assert.equal(controller.getState().status, 'ready');
    assert.equal(controller.getState().error, null);
    assert.equal(controller.isGoogleSignInReady(false), true);
    // When loading is true, isGoogleSignInReady is false
    assert.equal(controller.isGoogleSignInReady(true), false);
  });

  await t.test('3. Failed initialization transitions to error status and provides retry', async () => {
    const mockAuth = createMockAuth();
    let attemptCount = 0;

    const adapter: PersistenceAdapter = {
      localPersistence: mockLocalPersistence,
      sessionPersistence: mockSessionPersistence,
      setPersistence: async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('IndexedDB unavailable in private browsing');
        }
      },
    };

    const controller = new AuthPersistenceController(mockAuth, true, adapter);

    // Initial attempt fails
    const initialResult = await controller.apply(true);
    assert.equal(initialResult, false);
    assert.equal(controller.getState().status, 'error');
    assert.ok(controller.getState().error instanceof Error);
    assert.equal(controller.getState().error?.message, 'IndexedDB unavailable in private browsing');
    // Error status prevents Google sign-in
    assert.equal(controller.isGoogleSignInReady(false), false);

    // Retry action succeeds
    const retryResult = await controller.retry();
    assert.equal(retryResult, true);
    assert.equal(controller.getState().status, 'ready');
    assert.equal(controller.getState().error, null);
    assert.equal(controller.isGoogleSignInReady(false), true);
  });

  await t.test('4. Google sign-in remains unavailable while initialization is pending or failed', async () => {
    const mockAuth = createMockAuth();
    const adapter: PersistenceAdapter = {
      localPersistence: mockLocalPersistence,
      sessionPersistence: mockSessionPersistence,
      setPersistence: async () => {
        throw new Error('Storage disabled');
      },
    };

    const controller = new AuthPersistenceController(mockAuth, true, adapter);

    // 1. Pending: cannot sign in
    assert.equal(controller.isGoogleSignInReady(false), false);

    // 2. Failed: cannot sign in
    await controller.apply(true);
    assert.equal(controller.getState().status, 'error');
    assert.equal(controller.isGoogleSignInReady(false), false);
  });

  await t.test('5. Stale completion from previous Remember me selection is discarded', async () => {
    const mockAuth = createMockAuth();
    let resolveFirst: () => void = () => {};
    let resolveSecond: () => void = () => {};

    const firstPromise = new Promise<void>((res) => {
      resolveFirst = res;
    });
    const secondPromise = new Promise<void>((res) => {
      resolveSecond = res;
    });

    let callCount = 0;
    const adapter: PersistenceAdapter = {
      localPersistence: mockLocalPersistence,
      sessionPersistence: mockSessionPersistence,
      setPersistence: async () => {
        callCount++;
        if (callCount === 1) return firstPromise;
        return secondPromise;
      },
    };

    const controller = new AuthPersistenceController(mockAuth, true, adapter);

    // Request 1: rememberMe = true
    const p1 = controller.apply(true);
    assert.equal(controller.getState().rememberMe, true);

    // Request 2: rememberMe = false (user immediately toggles off)
    const p2 = controller.apply(false);
    assert.equal(controller.getState().rememberMe, false);

    // First request resolves later (stale)
    resolveFirst();
    const res1 = await p1;
    // Stale resolution must return false and not mark state ready for the stale preference
    assert.equal(res1, false);

    // Second request resolves (current)
    resolveSecond();
    const res2 = await p2;
    assert.equal(res2, true);
    assert.equal(controller.getState().status, 'ready');
    assert.equal(controller.getState().rememberMe, false);
    assert.equal(controller.getState().error, null);
  });

  await t.test('6. Prevent preference changes during an active authentication attempt', async () => {
    const mockAuth = createMockAuth();
    const adapter: PersistenceAdapter = {
      localPersistence: mockLocalPersistence,
      sessionPersistence: mockSessionPersistence,
      setPersistence: async () => {},
    };

    const controller = new AuthPersistenceController(mockAuth, true, adapter);
    await controller.apply(true);

    let resolveActiveAttempt: () => void = () => {};
    const lockPromise = new Promise<void>((res) => {
      resolveActiveAttempt = res;
    });

    const attempt = controller.runAuthAttempt(async () => {
      await lockPromise;
      return true;
    });

    // While an auth attempt is in flight, setRememberMe must refuse
    const changed = controller.setRememberMe(false);
    assert.equal(changed, false);
    assert.equal(controller.getState().rememberMe, true);

    resolveActiveAttempt();
    await attempt;

    // After attempt ends, setRememberMe works
    assert.equal(controller.setRememberMe(false), true);
  });

  await t.test('7. Invoking the actual Google authentication handler: readiness gate, popup call, and fallback logic', async () => {
    const mockAuth = createMockAuth();
    let setPersistenceCallCount = 0;

    const adapter: PersistenceAdapter = {
      localPersistence: mockLocalPersistence,
      sessionPersistence: mockSessionPersistence,
      setPersistence: async () => {
        setPersistenceCallCount++;
      },
    };

    const controller = new AuthPersistenceController(mockAuth, true, adapter);

    let popupCalls = 0;
    let redirectCalls = 0;

    // A. When NOT ready (status still pending): runGoogleSignIn aborts immediately and does NOT call popup
    const notReadyResult = await runGoogleSignIn(controller, {
      popup: async () => {
        popupCalls++;
        return { user: { uid: 'u1' } };
      },
      redirect: async () => {
        redirectCalls++;
      },
    });

    assert.equal(notReadyResult.started, false);
    if (!notReadyResult.started) {
      assert.equal(notReadyResult.reason, 'not-ready');
    }
    assert.equal(popupCalls, 0, 'Must NOT invoke popup when not ready');
    assert.equal(redirectCalls, 0);

    // Make controller ready
    await controller.apply(true);
    assert.equal(controller.getState().status, 'ready');
    assert.equal(setPersistenceCallCount, 1);

    // B. When ready: directly calls popup without calling setPersistence again
    const successResult = await runGoogleSignIn(controller, {
      popup: async () => {
        popupCalls++;
        return { user: { uid: 'google-user-123', email: 'test@example.com' } };
      },
      redirect: async () => {
        redirectCalls++;
      },
    });

    assert.equal(successResult.started, true);
    if (successResult.started) {
      assert.equal(successResult.redirected, false);
      assert.equal(successResult.result?.user?.uid, 'google-user-123');
    }
    assert.equal(popupCalls, 1, 'Invoked signInWithPopup directly');
    assert.equal(redirectCalls, 0, 'Did not redirect on success');
    assert.equal(setPersistenceCallCount, 1, 'No redundant setPersistence call in handler');

    // C. Popup blocked: falls back to redirect
    const blockedResult = await runGoogleSignIn(controller, {
      popup: async () => {
        popupCalls++;
        throw Object.assign(new Error('Blocked'), { code: 'auth/popup-blocked' });
      },
      redirect: async () => {
        redirectCalls++;
      },
    });

    assert.equal(blockedResult.started, true);
    if (blockedResult.started) {
      assert.equal(blockedResult.redirected, true);
    }
    assert.equal(popupCalls, 2);
    assert.equal(redirectCalls, 1, 'Fell back to redirect when popup blocked');

    // D. Popup closed by user: rethrows error and does NOT redirect
    await assert.rejects(
      runGoogleSignIn(controller, {
        popup: async () => {
          popupCalls++;
          throw Object.assign(new Error('Closed by user'), { code: 'auth/popup-closed-by-user' });
        },
        redirect: async () => {
          redirectCalls++;
        },
      }),
      (err: any) => err.code === 'auth/popup-closed-by-user'
    );
    assert.equal(popupCalls, 3);
    assert.equal(redirectCalls, 1, 'Must NOT redirect on user cancellation');

    // E. Operation not supported in this environment: falls back to redirect
    const unsupportedResult = await runGoogleSignIn(controller, {
      popup: async () => {
        popupCalls++;
        throw Object.assign(new Error('Unsupported'), { code: 'auth/operation-not-supported-in-this-environment' });
      },
      redirect: async () => {
        redirectCalls++;
      },
    });
    assert.equal(unsupportedResult.started, true);
    if (unsupportedResult.started) {
      assert.equal(unsupportedResult.redirected, true);
    }
    assert.equal(redirectCalls, 2);

    // F. Concurrent auth attempt is locked out (busy reason)
    let resolveActiveAttempt: () => void = () => {};
    const activeAttemptPromise = new Promise<void>((res) => {
      resolveActiveAttempt = res;
    });

    const attempt1 = controller.runAuthAttempt(async () => {
      await activeAttemptPromise;
      return 'done';
    });

    // While attempt1 is running, second attempt must synchronously be refused as busy
    const attempt2 = await runGoogleSignIn(controller, {
      popup: async () => {
        popupCalls++;
        return {};
      },
      redirect: async () => {
        redirectCalls++;
      },
    });
    assert.equal(attempt2.started, false);
    if (!attempt2.started) {
      assert.equal(attempt2.reason, 'busy');
    }
    // Also setRememberMe must be refused while attempt is active
    assert.equal(controller.setRememberMe(false), false);

    resolveActiveAttempt();
    await attempt1;

    // After attempt completes, authInFlight is cleared and attempts are allowed again
    assert.equal(controller.getState().authInFlight, false);
    assert.equal(controller.setRememberMe(false), true);
  });

  await t.test('8. Remember me selection maps accurately to local vs session persistence', async () => {
    const mockAuth = createMockAuth();
    let appliedPersistence: Persistence | null = null;

    const adapter: PersistenceAdapter = {
      localPersistence: mockLocalPersistence,
      sessionPersistence: mockSessionPersistence,
      setPersistence: async (_auth, p) => {
        appliedPersistence = p;
      },
    };

    const controller = new AuthPersistenceController(mockAuth, true, adapter);

    // Checked (true) -> localPersistence
    await controller.apply(true);
    assert.equal(appliedPersistence, mockLocalPersistence);

    // Unchecked (false) -> sessionPersistence
    await controller.apply(false);
    assert.equal(appliedPersistence, mockSessionPersistence);
  });

  await t.test('9. Missing Auth instance produces immediate error state without hanging in pending', async () => {
    // When instantiated with null auth
    const nullAuthController = new AuthPersistenceController(null, true);
    assert.equal(nullAuthController.getState().status, 'error');
    assert.ok(nullAuthController.getState().error instanceof Error);
    assert.equal(nullAuthController.getState().error?.message, 'Firebase Auth is not initialized');
    assert.equal(nullAuthController.isGoogleSignInReady(false), false);

    // Synchronous subscribers observe the error state
    let observedState = nullAuthController.getState();
    nullAuthController.subscribe((s) => {
      observedState = s;
    });

    const applied = await nullAuthController.apply(false);
    assert.equal(applied, false);
    assert.equal(observedState.status, 'error');
    assert.equal(observedState.rememberMe, false);
    assert.equal(nullAuthController.isGoogleSignInReady(false), false);
  });

  await t.test('10. Ready controller becoming pending via setRememberMe blocks runGoogleSignIn', async () => {
    const mockAuth = createMockAuth();
    let resolvePending: () => void = () => {};
    let isPending = false;

    const adapter: PersistenceAdapter = {
      localPersistence: mockLocalPersistence,
      sessionPersistence: mockSessionPersistence,
      setPersistence: async () => {
        if (isPending) {
          return new Promise<void>((res) => {
            resolvePending = res;
          });
        }
      },
    };

    const controller = new AuthPersistenceController(mockAuth, true, adapter);
    await controller.apply(true);
    assert.equal(controller.getState().status, 'ready');

    isPending = true;
    controller.setRememberMe(false);
    assert.equal(controller.getState().status, 'pending');

    let popupCalled = false;
    const result = await runGoogleSignIn(controller, {
      popup: async () => {
        popupCalled = true;
        return { user: { uid: 'u1' } };
      },
      redirect: async () => {},
    });

    assert.equal(result.started, false);
    if (!result.started) {
      assert.equal(result.reason, 'not-ready');
    }
    assert.equal(popupCalled, false, 'popup must NOT be called when controller is pending');

    resolvePending();
  });

  await t.test('11. Out-of-order adapter resolutions correctly preserve last applied persistence and runAuthAttempt runs only when ready', async () => {
    const mockAuth = createMockAuth();
    let resolveFirst: () => void = () => {};
    let resolveSecond: () => void = () => {};
    let lastAppliedPersistence: Persistence | null = null;

    let callCount = 0;
    const adapter: PersistenceAdapter = {
      localPersistence: mockLocalPersistence,
      sessionPersistence: mockSessionPersistence,
      setPersistence: async (_auth, p) => {
        callCount++;
        lastAppliedPersistence = p;
        if (callCount === 1) {
          return new Promise<void>((res) => {
            resolveFirst = res;
          });
        }
        return new Promise<void>((res) => {
          resolveSecond = res;
        });
      },
    };

    const controller = new AuthPersistenceController(mockAuth, true, adapter);
    // Call 1: rememberMe = true
    const p1 = controller.apply(true);
    // Call 2: rememberMe = false
    const p2 = controller.apply(false);

    // Resolve second (session) FIRST
    resolveSecond();
    await p2;
    assert.equal(controller.getState().status, 'ready');
    assert.equal(controller.getState().rememberMe, false);

    // Resolve first (local) LATER (out of order)
    resolveFirst();
    await p1;
    // Status must remain ready with rememberMe = false and session persistence
    assert.equal(controller.getState().status, 'ready');
    assert.equal(controller.getState().rememberMe, false);
    assert.equal(lastAppliedPersistence, mockSessionPersistence);

    // Now runAuthAttempt (email stand-in) runs
    let statusWhenAuthRan = '';
    const emailAttempt = await controller.runAuthAttempt(async () => {
      statusWhenAuthRan = controller.getState().status;
      return { emailUser: 'user@example.com' };
    });

    assert.equal(emailAttempt.started, true);
    assert.equal(statusWhenAuthRan, 'ready');
  });

  await t.test('12. runAuthAttempt error propagation cleans up authInFlight and unlocks setRememberMe', async () => {
    const mockAuth = createMockAuth();
    const adapter: PersistenceAdapter = {
      localPersistence: mockLocalPersistence,
      sessionPersistence: mockSessionPersistence,
      setPersistence: async () => {},
    };

    const controller = new AuthPersistenceController(mockAuth, true, adapter);
    await controller.apply(true);
    assert.equal(controller.getState().status, 'ready');

    const thrownError = new Error('Auth execution failed');
    await assert.rejects(
      controller.runAuthAttempt(async () => {
        throw thrownError;
      }),
      (err) => err === thrownError
    );

    assert.equal(controller.getState().authInFlight, false);
    assert.equal(controller.setRememberMe(false), true);
  });

  await t.test('13. Controller initialized with null transitions from error to ready on setAuth and permits runAuthAttempt', async () => {
    const mockAuth = createMockAuth();
    const adapter: PersistenceAdapter = {
      localPersistence: mockLocalPersistence,
      sessionPersistence: mockSessionPersistence,
      setPersistence: async () => {},
    };

    const controller = new AuthPersistenceController(null, true, adapter);
    assert.equal(controller.getState().status, 'error');

    // Attempt before auth must fail with no-auth
    const failAttempt = await controller.runAuthAttempt(async () => 'never');
    assert.equal(failAttempt.started, false);
    if (!failAttempt.started) {
      assert.equal(failAttempt.reason, 'no-auth');
    }

    controller.setAuth(mockAuth);
    // Wait for apply triggered by setAuth
    await controller.apply(true);
    assert.equal(controller.getState().status, 'ready');

    const successAttempt = await controller.runAuthAttempt(async () => 'started-successfully');
    assert.equal(successAttempt.started, true);
    if (successAttempt.started) {
      assert.equal(successAttempt.result, 'started-successfully');
    }
  });

  await t.test('14. Unsubscribed listeners are never invoked on state changes', async () => {
    const mockAuth = createMockAuth();
    const adapter: PersistenceAdapter = {
      localPersistence: mockLocalPersistence,
      sessionPersistence: mockSessionPersistence,
      setPersistence: async () => {},
    };

    const controller = new AuthPersistenceController(mockAuth, true, adapter);
    await controller.apply(true);

    let callCount = 0;
    const unsubscribe = controller.subscribe(() => {
      callCount++;
    });

    // Invoke unsubscribe immediately
    unsubscribe();

    // Trigger state changes
    controller.setRememberMe(false);
    await controller.apply(false);

    assert.equal(callCount, 0, 'Listener must never be called after unsubscribe');
  });

  await t.test('15. Two runGoogleSignIn calls in the same tick with no await between them: popup is invoked exactly once', async () => {
    const mockAuth = createMockAuth();
    const adapter: PersistenceAdapter = {
      localPersistence: mockLocalPersistence,
      sessionPersistence: mockSessionPersistence,
      setPersistence: async () => {},
    };

    const controller = new AuthPersistenceController(mockAuth, true, adapter);
    await controller.apply(true);
    assert.equal(controller.getState().status, 'ready');

    let popupCount = 0;
    let redirectCount = 0;

    // Both called in the exact same tick, no await between them
    const p1 = runGoogleSignIn(controller, {
      popup: async () => {
        popupCount++;
        await new Promise((r) => setTimeout(r, 10));
        return { user: { uid: 'u1' } };
      },
      redirect: async () => {
        redirectCount++;
      },
    });

    const p2 = runGoogleSignIn(controller, {
      popup: async () => {
        popupCount++;
        return { user: { uid: 'u2' } };
      },
      redirect: async () => {
        redirectCount++;
      },
    });

    const [res1, res2] = await Promise.all([p1, p2]);

    assert.equal(popupCount, 1, 'popup must be invoked exactly once');
    assert.equal(redirectCount, 0);
    assert.equal(res1.started, true);
    assert.equal(res2.started, false);
    if (!res2.started) {
      assert.equal(res2.reason, 'busy');
    }
  });
});
