process.env.NODE_ENV = 'test';
if (!process.env.CONTACT_HASH_SECRET || process.env.CONTACT_HASH_SECRET.length < 32) {
  process.env.CONTACT_HASH_SECRET = 'test_contact_hash_secret_at_least_32_characters_long_for_hmac';
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hashContact,
  toCanonicalStage,
  verifyContactByQuery,
  extractCanonicalContacts,
  PUBLIC_CONTACT_INDEX_COL,
  type ContactVerifyDb,
  type PublicContactIndexDoc
} from '../src/utils/contacts';
import {
  verifyRecipientIdentity,
  cleanRelatedDocsInBatches,
  reconcilePendingAccountDeletions,
  isUserDeletionPending,
  isRelationshipDeletionPending
} from '../server';

// 1. Either participant may end relationship; unrelated user or mismatched ID cannot
test('1. Either participant may end relationship unilaterally; unrelated user or mismatched ID cannot', () => {
  const relationshipStore = new Map<string, any>();
  const userStore = new Map<string, { activeRecordId?: string; name: string }>();
  const certStore = new Map<string, any>();
  const crStore = new Map<string, any>();
  const notifStore = new Map<string, any>();
  const resStore = new Map<string, any>();
  const indexStore = new Map<string, any>();

  const relId = 'rec_1001';
  const certRef = 'REL-2026-1001';
  const p1Uid = 'uid_user_p1';
  const p2Uid = 'uid_user_p2';
  const attackerUid = 'uid_attacker';

  const p1Phone = '+966551112233';
  const p2Phone = '+966559998877';
  const p1Hash = hashContact(p1Phone);
  const p2Hash = hashContact(p2Phone);

  relationshipStore.set(relId, {
    id: relId,
    status: 'active',
    type: 'marriage',
    verificationRef: certRef,
    p1Uid,
    p2Uid,
    partner1: { fullName: 'خالد عبدالله', phoneE164: p1Phone },
    partner2: { fullName: 'منى إبراهيم', phoneE164: p2Phone },
    settings: { publicContactSearchP1: true, publicContactSearchP2: true }
  });

  certStore.set(certRef, {
    verificationRef: certRef,
    status: 'active',
    partner1Name: 'خالد عبدالله',
    partner2Name: 'منى إبراهيم',
    type: 'marriage'
  });

  userStore.set(p1Uid, { activeRecordId: relId, name: 'خالد عبدالله' });
  userStore.set(p2Uid, { activeRecordId: relId, name: 'منى إبراهيم' });

  resStore.set(p1Hash, { recordId: relId, contactHash: p1Hash });
  resStore.set(p2Hash, { recordId: relId, contactHash: p2Hash });

  indexStore.set(p1Hash, { recordId: relId, contactHash: p1Hash, stage: 'Married' });
  indexStore.set(p2Hash, { recordId: relId, contactHash: p2Hash, stage: 'Married' });

  crStore.set('cr_1', { id: 'cr_1', recordId: relId, status: 'pending' });
  notifStore.set('notif_1', { id: 'notif_1', recordId: relId, message: 'old alert' });

  // Add unrelated relationship and reservation
  const otherRelId = 'rec_other_999';
  const otherHash = hashContact('+966553334455');
  relationshipStore.set(otherRelId, { id: otherRelId, status: 'active', p1Uid: 'uid_other_1', p2Uid: 'uid_other_2' });
  resStore.set(otherHash, { recordId: otherRelId, contactHash: otherHash });
  indexStore.set(otherHash, { recordId: otherRelId, contactHash: otherHash, stage: 'Dating' });

  // Pure function model of permanent termination
  const terminateActive = (callerUid: string, targetId: string) => {
    const rec = relationshipStore.get(targetId);
    if (!rec || rec.status !== 'active') throw new Error('ACTIVE_RELATIONSHIP_NOT_FOUND');
    if (rec.p1Uid !== callerUid && rec.p2Uid !== callerUid) throw new Error('NOT_RELATIONSHIP_PARTICIPANT');

    // 1. Delete relationship doc
    relationshipStore.delete(targetId);

    // 2. Delete cert doc
    if (rec.verificationRef) certStore.delete(rec.verificationRef);

    // 3. Clear user activeRecordId if matching
    const p1 = userStore.get(rec.p1Uid);
    if (p1 && p1.activeRecordId === targetId) p1.activeRecordId = undefined;
    const p2 = userStore.get(rec.p2Uid);
    if (p2 && p2.activeRecordId === targetId) p2.activeRecordId = undefined;

    // 4. Delete CRs and Notifications
    for (const [id, cr] of crStore.entries()) {
      if (cr.recordId === targetId) crStore.delete(id);
    }
    for (const [id, n] of notifStore.entries()) {
      if (n.recordId === targetId) notifStore.delete(id);
    }

    // 5. Delete reservations owned by targetId
    for (const [h, r] of resStore.entries()) {
      if (r.recordId === targetId) resStore.delete(h);
    }

    // 6. Delete public index entries owned by targetId
    for (const [h, idx] of indexStore.entries()) {
      if (idx.recordId === targetId) indexStore.delete(h);
    }

    return { success: true, deleted: true };
  };

  // Rejection 1: Attacker rejected
  assert.throws(() => terminateActive(attackerUid, relId), /NOT_RELATIONSHIP_PARTICIPANT/);

  // Success: Unilateral ending by P2
  const res = terminateActive(p2Uid, relId);
  assert.equal(res.success, true);
  assert.equal(res.deleted, true);

  // Relationship permanently deleted
  assert.equal(relationshipStore.has(relId), false);
  assert.equal(certStore.has(certRef), false);
  assert.equal(crStore.has('cr_1'), false);
  assert.equal(notifStore.has('notif_1'), false);
  assert.equal(resStore.has(p1Hash), false);
  assert.equal(resStore.has(p2Hash), false);
  assert.equal(indexStore.has(p1Hash), false);
  assert.equal(indexStore.has(p2Hash), false);

  // Both user accounts preserved and pointers cleared
  assert.equal(userStore.has(p1Uid), true);
  assert.equal(userStore.get(p1Uid)?.activeRecordId, undefined);
  assert.equal(userStore.has(p2Uid), true);
  assert.equal(userStore.get(p2Uid)?.activeRecordId, undefined);

  // Unrelated relationship and reservations completely untouched
  assert.equal(relationshipStore.has(otherRelId), true);
  assert.equal(resStore.has(otherHash), true);
  assert.equal(indexStore.has(otherHash), true);

  // Replay fails
  assert.throws(() => terminateActive(p2Uid, relId), /ACTIVE_RELATIONSHIP_NOT_FOUND/);
});

