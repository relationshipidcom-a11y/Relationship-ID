import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createApp,
  __setTestDeps,
  terminateActiveRelationship,
  reconcilePendingAccountDeletions
} from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

const P1_PHONE = '+966500000001';
const P2_PHONE = '+966500000002';

function samplePartner(fullName: string, email: string, phone: string) {
  return {
    fullName,
    fullNameEn: fullName,
    birthDay: '10',
    birthMonth: '04',
    birthYear: '1992',
    email,
    phoneCountry: 'SA +966',
    phoneNumber: phone.slice(4),
    phoneE164: phone,
    whatsappCountry: 'SA +966',
    whatsappNumber: phone.slice(4),
    whatsappE164: phone
  };
}

test('Steps 7 & 8: Account Deletion in every state and Retryable End Relationship', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  const seedAuth = () => {
    mockAuth.reset();
    mockAuth.addUser('token_p1', {
      uid: 'uid_p1',
      email: 'p1@example.com',
      email_verified: true,
      phone_number: P1_PHONE
    });

    mockAuth.addUser('token_p2', {
      uid: 'uid_p2',
      email: 'p2@example.com',
      email_verified: true,
      phone_number: P2_PHONE
    });

    mockAuth.addUser('token_p3', {
      uid: 'uid_p3',
      email: 'p3@example.com',
      email_verified: true,
      phone_number: '+966500000003'
    });
  };

  seedAuth();

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // === STEP 7A: terminateActiveRelationship accepts all statuses ===
    await t.test('Step 7: terminateActiveRelationship accepts ended and cancelled statuses', async () => {
      mockDb.reset();
      seedAuth();
      const p1 = samplePartner('Fahad', 'p1@example.com', P1_PHONE);
      const p2 = samplePartner('Sara', 'p2@example.com', P2_PHONE);

      for (const st of ['draft', 'pending_partner', 'active', 'deleting', 'ended', 'cancelled'] as const) {
        const relId = `rel_${st}`;
        mockDb.seed('relationships', relId, {
          id: relId,
          status: st,
          p1Uid: 'uid_p1',
          p2Uid: 'uid_p2',
          partner1: p1,
          partner2: p2
        });

        const res = await terminateActiveRelationship(mockDb as any, 'uid_p1', relId, 'test_cleanup');
        assert.equal(res.success, true);
        assert.equal(res.deleted, true);
        assert.equal(mockDb.getDoc('relationships', relId), undefined);
      }

      // Rejects non-participant
      mockDb.seed('relationships', 'rel_other', {
        id: 'rel_other',
        status: 'active',
        p1Uid: 'uid_p1',
        p2Uid: 'uid_p2',
        partner1: p1,
        partner2: p2
      });
      await assert.rejects(
        async () => {
          await terminateActiveRelationship(mockDb as any, 'uid_p3', 'rel_other', 'test');
        },
        { message: 'NOT_RELATIONSHIP_PARTICIPANT' }
      );
    });

    // === STEP 7B: POST /api/account/delete removes all relationships in every state ===
    await t.test('Step 7: Delete My Account removes all relationships where user is p1Uid in any state', async () => {
      mockDb.reset();
      seedAuth();
      const p1 = samplePartner('Fahad', 'p1@example.com', P1_PHONE);
      const p2 = samplePartner('Sara', 'p2@example.com', P2_PHONE);

      mockDb.seed('users', 'uid_p1', {
        uid: 'uid_p1',
        email: 'p1@example.com',
        activeRecordId: 'rel_active',
        profile: p1
      });
      mockDb.seed('users', 'uid_p2', {
        uid: 'uid_p2',
        email: 'p2@example.com',
        activeRecordId: 'rel_active',
        profile: p2
      });

      // Seed multiple relationships in different states
      mockDb.seed('relationships', 'rel_active', {
        id: 'rel_active',
        status: 'active',
        p1Uid: 'uid_p1',
        p2Uid: 'uid_p2',
        partner1: p1,
        partner2: p2
      });
      mockDb.seed('relationships', 'rel_draft', {
        id: 'rel_draft',
        status: 'draft',
        p1Uid: 'uid_p1',
        p2Uid: null,
        partner1: p1,
        partner2: null
      });
      mockDb.seed('relationships', 'rel_deleting', {
        id: 'rel_deleting',
        status: 'deleting',
        p1Uid: 'uid_p1',
        p2Uid: 'uid_p2',
        partner1: p1,
        partner2: p2
      });
      mockDb.seed('relationships', 'rel_ended', {
        id: 'rel_ended',
        status: 'ended',
        p1Uid: 'uid_p1',
        p2Uid: 'uid_p2',
        partner1: p1,
        partner2: p2
      });

      const res = await fetch(`${baseUrl}/api/account/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        }
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
      assert.equal(body.message, 'ACCOUNT_DELETED');

      // Verify all relationships are gone
      assert.equal(mockDb.getDoc('relationships', 'rel_active'), undefined);
      assert.equal(mockDb.getDoc('relationships', 'rel_draft'), undefined);
      assert.equal(mockDb.getDoc('relationships', 'rel_deleting'), undefined);
      assert.equal(mockDb.getDoc('relationships', 'rel_ended'), undefined);

      // Verify P1 user doc deleted, but P2 user doc preserved with activeRecordId cleared
      assert.equal(mockDb.getDoc('users', 'uid_p1'), undefined);
      const p2User = mockDb.getDoc('users', 'uid_p2');
      assert.ok(p2User, 'P2 user doc must not be deleted');
      assert.equal(p2User.activeRecordId, undefined, 'P2 activeRecordId must be cleared');

      // Verify account_deletions progress doc is cleaned up
      assert.equal(mockDb.getDoc('account_deletions', 'uid_p1'), undefined);
    });

    await t.test('Step 7: Delete My Account removes relationships where user is p2Uid in deleting/active states', async () => {
      mockDb.reset();
      seedAuth();
      const p1 = samplePartner('Fahad', 'p1@example.com', P1_PHONE);
      const p2 = samplePartner('Sara', 'p2@example.com', P2_PHONE);

      mockDb.seed('users', 'uid_p1', {
        uid: 'uid_p1',
        email: 'p1@example.com',
        activeRecordId: 'rel_p2_del',
        profile: p1
      });
      mockDb.seed('users', 'uid_p2', {
        uid: 'uid_p2',
        email: 'p2@example.com',
        activeRecordId: 'rel_p2_del',
        profile: p2
      });

      // Relationship in deleting state where caller is p2Uid
      mockDb.seed('relationships', 'rel_p2_del', {
        id: 'rel_p2_del',
        status: 'deleting',
        p1Uid: 'uid_p1',
        p2Uid: 'uid_p2',
        partner1: p1,
        partner2: p2
      });

      const res = await fetch(`${baseUrl}/api/account/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        }
      });

      assert.equal(res.status, 200);
      assert.equal(mockDb.getDoc('relationships', 'rel_p2_del'), undefined);
      assert.equal(mockDb.getDoc('users', 'uid_p2'), undefined);
      assert.ok(mockDb.getDoc('users', 'uid_p1'), 'P1 user document must remain');
    });

    await t.test('Step 7: Delete My Account succeeds when user has zero relationships', async () => {
      mockDb.reset();
      seedAuth();
      mockDb.seed('users', 'uid_p3', {
        uid: 'uid_p3',
        email: 'p3@example.com'
      });

      const res = await fetch(`${baseUrl}/api/account/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p3'
        }
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
      assert.equal(mockDb.getDoc('users', 'uid_p3'), undefined);
    });

    await t.test('Step 7: reconcilePendingAccountDeletions loops and removes all relationships in any state', async () => {
      mockDb.reset();
      seedAuth();
      const p1 = samplePartner('Fahad', 'p1@example.com', P1_PHONE);
      const p2 = samplePartner('Sara', 'p2@example.com', P2_PHONE);

      mockDb.seed('account_deletions', 'uid_p1', {
        uid: 'uid_p1',
        status: 'pending_cleanup',
        createdAt: new Date().toISOString()
      });
      mockDb.seed('relationships', 'rel_p1_canc', {
        id: 'rel_p1_canc',
        status: 'cancelled',
        p1Uid: 'uid_p1',
        p2Uid: 'uid_p2',
        partner1: p1,
        partner2: p2
      });
      mockDb.seed('relationships', 'rel_p1_del', {
        id: 'rel_p1_del',
        status: 'deleting',
        p1Uid: 'uid_p2',
        p2Uid: 'uid_p1',
        partner1: p2,
        partner2: p1
      });

      const recon = await reconcilePendingAccountDeletions(mockDb as any, mockAuth as any, 'uid_p1');
      assert.equal(recon.processed, 1);
      assert.equal(mockDb.getDoc('relationships', 'rel_p1_canc'), undefined);
      assert.equal(mockDb.getDoc('relationships', 'rel_p1_del'), undefined);
    });

    // === STEP 8: End Relationship is retryable ===
    await t.test('Step 8: Retrying POST /api/relationship/end on deleting relationship with relationshipId succeeds', async () => {
      mockDb.reset();
      seedAuth();
      const p1 = samplePartner('Fahad', 'p1@example.com', P1_PHONE);
      const p2 = samplePartner('Sara', 'p2@example.com', P2_PHONE);

      // Simulate state after Phase 1 was executed: status is 'deleting' and activeRecordId was cleared from users
      mockDb.seed('users', 'uid_p1', {
        uid: 'uid_p1',
        email: 'p1@example.com',
        profile: p1
        // activeRecordId is already deleted/undefined
      });
      mockDb.seed('users', 'uid_p2', {
        uid: 'uid_p2',
        email: 'p2@example.com',
        profile: p2
      });

      mockDb.seed('relationships', 'rel_interrupted', {
        id: 'rel_interrupted',
        status: 'deleting',
        p1Uid: 'uid_p1',
        p2Uid: 'uid_p2',
        partner1: p1,
        partner2: p2
      });

      const res = await fetch(`${baseUrl}/api/relationship/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({ relationshipId: 'rel_interrupted' })
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
      assert.equal(body.deleted, true);
      assert.equal(body.recordId, 'rel_interrupted');
      assert.equal(mockDb.getDoc('relationships', 'rel_interrupted'), undefined);
    });

    await t.test('Step 8: Retrying POST /api/relationship/end without body discovers deleting relationship', async () => {
      mockDb.reset();
      seedAuth();
      const p1 = samplePartner('Fahad', 'p1@example.com', P1_PHONE);
      const p2 = samplePartner('Sara', 'p2@example.com', P2_PHONE);

      mockDb.seed('users', 'uid_p1', {
        uid: 'uid_p1',
        email: 'p1@example.com',
        profile: p1
      });

      mockDb.seed('relationships', 'rel_no_body', {
        id: 'rel_no_body',
        status: 'deleting',
        p1Uid: 'uid_p1',
        p2Uid: 'uid_p2',
        partner1: p1,
        partner2: p2
      });

      const res = await fetch(`${baseUrl}/api/relationship/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        }
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
      assert.equal(body.deleted, true);
      assert.equal(mockDb.getDoc('relationships', 'rel_no_body'), undefined);
    });

    await t.test('Step 8: P2 can retry POST /api/relationship/end on deleting relationship', async () => {
      mockDb.reset();
      seedAuth();
      const p1 = samplePartner('Fahad', 'p1@example.com', P1_PHONE);
      const p2 = samplePartner('Sara', 'p2@example.com', P2_PHONE);

      mockDb.seed('relationships', 'rel_p2_end', {
        id: 'rel_p2_end',
        status: 'deleting',
        p1Uid: 'uid_p1',
        p2Uid: 'uid_p2',
        partner1: p1,
        partner2: p2
      });

      const res = await fetch(`${baseUrl}/api/relationship/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        },
        body: JSON.stringify({ relationshipId: 'rel_p2_end' })
      });

      assert.equal(res.status, 200);
      assert.equal(mockDb.getDoc('relationships', 'rel_p2_end'), undefined);
    });

    await t.test('Step 8: Non-participant gets 403 NOT_RELATIONSHIP_PARTICIPANT', async () => {
      mockDb.reset();
      seedAuth();
      const p1 = samplePartner('Fahad', 'p1@example.com', P1_PHONE);
      const p2 = samplePartner('Sara', 'p2@example.com', P2_PHONE);

      mockDb.seed('relationships', 'rel_forbidden', {
        id: 'rel_forbidden',
        status: 'active',
        p1Uid: 'uid_p1',
        p2Uid: 'uid_p2',
        partner1: p1,
        partner2: p2
      });

      const res = await fetch(`${baseUrl}/api/relationship/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p3'
        },
        body: JSON.stringify({ relationshipId: 'rel_forbidden' })
      });

      assert.equal(res.status, 403);
      const body = (await res.json()) as any;
      assert.equal(body.error, 'NOT_RELATIONSHIP_PARTICIPANT');
    });

    await t.test('Step 8: Non-existent relationship gets 404 ACTIVE_RELATIONSHIP_NOT_FOUND', async () => {
      mockDb.reset();
      seedAuth();
      const res = await fetch(`${baseUrl}/api/relationship/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({ relationshipId: 'rel_does_not_exist' })
      });

      assert.equal(res.status, 404);
      const body = (await res.json()) as any;
      assert.equal(body.error, 'ACTIVE_RELATIONSHIP_NOT_FOUND');
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
