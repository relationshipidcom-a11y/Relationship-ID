process.env.NODE_ENV = 'test';
if (!process.env.CONTACT_HASH_SECRET || process.env.CONTACT_HASH_SECRET.length < 32) {
  process.env.CONTACT_HASH_SECRET = 'test_contact_hash_secret_at_least_32_characters_long_for_hmac';
}

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, __setTestDeps, CURRENT_LEGAL_VERSION } from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';
import {
  executePrivateRecordLoad,
  evaluateP2Authorization,
  shouldRenderP2RegistrationScreen
} from '../src/utils/relationshipState';
import { getLocalizedErrorMessage } from '../src/utils/api';
import type { ScreenId, RelationshipRecord, Invitation } from '../src/types';

interface RecordApiResponse {
  record: RelationshipRecord | null;
  invitation: Invitation | null;
  userProfile?: any;
}

const emptyPartner = () => ({
  fullName: '',
  birthDay: '',
  birthMonth: '',
  birthYear: '',
  email: '',
  phoneCountry: 'SA +966',
  phoneNumber: '',
  whatsappCountry: 'SA +966',
  whatsappNumber: ''
});

const initialTestRecord: RelationshipRecord = {
  id: '',
  recordNumber: '',
  verificationRef: '',
  type: 'dating',
  startDate: '',
  startDateAr: '',
  startDateIso: '',
  status: 'draft',
  activeSinceDays: 0,
  partner1: emptyPartner(),
  partner2: emptyPartner(),
  issuedDate: '',
  issuedDateAr: '',
  createdAt: new Date().toISOString(),
  settings: {
    showSocialHandles: true,
    showContactDetails: false,
    showQrMatrix: true
  }
};

const initialTestInvitation: Invitation = {
  id: '',
  recordId: '',
  inviterName: '',
  partner2Name: '',
  relationshipType: 'dating',
  startDate: '',
  startDateAr: '',
  startDateIso: '',
  status: 'pending',
  createdAt: '',
  expiresAt: '',
  reminderCount: 0
};

