import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createApp,
  __setTestDeps,
  runDeletionReconciliation
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