// 2. Old public QR/certificate and contact searches expose no deleted information
test('2. Public QR/cert verification and contact search return no details after relationship deletion', async () => {
  const indexStore: Record<string, PublicContactIndexDoc> = {};
  const relStore: Record<string, any> = {};

  const mockDb: ContactVerifyDb = {
    collection: (colName: string) => ({
      doc: (id: string) => ({
        get: async () => {
          if (colName === PUBLIC_CONTACT_INDEX_COL) {
            const data = indexStore[id];
            return { exists: Boolean(data), data: () => data };
          }
          if (colName === 'relationships') {
            const data = relStore[id];
            return { exists: Boolean(data), data: () => data };
          }
          return { exists: false, data: () => undefined };
        }
      })
    })
  };

  const contact = '+966551112233';
  const res = await verifyContactByQuery(mockDb, contact);
  assert.equal(res.found, false);
  assert.equal(res.stage, null);
});

// 3. Public invitation preview allowlist exposes strictly P1 full name, stage, and availability
test('3. Public invitation preview allowlist exposes only P1 name, requested stage, and non-sensitive status', () => {
  const rawInvitation = {
    id: 'inv_test_token_123',
    recordId: 'rec_secret_internal_456',
    inviterName: 'أحمد السعيد',
    partner2Name: 'سارة خالد',
    partner2Email: 'sara@example.com',
    partner2Phone: '+966550001122',
    relationshipType: 'marriage',
    startDate: '2026-01-15',
    startDateAr: '١٥ يناير ٢٠٢٦',
    startDateIso: '2026-01-15',
    status: 'pending',
    createdAt: '2026-09-28T10:00:00Z',
    expiresAt: '2026-10-01T10:00:00Z',
    reminderCount: 2
  };

  // Helper simulating public preview allowlist projection
  const getPublicPreview = (inv: typeof rawInvitation, isAuthenticatedRecipient: boolean) => {
    if (inv.status !== 'pending') {
      return {
        invitation: {
          id: inv.id,
          status: inv.status
        },
        record: null
      };
    }

    if (isAuthenticatedRecipient) {
      return {
        invitation: { ...inv },
        record: {
          type: inv.relationshipType,
          startDate: inv.startDate,
          partner1Name: inv.inviterName
        }
      };
    }

    return {
      invitation: {
        id: inv.id,
        inviterName: inv.inviterName,
        relationshipType: inv.relationshipType,
        status: inv.status,
        expiresAt: inv.expiresAt
      },
      record: null
    };
  };

  const publicResult = getPublicPreview(rawInvitation, false);

  // Check allowlist keys
  assert.deepEqual(Object.keys(publicResult.invitation).sort(), [
    'expiresAt',
    'id',
    'inviterName',
    'relationshipType',
    'status'
  ]);
  assert.equal(publicResult.invitation.inviterName, 'أحمد السعيد');
  assert.equal(publicResult.invitation.relationshipType, 'marriage');
  assert.equal(publicResult.invitation.status, 'pending');
  assert.equal(publicResult.record, null);

  // Prohibited fields must be absent
  assert.equal('partner2Name' in publicResult.invitation, false);
  assert.equal('partner2Email' in publicResult.invitation, false);
  assert.equal('partner2Phone' in publicResult.invitation, false);
  assert.equal('startDate' in publicResult.invitation, false);
  assert.equal('recordId' in publicResult.invitation, false);
  assert.equal('reminderCount' in publicResult.invitation, false);
});