test('P1 Returning with Existing Invitation & Record Retry Regression Suite', async (t) => {
  // Test Harness implementing production executePrivateRecordLoad
  class PrivateRecordTestHarness {
    privateRecordRequestId = 0;
    activeAuthUid: string | null = null;
    currentUserUid: string | null = null;
    record: RelationshipRecord = { ...initialTestRecord };
    invitation: Invitation = { ...initialTestInvitation };
    appError = '';
    navigatedScreen: ScreenId | null = null;
    navigatedPath: string | null = null;

    load(fetchFn: () => Promise<RecordApiResponse>, routeAfterLoad = true) {
      const requestId = ++this.privateRecordRequestId;
      const requestUid = this.currentUserUid;

      return executePrivateRecordLoad<RecordApiResponse>({
        requestUid,
        requestId,
        getCurrentRequestId: () => this.privateRecordRequestId,
        getActiveAuthUid: () => this.activeAuthUid,
        getCurrentAuthUid: () => this.currentUserUid,
        fetchRecord: fetchFn,
        setRecord: (rec) => { this.record = rec; },
        setInvitation: (inv) => { this.invitation = inv; },
        setAppError: (err) => { this.appError = err; },
        formatErrorMessage: (err) => getLocalizedErrorMessage(err, 'ar'),
        routeAfterLoad,
        onNavigate: (screen, path) => {
          this.navigatedScreen = screen;
          this.navigatedPath = path || null;
        },
        initialRecord: initialTestRecord,
        initialInvitation: initialTestInvitation
      });
    }

    signOut() {
      this.activeAuthUid = null;
      this.currentUserUid = null;
      this.privateRecordRequestId += 1;
      this.record = { ...initialTestRecord };
      this.invitation = { ...initialTestInvitation };
      this.appError = '';
      this.navigatedScreen = null;
      this.navigatedPath = null;
    }

    switchAccount(newUid: string) {
      this.activeAuthUid = newUid;
      this.currentUserUid = newUid;
      this.privateRecordRequestId += 1;
      this.record = { ...initialTestRecord };
      this.invitation = { ...initialTestInvitation };
      this.appError = '';
      this.navigatedScreen = null;
      this.navigatedPath = null;
    }
  }

  // 1. Returning P1 with an existing invitation loads record, invitation, and navigates to p1_waiting
  await t.test('1. Returning P1 with existing invitation navigates to p1_waiting and clears error', async () => {
    const harness = new PrivateRecordTestHarness();
    harness.activeAuthUid = 'p1_user_uid';
    harness.currentUserUid = 'p1_user_uid';

    const existingRecord: RelationshipRecord = {
      ...initialTestRecord,
      id: 'rec_pending_123',
      p1Uid: 'p1_user_uid',
      status: 'pending_partner',
      partner1: {
        ...emptyPartner(),
        fullName: 'Zaid Al-Harbi',
        email: 'zaid@example.com'
      },
      inviteId: 'inv_abc_789'
    };

    const existingInvitation: Invitation = {
      ...initialTestInvitation,
      id: 'inv_abc_789',
      recordId: 'rec_pending_123',
      inviterName: 'Zaid Al-Harbi',
      partner2Name: 'Sara Al-Otaibi',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    };

    const result = await harness.load(async () => ({
      record: existingRecord,
      invitation: existingInvitation
    }));

    assert.ok(result);
    assert.equal(harness.record.id, 'rec_pending_123');
    assert.equal(harness.record.status, 'pending_partner');
    assert.equal(harness.invitation.id, 'inv_abc_789');
    assert.equal(harness.invitation.partner2Name, 'Sara Al-Otaibi');
    assert.equal(harness.appError, '', 'App error must be cleared on successful load');
    assert.equal(harness.navigatedScreen, 'p1_waiting');
    assert.equal(harness.navigatedPath, '/waiting');
  });

  // 2. Failed request sets localized database error, does NOT pretend success, and preserves existing invitation
  await t.test('2. Database failure sets Arabic error and preserves existing invitation without pretending success', async () => {
    const harness = new PrivateRecordTestHarness();
    harness.activeAuthUid = 'p1_user_uid';
    harness.currentUserUid = 'p1_user_uid';

    // Pre-populate with existing invitation (e.g. from prior state or memory)
    harness.record = {
      ...initialTestRecord,
      id: 'rec_existing_123',
      status: 'pending_partner'
    };
    harness.invitation = {
      ...initialTestInvitation,
      id: 'inv_existing_456',
      inviterName: 'Zaid Al-Harbi'
    };

    // Subsequent request fails with DATABASE_ERROR
    const result = await harness.load(async () => {
      throw new Error('DATABASE_ERROR');
    });

    assert.equal(result, null, 'Failed request must return null and never fabricate success');
    assert.equal(harness.appError, 'حدث خطأ في قاعدة البيانات. يرجى المحاولة لاحقاً.');
    // Crucial: Old state must remain displayed so the existing invitation is still visible
    assert.equal(harness.record.id, 'rec_existing_123');
    assert.equal(harness.invitation.id, 'inv_existing_456');
    assert.equal(harness.invitation.inviterName, 'Zaid Al-Harbi');
  });

  // 3. Successful retry following a failed request clears the error and updates state
  await t.test('3. Successful retry clears the database error and updates state to fresh invitation', async () => {
    const harness = new PrivateRecordTestHarness();
    harness.activeAuthUid = 'p1_user_uid';
    harness.currentUserUid = 'p1_user_uid';

    // 1st attempt: fails
    const failResult = await harness.load(async () => {
      throw new Error('DATABASE_ERROR');
    });
    assert.equal(failResult, null);
    assert.equal(harness.appError, 'حدث خطأ في قاعدة البيانات. يرجى المحاولة لاحقاً.');

    // 2nd attempt (retry): succeeds
    const refreshedRecord: RelationshipRecord = {
      ...initialTestRecord,
      id: 'rec_retry_success',
      status: 'pending_partner',
      partner1: { ...emptyPartner(), fullName: 'Zaid Al-Harbi' }
    };
    const refreshedInvitation: Invitation = {
      ...initialTestInvitation,
      id: 'inv_retry_success',
      inviterName: 'Zaid Al-Harbi',
      partner2Name: 'Sara Al-Otaibi'
    };

    const retryResult = await harness.load(async () => ({
      record: refreshedRecord,
      invitation: refreshedInvitation
    }));

    assert.ok(retryResult);
    assert.equal(harness.appError, '', 'Successful retry MUST clear the error');
    assert.equal(harness.record.id, 'rec_retry_success');
    assert.equal(harness.invitation.id, 'inv_retry_success');
    assert.equal(harness.navigatedScreen, 'p1_waiting');
    assert.equal(harness.navigatedPath, '/waiting');
  });

  // 4. Concurrency: older request completing after newer request starts does not overwrite newer state
  await t.test('4. Older request completing after newer request starts does not clobber state', async () => {
    const harness = new PrivateRecordTestHarness();
    harness.activeAuthUid = 'p1_user_uid';
    harness.currentUserUid = 'p1_user_uid';

    let resolveA!: (val: RecordApiResponse) => void;
    const promiseA = new Promise<RecordApiResponse>((res) => { resolveA = res; });

    let resolveB!: (val: RecordApiResponse) => void;
    const promiseB = new Promise<RecordApiResponse>((res) => { resolveB = res; });

    const callA = harness.load(() => promiseA);
    const callB = harness.load(() => promiseB);

    // Request B completes first with new record
    resolveB({
      record: { ...initialTestRecord, id: 'rec_newer_B', status: 'pending_partner' },
      invitation: { ...initialTestInvitation, id: 'inv_newer_B' }
    });
    const resultB = await callB;
    assert.ok(resultB);
    assert.equal(harness.record.id, 'rec_newer_B');
    assert.equal(harness.invitation.id, 'inv_newer_B');

    // Older request A completes later with older record
    resolveA({
      record: { ...initialTestRecord, id: 'rec_older_A', status: 'pending_partner' },
      invitation: { ...initialTestInvitation, id: 'inv_older_A' }
    });
    const resultA = await callA;
    assert.equal(resultA, null, 'Superseded request A must return null');
    assert.equal(harness.record.id, 'rec_newer_B', 'Request A must not overwrite record from request B');
    assert.equal(harness.invitation.id, 'inv_newer_B', 'Request A must not overwrite invitation from request B');
  });

  // 5. Older failed request finishing after newer request starts does not set error
  await t.test('5. Older failed request finishing after newer request starts does not set appError', async () => {
    const harness = new PrivateRecordTestHarness();
    harness.activeAuthUid = 'p1_user_uid';
    harness.currentUserUid = 'p1_user_uid';

    let rejectA!: (err: Error) => void;
    const promiseA = new Promise<RecordApiResponse>((_, rej) => { rejectA = rej; });

    let resolveB!: (val: RecordApiResponse) => void;
    const promiseB = new Promise<RecordApiResponse>((res) => { resolveB = res; });

    const callA = harness.load(() => promiseA);
    const callB = harness.load(() => promiseB);

    rejectA(new Error('DATABASE_ERROR'));
    const resultA = await callA;
    assert.equal(resultA, null);
    assert.equal(harness.appError, '', 'Superseded failed request must not set appError');

    resolveB({
      record: { ...initialTestRecord, id: 'rec_ok', status: 'pending_partner' },
      invitation: { ...initialTestInvitation, id: 'inv_ok' }
    });
    const resultB = await callB;
    assert.ok(resultB);
    assert.equal(harness.appError, '');
    assert.equal(harness.record.id, 'rec_ok');
  });

  // 6. Sign out in-flight isolates state and prevents leaking
  await t.test('6. Sign out in flight drops in-flight response and prevents state update', async () => {
    const harness = new PrivateRecordTestHarness();
    harness.activeAuthUid = 'p1_user_uid';
    harness.currentUserUid = 'p1_user_uid';

    let resolveInFlight!: (val: RecordApiResponse) => void;
    const promiseInFlight = new Promise<RecordApiResponse>((res) => { resolveInFlight = res; });

    const callInFlight = harness.load(() => promiseInFlight);

    // User signs out
    harness.signOut();
    assert.equal(harness.record.id, '');
    assert.equal(harness.invitation.id, '');

    // In-flight response arrives
    resolveInFlight({
      record: { ...initialTestRecord, id: 'rec_leaked', status: 'pending_partner' },
      invitation: { ...initialTestInvitation, id: 'inv_leaked' }
    });

    const result = await callInFlight;
    assert.equal(result, null);
    assert.equal(harness.record.id, '', 'Signed out user must not receive record');
    assert.equal(harness.invitation.id, '', 'Signed out user must not receive invitation');
  });

  // 7. Fail-closed P2 authorization gate remains strictly enforced for returning P1
  await t.test('7. Fail-closed P2 gate rejects P1 attempting to view details of own invitation', () => {
    const p1Record: RelationshipRecord = {
      ...initialTestRecord,
      id: 'rec_100',
      p1Uid: 'user_p1',
      status: 'pending_partner'
    };
    const p1Invitation: Invitation = {
      ...initialTestInvitation,
      id: 'inv_100',
      p1Uid: 'user_p1',
      status: 'pending'
    };

    const decision = evaluateP2Authorization({
      authInitialized: true,
      currentUserId: 'user_p1',
      targetInviteId: 'inv_100',
      invitationAuth: {
        authenticated: true,
        isP1: true,
        authorized: false,
        reason: 'CANNOT_ACCEPT_OWN_INVITATION',
        inviteId: 'inv_100',
        authorizedUid: 'user_p1'
      },
      invitation: p1Invitation,
      record: p1Record,
      invitationLoading: false
    });

    assert.equal(decision.state, 'p1_rejected');
    assert.equal(shouldRenderP2RegistrationScreen(decision), false, 'P1 must never access P2 registration screen');
  });
});

