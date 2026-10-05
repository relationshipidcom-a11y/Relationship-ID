process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { hashContact } from '../src/utils/contacts';
import { createApp, __setTestDeps, rateLimitMap } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

const SAUDI_P1_PHONE = '+966500000001';
const SAUDI_P2_PHONE = '+966500000002';
const SAUDI_P3_PHONE = '+966500000003';
const SAUDI_P4_PHONE = '+966500000004';

test('Invitation blocks and decline limits test suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  function resetState() {
    mockDb.reset();
    mockAuth.reset();
    rateLimitMap.clear();

    mockAuth.addUser('token_p1', {
      uid: 'uid_p1',
      email: 'p1@example.com',
      email_verified: true,
      phone_number: SAUDI_P1_PHONE
    });

    mockAuth.addUser('token_p2', {
      uid: 'uid_p2',
      email: 'p2@example.com',
      email_verified: true,
      phone_number: SAUDI_P2_PHONE
    });

    mockAuth.addUser('token_p3', {
      uid: 'uid_p3',
      email: 'p3@example.com',
      email_verified: true,
      phone_number: SAUDI_P3_PHONE
    });

    mockAuth.addUser('token_p4', {
      uid: 'uid_p4',
      email: 'p4@example.com',
      email_verified: true,
      phone_number: SAUDI_P4_PHONE
    });

    const p1 = {
      fullName: 'Fahad Al-Harbi',
      fullNameEn: 'Fahad Al-Harbi',
      birthDay: '10',
      birthMonth: '04',
      birthYear: '1992',
      email: 'p1@example.com',
      phoneCountry: 'SA +966',
      phoneNumber: '0500000001',
      phoneE164: SAUDI_P1_PHONE
    };

    mockDb.seed('users', 'uid_p1', {
      uid: 'uid_p1',
      email: 'p1@example.com',
      phoneE164: SAUDI_P1_PHONE,
      activeRecordId: 'rel_p1',
      profile: p1
    });

    mockDb.seed('relationships', 'rel_p1', {
      id: 'rel_p1',
      recordNumber: '123456',
      type: 'dating',
      status: 'draft',
      p1Uid: 'uid_p1',
      p2Uid: null,
      partner1: p1,
      partner2: {
        fullName: '',
        birthDay: '',
        birthMonth: '',
        birthYear: '',
        email: '',
        phoneCountry: 'SA +966',
        phoneNumber: '',
        whatsappCountry: 'SA +966',
        whatsappNumber: ''
      },
      startDate: '2024-01-01',
      startDateAr: '1 يناير 2024',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    });

    mockDb.seed('users', 'uid_p2', {
      uid: 'uid_p2',
      email: 'p2@example.com',
      phoneE164: SAUDI_P2_PHONE,
      profile: {
        fullName: 'Sara Al-Otaibi',
        fullNameEn: 'Sara Al-Otaibi',
        email: 'p2@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '0500000002',
        phoneE164: SAUDI_P2_PHONE
      }
    });

    mockDb.seed('users', 'uid_p3', {
      uid: 'uid_p3',
      email: 'p3@example.com',
      phoneE164: SAUDI_P3_PHONE,
      profile: {
        fullName: 'Noura Al-Dosari',
        fullNameEn: 'Noura Al-Dosari',
        email: 'p3@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '0500000003',
        phoneE164: SAUDI_P3_PHONE
      }
    });

    mockDb.seed('users', 'uid_p4', {
      uid: 'uid_p4',
      email: 'p4@example.com',
      phoneE164: SAUDI_P4_PHONE,
      profile: {
        fullName: 'Reem Al-Ghamdi',
        fullNameEn: 'Reem Al-Ghamdi',
        email: 'p4@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '0500000004',
        phoneE164: SAUDI_P4_PHONE
      }
    });
  }

  try {
    // 1. Two declines from P2 -> P1 can still create an invitation to P2 (not 403).
    await t.test('1. Two declines from P2 -> P1 can still create an invitation to P2 (not 403)', async () => {
      resetState();

      // Invite 1
      const inv1Res = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Sara Al-Otaibi',
          partner2Email: 'p2@example.com'
        })
      });
      assert.equal(inv1Res.status, 200);
      const inv1Data = (await inv1Res.json()) as any;
      const inv1Id = inv1Data.invitation.id;

      // Decline 1
      const dec1Res = await fetch(`${baseUrl}/api/invitations/${inv1Id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p2' },
        body: JSON.stringify({ block: false })
      });
      assert.equal(dec1Res.status, 200);
      const dec1Data = (await dec1Res.json()) as any;
      assert.equal(dec1Data.blocked, false);

      // Invite 2
      const inv2Res = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Sara Al-Otaibi',
          partner2Email: 'p2@example.com'
        })
      });
      assert.equal(inv2Res.status, 200);
      const inv2Data = (await inv2Res.json()) as any;
      const inv2Id = inv2Data.invitation.id;

      // Decline 2
      const dec2Res = await fetch(`${baseUrl}/api/invitations/${inv2Id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p2' },
        body: JSON.stringify({ block: false })
      });
      assert.equal(dec2Res.status, 200);
      const dec2Data = (await dec2Res.json()) as any;
      assert.equal(dec2Data.blocked, false);

      // Invite 3 (should still succeed, not 403)
      const inv3Res = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Sara Al-Otaibi',
          partner2Email: 'p2@example.com'
        })
      });
      assert.equal(inv3Res.status, 200, `Expected 200 on 3rd invitation attempt before 3rd decline, got ${inv3Res.status}`);
      const inv3Data = (await inv3Res.json()) as any;
      assert.ok(inv3Data.invitation?.id);
    });

    // 2. Third decline -> response blocked: true; P1 creating an invitation to P2's email -> 403 INVITATION_NOT_ALLOWED; same for P2's phone.
    await t.test("2. Third decline -> response blocked: true; P1 creating an invitation to P2's email -> 403 INVITATION_NOT_ALLOWED; same for P2's phone", async () => {
      resetState();

      // Perform 3 invite + decline cycles
      let latestInviteId = '';
      for (let i = 1; i <= 3; i++) {
        const invRes = await fetch(`${baseUrl}/api/invite/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
          body: JSON.stringify({
            partner2Name: 'Sara Al-Otaibi',
            partner2Email: 'p2@example.com'
          })
        });
        assert.equal(invRes.status, 200);
        const invData = (await invRes.json()) as any;
        latestInviteId = invData.invitation.id;

        const decRes = await fetch(`${baseUrl}/api/invitations/${latestInviteId}/decline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p2' },
          body: JSON.stringify({ block: false })
        });
        assert.equal(decRes.status, 200);
        const decData = (await decRes.json()) as any;
        if (i === 3) {
          assert.equal(decData.blocked, true, '3rd decline must return blocked: true');
        } else {
          assert.equal(decData.blocked, false);
        }
      }

      // Try creating invite with P2's email -> 403 INVITATION_NOT_ALLOWED
      const emailInviteRes = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Sara Al-Otaibi',
          partner2Email: 'p2@example.com'
        })
      });
      assert.equal(emailInviteRes.status, 403);
      const emailInviteData = (await emailInviteRes.json()) as any;
      assert.equal(emailInviteData.error, 'INVITATION_NOT_ALLOWED');

      // Try creating invite with P2's phone -> 403 INVITATION_NOT_ALLOWED
      const phoneInviteRes = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Sara Al-Otaibi',
          partner2Phone: '0500000002',
          partner2PhoneCountry: 'SA +966'
        })
      });
      assert.equal(phoneInviteRes.status, 403);
      const phoneInviteData = (await phoneInviteRes.json()) as any;
      assert.equal(phoneInviteData.error, 'INVITATION_NOT_ALLOWED');
    });

    // 3. First decline with body { block: true } -> blocked: true immediately.
    await t.test('3. First decline with body { block: true } -> blocked: true immediately', async () => {
      resetState();

      const invRes = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Noura Al-Dosari',
          partner2Email: 'p3@example.com'
        })
      });
      assert.equal(invRes.status, 200);
      const invData = (await invRes.json()) as any;
      const inviteId = invData.invitation.id;

      const decRes = await fetch(`${baseUrl}/api/invitations/${inviteId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p3' },
        body: JSON.stringify({ block: true })
      });
      assert.equal(decRes.status, 200);
      const decData = (await decRes.json()) as any;
      assert.equal(decData.blocked, true, 'Immediate block must return blocked: true');

      // Re-invitation should be rejected immediately
      const reInviteRes = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Noura Al-Dosari',
          partner2Email: 'p3@example.com'
        })
      });
      assert.equal(reInviteRes.status, 403);
      const reInviteData = (await reInviteRes.json()) as any;
      assert.equal(reInviteData.error, 'INVITATION_NOT_ALLOWED');
    });

    // 4. A block does not stop P1 inviting a DIFFERENT person.
    await t.test('4. A block does not stop P1 inviting a DIFFERENT person', async () => {
      resetState();

      // P3 blocks P1
      const inv3Res = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Noura Al-Dosari',
          partner2Email: 'p3@example.com'
        })
      });
      const inv3Data = (await inv3Res.json()) as any;
      await fetch(`${baseUrl}/api/invitations/${inv3Data.invitation.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p3' },
        body: JSON.stringify({ block: true })
      });

      // P1 invites P4 (different person) -> succeeds
      const inv4Res = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Reem Al-Ghamdi',
          partner2Email: 'p4@example.com',
          partner2Phone: '0500000004',
          partner2PhoneCountry: 'SA +966'
        })
      });
      assert.equal(inv4Res.status, 200, 'Inviting a different person must succeed');
      const inv4Data = (await inv4Res.json()) as any;
      assert.equal(inv4Data.success, true);
    });

    // 5. GET /api/blocks as P2 -> one item with p1DisplayName and NO contactHashes field; as P1 -> empty list.
    await t.test('5. GET /api/blocks as P2 -> one item with p1DisplayName and NO contactHashes field; as P1 -> empty list', async () => {
      resetState();

      // P2 blocks P1
      const invRes = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Sara Al-Otaibi',
          partner2Email: 'p2@example.com'
        })
      });
      const invData = (await invRes.json()) as any;
      await fetch(`${baseUrl}/api/invitations/${invData.invitation.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p2' },
        body: JSON.stringify({ block: true })
      });

      // P2 calls GET /api/blocks
      const p2BlocksRes = await fetch(`${baseUrl}/api/blocks`, {
        method: 'GET',
        headers: { Authorization: 'Bearer token_p2' }
      });
      assert.equal(p2BlocksRes.status, 200);
      const p2BlocksData = (await p2BlocksRes.json()) as any;
      assert.equal(Array.isArray(p2BlocksData.blocks), true);
      assert.equal(p2BlocksData.blocks.length, 1);
      const blockItem = p2BlocksData.blocks[0];
      assert.equal(blockItem.p1Uid, 'uid_p1');
      assert.ok(typeof blockItem.p1DisplayName === 'string' && blockItem.p1DisplayName.length > 0);
      assert.equal(blockItem.contactHashes, undefined, 'contactHashes must NOT be leaked to client');

      // P1 calls GET /api/blocks
      const p1BlocksRes = await fetch(`${baseUrl}/api/blocks`, {
        method: 'GET',
        headers: { Authorization: 'Bearer token_p1' }
      });
      assert.equal(p1BlocksRes.status, 200);
      const p1BlocksData = (await p1BlocksRes.json()) as any;
      assert.equal(Array.isArray(p1BlocksData.blocks), true);
      assert.equal(p1BlocksData.blocks.length, 0, 'P1 must have no blocks where they are P2');
    });

    // 6. P1 calling DELETE /api/blocks/<any id> -> 404, and P2's block still exists.
    await t.test("6. P1 calling DELETE /api/blocks/<any id> -> 404, and P2's block still exists", async () => {
      resetState();

      // P2 blocks P1
      const invRes = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Sara Al-Otaibi',
          partner2Email: 'p2@example.com'
        })
      });
      const invData = (await invRes.json()) as any;
      await fetch(`${baseUrl}/api/invitations/${invData.invitation.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p2' },
        body: JSON.stringify({ block: true })
      });

      // P1 tries to delete the block (targeting uid_p2 or uid_p1)
      const delByP1 = await fetch(`${baseUrl}/api/blocks/uid_p1`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer token_p1' }
      });
      assert.equal(delByP1.status, 404);
      const delByP1Data = (await delByP1.json()) as any;
      assert.equal(delByP1Data.error, 'BLOCK_NOT_FOUND');

      const delByP1TargetP2 = await fetch(`${baseUrl}/api/blocks/uid_p2`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer token_p1' }
      });
      assert.equal(delByP1TargetP2.status, 404);

      // Verify P2's block is intact
      const p2BlocksRes = await fetch(`${baseUrl}/api/blocks`, {
        headers: { Authorization: 'Bearer token_p2' }
      });
      const p2BlocksData = (await p2BlocksRes.json()) as any;
      assert.equal(p2BlocksData.blocks.length, 1);
    });

    // 7. P2 DELETE /api/blocks/:p1Uid -> removed; P1 can invite P2 again; the next decline has declineCount 1.
    await t.test('7. P2 DELETE /api/blocks/:p1Uid -> removed; P1 can invite P2 again; the next decline has declineCount 1', async () => {
      resetState();

      // P2 blocks P1
      const invRes = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Sara Al-Otaibi',
          partner2Email: 'p2@example.com'
        })
      });
      const invData = (await invRes.json()) as any;
      await fetch(`${baseUrl}/api/invitations/${invData.invitation.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p2' },
        body: JSON.stringify({ block: true })
      });

      // P2 unblocks P1
      const unblockRes = await fetch(`${baseUrl}/api/blocks/uid_p1`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer token_p2' }
      });
      assert.equal(unblockRes.status, 200);
      const unblockData = (await unblockRes.json()) as any;
      assert.equal(unblockData.success, true);

      // P1 can invite P2 again
      const newInvRes = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Sara Al-Otaibi',
          partner2Email: 'p2@example.com'
        })
      });
      assert.equal(newInvRes.status, 200);
      const newInvData = (await newInvRes.json()) as any;
      const newInviteId = newInvData.invitation.id;

      // P2 declines again (not blocking)
      const nextDecRes = await fetch(`${baseUrl}/api/invitations/${newInviteId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p2' },
        body: JSON.stringify({ block: false })
      });
      assert.equal(nextDecRes.status, 200);
      const nextDecData = (await nextDecRes.json()) as any;
      assert.equal(nextDecData.blocked, false);

      // Check Firestore document for declineCount == 1
      const blockDoc = mockDb.getDoc('invitation_blocks', 'uid_p2_uid_p1');
      assert.ok(blockDoc);
      assert.equal(blockDoc.declineCount, 1);
      assert.equal(blockDoc.blocked, false);
    });

    // 8. P2 deletes account -> invitation_blocks where p2Uid == P2 are gone. P1 deletes account -> invitation_blocks where p1Uid == P1 are gone.
    await t.test('8. P2 deletes account -> invitation_blocks where p2Uid == P2 are gone. P1 deletes account -> invitation_blocks where p1Uid == P1 are gone', async () => {
      resetState();

      // P2 blocks P1
      const inv1Res = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Sara Al-Otaibi',
          partner2Email: 'p2@example.com'
        })
      });
      const inv1Data = (await inv1Res.json()) as any;
      await fetch(`${baseUrl}/api/invitations/${inv1Data.invitation.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p2' },
        body: JSON.stringify({ block: true })
      });

      // P3 blocks P1
      const inv2Res = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Noura Al-Dosari',
          partner2Email: 'p3@example.com'
        })
      });
      const inv2Data = (await inv2Res.json()) as any;
      await fetch(`${baseUrl}/api/invitations/${inv2Data.invitation.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p3' },
        body: JSON.stringify({ block: true })
      });

      assert.ok(mockDb.getDoc('invitation_blocks', 'uid_p2_uid_p1'));
      assert.ok(mockDb.getDoc('invitation_blocks', 'uid_p3_uid_p1'));

      // P2 deletes account
      const p2DelRes = await fetch(`${baseUrl}/api/account/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p2' }
      });
      assert.equal(p2DelRes.status, 200);

      // Verify blocks where p2Uid == P2 are deleted, but P3 block on P1 still exists
      assert.equal(mockDb.getDoc('invitation_blocks', 'uid_p2_uid_p1'), undefined);
      assert.ok(mockDb.getDoc('invitation_blocks', 'uid_p3_uid_p1'));

      // P1 deletes account
      const p1DelRes = await fetch(`${baseUrl}/api/account/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' }
      });
      assert.equal(p1DelRes.status, 200);

      // Verify blocks where p1Uid == P1 are now completely deleted
      assert.equal(mockDb.getDoc('invitation_blocks', 'uid_p3_uid_p1'), undefined);
    });

    // 9. INVITATION_NOT_ALLOWED messages (en + ar) contain no "block" and no "حظر".
    await t.test('9. INVITATION_NOT_ALLOWED messages (en + ar) contain no "block" and no "حظر"', async () => {
      resetState();

      // P2 blocks P1
      const invRes = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Sara Al-Otaibi',
          partner2Email: 'p2@example.com'
        })
      });
      const invData = (await invRes.json()) as any;
      await fetch(`${baseUrl}/api/invitations/${invData.invitation.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p2' },
        body: JSON.stringify({ block: true })
      });

      // P1 tries to create invitation
      const blockedInvRes = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Sara Al-Otaibi',
          partner2Email: 'p2@example.com'
        })
      });
      assert.equal(blockedInvRes.status, 403);
      const data = (await blockedInvRes.json()) as any;
      assert.equal(data.error, 'INVITATION_NOT_ALLOWED');

      const msgEn = (data.messageEn || data.errorEn || '').toLowerCase();
      const msgAr = data.messageAr || data.errorAr || '';

      assert.ok(msgEn.length > 0, 'English message must be present');
      assert.ok(msgAr.length > 0, 'Arabic message must be present');
      assert.equal(msgEn.includes('block'), false, 'English message must not reveal blocking');
      assert.equal(msgAr.includes('حظر'), false, 'Arabic message must not reveal blocking');
    });

    // 10. No stored contactHashes entry equals hashContact('').
    await t.test("10. No stored contactHashes entry equals hashContact('')", async () => {
      resetState();

      const emptyHash = hashContact('');

      // Create invitation with only email (no phone or whatsapp)
      const invRes = await fetch(`${baseUrl}/api/invite/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p1' },
        body: JSON.stringify({
          partner2Name: 'Sara Al-Otaibi',
          partner2Email: 'p2@example.com'
        })
      });
      const invData = (await invRes.json()) as any;
      await fetch(`${baseUrl}/api/invitations/${invData.invitation.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_p2' },
        body: JSON.stringify({ block: true })
      });

      const blocksMap = mockDb.store.get('invitation_blocks');
      assert.ok(blocksMap && blocksMap.size > 0);

      for (const [docId, docData] of blocksMap.entries()) {
        const hashes: string[] = docData.contactHashes || [];
        assert.ok(hashes.length > 0, `Document ${docId} should have contactHashes`);
        for (const h of hashes) {
          assert.notEqual(h, emptyHash, `contactHashes entry in ${docId} must not equal empty string hash`);
          assert.notEqual(h, '', `contactHashes entry in ${docId} must not be empty string`);
          assert.equal(h.length, 64, `Hash in ${docId} must be a valid 64-character sha256 hex string`);
        }
      }
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
