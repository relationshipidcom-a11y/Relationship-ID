import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createApp,
  __setTestDeps,
  runDeletionReconciliation,
  reconcilePendingAccountDeletions
} from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

const SAUDI_PHONE = '+966500000001';

function samplePartner(fullName: string, email: string) {
  return {
    fullName,
    fullNameEn: fullName,
    birthDay: '10',
    birthMonth: '04',
    birthYear: '1992',
    email,
    phoneCountry: 'SA +966',
    phoneNumber: '0500000001',
    phoneE164: SAUDI_PHONE,
    whatsappCountry: 'SA +966',
    whatsappNumber: '0500000001',
    whatsappE164: SAUDI_PHONE
  };
}

test('Steps 9 & 10: Recovery executor and truthful account deletion', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Progress doc + relationship in 'deleting' + an invitation for it -> runDeletionReconciliation() -> relationship, invitation and progress doc are gone
    await t.test('1. Progress doc + relationship in deleting + invitation -> all cleaned', async () => {
      mockDb.reset();
      mockAuth.reset();

      const p1 = samplePartner('Fahad', 'p1@example.com');
      const p2 = samplePartner('Sara', 'p2@example.com');

      mockDb.seed('relationship_deletions', 'rel_1', {
        recordId: 'rel_1',
        callerUid: 'uid_p1',
        stage: 'cleaning_batches',
        startedAt: new Date().toISOString()
      });

      mockDb.seed('relationships', 'rel_1', {
        id: 'rel_1',
        status: 'deleting',
        p1Uid: 'uid_p1',
        p2Uid: 'uid_p2',
        partner1: p1,
        partner2: p2
      });

      mockDb.seed('invitations', 'inv_1', {
        id: 'inv_1',
        recordId: 'rel_1',
        p1Uid: 'uid_p1',
        status: 'pending'
      });

      const res = await runDeletionReconciliation();
      assert.equal(res.relationships, 1);
      assert.equal(mockDb.getDoc('relationships', 'rel_1'), undefined);
      assert.equal(mockDb.getDoc('invitations', 'inv_1'), undefined);
      assert.equal(mockDb.getDoc('relationship_deletions', 'rel_1'), undefined);
    });

    // 2. Progress doc whose relationship no longer exists -> progress doc gone, related invitations gone
    await t.test('2. Progress doc whose relationship no longer exists -> progress doc and invitations gone', async () => {
      mockDb.reset();
      mockAuth.reset();

      mockDb.seed('relationship_deletions', 'rel_2', {
        recordId: 'rel_2',
        callerUid: 'uid_p1',
        stage: 'cleaning_batches',
        startedAt: new Date().toISOString()
      });

      mockDb.seed('invitations', 'inv_2', {
        id: 'inv_2',
        recordId: 'rel_2',
        p1Uid: 'uid_p1',
        status: 'pending'
      });

      const res = await runDeletionReconciliation();
      assert.equal(res.relationships, 1);
      assert.equal(mockDb.getDoc('relationship_deletions', 'rel_2'), undefined);
      assert.equal(mockDb.getDoc('invitations', 'inv_2'), undefined);
    });

    // 3. Progress doc whose relationship is 'active' -> relationship still exists and unchanged; progress doc gone
    await t.test('3. Progress doc whose relationship is active -> relationship unchanged; progress doc gone', async () => {
      mockDb.reset();
      mockAuth.reset();

      const p1 = samplePartner('Fahad', 'p1@example.com');
      const p2 = samplePartner('Sara', 'p2@example.com');

      mockDb.seed('relationship_deletions', 'rel_3', {
        recordId: 'rel_3',
        callerUid: 'uid_p1',
        stage: 'stale_marker',
        startedAt: new Date().toISOString()
      });

      mockDb.seed('relationships', 'rel_3', {
        id: 'rel_3',
        status: 'active',
        p1Uid: 'uid_p1',
        p2Uid: 'uid_p2',
        partner1: p1,
        partner2: p2
      });

      const res = await runDeletionReconciliation();
      assert.equal(res.relationships, 1);
      const relDoc = mockDb.getDoc('relationships', 'rel_3');
      assert.ok(relDoc, 'Active relationship must still exist');
      assert.equal(relDoc.status, 'active', 'Active relationship must remain active');
      assert.equal(mockDb.getDoc('relationship_deletions', 'rel_3'), undefined, 'Stale progress doc must be gone');
    });

    // 4. account_deletions doc for a user already missing from Auth (getUser throws code 'auth/user-not-found') -> users doc and account_deletions doc are gone
    await t.test('4. account_deletions doc for missing Auth user -> users doc and account_deletions doc gone', async () => {
      mockDb.reset();
      mockAuth.reset();

      mockDb.seed('account_deletions', 'uid_missing', {
        uid: 'uid_missing',
        status: 'pending_cleanup',
        createdAt: new Date().toISOString()
      });

      mockDb.seed('users', 'uid_missing', {
        uid: 'uid_missing',
        email: 'missing@example.com'
      });

      mockAuth.onDeleteUser = async () => {
        const err = new Error('User not found');
        (err as any).code = 'auth/user-not-found';
        throw err;
      };

      mockAuth.onGetUser = async () => {
        const err = new Error('User not found');
        (err as any).code = 'auth/user-not-found';
        throw err;
      };

      const res = await runDeletionReconciliation();
      assert.equal(res.accounts, 1);
      assert.equal(mockDb.getDoc('users', 'uid_missing'), undefined);
      assert.equal(mockDb.getDoc('account_deletions', 'uid_missing'), undefined);
    });

    // 5. Calling runDeletionReconciliation twice at the same time -> the second returns skipped: true
    await t.test('5. Calling runDeletionReconciliation concurrently -> second returns skipped: true', async () => {
      mockDb.reset();
      mockAuth.reset();

      mockDb.seed('relationship_deletions', 'rel_concurrent', {
        recordId: 'rel_concurrent',
        callerUid: 'uid_p1',
        stage: 'cleaning_batches',
        startedAt: new Date().toISOString()
      });

      // Introduce a slight delay during delete so both runs overlap
      mockDb.hooks.onBeforeDelete = async () => {
        await new Promise((r) => setTimeout(r, 40));
      };

      const [resA, resB] = await Promise.all([
        runDeletionReconciliation(),
        runDeletionReconciliation()
      ]);

      const skippedCount = [resA, resB].filter((r) => r.skipped === true).length;
      assert.equal(skippedCount, 1, 'Exactly one concurrent reconciliation run must be skipped');
    });

    // 6. Auth deletion succeeds, then deleting the users doc fails -> HTTP 202, status 'DELETION_PENDING', both messages present, account_deletions doc still exists
    await t.test('6. Auth deletion succeeds then users doc delete fails -> HTTP 202 DELETION_PENDING', async () => {
      mockDb.reset();
      mockAuth.reset();

      mockAuth.addUser('token_p1', {
        uid: 'uid_p1',
        email: 'p1@example.com',
        email_verified: true
      });

      mockDb.seed('users', 'uid_p1', {
        uid: 'uid_p1',
        email: 'p1@example.com'
      });

      mockDb.hooks.onBeforeDelete = async (col, id) => {
        if (col === 'users' && id === 'uid_p1') {
          throw new Error('SIMULATED_USERS_DOC_DELETE_FAILURE');
        }
      };

      const res = await fetch(`${baseUrl}/api/account/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        }
      });

      assert.equal(res.status, 202);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);
      assert.equal(data.status, 'DELETION_PENDING');
      assert.equal(data.messageEn, 'Your account was deleted. Remaining data will be removed automatically.');
      assert.equal(data.messageAr, 'تم حذف حسابك. سيتم حذف البيانات المتبقية تلقائياً.');
      assert.ok(mockDb.getDoc('account_deletions', 'uid_p1'), 'account_deletions doc must still exist');
    });

    // 7. Failure BEFORE Auth deletion -> HTTP 500 ACCOUNT_DELETION_FAILED with messageEn and messageAr, Auth user NOT deleted
    await t.test('7. Failure BEFORE Auth deletion -> HTTP 500 ACCOUNT_DELETION_FAILED', async () => {
      mockDb.reset();
      mockAuth.reset();

      let authDeleteAttempted = false;
      mockAuth.onDeleteUser = async () => {
        authDeleteAttempted = true;
      };

      mockAuth.addUser('token_p1', {
        uid: 'uid_p1',
        email: 'p1@example.com',
        email_verified: true
      });

      mockDb.seed('users', 'uid_p1', {
        uid: 'uid_p1',
        email: 'p1@example.com'
      });

      // Fail during progress update prior to Auth deletion
      mockDb.hooks.onBeforeUpdate = async (col, _id, data) => {
        if (col === 'account_deletions' && data.status === 'pending_auth_deletion') {
          throw new Error('SIMULATED_PRE_AUTH_PROGRESS_FAILURE');
        }
      };

      const res = await fetch(`${baseUrl}/api/account/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        }
      });

      assert.equal(res.status, 500);
      const data = (await res.json()) as any;
      assert.equal(data.error, 'ACCOUNT_DELETION_FAILED');
      assert.equal(data.messageEn, "We couldn't finish deleting your account right now. It will be completed automatically — you can also try again.");
      assert.equal(data.messageAr, 'تعذر إكمال حذف حسابك الآن. سيتم إكماله تلقائياً، ويمكنك أيضاً المحاولة مرة أخرى.');
      assert.equal(authDeleteAttempted, false, 'Auth deletion must not have been executed');
    });

    // 8. Normal delete -> HTTP 200 { success: true, message: 'ACCOUNT_DELETED' }
    await t.test('8. Normal delete -> HTTP 200 ACCOUNT_DELETED', async () => {
      mockDb.reset();
      mockAuth.reset();

      mockAuth.addUser('token_p1', {
        uid: 'uid_p1',
        email: 'p1@example.com',
        email_verified: true
      });

      mockDb.seed('users', 'uid_p1', {
        uid: 'uid_p1',
        email: 'p1@example.com'
      });

      const res = await fetch(`${baseUrl}/api/account/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        }
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);
      assert.equal(data.message, 'ACCOUNT_DELETED');
      assert.equal(mockDb.getDoc('users', 'uid_p1'), undefined);
      assert.equal(mockDb.getDoc('account_deletions', 'uid_p1'), undefined);
    });

    // 9. Importing server.ts in tests does NOT start any interval (assert no reconciliation runs happened without being called)
    await t.test('9. Importing server.ts in tests does not run reconciliation interval', async () => {
      mockDb.reset();
      mockAuth.reset();

      // Seed a deletion marker
      mockDb.seed('relationship_deletions', 'rel_passive', {
        recordId: 'rel_passive',
        callerUid: 'uid_p1',
        stage: 'cleaning_batches',
        startedAt: new Date().toISOString()
      });

      // Wait a short time; ensure it was not cleaned automatically
      await new Promise((r) => setTimeout(r, 60));

      assert.ok(
        mockDb.getDoc('relationship_deletions', 'rel_passive'),
        'Deletion marker must not be cleaned up without explicit reconciliation trigger'
      );
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});


test('Revoked account boundaries protect profile mutations and invitation proposals', async (t) => {
  const app = createApp();
  const server: Server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const state of ['active', 'deleted', 'disabled', 'revoked', 'expired', 'invalid', 'unavailable']) {
      await t.test(state, async () => {
        const db = createMockFirestore();
        const uid = `session_${state}`;
        const flags: Array<boolean | undefined> = [];
        const auth = {
          async verifyIdToken(_token: string, checkRevoked?: boolean) {
            flags.push(checkRevoked);
            if (['expired', 'invalid'].includes(state) || (checkRevoked && state !== 'active')) {
              const error = new Error(`auth/${state}`);
              throw error;
            }
            return { uid, email: 'recipient@example.invalid', email_verified: true };
          }
        };
        __setTestDeps(db, auth);
        db.seed('relationships', 'session_record', {
          id: 'session_record', p1Uid: 'inviter', p2Uid: null, status: 'pending_partner',
          type: 'Engaged', startDate: '1 January 2026', startDateIso: '2026-01-01',
          partner1: { fullName: 'Inviter Example' }, partner2: { fullName: 'Recipient Example' }
        });
        db.seed('invitations', 'session_invite', {
          id: 'session_invite', recordId: 'session_record', p1Uid: 'inviter', p2Uid: null,
          inviterName: 'Inviter Example', partner2Name: 'Recipient Example',
          partner2Email: 'recipient@example.invalid', partner2Phone: null, partner2Whatsapp: null,
          relationshipType: 'Engaged', startDate: '1 January 2026', startDateIso: '2026-01-01',
          status: 'pending', createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString()
        });
        const headers = { Authorization: 'Bearer modeled_token', 'Content-Type': 'application/json' };
        const mutation = await fetch(`${baseUrl}/api/profile`, {
          method: 'POST', headers, body: JSON.stringify({ fullName: 'Recipient Example' })
        });
        assert.equal(mutation.status, state === 'active' ? 200 : 401);
        assert.equal(Boolean(db.getDoc('users', uid)), state === 'active');
        const preview = await fetch(`${baseUrl}/api/invitations/session_invite`, { headers });
        assert.equal(preview.status, 200);
        const body = await preview.json() as any;
        assert.equal(body.authorization.authorized, state === 'active');
        assert.deepEqual(flags, [true, true]);
        if (state === 'active') {
          assert.equal(body.invitation.partner2Email, 'recipient@example.invalid');
          assert.ok(body.record);
        } else {
          assert.equal(body.record, null);
          assert.equal(body.authorization.reason, 'AUTH_REQUIRED');
          assert.equal(body.authorization.authorizedUid, undefined);
          assert.equal(body.invitation.partner2Email, undefined);
          assert.equal(body.invitation.partner2Phone, undefined);
          assert.equal(body.invitation.recordId, undefined);
          assert.equal(body.invitation.startDate, undefined);
          assert.deepEqual(Object.keys(body.invitation).sort(),
            ['id', 'inviterName', 'relationshipType', 'status', 'expiresAt', 'contactRequirement'].sort());
        }
      });
    }
    const publicPreview = await fetch(`${baseUrl}/api/invitations/session_invite`);
    const body = await publicPreview.json() as any;
    assert.equal(publicPreview.status, 200);
    assert.equal(body.record, null);
    assert.equal(body.authorization.authenticated, false);
    assert.equal(body.invitation.partner2Email, undefined);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

const cleanupSingletons = ['reminder_settings', 'whatsapp_verify_attempts', 'whatsapp_verify_limits'];
const cleanupQueries = ['push_subscriptions', 'in_app_dismissals', 'reminder_deliveries'];

function seedAccountCleanup(db: ReturnType<typeof createMockFirestore>, uid: string, count = 2) {
  db.seed('users', uid, { profile: { fullName: 'Cleanup Example' } });
  db.seed('users', 'unrelated', { profile: { fullName: 'Unrelated Example' } });
  for (const collection of cleanupSingletons) {
    db.seed(collection, uid, { userId: uid });
    db.seed(collection, 'unrelated', { userId: 'unrelated' });
  }
  for (const collection of cleanupQueries) {
    for (let i = 0; i < count; i++) db.seed(collection, `${uid}_${i}`, { userId: uid });
    db.seed(collection, 'unrelated', { userId: 'unrelated' });
  }
}

function assertAccountCleanup(db: ReturnType<typeof createMockFirestore>, uid: string) {
  assert.equal(db.getDoc('users', uid), undefined);
  assert.equal(db.getDoc('account_deletions', uid), undefined);
  assert.ok(db.getDoc('users', 'unrelated'));
  for (const collection of [...cleanupSingletons, ...cleanupQueries]) {
    assert.ok(db.getDoc(collection, 'unrelated'), `Preserve unrelated data in ${collection}`);
    for (const data of db.store.get(collection)?.values() || []) assert.notEqual(data.userId, uid);
  }
}

test('Account cleanup retains progress on failure and reconciles every owned collection', async (t) => {
  const app = createApp();
  const server: Server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const failure of ['document', 'query', 'batch', 'whatsapp']) {
      await t.test(`${failure} failure stays pending until successful reconciliation`, async () => {
        const db = createMockFirestore();
        const auth = createMockAuth();
        const uid = `cleanup_${failure}`;
        auth.addUser(uid, { uid, email: 'cleanup@example.invalid', email_verified: true });
        seedAccountCleanup(db, uid);
        let fail = true;
        db.hooks.onBeforeDelete = (collection, id) => {
          if (fail && id === uid && ((failure === 'document' && collection === 'reminder_settings') ||
            (failure === 'whatsapp' && collection === 'whatsapp_verify_attempts'))) {
            throw new Error('INJECTED_DELETE_FAILURE');
          }
        };
        const collection = db.collection.bind(db);
        db.collection = name => {
          const ref = collection(name);
          if (name === 'push_subscriptions' && failure === 'query') {
            const where = ref.where.bind(ref);
            ref.where = (field, op, value) => {
              const query = where(field, op, value);
              const get = query.get.bind(query);
              query.get = async () => { if (fail) throw new Error('INJECTED_QUERY_FAILURE'); return get(); };
              const limit = query.limit.bind(query);
              query.limit = size => {
                const bounded = limit(size);
                const getBounded = bounded.get.bind(bounded);
                bounded.get = async () => { if (fail) throw new Error('INJECTED_QUERY_FAILURE'); return getBounded(); };
                return bounded;
              };
              return query;
            };
          }
          return ref;
        };
        const makeBatch = db.batch.bind(db);
        db.batch = () => {
          const batch = makeBatch();
          const commit = batch.commit.bind(batch);
          batch.commit = async () => {
            if (fail && failure === 'batch') throw new Error('INJECTED_BATCH_FAILURE');
            await commit();
          };
          return batch;
        };
        __setTestDeps(db, auth);
        const response = await fetch(`${baseUrl}/api/account/delete`, {
          method: 'POST', headers: { Authorization: `Bearer ${uid}`, 'Content-Type': 'application/json' }, body: '{}'
        });
        const body = await response.json() as any;
        assert.equal(response.status, 202);
        assert.equal(body.status, 'DELETION_PENDING');
        assert.ok(db.getDoc('account_deletions', uid));
        const failed = await reconcilePendingAccountDeletions(db as any, auth as any, uid);
        assert.deepEqual(failed.completed, []);
        assert.deepEqual(failed.failed, [uid]);
        assert.ok(db.getDoc('account_deletions', uid));
        fail = false;
        const completed = await reconcilePendingAccountDeletions(db as any, auth as any, uid);
        assert.deepEqual(completed.completed, [uid]);
        assert.deepEqual(completed.failed, []);
        assertAccountCleanup(db, uid);
        const repeated = await reconcilePendingAccountDeletions(db as any, auth as any, uid);
        assert.equal(repeated.processed, 0);
      });
    }
    await t.test('normal deletion cleans all supporting data and preserves unrelated users', async () => {
      const db = createMockFirestore();
      const auth = createMockAuth();
      const uid = 'cleanup_success';
      auth.addUser(uid, { uid, email_verified: true });
      seedAccountCleanup(db, uid);
      __setTestDeps(db, auth);
      const response = await fetch(`${baseUrl}/api/account/delete`, {
        method: 'POST', headers: { Authorization: `Bearer ${uid}`, 'Content-Type': 'application/json' }, body: '{}'
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json() as any).message, 'ACCOUNT_DELETED');
      assertAccountCleanup(db, uid);
    });
    await t.test('reconciliation deletes multiple bounded pages and tolerates missing singletons', async () => {
      const db = createMockFirestore();
      const auth = createMockAuth();
      const uid = 'cleanup_pages';
      seedAccountCleanup(db, uid, 137);
      db.seed('account_deletions', uid, { uid, status: 'pending_firestore_cleanup' });
      await db.collection('reminder_settings').doc(uid).delete();
      await db.collection('whatsapp_verify_attempts').doc(uid).delete();
      const sizes: number[] = [];
      const makeBatch = db.batch.bind(db);
      db.batch = () => {
        const batch = makeBatch();
        let size = 0;
        const remove = batch.delete.bind(batch);
        batch.delete = ref => { size++; return remove(ref); };
        const commit = batch.commit.bind(batch);
        batch.commit = async () => { sizes.push(size); await commit(); };
        return batch;
      };
      const outcome = await reconcilePendingAccountDeletions(db as any, auth as any, uid);
      assert.deepEqual(outcome.completed, [uid]);
      assert.deepEqual(sizes, [50, 50, 37, 50, 50, 37, 50, 50, 37]);
      assertAccountCleanup(db, uid);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