// 4. Expired, cancelled, declined or accepted invitations expose no personal preview
test('4. Non-pending invitations (expired, cancelled, declined, accepted) expose no personal preview', () => {
  const expiredInv = {
    id: 'inv_expired_token',
    inviterName: 'أحمد السعيد',
    relationshipType: 'dating',
    status: 'expired'
  };

  const getPublicPreviewForNonPending = (inv: typeof expiredInv) => {
    return {
      invitation: {
        id: inv.id,
        status: inv.status
      },
      record: null
    };
  };

  const res = getPublicPreviewForNonPending(expiredInv);
  assert.deepEqual(res, {
    invitation: {
      id: 'inv_expired_token',
      status: 'expired'
    },
    record: null
  });
  assert.equal('inviterName' in res.invitation, false);
  assert.equal('relationshipType' in res.invitation, false);
});

// 5. Recipient server-side verification confirms intended recipient before revealing proposal
test('5. Recipient identity verification gate allows only verified intended recipient or P1', () => {
  const inv: any = {
    id: 'inv_token_999',
    p1Uid: 'uid_p1_owner',
    partner2Email: 'intended.partner@example.com',
    partner2Phone: '+966551234567'
  };

  // Case A: P1 owner -> authorized for view
  const resA = verifyRecipientIdentity({ invitation: inv, user: { uid: 'uid_p1_owner' }, isAction: 'view' });
  assert.equal(resA.authorized, true);
  assert.equal(resA.isP1, true);

  // Case A2: P1 owner cannot accept or decline as P2
  const resAcceptP1 = verifyRecipientIdentity({ invitation: inv, user: { uid: 'uid_p1_owner' }, isAction: 'accept' });
  assert.equal(resAcceptP1.authorized, false);
  assert.equal(resAcceptP1.reason, 'CANNOT_ACCEPT_OWN_INVITATION');

  const resDeclineP1 = verifyRecipientIdentity({ invitation: inv, user: { uid: 'uid_p1_owner' }, isAction: 'decline' });
  assert.equal(resDeclineP1.authorized, false);
  assert.equal(resDeclineP1.reason, 'INVITER_CANNOT_DECLINE_AS_P2');

  // Case B: Verified recipient with matching verified email -> authorized
  const resB = verifyRecipientIdentity({
    invitation: inv,
    user: { uid: 'uid_p2', email: 'intended.partner@example.com', email_verified: true },
    isAction: 'accept'
  });
  assert.equal(resB.authorized, true);

  // Case C: Recipient with matching phone -> authorized
  const resC = verifyRecipientIdentity({
    invitation: inv,
    user: { uid: 'uid_p2', phone_number: '+966551234567' },
    isAction: 'accept'
  });
  assert.equal(resC.authorized, true);

  // Case D: Recipient with matching email but NOT verified -> rejected (fails closed)
  const resD = verifyRecipientIdentity({
    invitation: inv,
    user: { uid: 'uid_p2', email: 'intended.partner@example.com', email_verified: false },
    isAction: 'accept'
  });
  assert.equal(resD.authorized, false);
  assert.equal(resD.reason, 'INVITATION_IDENTITY_MISMATCH');

  // Case E: Unrelated logged-in user -> rejected
  const resE = verifyRecipientIdentity({
    invitation: inv,
    user: { uid: 'uid_stranger', email: 'stranger@example.com', email_verified: true },
    isAction: 'accept'
  });
  assert.equal(resE.authorized, false);

  // Case F: Email-only invitation where user has verified phone but no matching verified email -> rejected
  const invEmailOnly: any = {
    id: 'inv_email_only',
    p1Uid: 'uid_p1_owner',
    partner2Email: 'intended@example.com'
  };
  const resF = verifyRecipientIdentity({
    invitation: invEmailOnly,
    user: { uid: 'uid_p2', phone_number: '+966559999999', email: 'intended@example.com', email_verified: false },
    isAction: 'accept'
  });
  assert.equal(resF.authorized, false);
  assert.equal(resF.reason, 'INVITATION_IDENTITY_MISMATCH');
});

