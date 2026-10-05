process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, __setTestDeps } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

const SAUDI_P1_PHONE = '+966500000001';
const SAUDI_P2_PHONE = '+966500000002';
const STRANGER_PHONE = '+966500000099';

function seedActiveState(mockDb: any) {
  mockDb.reset();

  const p1 = {
    fullName: 'رامي خليل',
    fullNameEn: 'Rami Khalil',
    birthDay: '10',
    birthMonth: '05',
    birthYear: '1995',
    email: 'rami@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '0500000001',
    phoneE164: SAUDI_P1_PHONE,
    phoneVerified: true,
    whatsappCountry: 'SA +966',
    whatsappNumber: '0500000001',
    whatsappE164: SAUDI_P1_PHONE,
    socialHandle: 'rami_k'
  };

  const p2 = {
    fullName: 'سارة أحمد',
    fullNameEn: 'Sara Ahmed',
    birthDay: '14',
    birthMonth: '08',
    birthYear: '1997',
    email: 'sara@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '0500000002',
    phoneE164: SAUDI_P2_PHONE,
    phoneVerified: true,
    whatsappCountry: 'SA +966',
    whatsappNumber: '0500000002',
    whatsappE164: SAUDI_P2_PHONE,
    socialHandle: 'sara_a'
  };

  mockDb.seed('users', 'uid_p1_rami', {
    uid: 'uid_p1_rami',
    email: 'rami@example.com',
    phoneE164: SAUDI_P1_PHONE,
    relationshipId: 'rec_1001',
    activeRecordId: 'rec_1001',
    profile: p1
  });

  mockDb.seed('users', 'uid_p2_sara', {
    uid: 'uid_p2_sara',
    email: 'sara@example.com',
    phoneE164: SAUDI_P2_PHONE,
    relationshipId: 'rec_1001',
    activeRecordId: 'rec_1001',
    profile: p2
  });

  mockDb.seed('users', 'uid_stranger', {
    uid: 'uid_stranger',
    email: 'stranger@example.com',
    phoneE164: STRANGER_PHONE,
    profile: {
      fullName: 'Stranger User',
      email: 'stranger@example.com'
    }
  });

  mockDb.seed('relationships', 'rec_1001', {
    id: 'rec_1001',
    recordNumber: '556677',
    verificationRef: 'RID-2026-556677-ABC',
    type: 'dating',
    startDate: '2026-01-15',
    startDateAr: '١٥ يناير ٢٠٢٦',
    status: 'active',
    p1Uid: 'uid_p1_rami',
    p2Uid: 'uid_p2_sara',
    partner1: p1,
    partner2: p2,
    settings: {
      showAnniversary: true,
      publicContactSearchP1: false,
      publicContactSearchP2: false
    },
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z'
  });

  mockDb.seed('certificates', 'RID-2026-556677-ABC', {
    verificationRef: 'RID-2026-556677-ABC',
    recordNumber: '556677',
    partner1Name: 'رامي خليل',
    partner2Name: 'سارة أحمد',
    partner1En: 'Rami Khalil',
    partner2En: 'Sara Ahmed',
    type: 'dating',
    startDate: '2026-01-15',
    startDateAr: '١٥ يناير ٢٠٢٦',
    issuedDate: '2026-01-15',
    issuedDateAr: '١٥ يناير ٢٠٢٦',
    status: 'active',
    relationshipId: 'rec_1001'
  });
}

