import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeRelationshipSnapshotRecovery,
  handleRelationshipSubscriptionError,
  executeNotificationsFetch
} from '../src/utils/relationshipState';

interface RecordResponse {
  record: {
    id: string;
    status: string;
    p1Uid: string;
    p2Uid: string;
  } | null;
}

class RecoveryHarness {
  currentRelId = 'rel_123';
  privateRecordRequestId = 0;
  activeAuthUid: string | null = 'user_p1';
  currentUserUid: string | null = 'user_p1';
  isSubscribed = true;
  record: any = { id: 'rel_123', status: 'active' };
  appError = '';
  clearedRelId: string | null = null;

  recover(fetchFn: () => Promise<RecordResponse>) {
    const requestId = ++this.privateRecordRequestId;
    const requestUid = this.currentUserUid;

    return executeRelationshipSnapshotRecovery<RecordResponse>({
      currentRelId: this.currentRelId,
      requestUid,
      requestId,
      isSubscriptionActive: () => this.isSubscribed,
      getCurrentRequestId: () => this.privateRecordRequestId,
      getActiveAuthUid: () => this.activeAuthUid,
      getCurrentAuthUid: () => this.currentUserUid,
      fetchRecord: fetchFn,
      onRelationshipCleared: (relId) => {
        this.clearedRelId = relId;
        this.record = null;
      },
      setRecord: (rec) => {
        this.record = rec;
      },
      setAppError: (msg) => {
        this.appError = msg;
      },
      formatErrorMessage: (err) => (err instanceof Error ? err.message : String(err))
    });
  }

  handleSubscriptionError(
    error: { code?: string; message?: string },
    fetchFn: () => Promise<RecordResponse>,
    subscriptionUid = 'user_p1'
  ) {
    return handleRelationshipSubscriptionError<RecordResponse>({
      error,
      currentRelId: this.currentRelId,
      subscriptionUid,
      isSubscribed: () => this.isSubscribed,
      getActiveAuthUid: () => this.activeAuthUid,
      getCurrentAuthUid: () => this.currentUserUid,
      incrementRequestId: () => ++this.privateRecordRequestId,
      getCurrentRequestId: () => this.privateRecordRequestId,
      fetchRecord: fetchFn,
      onRelationshipCleared: (relId) => {
        this.clearedRelId = relId;
        this.record = null;
      },
      setRecord: (rec) => {
        this.record = rec;
      },
      setAppError: (msg) => {
        this.appError = msg;
      },
      formatErrorMessage: (err) => (err instanceof Error ? err.message : String(err))
    });
  }

  signOut() {
    this.activeAuthUid = null;
    this.currentUserUid = null;
    this.privateRecordRequestId += 1;
    this.record = null;
    this.appError = '';
  }

  switchAccount(newUid: string) {
    this.activeAuthUid = newUid;
    this.currentUserUid = newUid;
    this.privateRecordRequestId += 1;
    this.record = null;
    this.appError = '';
  }

  unsubscribe() {
    this.isSubscribed = false;
  }
}

class NotificationHarness {
  notificationsRequestId = 0;
  activeAuthUid: string | null = 'user_p1';
  currentUserUid: string | null = 'user_p1';
  activeNotification: any = null;
  record: any = {
    id: 'rel_123',
    status: 'active',
    p1Uid: 'user_p1',
    p2Uid: 'user_p2',
    partner1: { fullName: 'Partner 1' },
    partner2: { fullName: 'Partner 2' }
  };
  invitation: any = { id: 'inv_123' };

  fetch(fetchFn: () => Promise<{ notifications: any[] }>) {
    const requestId = ++this.notificationsRequestId;
    const requestUid = this.currentUserUid || 'user_p1';

    return executeNotificationsFetch({
      requestUid,
      requestId,
      getCurrentRequestId: () => this.notificationsRequestId,
      getActiveAuthUid: () => this.activeAuthUid,
      getCurrentAuthUid: () => this.currentUserUid,
      fetchNotifications: fetchFn,
      setActiveNotification: (notif) => {
        this.activeNotification = notif;
      },
      onRelationshipEnded: (uid) => {
        this.record = {
          id: '',
          partner1: uid === this.record.p2Uid ? this.record.partner2 : this.record.partner1
        };
        this.invitation = null;
      }
    });
  }

  signOut() {
    this.activeAuthUid = null;
    this.currentUserUid = null;
    this.notificationsRequestId += 1;
    this.activeNotification = null;
  }

  switchAccount(newUid: string) {
    this.activeAuthUid = newUid;
    this.currentUserUid = newUid;
    this.notificationsRequestId += 1;
    this.activeNotification = null;
  }
}