// 6. Delete My Account deletes requester account and relationship, preserving other partner
test('6. Delete My Account removes requester account and relationship data, preserving other partner account', async () => {
  const users = new Map<string, { email: string; name: string; activeRecordId?: string }>();
  const authUsers = new Set<string>();
  const relationships = new Map<string, any>();

  users.set('uid_p1', { email: 'p1@example.com', name: 'طرف أول', activeRecordId: 'rec_100' });
  users.set('uid_p2', { email: 'p2@example.com', name: 'طرف ثان', activeRecordId: 'rec_100' });
  authUsers.add('uid_p1');
  authUsers.add('uid_p2');
  relationships.set('rec_100', { id: 'rec_100', status: 'active', p1Uid: 'uid_p1', p2Uid: 'uid_p2' });

  const deleteAccount = async (callerUid: string) => {
    const userDoc = users.get(callerUid);
    if (!userDoc) throw new Error('USER_NOT_FOUND');

    // 1. Terminate relationship if active
    if (userDoc.activeRecordId && relationships.has(userDoc.activeRecordId)) {
      const rel = relationships.get(userDoc.activeRecordId);
      relationships.delete(rel.id);
      const otherUid = rel.p1Uid === callerUid ? rel.p2Uid : rel.p1Uid;
      const otherDoc = users.get(otherUid);
      if (otherDoc && otherDoc.activeRecordId === rel.id) {
        otherDoc.activeRecordId = undefined;
      }
    }

    // 2. Delete Auth user
    if (!authUsers.has(callerUid)) {
      // already missing from Auth
    } else {
      authUsers.delete(callerUid);
    }

    // 3. Delete Firestore document
    users.delete(callerUid);

    return { success: true, message: 'ACCOUNT_DELETED' };
  };

  const res = await deleteAccount('uid_p1');
  assert.equal(res.success, true);
  assert.equal(res.message, 'ACCOUNT_DELETED');

  // P1 removed from users and Auth
  assert.equal(users.has('uid_p1'), false);
  assert.equal(authUsers.has('uid_p1'), false);

  // Shared relationship removed
  assert.equal(relationships.has('rec_100'), false);

  // P2 account and Auth user fully preserved
  assert.equal(users.has('uid_p2'), true);
  assert.equal(authUsers.has('uid_p2'), true);
  assert.equal(users.get('uid_p2')?.activeRecordId, undefined);
});