test('Server GET /api/record route tests for returning P1 and error cases', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  let server: Server;
  let baseUrl: string;

  t.before(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await t.test('Server returns record and invitation for returning P1', async () => {
    const p1Uid = 'user_server_p1';
    const recId = 'rec_server_123';
    const invId = 'inv_server_456';
    mockAuth.addUser(`mock_token_for_${p1Uid}`, { uid: p1Uid, email: 'p1@example.com' });

    await mockDb.collection('users').doc(p1Uid).set({
      activeRecordId: recId,
      profile: { fullName: 'Fahad Al-Dossari' }
    });

    await mockDb.collection('relationships').doc(recId).set({
      id: recId,
      p1Uid,
      status: 'pending_partner',
      type: 'dating',
      startDate: '1 January 2026',
      startDateAr: '1 يناير 2026',
      startDateIso: '2026-01-01',
      partner1: { fullName: 'Fahad Al-Dossari' },
      partner2: emptyPartner(),
      inviteId: invId
    });

    await mockDb.collection('invitations').doc(invId).set({
      id: invId,
      recordId: recId,
      p1Uid,
      inviterName: 'Fahad Al-Dossari',
      partner2Name: 'Maha Al-Harbi',
      status: 'pending'
    });

    const res = await fetch(`${baseUrl}/api/record`, {
      headers: {
        Authorization: `Bearer mock_token_for_${p1Uid}`,
        'X-Firebase-AppCheck': 'test_mock_app_check_token'
      }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.record?.id, recId);
    assert.equal(data.record?.status, 'pending_partner');
    assert.equal(data.invitation?.id, invId);
    assert.equal(data.invitation?.partner2Name, 'Maha Al-Harbi');
  });

  await t.test('Server returns localized DATABASE_ERROR when database throws', async () => {
    const errUid = 'user_db_error_uid';
    mockAuth.addUser(`mock_token_for_${errUid}`, { uid: errUid, email: 'err@example.com' });

    const originalCollection = mockDb.collection.bind(mockDb);
    mockDb.collection = (name: string) => {
      if (name === 'users') {
        return {
          doc: () => ({
            get: async () => {
              throw new Error('SIMULATED_FIRESTORE_FAILURE');
            }
          })
        } as any;
      }
      return originalCollection(name);
    };

    try {
      const res = await fetch(`${baseUrl}/api/record`, {
        headers: {
          Authorization: `Bearer mock_token_for_${errUid}`,
          'X-Firebase-AppCheck': 'test_mock_app_check_token'
        }
      });

      assert.equal(res.status, 500);
      const data = await res.json();
      assert.equal(data.error, 'DATABASE_ERROR');
      // Ensure no stack trace or internal message leaks
      assert.equal('stack' in data, false);
      assert.equal(data.messageAr, 'حدث خطأ في قاعدة البيانات. يرجى المحاولة لاحقاً.');
    } finally {
      mockDb.collection = originalCollection;
    }
  });

  await t.test('If p1Uid query throws during relationship creation, route returns 500 DATABASE_ERROR and NO new relationship document is written', async () => {
    const p1Uid = 'user_p1_query_fail_uid';
    const testPhone = '+966501112233';
    mockAuth.addUser(`mock_token_for_${p1Uid}`, {
      uid: p1Uid,
      email: 'p1_query_fail@example.com',
      phone_number: testPhone
    });

    const relCountBefore = mockDb.store.get('relationships')?.size || 0;

    const originalCollection = mockDb.collection.bind(mockDb);
    mockDb.collection = (name: string) => {
      const col = originalCollection(name);
      if (name === 'relationships') {
        const originalWhere = col.where.bind(col);
        col.where = (field: string, op: any, value: any) => {
          const q = originalWhere(field, op, value);
          if (field === 'p1Uid') {
            const originalLimit = q.limit.bind(q);
            q.limit = (n: number) => {
              const limited = originalLimit(n);
              limited.get = async () => {
                throw new Error('SIMULATED_P1_QUERY_FAILURE');
              };
              return limited;
            };
            q.get = async () => {
              throw new Error('SIMULATED_P1_QUERY_FAILURE');
            };
          }
          return q;
        };
      }
      return col;
    };

    try {
      const res = await fetch(`${baseUrl}/api/relationship`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer mock_token_for_${p1Uid}`,
          'X-Firebase-AppCheck': 'test_mock_app_check_token'
        },
        body: JSON.stringify({
          partner1: {
            fullName: 'فهد المطيري',
            fullNameEn: 'Fahad Al-Mutairi',
            birthDay: '10',
            birthMonth: '05',
            birthYear: '1990',
            email: 'p1_query_fail@example.com',
            phoneCountry: 'SA +966',
            phoneNumber: '0501112233',
            phoneE164: testPhone,
            whatsappCountry: 'SA +966',
            whatsappNumber: '0501112233',
            whatsappE164: testPhone
          },
          type: 'marriage',
          startDate: '2024-01-01',
          acceptedLegalVersion: CURRENT_LEGAL_VERSION
        })
      });

      assert.equal(res.status, 500);
      const data = await res.json();
      assert.equal(data.error, 'DATABASE_ERROR');
      assert.equal(data.messageAr, 'حدث خطأ في قاعدة البيانات. يرجى المحاولة لاحقاً.');

      const relCountAfter = mockDb.store.get('relationships')?.size || 0;
      assert.equal(relCountAfter, relCountBefore, 'NO new relationship document must be written when p1Uid query fails');
      const allRels = Array.from(mockDb.store.get('relationships')?.values() || []);
      const writtenForUser = allRels.filter((r: any) => r.p1Uid === p1Uid);
      assert.equal(writtenForUser.length, 0, 'No relationship document must exist for p1Uid');
      assert.equal(mockDb.getDoc('users', p1Uid)?.activeRecordId, undefined, 'User must not have activeRecordId set');
    } finally {
      mockDb.collection = originalCollection;
    }
  });
});
