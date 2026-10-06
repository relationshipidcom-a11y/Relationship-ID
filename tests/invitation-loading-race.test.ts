import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeInvitationLoad,
  evaluateP2Authorization,
  shouldRenderP2RegistrationScreen
} from '../src/utils/relationshipState';

interface InvitationResponse {
  invitation: { id: string; inviterName: string; relationshipType: string };
  authorization: {
    authenticated: boolean;
    isP1: boolean;
    authorized: boolean;
    reason?: string;
    inviteId?: string;
    authorizedUid?: string;
  };
  record?: any;
}

test('Production Invitation Loading Race & Concurrency Guard Suite', async (t) => {
  // Test state container that uses real executeInvitationLoad from production code
  class ProductionTestHarness {
    invitationRequestId = 0;
    activeAuthUid: string | null = null;
    currentUserUid: string | null = null;
    invitationLoading = false;
    invitation: InvitationResponse['invitation'] | null = null;
    invitationAuth: InvitationResponse['authorization'] | null = null;
    record: any = null;
    appError: string | null = null;

    load(inviteId: string, fetchFn: () => Promise<InvitationResponse>, skipRecordOverwrite = false) {
      const requestId = ++this.invitationRequestId;
      const requestUid = this.currentUserUid;

      return executeInvitationLoad<InvitationResponse>({
        inviteId,
        skipRecordOverwrite,
        requestUid,
        requestId,
        getCurrentRequestId: () => this.invitationRequestId,
        getActiveAuthUid: () => this.activeAuthUid,
        getCurrentAuthUid: () => this.currentUserUid,
        fetchInvitation: fetchFn,
        setInvitation: (inv) => { this.invitation = inv; },
        setInvitationAuth: (auth) => { this.invitationAuth = auth; },
        setRecord: (updater) => { this.record = typeof updater === 'function' ? updater(this.record) : updater; },
        setAppError: (err) => { this.appError = err; },
        setInvitationLoading: (loading) => { this.invitationLoading = loading; },
        formatErrorMessage: (err) => (err instanceof Error ? err.message : String(err))
      });
    }

    signOut() {
      this.activeAuthUid = null;
      this.currentUserUid = null;
      this.invitationRequestId += 1;
      this.invitation = null;
      this.invitationAuth = null;
      this.record = null;
      this.invitationLoading = false;
    }

    switchAccount(newUid: string) {
      this.activeAuthUid = newUid;
      this.currentUserUid = newUid;
      this.invitationRequestId += 1;
      this.invitation = null;
      this.invitationAuth = null;
      this.record = null;
      this.invitationLoading = false;
    }
  }

  // 1. Completion order A before B: older request A finishing first does not clear loading or overwrite state of B
  await t.test('1. Completion order A then B: older request finishing first does not clear loading or overwrite state of newer request', async () => {
    const harness = new ProductionTestHarness();
    harness.activeAuthUid = 'uid_p2';
    harness.currentUserUid = 'uid_p2';

    let resolveA!: (val: InvitationResponse) => void;
    const promiseA = new Promise<InvitationResponse>((res) => { resolveA = res; });

    let resolveB!: (val: InvitationResponse) => void;
    const promiseB = new Promise<InvitationResponse>((res) => { resolveB = res; });

    const callA = harness.load('invite_A', () => promiseA);
    assert.equal(harness.invitationLoading, true);
    assert.equal(harness.invitationRequestId, 1);

    const callB = harness.load('invite_B', () => promiseB);
    assert.equal(harness.invitationLoading, true);
    assert.equal(harness.invitationRequestId, 2);

    // Older request A completes first
    resolveA({
      invitation: { id: 'invite_A', inviterName: 'Partner A', relationshipType: 'dating' },
      authorization: {
        authenticated: true,
        isP1: false,
        authorized: true,
        inviteId: 'invite_A',
        authorizedUid: 'uid_p2'
      }
    });

    const resultA = await callA;
    assert.equal(resultA, null, 'Stale request A must return null from production executeInvitationLoad');
    assert.equal(harness.invitationLoading, true, 'Request B is still in flight: loading must remain true');
    assert.equal(harness.invitationAuth, null, 'Stale request A must not overwrite invitationAuth');
    assert.equal(harness.invitation, null, 'Stale request A must not overwrite invitation');

    // Newer request B completes second
    resolveB({
      invitation: { id: 'invite_B', inviterName: 'Partner B', relationshipType: 'engaged' },
      authorization: {
        authenticated: true,
        isP1: false,
        authorized: true,
        inviteId: 'invite_B',
        authorizedUid: 'uid_p2'
      }
    });

    const resultB = await callB;
    assert.ok(resultB, 'Current request B must return valid data');
    assert.equal(harness.invitationLoading, false, 'Loading must end when request B completes');
    assert.equal((harness.invitation as any)?.id, 'invite_B');
    assert.equal((harness.invitationAuth as any)?.inviteId, 'invite_B');
    assert.equal((harness.invitationAuth as any)?.authorized, true);

    // Fail-closed P2 gate verification
    const decision = evaluateP2Authorization({
      authInitialized: true,
      currentUserId: 'uid_p2',
      targetInviteId: 'invite_B',
      invitationAuth: harness.invitationAuth,
      invitation: harness.invitation,
      record: null,
      invitationLoading: harness.invitationLoading
    });
    assert.equal(decision.state, 'authorized');
    assert.equal(shouldRenderP2RegistrationScreen(decision), true);
  });

  // 2. Completion order B before A: newer request B finishes first, older request A finishes later
  await t.test('2. Completion order B then A: older request finishing after newer request does not clobber newer state', async () => {
    const harness = new ProductionTestHarness();
    harness.activeAuthUid = 'uid_p2';
    harness.currentUserUid = 'uid_p2';

    let resolveA!: (val: InvitationResponse) => void;
    const promiseA = new Promise<InvitationResponse>((res) => { resolveA = res; });

    let resolveB!: (val: InvitationResponse) => void;
    const promiseB = new Promise<InvitationResponse>((res) => { resolveB = res; });

    const callA = harness.load('invite_A', () => promiseA);
    const callB = harness.load('invite_B', () => promiseB);

    // Newer request B finishes first
    resolveB({
      invitation: { id: 'invite_B', inviterName: 'Partner B', relationshipType: 'married' },
      authorization: {
        authenticated: true,
        isP1: false,
        authorized: true,
        inviteId: 'invite_B',
        authorizedUid: 'uid_p2'
      }
    });

    const resultB = await callB;
    assert.ok(resultB);
    assert.equal(harness.invitationLoading, false);
    assert.equal(harness.invitation?.id, 'invite_B');

    // Older request A finishes later
    resolveA({
      invitation: { id: 'invite_A', inviterName: 'Partner A', relationshipType: 'dating' },
      authorization: {
        authenticated: true,
        isP1: false,
        authorized: true,
        inviteId: 'invite_A',
        authorizedUid: 'uid_p2'
      }
    });

    const resultA = await callA;
    assert.equal(resultA, null);
    assert.equal(harness.invitationLoading, false, 'Loading should not be changed');
    assert.equal(harness.invitation?.id, 'invite_B', 'Older request A must not clobber invitation from request B');
    assert.equal(harness.invitationAuth?.inviteId, 'invite_B', 'Older request A must not clobber invitationAuth from request B');
  });

  // 3. Older request fails after newer request starts
  await t.test('3. Older request failing after newer request starts does not set appError or clear loading', async () => {
    const harness = new ProductionTestHarness();
    harness.activeAuthUid = 'uid_p2';
    harness.currentUserUid = 'uid_p2';

    let rejectA!: (err: Error) => void;
    const promiseA = new Promise<InvitationResponse>((_, rej) => { rejectA = rej; });

    let resolveB!: (val: InvitationResponse) => void;
    const promiseB = new Promise<InvitationResponse>((res) => { resolveB = res; });

    const callA = harness.load('invite_A', () => promiseA);
    const callB = harness.load('invite_B', () => promiseB);

    // Older request A rejects with network error
    rejectA(new Error('NETWORK_TIMEOUT'));
    const resultA = await callA;

    assert.equal(resultA, null);
    assert.equal(harness.appError, null, 'Superseded failed request A must not set appError');
    assert.equal(harness.invitationLoading, true, 'Request B is still running; loading must remain true');

    // Newer request B completes successfully
    resolveB({
      invitation: { id: 'invite_B', inviterName: 'Partner B', relationshipType: 'dating' },
      authorization: {
        authenticated: true,
        isP1: false,
        authorized: true,
        inviteId: 'invite_B',
        authorizedUid: 'uid_p2'
      }
    });
    const resultB = await callB;

    assert.ok(resultB);
    assert.equal(harness.invitationLoading, false);
    assert.equal(harness.appError, null);
    assert.equal(harness.invitation?.id, 'invite_B');
  });

  // 4. Sign-out while request is in flight
  await t.test('4. Sign-out while request is in flight drops auth data and keeps state clean', async () => {
    const harness = new ProductionTestHarness();
    harness.activeAuthUid = 'uid_p2';
    harness.currentUserUid = 'uid_p2';

    let resolveInFlight!: (val: InvitationResponse) => void;
    const promiseInFlight = new Promise<InvitationResponse>((res) => { resolveInFlight = res; });

    const callInFlight = harness.load('invite_secret', () => promiseInFlight);
    assert.equal(harness.invitationLoading, true);

    // User signs out
    harness.signOut();
    assert.equal(harness.invitationLoading, false);
    assert.equal(harness.invitationAuth, null);

    // Stale in-flight response arrives
    resolveInFlight({
      invitation: { id: 'invite_secret', inviterName: 'Secret', relationshipType: 'dating' },
      authorization: {
        authenticated: true,
        isP1: false,
        authorized: true,
        inviteId: 'invite_secret',
        authorizedUid: 'uid_p2'
      }
    });

    const result = await callInFlight;
    assert.equal(result, null);
    assert.equal(harness.invitationAuth, null, 'Private auth data must not leak after sign out');
    assert.equal(harness.invitation, null);
  });

  // 5. Account switching while request is in flight
  await t.test('5. Account switching while request is in flight isolates user state and prevents cross-account leak', async () => {
    const harness = new ProductionTestHarness();
    harness.activeAuthUid = 'uid_user_1';
    harness.currentUserUid = 'uid_user_1';

    let resolveUser1!: (val: InvitationResponse) => void;
    const promise1 = new Promise<InvitationResponse>((res) => { resolveUser1 = res; });

    const call1 = harness.load('invite_123', () => promise1);

    // Switch account to User 2
    harness.switchAccount('uid_user_2');

    // Stale User 1 response arrives
    resolveUser1({
      invitation: { id: 'invite_123', inviterName: 'Partner', relationshipType: 'dating' },
      authorization: {
        authenticated: true,
        isP1: false,
        authorized: true,
        inviteId: 'invite_123',
        authorizedUid: 'uid_user_1'
      }
    });

    const res1 = await call1;
    assert.equal(res1, null);
    assert.equal(harness.invitationAuth, null);
    assert.equal(harness.invitation, null);
  });

  // 6. Direct proof that removing production request guard causes test failure
  await t.test('6. Removing or bypassing production request guard would fail the test', async () => {
    let mutatedInvitation: any = null;
    let mutatedLoading = false;

    // Simulate calling executeInvitationLoad where request ID has been superseded
    const staleResult = await executeInvitationLoad({
      inviteId: 'invite_stale',
      requestUid: 'user_x',
      requestId: 1, // older request ID
      getCurrentRequestId: () => 2, // current is already 2!
      getActiveAuthUid: () => 'user_x',
      getCurrentAuthUid: () => 'user_x',
      fetchInvitation: async () => ({
        invitation: { id: 'invite_stale' }
      }),
      setInvitation: (inv) => { mutatedInvitation = inv; },
      setInvitationAuth: () => {},
      setRecord: () => {},
      setAppError: () => {},
      setInvitationLoading: (l) => { mutatedLoading = l; }
    });

    assert.equal(staleResult, null, 'Superseded request must return null');
    assert.equal(mutatedInvitation, null, 'Superseded request must not set invitation');
    assert.equal(mutatedLoading, true, 'Superseded request must not clear loading (still true from start)');
  });
});