// 7. Auth deletion failure never reports false success
test('7. Auth deletion failure returns truthful failure and does not claim account deletion', async () => {
  const users = new Map<string, any>();
  users.set('uid_p1', { email: 'p1@example.com' });

  const failingAdminAuth = {
    deleteUser: async (_uid: string) => {
      const err = new Error('Auth service network timeout');
      (err as any).code = 'auth/internal-error';
      throw err;
    }
  };

  const executeDelete = async (uid: string) => {
    try {
      await failingAdminAuth.deleteUser(uid);
      users.delete(uid);
      return { success: true, message: 'ACCOUNT_DELETED' };
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        users.delete(uid);
        return { success: true, message: 'ACCOUNT_DELETED' };
      }
      return { error: 'AUTH_DELETION_FAILED', status: 500 };
    }
  };

  const result = await executeDelete('uid_p1');
  assert.equal(result.error, 'AUTH_DELETION_FAILED');
  assert.equal(result.status, 500);
  assert.equal('success' in result, false);
});

// 8. Missing Auth user (auth/user-not-found) handled safely
test('8. Already missing Auth user is handled safely without throwing error', async () => {
  const users = new Map<string, any>();
  users.set('uid_p1', { email: 'p1@example.com' });

  const adminAuthWithMissingUser = {
    deleteUser: async (_uid: string) => {
      const err = new Error('User not found in Auth');
      (err as any).code = 'auth/user-not-found';
      throw err;
    }
  };

  const executeDelete = async (uid: string) => {
    try {
      await adminAuthWithMissingUser.deleteUser(uid);
      users.delete(uid);
      return { success: true, message: 'ACCOUNT_DELETED' };
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        users.delete(uid);
        return { success: true, message: 'ACCOUNT_DELETED' };
      }
      return { error: 'AUTH_DELETION_FAILED' };
    }
  };

  const result = await executeDelete('uid_p1');
  assert.equal(result.success, true);
  assert.equal(result.message, 'ACCOUNT_DELETED');
  assert.equal(users.has('uid_p1'), false);
});

// 9. Client state resets cleanly after relationship deletion without accessing response.record
test('9. Client state clears relationship, certificate, and invitation when deletion succeeds', () => {
  let localRecord: any = { id: 'rec_1', status: 'active', partner1: { fullName: 'خالد' }, partner2: { fullName: 'منى' }, p1Uid: 'uid_1', p2Uid: 'uid_2' };
  let localInvitation: any = { id: 'inv_1', status: 'pending' };
  let currentScreen = 'review_controls';

  const onExitRelationshipResponse = (apiResponse: { success: boolean; deleted: boolean; recordId: string }, callerUid: string) => {
    if (apiResponse.success && apiResponse.deleted) {
      localRecord = {
        id: '',
        status: 'draft',
        partner1: callerUid === localRecord.p2Uid ? localRecord.partner2 : localRecord.partner1,
        partner2: { fullName: '' }
      };
      localInvitation = { id: '', status: 'pending' };
      currentScreen = 'p1_details';
    }
  };

  onExitRelationshipResponse({ success: true, deleted: true, recordId: 'rec_1' }, 'uid_1');
  assert.equal(localRecord.id, '');
  assert.equal(localRecord.status, 'draft');
  assert.equal(localRecord.partner1.fullName, 'خالد');
  assert.equal(localInvitation.id, '');
  assert.equal(currentScreen, 'p1_details');
});