test('Guarded Relationship Recovery Suite', async (t) => {
  await t.test('1. Current request delayed success updates record and clears appError', async () => {
    const harness = new RecoveryHarness();
    harness.appError = 'INITIAL_ERROR';

    let resolveFetch!: (val: RecordResponse) => void;
    const promise = new Promise<RecordResponse>((res) => { resolveFetch = res; });

    const recoveryPromise = harness.recover(() => promise);

    resolveFetch({
      record: { id: 'rel_123', status: 'active', p1Uid: 'user_p1', p2Uid: 'user_p2' }
    });

    const result = await recoveryPromise;
    assert.ok(result);
    assert.equal(harness.record.id, 'rel_123');
    assert.equal(harness.appError, '');
    assert.equal(harness.clearedRelId, null);
  });

  await t.test('2. Current request delayed failure displays real error', async () => {
    const harness = new RecoveryHarness();

    let rejectFetch!: (err: Error) => void;
    const promise = new Promise<RecordResponse>((_, rej) => { rejectFetch = rej; });

    const recoveryPromise = harness.recover(() => promise);

    rejectFetch(new Error('DATABASE_READ_FAILED'));

    const result = await recoveryPromise;
    assert.equal(result, null);
    assert.equal(harness.appError, 'DATABASE_READ_FAILED');
  });

  await t.test('3. Newer request supersedes older request: older success does not overwrite state', async () => {
    const harness = new RecoveryHarness();

    let resolveOld!: (val: RecordResponse) => void;
    const promiseOld = new Promise<RecordResponse>((res) => { resolveOld = res; });

    let resolveNew!: (val: RecordResponse) => void;
    const promiseNew = new Promise<RecordResponse>((res) => { resolveNew = res; });

    const oldCall = harness.recover(() => promiseOld);
    const newCall = harness.recover(() => promiseNew);

    // Resolve newer first
    resolveNew({
      record: { id: 'rel_123', status: 'active', p1Uid: 'user_p1', p2Uid: 'user_p2' }
    });
    await newCall;
    assert.equal(harness.record?.status, 'active');

    // Resolve older with stale data
    resolveOld({
      record: { id: 'rel_123', status: 'ended', p1Uid: 'user_p1', p2Uid: 'user_p2' }
    });
    const oldResult = await oldCall;
    assert.equal(oldResult, null);
    // State should retain the newer response
    assert.equal(harness.record?.status, 'active');
  });

  await t.test('4. Newer request supersedes older request: older failure does not set appError', async () => {
    const harness = new RecoveryHarness();

    let rejectOld!: (err: Error) => void;
    const promiseOld = new Promise<RecordResponse>((_, rej) => { rejectOld = rej; });

    let resolveNew!: (val: RecordResponse) => void;
    const promiseNew = new Promise<RecordResponse>((res) => { resolveNew = res; });

    const oldCall = harness.recover(() => promiseOld);
    const newCall = harness.recover(() => promiseNew);

    resolveNew({
      record: { id: 'rel_123', status: 'active', p1Uid: 'user_p1', p2Uid: 'user_p2' }
    });
    await newCall;
    assert.equal(harness.appError, '');

    // Older rejects
    rejectOld(new Error('OLD_ERROR'));
    await oldCall;
    assert.equal(harness.appError, '');
  });

  await t.test('5. Sign-out before recovery completes prevents success from modifying record or error', async () => {
    const harness = new RecoveryHarness();

    let resolveFetch!: (val: RecordResponse) => void;
    const promise = new Promise<RecordResponse>((res) => { resolveFetch = res; });

    const call = harness.recover(() => promise);

    // User signs out
    harness.signOut();

    resolveFetch({
      record: { id: 'rel_123', status: 'active', p1Uid: 'user_p1', p2Uid: 'user_p2' }
    });

    const result = await call;
    assert.equal(result, null);
    assert.equal(harness.record, null);
    assert.equal(harness.appError, '');
  });

  await t.test('6. Sign-out before recovery completes prevents failure from setting appError', async () => {
    const harness = new RecoveryHarness();

    let rejectFetch!: (err: Error) => void;
    const promise = new Promise<RecordResponse>((_, rej) => { rejectFetch = rej; });

    const call = harness.recover(() => promise);

    harness.signOut();

    rejectFetch(new Error('NETWORK_FAILURE_AFTER_LOGOUT'));

    const result = await call;
    assert.equal(result, null);
    assert.equal(harness.appError, '');
  });

  await t.test('7. Account switch prevents stale response from mutating state for new account', async () => {
    const harness = new RecoveryHarness();

    let resolveFetch!: (val: RecordResponse) => void;
    const promise = new Promise<RecordResponse>((res) => { resolveFetch = res; });

    const call = harness.recover(() => promise);

    harness.switchAccount('user_p2');

    resolveFetch({
      record: { id: 'rel_123', status: 'active', p1Uid: 'user_p1', p2Uid: 'user_p2' }
    });

    const result = await call;
    assert.equal(result, null);
    assert.equal(harness.record, null);
  });

  await t.test('8. Delayed failure after account switching prevents setting appError or modifying state', async () => {
    const harness = new RecoveryHarness();

    let rejectFetch!: (err: Error) => void;
    const promise = new Promise<RecordResponse>((_, rej) => { rejectFetch = rej; });

    const call = harness.recover(() => promise);

    // Account switches while recovery request is in flight
    harness.switchAccount('user_p2');

    rejectFetch(new Error('RECOVERY_FAILED_AFTER_SWITCH'));

    const result = await call;
    assert.equal(result, null);
    assert.equal(harness.record, null);
    assert.equal(harness.appError, '');
  });

  await t.test('9. Subscription cleanup prevents delayed recovery success from modifying state', async () => {
    const harness = new RecoveryHarness();

    let resolveFetch!: (val: RecordResponse) => void;
    const promise = new Promise<RecordResponse>((res) => { resolveFetch = res; });

    const call = harness.recover(() => promise);

    // Component unmounts or record changes -> subscription unsubscribes
    harness.unsubscribe();

    resolveFetch({
      record: { id: 'rel_123', status: 'active', p1Uid: 'user_p1', p2Uid: 'user_p2' }
    });

    const result = await call;
    assert.equal(result, null);
  });

  await t.test('10. Subscription cleanup prevents delayed recovery failure from setting appError', async () => {
    const harness = new RecoveryHarness();

    let rejectFetch!: (err: Error) => void;
    const promise = new Promise<RecordResponse>((_, rej) => { rejectFetch = rej; });

    const call = harness.recover(() => promise);

    // Subscription cleans up while request is in flight
    harness.unsubscribe();

    rejectFetch(new Error('RECOVERY_FAILED_AFTER_CLEANUP'));

    const result = await call;
    assert.equal(result, null);
    assert.equal(harness.appError, '');
  });

  await t.test('11. Late error callback prevention: inactive subscription prevents counter increment and recovery execution', async () => {
    const harness = new RecoveryHarness();
    let fetchInvoked = false;
    const fetchFn = async () => {
      fetchInvoked = true;
      return { record: { id: 'rel_123', status: 'active', p1Uid: 'user_p1', p2Uid: 'user_p2' } };
    };

    // Subscription is cleaned up before the error callback fires
    harness.unsubscribe();
    const prevRequestId = harness.privateRecordRequestId;

    const result = await harness.handleSubscriptionError({ code: 'permission-denied' }, fetchFn, 'user_p1');

    assert.equal(result, null);
    assert.equal(fetchInvoked, false);
    assert.equal(harness.privateRecordRequestId, prevRequestId);
    assert.equal(harness.appError, '');
  });

  await t.test('12. Late error callback prevention: account switch or sign-out prevents counter increment and recovery execution', async () => {
    const harness = new RecoveryHarness();
    let fetchInvoked = false;
    const fetchFn = async () => {
      fetchInvoked = true;
      return { record: { id: 'rel_123', status: 'active', p1Uid: 'user_p1', p2Uid: 'user_p2' } };
    };

    // Account switches before old subscription error callback runs
    harness.switchAccount('user_p2');
    const prevRequestId = harness.privateRecordRequestId;

    const result = await harness.handleSubscriptionError({ code: 'permission-denied' }, fetchFn, 'user_p1');

    assert.equal(result, null);
    assert.equal(fetchInvoked, false);
    assert.equal(harness.privateRecordRequestId, prevRequestId);
    assert.equal(harness.appError, '');
  });

  await t.test('13. Record missing or cleared from backend triggers onRelationshipCleared callback', async () => {
    const harness = new RecoveryHarness();

    let resolveFetch!: (val: RecordResponse) => void;
    const promise = new Promise<RecordResponse>((res) => { resolveFetch = res; });

    const call = harness.recover(() => promise);

    resolveFetch({ record: null });

    const result = await call;
    assert.ok(result);
    assert.equal(harness.clearedRelId, 'rel_123');
    assert.equal(harness.record, null);
  });
});