test('Change requests & profile mutation route test suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  mockAuth.addUser('token_p1', {
    uid: 'uid_p1_rami',
    email: 'rami@example.com',
    email_verified: true,
    phone_number: SAUDI_P1_PHONE
  });

  mockAuth.addUser('token_p2', {
    uid: 'uid_p2_sara',
    email: 'sara@example.com',
    email_verified: true,
    phone_number: SAUDI_P2_PHONE
  });

  mockAuth.addUser('token_stranger', {
    uid: 'uid_stranger',
    email: 'stranger@example.com',
    email_verified: true,
    phone_number: STRANGER_PHONE
  });

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. PATCH /api/profile/me - P1 updates personal info & clears optional fields
    await t.test('1. P1 updates personal info via PATCH /api/profile/me; clearing whatsapp/fullNameEn succeeds', async () => {
      seedActiveState(mockDb);

      const res = await fetch(`${baseUrl}/api/profile/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({
          socialHandle: 'rami_updated',
          fullNameEn: '',
          whatsappNumber: '',
          whatsappCountry: 'SA +966'
        })
      });

      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);
      assert.equal(data.record.partner1.socialHandle, 'rami_updated');
      assert.equal(data.record.partner1.fullNameEn, undefined);
      assert.equal(data.record.partner1.whatsappNumber, '');

      // Check database persistence in relationship & certificate
      const rel = mockDb.getDoc('relationships', 'rec_1001');
      assert.equal(rel?.partner1.socialHandle, 'rami_updated');

      const cert = mockDb.getDoc('certificates', 'RID-2026-556677-ABC');
      assert.equal(cert?.partner1En, null);
    });

    // 2. PATCH /api/profile/me - P2 updates personal info
    await t.test('2. P2 updates personal info via PATCH /api/profile/me', async () => {
      seedActiveState(mockDb);

      const res = await fetch(`${baseUrl}/api/profile/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        },
        body: JSON.stringify({
          socialHandle: 'sara_updated',
          fullNameEn: 'Sara A. Ahmed'
        })
      });

      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);
      assert.equal(data.record.partner2.socialHandle, 'sara_updated');
      assert.equal(data.record.partner2.fullNameEn, 'Sara A. Ahmed');

      const cert = mockDb.getDoc('certificates', 'RID-2026-556677-ABC');
      assert.equal(cert?.partner2En, 'Sara A. Ahmed');
    });

    // 3. PATCH /api/profile/me - Unauthenticated rejected
    await t.test('3. PATCH /api/profile/me unauthenticated is rejected', async () => {
      seedActiveState(mockDb);

      const res = await fetch(`${baseUrl}/api/profile/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ socialHandle: 'unauth' })
      });

      assert.equal(res.status, 401);
    });

    // 4. POST /api/change-requests - P1 creates request for type change, assigning P2 as approver
    await t.test('4. P1 creates change request for type -> creates pending request with P2 as approver', async () => {
      seedActiveState(mockDb);

      const res = await fetch(`${baseUrl}/api/change-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({
          field: 'type',
          proposedValue: 'marriage'
        })
      });

      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);
      assert.equal(data.changeRequest.field, 'type');
      assert.equal(data.changeRequest.proposedValue, 'marriage');
      assert.equal(data.changeRequest.status, 'pending');
      assert.equal(data.changeRequest.requesterUid, 'uid_p1_rami');
      assert.equal(data.changeRequest.approverUid, 'uid_p2_sara');
    });

    // 5. POST /api/change-requests - Requester cannot submit name change for partner
    await t.test('5. P1 cannot submit change request for partner2 name', async () => {
      seedActiveState(mockDb);

      const res = await fetch(`${baseUrl}/api/change-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({
          field: 'partner2FullName',
          proposedValue: 'اسم جديد للشريك'
        })
      });

      assert.ok(res.status === 400 || res.status === 403);
    });

    // 6. POST /api/change-requests - Duplicate pending request for the same field is rejected
    await t.test('6. Duplicate pending change request for the same field is rejected', async () => {
      seedActiveState(mockDb);

      // Create first pending request
      const res1 = await fetch(`${baseUrl}/api/change-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({
          field: 'type',
          proposedValue: 'marriage'
        })
      });
      assert.equal(res1.status, 200);

      // Attempt second pending request for same field
      const res2 = await fetch(`${baseUrl}/api/change-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({
          field: 'type',
          proposedValue: 'engagement'
        })
      });

      assert.ok(res2.status === 400 || res2.status === 409);
    });

    // 7. POST /api/change-requests/:requestId/approve - Requester cannot approve their own request
    await t.test('7. Requester cannot approve their own change request (403)', async () => {
      seedActiveState(mockDb);

      const createRes = await fetch(`${baseUrl}/api/change-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({
          field: 'type',
          proposedValue: 'marriage'
        })
      });
      const createData = (await createRes.json()) as any;
      const crId = createData.changeRequest.id;

      // P1 tries to approve own request
      const approveRes = await fetch(`${baseUrl}/api/change-requests/${crId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        }
      });

      assert.equal(approveRes.status, 403);
    });

    // 8. POST /api/change-requests/:requestId/approve - Unrelated user cannot approve
    await t.test('8. Unrelated user cannot approve change request (403)', async () => {
      seedActiveState(mockDb);

      const createRes = await fetch(`${baseUrl}/api/change-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({
          field: 'type',
          proposedValue: 'marriage'
        })
      });
      const createData = (await createRes.json()) as any;
      const crId = createData.changeRequest.id;

      const approveRes = await fetch(`${baseUrl}/api/change-requests/${crId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_stranger'
        }
      });

      assert.equal(approveRes.status, 403);
    });

    // 9. POST /api/change-requests/:requestId/approve - Other partner approves -> record and certificate updated
    await t.test('9. Other partner approves -> record and certificate updated atomically', async () => {
      seedActiveState(mockDb);

      const createRes = await fetch(`${baseUrl}/api/change-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({
          field: 'type',
          proposedValue: 'marriage'
        })
      });
      const createData = (await createRes.json()) as any;
      const crId = createData.changeRequest.id;

      // P2 approves
      const approveRes = await fetch(`${baseUrl}/api/change-requests/${crId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        }
      });

      assert.equal(approveRes.status, 200, `Expected 200, got ${approveRes.status}`);
      const approveData = (await approveRes.json()) as any;
      assert.equal(approveData.success, true);
      assert.equal(approveData.record.type, 'marriage');
      assert.equal(approveData.changeRequest.status, 'approved');

      // Check DB persistence
      const rel = mockDb.getDoc('relationships', 'rec_1001');
      assert.equal(rel?.type, 'marriage');

      const cert = mockDb.getDoc('certificates', 'RID-2026-556677-ABC');
      assert.equal(cert?.type, 'marriage');
    });

    // 10. POST /api/change-requests/:requestId/approve - Replayed approval rejected
    await t.test('10. Replayed approval of already approved request is rejected', async () => {
      seedActiveState(mockDb);

      const createRes = await fetch(`${baseUrl}/api/change-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({
          field: 'type',
          proposedValue: 'marriage'
        })
      });
      const createData = (await createRes.json()) as any;
      const crId = createData.changeRequest.id;

      // First approve succeeds
      const approveRes1 = await fetch(`${baseUrl}/api/change-requests/${crId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        }
      });
      assert.equal(approveRes1.status, 200);

      // Replayed approve is rejected
      const approveRes2 = await fetch(`${baseUrl}/api/change-requests/${crId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        }
      });
      assert.ok(approveRes2.status === 400 || approveRes2.status === 409);
    });

    // 11. POST /api/change-requests/:requestId/decline - Other partner declines -> unchanged
    await t.test('11. Decline leaves certificate and relationship unchanged', async () => {
      seedActiveState(mockDb);

      const createRes = await fetch(`${baseUrl}/api/change-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({
          field: 'type',
          proposedValue: 'marriage'
        })
      });
      const createData = (await createRes.json()) as any;
      const crId = createData.changeRequest.id;

      // P2 declines
      const declineRes = await fetch(`${baseUrl}/api/change-requests/${crId}/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        }
      });

      assert.equal(declineRes.status, 200);
      const declineData = (await declineRes.json()) as any;
      assert.equal(declineData.success, true);
      assert.equal(declineData.changeRequest.status, 'declined');

      // Check DB remains dating
      const rel = mockDb.getDoc('relationships', 'rec_1001');
      assert.equal(rel?.type, 'dating');

      const cert = mockDb.getDoc('certificates', 'RID-2026-556677-ABC');
      assert.equal(cert?.type, 'dating');
    });

    // 12. PATCH /api/record/settings - P1 updates publicContactSearchP1, P2 updates publicContactSearchP2
    await t.test('12. PATCH /api/record/settings: P1 changes only publicContactSearchP1, P2 only publicContactSearchP2', async () => {
      seedActiveState(mockDb);

      // P1 toggles publicContactSearchP1 to true
      const resP1 = await fetch(`${baseUrl}/api/record/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p1'
        },
        body: JSON.stringify({
          publicContactSearchP1: true,
          publicContactSearchP2: true // P1 attempts to toggle P2 setting
        })
      });

      assert.equal(resP1.status, 200);
      let rel = mockDb.getDoc('relationships', 'rec_1001');
      assert.equal(rel?.settings?.publicContactSearchP1, true);
      assert.equal(rel?.settings?.publicContactSearchP2, false, 'P1 must not be able to set publicContactSearchP2');

      // P2 toggles publicContactSearchP2 to true
      const resP2 = await fetch(`${baseUrl}/api/record/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_p2'
        },
        body: JSON.stringify({
          publicContactSearchP2: true
        })
      });

      assert.equal(resP2.status, 200);
      rel = mockDb.getDoc('relationships', 'rec_1001');
      assert.equal(rel?.settings?.publicContactSearchP1, true);
      assert.equal(rel?.settings?.publicContactSearchP2, true);
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