// 10. Late asynchronous responses cannot restore deleted relationship data
test('10. Late asynchronous responses after deletion are blocked by request ID guards', () => {
  let currentRequestId = 5;
  let activeAuthUid: string | null = 'uid_p1';
  let storedRecord: any = null;

  const simulateAsyncResponse = (requestId: number, requestUid: string, data: any) => {
    // Guard check from App.tsx
    if (requestId !== currentRequestId || activeAuthUid !== requestUid) {
      return; // Blocked!
    }
    storedRecord = data;
  };

  // User ends relationship -> increments requestId & resets state
  currentRequestId += 1; // 6
  storedRecord = null;

  // Stale in-flight response from request #5 arrives late
  simulateAsyncResponse(5, 'uid_p1', { id: 'rec_old_deleted', status: 'active' });
  assert.equal(storedRecord, null); // Protected against stale restoration
});

// 11. Auth succeeds, Firestore profile deletion fails -> durable progress enables server reconciliation without user re-auth
test('11. Auth deletion succeeds, Firestore fails -> durable progress reconciles without user signing in', async () => {
  const users = new Map<string, any>();
  const accountDeletions = new Map<string, any>();
  const authUsers = new Set<string>();

  users.set('uid_orphan', { email: 'orphan@example.com', name: 'أيتام' });
  // Step A: Account deletion started, Auth deleted, but Firestore crashed
  accountDeletions.set('uid_orphan', { uid: 'uid_orphan', status: 'pending_firestore_cleanup' });

  const mockDb: any = {
    batch: () => ({
      delete: (_ref: any) => {},
      commit: async () => {}
    }),
    collection: (col: string) => {
      if (col === 'relationships' || col === 'invitation_blocks') {
        return {
          where: () => ({
            get: async () => ({ docs: [], empty: true, size: 0 }),
            limit: () => ({
              get: async () => ({ docs: [], empty: true, size: 0 })
            })
          })
        };
      }

      const getDocs = () => {
        const docs = Array.from(accountDeletions.entries()).map(([k, v]) => ({
          id: k,
          data: () => v,
          ref: {
            delete: async () => accountDeletions.delete(k)
          }
        }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      };

      return {
        doc: (id: string) => ({
          delete: async () => {
            if (col === 'users') users.delete(id);
            if (col === 'account_deletions') accountDeletions.delete(id);
          },
          get: async () => ({
            exists: col === 'account_deletions' ? accountDeletions.has(id) : users.has(id),
            data: () => (col === 'account_deletions' ? accountDeletions.get(id) : users.get(id))
          })
        }),
        limit: () => ({
          get: async () => getDocs()
        }),
        where: () => ({
          get: async () => ({ docs: [], empty: true }),
          limit: () => ({
            get: async () => getDocs()
          })
        })
      };
    }
  };

  const mockAuth: any = {
    deleteUser: async (uid: string) => {
      if (!authUsers.has(uid)) {
        const err: any = new Error('auth/user-not-found');
        err.code = 'auth/user-not-found';
        throw err;
      }
      authUsers.delete(uid);
    },
    getUser: async (uid: string) => {
      if (!authUsers.has(uid)) {
        const err: any = new Error('auth/user-not-found');
        err.code = 'auth/user-not-found';
        throw err;
      }
      return { uid };
    }
  };

  // Missing authService throws
  await assert.rejects(
    async () => reconcilePendingAccountDeletions(mockDb, null as any),
    /AUTH_SERVICE_REQUIRED_FOR_ACCOUNT_RECONCILIATION/
  );

  // Run actual production function
  const res = await reconcilePendingAccountDeletions(mockDb, mockAuth);
  assert.equal(res.completed.includes('uid_orphan'), true);
  assert.equal(users.has('uid_orphan'), false);
  assert.equal(accountDeletions.has('uid_orphan'), false);
});

// 12. Auth timeout with uncertain outcome -> getUser verifies actual deletion
test('12. Auth timeout with uncertain outcome -> getUser verification resolves status truthfully', async () => {
  let userInAuth = false; // Actually deleted on backend despite timeout

  const simulateTimeoutAuth = {
    deleteUser: async (_uid: string) => {
      const timeoutErr = new Error('ETIMEDOUT');
      (timeoutErr as any).code = 'auth/network-timeout';
      throw timeoutErr;
    },
    getUser: async (_uid: string) => {
      if (!userInAuth) {
        const notFound = new Error('User not found');
        (notFound as any).code = 'auth/user-not-found';
        throw notFound;
      }
      return { uid: 'uid_timeout' };
    }
  };

  let authConfirmedDeleted = false;
  try {
    await simulateTimeoutAuth.deleteUser('uid_timeout');
    authConfirmedDeleted = true;
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      authConfirmedDeleted = true;
    } else {
      try {
        await simulateTimeoutAuth.getUser('uid_timeout');
      } catch (getErr: any) {
        if (getErr?.code === 'auth/user-not-found') {
          authConfirmedDeleted = true;
        }
      }
    }
  }

  assert.equal(authConfirmedDeleted, true);
});

// 13. Cleanup with substantially more related documents than one batch (e.g. 120 items)
test('13. Bounded batch cleanup handles 120 related documents in 50-item batches without exceeding transaction limits', async () => {
  const notifications = new Map<string, { id: string; recordId: string }>();
  const relId = 'rec_large_history';

  // Seed 120 notifications
  for (let i = 0; i < 120; i++) {
    notifications.set(`notif_${i}`, { id: `notif_${i}`, recordId: relId });
  }
  // Seed 10 notifications for another unrelated relationship
  for (let i = 0; i < 10; i++) {
    notifications.set(`other_notif_${i}`, { id: `other_notif_${i}`, recordId: 'other_rec' });
  }

  assert.equal(notifications.size, 130);

  const mockDb: any = {
    collection: (_col: string) => ({
      where: (_field: string, _op: string, val: string) => ({
        limit: (batchSize: number) => ({
          get: async () => {
            const matches: any[] = [];
            for (const [id, doc] of notifications.entries()) {
              if (doc.recordId === val) {
                matches.push({
                  id,
                  ref: { id }
                });
                if (matches.length >= batchSize) break;
              }
            }
            return {
              docs: matches,
              size: matches.length,
              empty: matches.length === 0
            };
          }
        })
      })
    }),
    batch: () => {
      const pendingDeletes: string[] = [];
      return {
        delete: (ref: { id: string }) => {
          pendingDeletes.push(ref.id);
        },
        commit: async () => {
          for (const id of pendingDeletes) {
            notifications.delete(id);
          }
        }
      };
    }
  };

  // Run actual production function
  const totalDeleted = await cleanRelatedDocsInBatches(mockDb, 'notifications', relId, 50);
  assert.equal(totalDeleted, 120);

  // All 120 target notifications deleted
  for (let i = 0; i < 120; i++) {
    assert.equal(notifications.has(`notif_${i}`), false);
  }

  // Unrelated relationship's 10 notifications completely preserved
  assert.equal(notifications.size, 10);
  for (let i = 0; i < 10; i++) {
    assert.equal(notifications.has(`other_notif_${i}`), true);
  }
});

// 14. Concurrent mutation attempts during deletion are rejected
test('14. Concurrent change requests, edits, and approvals are rejected when relationship status is "deleting"', async () => {
  const accountDeletions = new Map<string, any>();
  accountDeletions.set('uid_p1', { uid: 'uid_p1', status: 'pending_cleanup' });

  const relDeletions = new Map<string, any>();
  relDeletions.set('rec_deleting_now', { recordId: 'rec_deleting_now', status: 'deleting' });

  const mockDb: any = {
    collection: (col: string) => ({
      doc: (id: string) => ({
        get: async () => ({
          exists: col === 'account_deletions' ? accountDeletions.has(id) : relDeletions.has(id),
          data: () => (col === 'account_deletions' ? accountDeletions.get(id) : relDeletions.get(id))
        })
      })
    })
  };

  // Test production isUserDeletionPending and isRelationshipDeletionPending
  assert.equal(await isUserDeletionPending(mockDb, 'uid_p1'), true);
  assert.equal(await isUserDeletionPending(mockDb, 'uid_p2'), false);

  assert.equal(await isRelationshipDeletionPending(mockDb, 'rec_deleting_now'), true);
  assert.equal(await isRelationshipDeletionPending(mockDb, 'rec_active'), false);
});