test('Guarded Notification Fetch Suite', async (t) => {
  await t.test('1. Current valid notification response applies notifications correctly', async () => {
    const harness = new NotificationHarness();

    let resolveFetch!: (val: { notifications: any[] }) => void;
    const promise = new Promise<{ notifications: any[] }>((res) => { resolveFetch = res; });

    const fetchPromise = harness.fetch(() => promise);

    resolveFetch({
      notifications: [{ id: 'notif_1', type: 'change_request_submitted', message: 'Change requested' }]
    });

    const result = await fetchPromise;
    assert.ok(result);
    assert.equal(harness.activeNotification?.id, 'notif_1');
  });

  await t.test('2. Current valid relationship_ended notification resets local relationship state', async () => {
    const harness = new NotificationHarness();

    let resolveFetch!: (val: { notifications: any[] }) => void;
    const promise = new Promise<{ notifications: any[] }>((res) => { resolveFetch = res; });

    const fetchPromise = harness.fetch(() => promise);

    resolveFetch({
      notifications: [{ id: 'notif_end', type: 'relationship_ended' }]
    });

    const result = await fetchPromise;
    assert.ok(result);
    assert.equal(harness.activeNotification?.type, 'relationship_ended');
    assert.equal(harness.record.id, '');
    assert.equal(harness.invitation, null);
  });

  await t.test('3. Stale notification response after newer notification request does not overwrite state', async () => {
    const harness = new NotificationHarness();

    let resolveOld!: (val: { notifications: any[] }) => void;
    const promiseOld = new Promise<{ notifications: any[] }>((res) => { resolveOld = res; });

    let resolveNew!: (val: { notifications: any[] }) => void;
    const promiseNew = new Promise<{ notifications: any[] }>((res) => { resolveNew = res; });

    const oldCall = harness.fetch(() => promiseOld);
    const newCall = harness.fetch(() => promiseNew);

    resolveNew({
      notifications: [{ id: 'notif_new', type: 'new_alert' }]
    });
    await newCall;
    assert.equal(harness.activeNotification?.id, 'notif_new');

    // Resolve old with stale notification
    resolveOld({
      notifications: [{ id: 'notif_stale', type: 'stale_alert' }]
    });
    const oldResult = await oldCall;
    assert.equal(oldResult, null);
    assert.equal(harness.activeNotification?.id, 'notif_new');
  });

  await t.test('4. Stale notification response after sign-out does not mutate state', async () => {
    const harness = new NotificationHarness();

    let resolveFetch!: (val: { notifications: any[] }) => void;
    const promise = new Promise<{ notifications: any[] }>((res) => { resolveFetch = res; });

    const call = harness.fetch(() => promise);

    harness.signOut();

    resolveFetch({
      notifications: [{ id: 'notif_1', type: 'relationship_ended' }]
    });

    const result = await call;
    assert.equal(result, null);
    assert.equal(harness.activeNotification, null);
  });

  await t.test('5. Stale notification response after account switch does not leak state to new account', async () => {
    const harness = new NotificationHarness();

    let resolveFetch!: (val: { notifications: any[] }) => void;
    const promise = new Promise<{ notifications: any[] }>((res) => { resolveFetch = res; });

    const call = harness.fetch(() => promise);

    harness.switchAccount('user_p2');

    resolveFetch({
      notifications: [{ id: 'notif_1', type: 'relationship_ended' }]
    });

    const result = await call;
    assert.equal(result, null);
    assert.equal(harness.activeNotification, null);
  });

  await t.test('6. Notification fetch errors remain silent and return null without throwing', async () => {
    const harness = new NotificationHarness();

    const result = await harness.fetch(async () => {
      throw new Error('NETWORK_TIMEOUT');
    });

    assert.equal(result, null);
    assert.equal(harness.activeNotification, null);
  });

  await t.test('7. Current currentUserUid mismatch (requestUid = user A, getCurrentAuthUid() = user B) prevents notification update and state mutation', async () => {
    const harness = new NotificationHarness();
    harness.activeAuthUid = 'user_A';
    harness.currentUserUid = 'user_B';

    let setActiveCalled = false;
    let onRelationshipEndedCalled = false;

    let resolveFetch!: (val: { notifications: any[] }) => void;
    const promise = new Promise<{ notifications: any[] }>((res) => { resolveFetch = res; });

    const fetchPromise = executeNotificationsFetch({
      requestUid: 'user_A',
      requestId: harness.notificationsRequestId,
      getCurrentRequestId: () => harness.notificationsRequestId,
      getActiveAuthUid: () => harness.activeAuthUid,
      getCurrentAuthUid: () => harness.currentUserUid,
      fetchNotifications: () => promise,
      setActiveNotification: () => {
        setActiveCalled = true;
      },
      onRelationshipEnded: () => {
        onRelationshipEndedCalled = true;
      }
    });

    resolveFetch({
      notifications: [{ id: 'notif_1', type: 'relationship_ended' }]
    });

    const result = await fetchPromise;
    assert.equal(result, null);
    assert.equal(setActiveCalled, false);
    assert.equal(onRelationshipEndedCalled, false);
  });
});

