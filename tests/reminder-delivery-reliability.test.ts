process.env.NODE_ENV = 'test';
if (!process.env.CONTACT_HASH_SECRET || process.env.CONTACT_HASH_SECRET.length < 32) {
  process.env.CONTACT_HASH_SECRET = 'test_contact_hash_secret_at_least_32_characters_long_for_hmac';
}

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createApp,
  sendReminderEmail,
  __setTestDeps,
  __setTestEmailSender,
  __setTestPushSender,
  claimReminderDelivery,
  ownsReminderClaim,
  recordReminderDeliveryOutcome,
  REMINDER_CLAIM_LEASE_MS,
  REMINDER_MAX_ATTEMPTS,
  REMINDER_RETRY_BACKOFF_MS,
  REMINDER_DELIVERIES_COL,
  REMINDER_SETTINGS_COL,
  PUSH_SUBSCRIPTIONS_COL,
  ACCOUNT_DELETIONS_COL,
  CURRENT_LEGAL_VERSION
} from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

const RELATIONSHIPS_COL = 'relationships';
const USERS_COL = 'users';

test('Reminder delivery reliability regression suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const validTestSecret = 'super_secure_reminder_secret_string_32_chars!';
  const originalReminderSecret = process.env.REMINDER_SCHEDULER_SECRET;
  process.env.REMINDER_SCHEDULER_SECRET = validTestSecret;

  t.after(async () => {
    process.env.REMINDER_SCHEDULER_SECRET = originalReminderSecret;
    __setTestEmailSender(null);
    __setTestPushSender(null);
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // 1. Core claim and fencing primitives
  await t.test('1. claimReminderDelivery: atomic initial claim, concurrent exclusion, and success idempotency', async () => {
    mockDb.reset();
    const claimRef = mockDb.collection(REMINDER_DELIVERIES_COL).doc('user1_email_2026-10-25');
    const baseNow = 1700000000000;

    // Worker 1 claims
    const claim1 = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: claimRef as any,
      deliveryDocId: 'user1_email_2026-10-25',
      userId: 'user1',
      channel: 'email',
      localDate: '2026-10-25',
      nowMs: baseNow
    });

    assert.equal(claim1.claimed, true);
    assert.equal(claim1.attemptCount, 1);
    assert.ok(claim1.claimId);

    // Worker 2 attempts concurrent claim within active lease window -> rejected
    const claim2 = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: claimRef as any,
      deliveryDocId: 'user1_email_2026-10-25',
      userId: 'user1',
      channel: 'email',
      localDate: '2026-10-25',
      nowMs: baseNow + 1000 // 1s later
    });

    assert.equal(claim2.claimed, false);
    assert.equal(claim2.reason, 'LEASE_ACTIVE');

    // Worker 1 records success
    const outcome1 = await recordReminderDeliveryOutcome({
      db: mockDb as any,
      claimRef: claimRef as any,
      expectedClaimId: claim1.claimId!,
      outcome: {
        status: 'success',
        occasions: [{ type: 'user_birthday' }],
        nowMs: baseNow + 2000
      }
    });
    assert.equal(outcome1.recorded, true);

    // Subsequent worker attempts to claim after recorded success -> permanently rejected
    const claim3 = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: claimRef as any,
      deliveryDocId: 'user1_email_2026-10-25',
      userId: 'user1',
      channel: 'email',
      localDate: '2026-10-25',
      nowMs: baseNow + 3600000 // 1 hour later
    });

    assert.equal(claim3.claimed, false);
    assert.equal(claim3.reason, 'ALREADY_SUCCEEDED');
  });

  await t.test('2. Abandoned worker crash recovery and fencing against stale worker overwrite', async () => {
    mockDb.reset();
    const claimRef = mockDb.collection(REMINDER_DELIVERIES_COL).doc('user2_email_2026-10-25');
    const baseNow = 1700000000000;

    // Worker 1 claims at t=0
    const claim1 = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: claimRef as any,
      deliveryDocId: 'user2_email_2026-10-25',
      userId: 'user2',
      channel: 'email',
      localDate: '2026-10-25',
      nowMs: baseNow
    });
    assert.equal(claim1.claimed, true);
    assert.ok(claim1.claimId);

    // Worker 1 hangs/crashes. At t = leaseMs + 10s, Worker 2 recovers the claim
    const claim2 = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: claimRef as any,
      deliveryDocId: 'user2_email_2026-10-25',
      userId: 'user2',
      channel: 'email',
      localDate: '2026-10-25',
      nowMs: baseNow + REMINDER_CLAIM_LEASE_MS + 10000
    });
    assert.equal(claim2.claimed, true);
    assert.equal(claim2.attemptCount, 2);
    assert.notEqual(claim2.claimId, claim1.claimId);

    // Worker 2 completes and records success
    const outcome2 = await recordReminderDeliveryOutcome({
      db: mockDb as any,
      claimRef: claimRef as any,
      expectedClaimId: claim2.claimId!,
      outcome: {
        status: 'success',
        occasions: [{ type: 'user_birthday' }],
        nowMs: baseNow + REMINDER_CLAIM_LEASE_MS + 15000
      }
    });
    assert.equal(outcome2.recorded, true);

    // Zombie Worker 1 wakes up late and attempts to write with stale claimId -> rejected and fenced
    const staleOutcome = await recordReminderDeliveryOutcome({
      db: mockDb as any,
      claimRef: claimRef as any,
      expectedClaimId: claim1.claimId!,
      outcome: {
        status: 'failed',
        error: 'NETWORK_TIMEOUT',
        nowMs: baseNow + REMINDER_CLAIM_LEASE_MS + 20000
      }
    });
    assert.equal(staleOutcome.recorded, false);
    assert.equal(staleOutcome.superseded, true);

    // Verify stored doc retained Worker 2's success state
    const doc = mockDb.getDoc(REMINDER_DELIVERIES_COL, 'user2_email_2026-10-25');
    assert.equal(doc.status, 'success');
    assert.equal(doc.claimId, claim2.claimId);
  });

  await t.test('3. Bounded retries and backoff enforcement', async () => {
    mockDb.reset();
    const claimRef = mockDb.collection(REMINDER_DELIVERIES_COL).doc('user3_push_2026-10-25');
    let now = 1700000000000;

    // Attempt 1: claim and fail
    const c1 = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: claimRef as any,
      deliveryDocId: 'user3_push_2026-10-25',
      userId: 'user3',
      channel: 'push',
      localDate: '2026-10-25',
      nowMs: now
    });
    assert.equal(c1.claimed, true);
    assert.equal(c1.attemptCount, 1);

    await recordReminderDeliveryOutcome({
      db: mockDb as any,
      claimRef: claimRef as any,
      expectedClaimId: c1.claimId!,
      outcome: { status: 'failed', error: 'PROVIDER_503', nowMs: now }
    });

    // Immediate retry (5 minutes later < 15 minute backoff) -> BACKOFF_ACTIVE
    now += 5 * 60 * 1000;
    const c1RetryTooSoon = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: claimRef as any,
      deliveryDocId: 'user3_push_2026-10-25',
      userId: 'user3',
      channel: 'push',
      localDate: '2026-10-25',
      nowMs: now
    });
    assert.equal(c1RetryTooSoon.claimed, false);
    assert.equal(c1RetryTooSoon.reason, 'BACKOFF_ACTIVE');

    // Attempt 2: retry after backoff (16 minutes later) -> succeeds
    now += 11 * 60 * 1000; // total 16 min
    const c2 = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: claimRef as any,
      deliveryDocId: 'user3_push_2026-10-25',
      userId: 'user3',
      channel: 'push',
      localDate: '2026-10-25',
      nowMs: now
    });
    assert.equal(c2.claimed, true);
    assert.equal(c2.attemptCount, 2);

    await recordReminderDeliveryOutcome({
      db: mockDb as any,
      claimRef: claimRef as any,
      expectedClaimId: c2.claimId!,
      outcome: { status: 'failed', error: 'PROVIDER_503', nowMs: now }
    });

    // Attempt 3: retry after another 16 minutes -> succeeds
    now += 16 * 60 * 1000;
    const c3 = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: claimRef as any,
      deliveryDocId: 'user3_push_2026-10-25',
      userId: 'user3',
      channel: 'push',
      localDate: '2026-10-25',
      nowMs: now
    });
    assert.equal(c3.claimed, true);
    assert.equal(c3.attemptCount, 3);

    await recordReminderDeliveryOutcome({
      db: mockDb as any,
      claimRef: claimRef as any,
      expectedClaimId: c3.claimId!,
      outcome: { status: 'failed', error: 'PROVIDER_503', nowMs: now }
    });

    // Attempt 4: after max attempts (3) exhausted -> permanently rejected
    now += 16 * 60 * 1000;
    const c4 = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: claimRef as any,
      deliveryDocId: 'user3_push_2026-10-25',
      userId: 'user3',
      channel: 'push',
      localDate: '2026-10-25',
      nowMs: now
    });
    assert.equal(c4.claimed, false);
    assert.equal(c4.reason, 'MAX_ATTEMPTS_EXCEEDED');
  });

  await t.test('4. Independent channels: Email and Push claims do not interfere', async () => {
    mockDb.reset();
    const emailRef = mockDb.collection(REMINDER_DELIVERIES_COL).doc('user4_email_2026-10-25');
    const pushRef = mockDb.collection(REMINDER_DELIVERIES_COL).doc('user4_push_2026-10-25');
    const now = 1700000000000;

    // Email succeeds
    const eClaim = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: emailRef as any,
      deliveryDocId: 'user4_email_2026-10-25',
      userId: 'user4',
      channel: 'email',
      localDate: '2026-10-25',
      nowMs: now
    });
    assert.equal(eClaim.claimed, true);
    await recordReminderDeliveryOutcome({
      db: mockDb as any,
      claimRef: emailRef as any,
      expectedClaimId: eClaim.claimId!,
      outcome: { status: 'success', nowMs: now }
    });

    // Push fails
    const pClaim = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: pushRef as any,
      deliveryDocId: 'user4_push_2026-10-25',
      userId: 'user4',
      channel: 'push',
      localDate: '2026-10-25',
      nowMs: now
    });
    assert.equal(pClaim.claimed, true);
    await recordReminderDeliveryOutcome({
      db: mockDb as any,
      claimRef: pushRef as any,
      expectedClaimId: pClaim.claimId!,
      outcome: { status: 'failed', error: 'PUSH_FAILED', nowMs: now }
    });

    // Verify email doc is still success and push doc is failed
    assert.equal(mockDb.getDoc(REMINDER_DELIVERIES_COL, 'user4_email_2026-10-25').status, 'success');
    assert.equal(mockDb.getDoc(REMINDER_DELIVERIES_COL, 'user4_push_2026-10-25').status, 'failed');

    // Retrying push after backoff claims push only; email is NOT claimed
    const eRetry = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: emailRef as any,
      deliveryDocId: 'user4_email_2026-10-25',
      userId: 'user4',
      channel: 'email',
      localDate: '2026-10-25',
      nowMs: now + 16 * 60 * 1000
    });
    assert.equal(eRetry.claimed, false);
    assert.equal(eRetry.reason, 'ALREADY_SUCCEEDED');

    const pRetry = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: pushRef as any,
      deliveryDocId: 'user4_push_2026-10-25',
      userId: 'user4',
      channel: 'push',
      localDate: '2026-10-25',
      nowMs: now + 16 * 60 * 1000
    });
    assert.equal(pRetry.claimed, true);
    assert.equal(pRetry.attemptCount, 2);
  });

  // 2. HTTP Integration tests for POST /api/reminders/process
  await t.test('5. POST /api/reminders/process end-to-end delivery and idempotency', async () => {
    mockDb.reset();
    const testUid = 'user_e2e_1';

    // Seed Auth user
    mockAuth.addUser('token_e2e_1', {
      uid: testUid,
      email: 'test_e2e@example.com',
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000)
    });
    mockAuth.onGetUser = (uid) => ({
      uid,
      email: 'test_e2e@example.com',
      emailVerified: true,
      disabled: false
    } as any);

    // Seed Reminder Settings
    mockDb.seed(REMINDER_SETTINGS_COL, testUid, {
      userId: testUid,
      emailEnabled: true,
      pushEnabled: true,
      timezone: 'UTC',
      language: 'en',
      updatedAt: new Date().toISOString()
    });

    // Seed User doc with Birthday today (2026-10-25)
    mockDb.seed(USERS_COL, testUid, {
      uid: testUid,
      birthYear: '1995',
      birthMonth: '10',
      birthDay: '25'
    });

    // Seed Push Subscription
    mockDb.seed(PUSH_SUBSCRIPTIONS_COL, `${testUid}_sub1`, {
      id: `${testUid}_sub1`,
      userId: testUid,
      subscription: {
        endpoint: 'https://push.example.com/sub1',
        keys: { p256dh: 'test_key', auth: 'test_auth' }
      },
      createdAt: new Date().toISOString()
    });

    // Mock senders
    let emailCallCount = 0;
    let pushCallCount = 0;
    __setTestEmailSender(async (toEmail, subject, body) => {
      emailCallCount++;
      assert.equal(toEmail, 'test_e2e@example.com');
      return { success: true };
    });
    __setTestPushSender(async (sub, payload) => {
      pushCallCount++;
      return { success: true };
    });

    // Run 1: Should deliver 1 email and 1 push
    const res1 = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`, {
      method: 'POST',
      headers: {
        'x-reminder-scheduler-secret': validTestSecret
      }
    });

    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.success, true);
    assert.equal(data1.emailsSent, 1);
    assert.equal(data1.pushSent, 1);
    assert.equal(emailCallCount, 1);
    assert.equal(pushCallCount, 1);

    // Verify delivery documents recorded in Firestore
    const emailDoc = mockDb.getDoc(REMINDER_DELIVERIES_COL, `${testUid}_email_2026-10-25`);
    assert.equal(emailDoc.status, 'success');
    assert.ok(emailDoc.deliveredAt);
    assert.equal(emailDoc.occasions[0].type, 'user_birthday');

    const pushDoc = mockDb.getDoc(REMINDER_DELIVERIES_COL, `${testUid}_push_2026-10-25`);
    assert.equal(pushDoc.status, 'success');
    assert.ok(pushDoc.deliveredAt);

    // Run 2 (Immediately after): Idempotency check -> 0 emails and 0 push sent
    const res2 = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`, {
      method: 'POST',
      headers: {
        'x-reminder-scheduler-secret': validTestSecret
      }
    });

    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.emailsSent, 0);
    assert.equal(data2.pushSent, 0);
    assert.equal(emailCallCount, 1); // Not called again
    assert.equal(pushCallCount, 1); // Not called again
  });

  await t.test('6. Ineligible relationship states suppress partner occasions but preserve user birthday', async () => {
    mockDb.reset();
    const p1Uid = 'user_p1';
    const p2Uid = 'user_p2';
    const recordId = 'rel_test_1';

    mockAuth.addUser('token_p1', {
      uid: p1Uid,
      email: 'p1@example.com',
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000)
    });
    mockAuth.onGetUser = (uid) => ({
      uid,
      email: 'p1@example.com',
      emailVerified: true,
      disabled: false
    } as any);

    mockDb.seed(REMINDER_SETTINGS_COL, p1Uid, {
      userId: p1Uid,
      emailEnabled: true,
      pushEnabled: false,
      timezone: 'UTC',
      language: 'en'
    });

    // P1 birthday is today (10/25); Partner birthday is today (10/25); Anniversary is today (started 2024-10-25)
    mockDb.seed(USERS_COL, p1Uid, {
      uid: p1Uid,
      activeRecordId: recordId,
      birthYear: '1995',
      birthMonth: '10',
      birthDay: '25'
    });

    mockDb.seed(RELATIONSHIPS_COL, recordId, {
      id: recordId,
      status: 'active',
      p1Uid,
      p2Uid,
      startDateIso: '2024-10-25',
      partner1: { fullName: 'P1', birthYear: '1995', birthMonth: '10', birthDay: '25' },
      partner2: { fullName: 'P2', birthYear: '1996', birthMonth: '10', birthDay: '25' }
    });

    // Flag relationship deletion pending
    mockDb.seed('relationship_deletions', recordId, {
      recordId,
      status: 'locked'
    });

    let deliveredOccasions: any[] = [];
    __setTestEmailSender(async (toEmail, subject, body) => {
      return { success: true };
    });

    const res = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`, {
      method: 'POST',
      headers: { 'x-reminder-scheduler-secret': validTestSecret }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.emailsSent, 1);

    const doc = mockDb.getDoc(REMINDER_DELIVERIES_COL, `${p1Uid}_email_2026-10-25`);
    assert.equal(doc.status, 'success');
    // Partner birthday & anniversary must be suppressed because relationship is deleting
    assert.equal(doc.occasions.length, 1);
    assert.equal(doc.occasions[0].type, 'user_birthday');
  });

  await t.test('7. Push subscription cleanup on 404/410 vs preservation on transient failure', async () => {
    mockDb.reset();
    const testUid = 'user_push_sub_test';

    mockAuth.addUser('token_push', {
      uid: testUid,
      email: 'user_push@example.com',
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000)
    });

    mockDb.seed(REMINDER_SETTINGS_COL, testUid, {
      userId: testUid,
      emailEnabled: false,
      pushEnabled: true,
      timezone: 'UTC'
    });

    mockDb.seed(USERS_COL, testUid, {
      uid: testUid,
      birthYear: '1995',
      birthMonth: '10',
      birthDay: '25'
    });

    const sub1Id = `${testUid}_sub_expired`;
    const sub2Id = `${testUid}_sub_transient`;

    mockDb.seed(PUSH_SUBSCRIPTIONS_COL, sub1Id, {
      id: sub1Id,
      userId: testUid,
      subscription: { endpoint: 'https://push.example.com/expired', keys: { p256dh: 'k1', auth: 'a1' } }
    });

    mockDb.seed(PUSH_SUBSCRIPTIONS_COL, sub2Id, {
      id: sub2Id,
      userId: testUid,
      subscription: { endpoint: 'https://push.example.com/transient', keys: { p256dh: 'k2', auth: 'a2' } }
    });

    // Mock sender: expired endpoint returns expired: true; transient endpoint returns error without expired
    __setTestPushSender(async (sub) => {
      if ((sub as any).endpoint?.includes('expired')) {
        return { success: false, expired: true, error: 'SUBSCRIPTION_EXPIRED' };
      }
      return { success: false, expired: false, error: 'GATEWAY_TIMEOUT' };
    });

    const res = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`, {
      method: 'POST',
      headers: { 'x-reminder-scheduler-secret': validTestSecret }
    });

    assert.equal(res.status, 200);

    // Verify expired subscription was deleted from Firestore
    assert.equal(mockDb.getDoc(PUSH_SUBSCRIPTIONS_COL, sub1Id), undefined);

    // Verify transient subscription was retained in Firestore
    assert.ok(mockDb.getDoc(PUSH_SUBSCRIPTIONS_COL, sub2Id));
  });

  await t.test('8. Partial success: Email provider succeeds and Push provider fails', async () => {
    mockDb.reset();
    const testUid = 'user_partial_test';

    mockAuth.addUser('token_partial', {
      uid: testUid,
      email: 'partial@example.com',
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000)
    });
    mockAuth.onGetUser = (uid) => ({
      uid,
      email: 'partial@example.com',
      emailVerified: true,
      disabled: false
    } as any);

    mockDb.seed(REMINDER_SETTINGS_COL, testUid, {
      userId: testUid,
      emailEnabled: true,
      pushEnabled: true,
      timezone: 'UTC'
    });

    mockDb.seed(USERS_COL, testUid, {
      uid: testUid,
      birthYear: '1995',
      birthMonth: '10',
      birthDay: '25'
    });

    mockDb.seed(PUSH_SUBSCRIPTIONS_COL, `${testUid}_sub`, {
      id: `${testUid}_sub`,
      userId: testUid,
      subscription: { endpoint: 'https://push.example.com/live', keys: { p256dh: 'k', auth: 'a' } }
    });

    // Email succeeds, push fails
    __setTestEmailSender(async () => ({ success: true }));
    __setTestPushSender(async () => ({ success: false, error: 'PUSH_GATEWAY_502' }));

    const res = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`, {
      method: 'POST',
      headers: { 'x-reminder-scheduler-secret': validTestSecret }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.emailsSent, 1);
    assert.equal(data.pushSent, 0);

    const emailDoc = mockDb.getDoc(REMINDER_DELIVERIES_COL, `${testUid}_email_2026-10-25`);
    const pushDoc = mockDb.getDoc(REMINDER_DELIVERIES_COL, `${testUid}_push_2026-10-25`);

    assert.equal(emailDoc.status, 'success');
    assert.equal(pushDoc.status, 'failed');
    assert.equal(pushDoc.error, 'PUSH_GATEWAY_502');
  });

  await t.test('9. Calendar edge cases: Leap year Feb 29 policy and anniversary rules', async () => {
    mockDb.reset();
    const { isOccasionToday, calculateActiveOccasions } = await import('../src/utils/reminders');

    // Leap day policy
    // In leap year 2028: Feb 29 triggers on Feb 29
    assert.equal(isOccasionToday(2, 29, 2, 29, 2028), true);
    assert.equal(isOccasionToday(2, 29, 2, 28, 2028), false);

    // In non-leap year 2027: Feb 29 triggers on Feb 28
    assert.equal(isOccasionToday(2, 29, 2, 28, 2027), true);
    assert.equal(isOccasionToday(2, 29, 2, 27, 2027), false);

    // Anniversary rule: Year 0 (same calendar year) is suppressed
    const year0Occasions = calculateActiveOccasions({
      relationshipStartDateIso: '2026-10-25',
      relationshipStatus: 'active',
      relationshipRecordId: 'rel_0',
      timeZone: 'UTC',
      referenceDate: new Date('2026-10-25T09:00:00Z')
    });
    assert.equal(year0Occasions.some(o => o.type === 'relationship_anniversary'), false);

    // Anniversary rule: Year 1 triggers anniversary
    const year1Occasions = calculateActiveOccasions({
      relationshipStartDateIso: '2025-10-25',
      relationshipStatus: 'active',
      relationshipRecordId: 'rel_1',
      timeZone: 'UTC',
      referenceDate: new Date('2026-10-25T09:00:00Z')
    });
    assert.equal(year1Occasions.some(o => o.type === 'relationship_anniversary'), true);
  });

  await t.test('10. Uncertain timeout outcome and pair block suppression', async () => {
    mockDb.reset();
    const INVITATION_BLOCKS_COL = 'invitation_blocks';
    const p1Uid = 'user_p1_blk';
    const p2Uid = 'user_p2_blk';
    const recordId = 'rel_blk_1';

    mockAuth.addUser('token_p1_blk', {
      uid: p1Uid,
      email: 'p1_blk@example.com',
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000)
    });
    mockAuth.onGetUser = (uid) => ({
      uid,
      email: `${uid}@example.com`,
      emailVerified: true,
      disabled: false
    } as any);

    mockDb.seed(REMINDER_SETTINGS_COL, p1Uid, {
      userId: p1Uid,
      emailEnabled: true,
      pushEnabled: false,
      timezone: 'UTC'
    });

    mockDb.seed(USERS_COL, p1Uid, {
      uid: p1Uid,
      activeRecordId: recordId,
      birthYear: '1995',
      birthMonth: '10',
      birthDay: '25'
    });

    mockDb.seed(RELATIONSHIPS_COL, recordId, {
      id: recordId,
      status: 'active',
      p1Uid,
      p2Uid,
      startDateIso: '2024-10-25',
      partner1: { fullName: 'P1', birthYear: '1995', birthMonth: '10', birthDay: '25' },
      partner2: { fullName: 'P2', birthYear: '1996', birthMonth: '10', birthDay: '25' }
    });

    // Seed pair block: P2 blocked P1
    mockDb.seed(INVITATION_BLOCKS_COL, `${p2Uid}_${p1Uid}`, {
      p2Uid,
      p1Uid,
      blocked: true,
      blockedAt: new Date().toISOString()
    });

    // Sender returns a timeout / uncertain error
    __setTestEmailSender(async () => ({
      success: false,
      error: 'TIMEOUT_UNCERTAIN',
      uncertain: true
    }));

    const res = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`, {
      method: 'POST',
      headers: { 'x-reminder-scheduler-secret': validTestSecret }
    });

    assert.equal(res.status, 200);
    const doc = mockDb.getDoc(REMINDER_DELIVERIES_COL, `${p1Uid}_email_2026-10-25`);
    assert.equal(doc.status, 'failed');
    assert.equal(doc.error, 'TIMEOUT_UNCERTAIN');
    assert.equal(doc.uncertain, true);
    // Explicit assertion: blocked-partner occasions are absent and user's own birthday is preserved
    assert.ok(doc.occasions);
    assert.equal(doc.occasions.length, 1);
    assert.equal(doc.occasions[0].type, 'user_birthday');
    assert.equal(doc.occasions.some((o: any) => o.type === 'partner_birthday'), false);
    assert.equal(doc.occasions.some((o: any) => o.type === 'relationship_anniversary'), false);
  });

  await t.test('11. Stable email idempotency key across multiple attempts and retries', async () => {
    mockDb.reset();
    const testUid = 'user_idemp_key';

    mockAuth.addUser('token_idemp', {
      uid: testUid,
      email: 'idemp@example.com',
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000)
    });
    mockAuth.onGetUser = (uid) => ({
      uid,
      email: `${uid}@example.com`,
      emailVerified: true,
      disabled: false
    } as any);

    mockDb.seed(REMINDER_SETTINGS_COL, testUid, {
      userId: testUid,
      emailEnabled: true,
      pushEnabled: false,
      timezone: 'UTC'
    });

    mockDb.seed(USERS_COL, testUid, {
      uid: testUid,
      birthYear: '1995',
      birthMonth: '10',
      birthDay: '25'
    });

    const capturedKeys: string[] = [];
    let attemptNum = 0;
    __setTestEmailSender(async (_toEmail, _subj, _body, idempKey) => {
      attemptNum++;
      if (idempKey) capturedKeys.push(idempKey);
      if (attemptNum === 1) {
        return { success: false, error: 'TIMEOUT_UNCERTAIN', uncertain: true };
      }
      return { success: true };
    });

    // Attempt 1: Uncertain timeout
    const res1 = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`, {
      method: 'POST',
      headers: { 'x-reminder-scheduler-secret': validTestSecret }
    });
    assert.equal(res1.status, 200);

    const doc1 = mockDb.getDoc(REMINDER_DELIVERIES_COL, `${testUid}_email_2026-10-25`);
    assert.equal(doc1.status, 'failed');
    assert.equal(doc1.attempts, 1);
    assert.equal(capturedKeys.length, 1);
    // Key must be stable logical occurrence identifier, NOT including attempt count or claimId
    assert.equal(capturedKeys[0], `${testUid}_email_2026-10-25`);
    assert.ok(!capturedKeys[0].includes('_1'));
    assert.ok(!capturedKeys[0].includes(doc1.claimId!));

    const testRefTime = Date.now() - (REMINDER_RETRY_BACKOFF_MS + 1000);
    doc1.firstAttemptAtMs = testRefTime;
    doc1.lastAttemptAtMs = testRefTime;
    mockDb.seed(REMINDER_DELIVERIES_COL, `${testUid}_email_2026-10-25`, doc1);

    mockDb.seed(REMINDER_SETTINGS_COL, testUid, {
      userId: testUid, emailEnabled: true, pushEnabled: false, timezone: 'UTC', language: 'ar'
    });
    const processUrl = `${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`;
    const processOptions = { method: 'POST', headers: { 'x-reminder-scheduler-secret': validTestSecret } };
    assert.equal((await fetch(processUrl, processOptions)).status, 200);
    assert.equal(capturedKeys.length, 1, 'language change must not reuse the key with a different body');
    mockDb.seed(REMINDER_SETTINGS_COL, testUid, {
      userId: testUid, emailEnabled: true, pushEnabled: false, timezone: 'UTC', language: 'en'
    });
    mockAuth.onGetUser = uid => ({ uid, email: 'changed@example.com', emailVerified: true, disabled: false } as any);
    assert.equal((await fetch(processUrl, processOptions)).status, 200);
    assert.equal(capturedKeys.length, 1, 'new recipient must not receive a retry of the old occurrence');
    mockAuth.onGetUser = uid => ({ uid, email: `${uid}@example.com`, emailVerified: true, disabled: false } as any);

    const res2 = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`, {
      method: 'POST',
      headers: { 'x-reminder-scheduler-secret': validTestSecret }
    });
    assert.equal(res2.status, 200);

    const doc2 = mockDb.getDoc(REMINDER_DELIVERIES_COL, `${testUid}_email_2026-10-25`);
    assert.equal(doc2.status, 'success');
    assert.equal(doc2.attempts, 2);
    assert.equal(capturedKeys.length, 2);
    // Idempotency key on attempt 2 MUST EXACTLY MATCH attempt 1
    assert.equal(capturedKeys[1], capturedKeys[0]);
  });

  await t.test('12. Confirmed permanent rejection suppresses retries while uncertain outcome permits retry', async () => {
    mockDb.reset();
    const permRef = mockDb.collection(REMINDER_DELIVERIES_COL).doc('user_perm_email_2026-10-25');
    const now = 1700000000000;

    // 1. Initial claim
    const c1 = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: permRef as any,
      deliveryDocId: 'user_perm_email_2026-10-25',
      userId: 'user_perm',
      channel: 'email',
      localDate: '2026-10-25',
      nowMs: now
    });
    assert.equal(c1.claimed, true);

    // Record confirmed permanent failure (e.g. 4xx unrecoverable client error)
    await recordReminderDeliveryOutcome({
      db: mockDb as any,
      claimRef: permRef as any,
      expectedClaimId: c1.claimId!,
      outcome: {
        status: 'failed',
        error: 'INVALID_RECIPIENT_422',
        permanent: true,
        uncertain: false,
        nowMs: now
      }
    });

    // Even after backoff window expires, permanent failure is NOT retryable
    const retryAfterBackoff = await claimReminderDelivery({
      db: mockDb as any,
      claimRef: permRef as any,
      deliveryDocId: 'user_perm_email_2026-10-25',
      userId: 'user_perm',
      channel: 'email',
      localDate: '2026-10-25',
      nowMs: now + (20 * 60 * 1000)
    });
    assert.equal(retryAfterBackoff.claimed, false);
    assert.equal(retryAfterBackoff.reason, 'MAX_ATTEMPTS_EXCEEDED');
  });

  await t.test('13. Multi-subscription push preserves uncertain timeout outcome across device failures', async () => {
    mockDb.reset();
    const testUid = 'user_multi_push';

    mockAuth.addUser('token_multi_push', {
      uid: testUid,
      email: 'multipush@example.com',
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000)
    });

    mockDb.seed(REMINDER_SETTINGS_COL, testUid, {
      userId: testUid,
      emailEnabled: false,
      pushEnabled: true,
      timezone: 'UTC'
    });

    mockDb.seed(USERS_COL, testUid, {
      uid: testUid,
      birthYear: '1995',
      birthMonth: '10',
      birthDay: '25'
    });

    // Seed 2 push subscriptions
    mockDb.seed(PUSH_SUBSCRIPTIONS_COL, `${testUid}_sub1`, {
      id: `${testUid}_sub1`,
      userId: testUid,
      subscription: { endpoint: 'https://push.example.com/sub1_timeout', keys: { p256dh: 'k1', auth: 'a1' } }
    });

    mockDb.seed(PUSH_SUBSCRIPTIONS_COL, `${testUid}_sub2`, {
      id: `${testUid}_sub2`,
      userId: testUid,
      subscription: { endpoint: 'https://push.example.com/sub2_server_error', keys: { p256dh: 'k2', auth: 'a2' } }
    });

    // Device 1 times out (uncertain: true), Device 2 fails with 500 server error (uncertain: false)
    __setTestPushSender(async (sub) => {
      if ((sub as any).endpoint?.includes('timeout')) {
        return { success: false, error: 'TIMEOUT_UNCERTAIN', uncertain: true };
      }
      return { success: false, error: 'PUSH_SERVER_500', uncertain: false };
    });

    const res = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`, {
      method: 'POST',
      headers: { 'x-reminder-scheduler-secret': validTestSecret }
    });
    assert.equal(res.status, 200);

    const doc = mockDb.getDoc(REMINDER_DELIVERIES_COL, `${testUid}_push_2026-10-25`);
    assert.equal(doc.status, 'failed');
    // The uncertain timeout from device 1 must NOT be dropped by device 2 failing with 500
    assert.equal(doc.uncertain, true);
    assert.equal(doc.error, 'TIMEOUT_UNCERTAIN');
  });

  await t.test('14. Block lookup DB read failure skips reminder dispatch without assuming allowed', async () => {
    mockDb.reset();
    const INVITATION_BLOCKS_COL = 'invitation_blocks';
    const p1Uid = 'user_p1_dberr';
    const p2Uid = 'user_p2_dberr';
    const recordId = 'rel_dberr_1';

    mockAuth.addUser('token_p1_dberr', {
      uid: p1Uid,
      email: 'p1_dberr@example.com',
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000)
    });
    mockAuth.onGetUser = (uid) => ({
      uid,
      email: `${uid}@example.com`,
      emailVerified: true,
      disabled: false
    } as any);

    mockDb.seed(REMINDER_SETTINGS_COL, p1Uid, {
      userId: p1Uid,
      emailEnabled: true,
      pushEnabled: false,
      timezone: 'UTC'
    });

    // P1 birthday is not today, but partner birthday IS today (10/25)
    mockDb.seed(USERS_COL, p1Uid, {
      uid: p1Uid,
      activeRecordId: recordId,
      birthYear: '1995',
      birthMonth: '05',
      birthDay: '10'
    });

    mockDb.seed(RELATIONSHIPS_COL, recordId, {
      id: recordId,
      status: 'active',
      p1Uid,
      p2Uid,
      startDateIso: '2024-10-25',
      partner1: { fullName: 'P1', birthYear: '1995', birthMonth: '05', birthDay: '10' },
      partner2: { fullName: 'P2', birthYear: '1996', birthMonth: '10', birthDay: '25' }
    });

    // Simulate Firestore error when reading invitation_blocks
    const originalCollection = mockDb.collection.bind(mockDb);
    mockDb.collection = ((col: string) => {
      if (col === INVITATION_BLOCKS_COL) {
        return {
          doc: () => ({
            get: async () => {
              throw new Error('SIMULATED_FIRESTORE_UNAVAILABLE');
            }
          })
        } as any;
      }
      return originalCollection(col);
    }) as any;

    let emailSent = false;
    __setTestEmailSender(async () => {
      emailSent = true;
      return { success: true };
    });

    const res = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`, {
      method: 'POST',
      headers: { 'x-reminder-scheduler-secret': validTestSecret }
    });
    assert.equal(res.status, 200);

    // Email must NOT be sent because block status could not be verified
    assert.equal(emailSent, false);

    // No delivery doc recorded (it was skipped, remaining retryable)
    const doc = mockDb.getDoc(REMINDER_DELIVERIES_COL, `${p1Uid}_email_2026-10-25`);
    assert.equal(doc, undefined);

    // An independently eligible own birthday must still dispatch during the same lookup outage.
    mockDb.seed(RELATIONSHIPS_COL, recordId, {
      id: recordId, status: 'active', p1Uid, p2Uid, startDateIso: '2024-10-25',
      partner1: { fullName: 'P1', birthYear: '1995', birthMonth: '10', birthDay: '25' },
      partner2: { fullName: 'P2', birthYear: '1996', birthMonth: '10', birthDay: '25' }
    });
    try {
      const ownRes = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`, {
        method: 'POST', headers: { 'x-reminder-scheduler-secret': validTestSecret }
      });
      assert.equal(ownRes.status, 200);
      assert.equal(emailSent, true);
      const ownDelivery = mockDb.getDoc(REMINDER_DELIVERIES_COL, `${p1Uid}_email_2026-10-25`);
      assert.deepEqual(ownDelivery.occasions.map((o: any) => o.type), ['user_birthday']);
    } finally {
      mockDb.collection = originalCollection;
    }
  });

  await t.test('15. GET /api/reminders/active suppresses blocked partner occasions but preserves user birthday', async () => {
    mockDb.reset();
    const INVITATION_BLOCKS_COL = 'invitation_blocks';
    const p1Uid = 'user_inapp_p1';
    const p2Uid = 'user_inapp_p2';
    const recordId = 'rel_inapp_1';

    mockAuth.addUser('token_inapp_p1', {
      uid: p1Uid,
      email: 'inapp_p1@example.com',
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000)
    });

    mockDb.seed(REMINDER_SETTINGS_COL, p1Uid, {
      userId: p1Uid,
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
      timezone: 'UTC'
    });

    // Today is local date for user birthday (assume reference date today or matching birth day/month)
    const today = new Date();
    const curMonth = String(today.getUTCMonth() + 1).padStart(2, '0');
    const curDay = String(today.getUTCDate()).padStart(2, '0');

    mockDb.seed(USERS_COL, p1Uid, {
      uid: p1Uid,
      activeRecordId: recordId,
      birthYear: '1995',
      birthMonth: curMonth,
      birthDay: curDay
    });

    mockDb.seed(RELATIONSHIPS_COL, recordId, {
      id: recordId,
      status: 'active',
      p1Uid,
      p2Uid,
      startDateIso: '2024-01-01',
      partner1: { fullName: 'P1', birthYear: '1995', birthMonth: curMonth, birthDay: curDay },
      partner2: { fullName: 'P2', birthYear: '1996', birthMonth: curMonth, birthDay: curDay }
    });

    // Seed pair block: P1 has a block recorded
    mockDb.seed(INVITATION_BLOCKS_COL, `${p2Uid}_${p1Uid}`, {
      p2Uid,
      p1Uid,
      blocked: true,
      blockedAt: new Date().toISOString()
    });

    const res = await fetch(`${baseUrl}/api/reminders/active`, {
      method: 'GET',
      headers: { Authorization: 'Bearer token_inapp_p1' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.occasions));
    // User birthday is preserved; partner birthday is suppressed
    assert.equal(data.occasions.length, 1);
    assert.equal(data.occasions[0].type, 'user_birthday');
  });

  await t.test('16. Invitation accept rejects with 403 INVITATION_NOT_ALLOWED when blocked in either direction', async () => {
    mockDb.reset();
    const INVITATION_BLOCKS_COL = 'invitation_blocks';
    const p1Uid = 'inv_blk_p1';
    const p2Uid = 'inv_blk_p2';
    const inviteId = 'inv_blk_test';
    const recordId = 'rel_blk_test';

    mockAuth.addUser('token_inv_p2', {
      uid: p2Uid,
      email: 'p2_blk@example.com',
      email_verified: true,
      phone_number: '+966500000002'
    });

    mockDb.seed(USERS_COL, p1Uid, {
      uid: p1Uid,
      email: 'p1_blk@example.com',
      phoneE164: '+966500000001',
      profile: { fullName: 'P1 Blk', birthYear: '1992', birthMonth: '01', birthDay: '01' }
    });

    mockDb.seed(USERS_COL, p2Uid, {
      uid: p2Uid,
      email: 'p2_blk@example.com',
      phoneE164: '+966500000002',
      profile: { fullName: 'P2 Blk', birthYear: '1995', birthMonth: '05', birthDay: '15' }
    });

    mockDb.seed('invitations', inviteId, {
      id: inviteId,
      recordId,
      p1Uid,
      p2Uid: null,
      inviterName: 'P1 Blk',
      relationshipType: 'dating',
      partner2Name: 'P2 Blk',
      partner2Email: 'p2_blk@example.com',
      partner2Phone: '0500000002',
      partner2PhoneCountry: 'SA +966',
      status: 'pending',
      createdAt: '2026-01-01T00:00:00Z',
      expiresAt: '2099-01-01T00:00:00Z'
    });

    mockDb.seed(RELATIONSHIPS_COL, recordId, {
      id: recordId,
      p1Uid,
      p2Uid: null,
      status: 'pending_partner',
      partner1: { fullName: 'P1 Blk', birthYear: '1992', birthMonth: '01', birthDay: '01', email: 'p1_blk@example.com' },
      partner2: { fullName: '', birthYear: '', birthMonth: '', birthDay: '', email: '' }
    });

    // Seed pair block: P1 has blocked P2
    mockDb.seed(INVITATION_BLOCKS_COL, `${p1Uid}_${p2Uid}`, {
      p1Uid,
      p2Uid,
      blocked: true,
      blockedAt: new Date().toISOString()
    });

    const res = await fetch(`${baseUrl}/api/invitations/${inviteId}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_inv_p2'
      },
      body: JSON.stringify({
        partner2: {
          fullName: 'P2 Blk',
          birthYear: '1995',
          birthMonth: '05',
          birthDay: '15',
          email: 'p2_blk@example.com',
          phoneNumber: '0500000002',
          phoneCountry: 'SA +966',
          phoneE164: '+966500000002'
        },
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.error, 'INVITATION_NOT_ALLOWED');
  });
  await t.test('Email transport validates acceptance, sanitizes failures, and preserves uncertainty', async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.RESEND_API_KEY;
    __setTestEmailSender(null);
    process.env.RESEND_API_KEY = 'test-only-fictional-key';
    try {
      const send = () => sendReminderEmail('test@example.com', 'Test', 'Body', 'stable-occurrence');
      globalThis.fetch = (async (_url, init) => {
        assert.equal((init?.headers as Record<string, string>)['Idempotency-Key'], 'stable-occurrence');
        assert.ok(init?.signal);
        return new Response(JSON.stringify({ id: 'test-message-id' }), { status: 200 });
      }) as typeof fetch;
      assert.equal((await send()).success, true);
      for (const body of ['{}', 'not-json', '{"id":""}']) {
        globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;
        assert.deepEqual(await send(), { success: false, error: 'EMAIL_RESPONSE_UNCERTAIN', uncertain: true });
      }
      for (const status of [408, 409, 429, 503]) {
        globalThis.fetch = (async () => new Response('{"message":"sensitive-provider-detail"}', { status })) as typeof fetch;
        const result = await send();
        assert.equal(result.success, false);
        assert.equal(result.permanent, false);
        assert.equal(result.error, `EMAIL_SEND_FAILED_${status}`);
      }
      globalThis.fetch = (async () => { throw new TypeError('sensitive-network-detail', { cause: { code: 'ECONNRESET' } }); }) as typeof fetch;
      assert.deepEqual(await send(), { success: false, error: 'EMAIL_NETWORK_UNCERTAIN', uncertain: true });
      globalThis.fetch = (async () => { throw new DOMException('test abort', 'AbortError'); }) as typeof fetch;
      assert.deepEqual(await send(), { success: false, error: 'TIMEOUT_UNCERTAIN', uncertain: true });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = originalKey;
    }
  });

  await t.test('Email retries require matching payload and a known safe retention window', async () => {
    mockDb.reset();
    const ref = mockDb.collection(REMINDER_DELIVERIES_COL).doc('retention-email');
    const start = 1700000000000;
    const params = { db: mockDb as any, claimRef: ref as any, deliveryDocId: 'retention-email',
      userId: 'retention', channel: 'email' as const, localDate: '2026-10-25', emailPayloadHash: 'original-payload' };
    const first = await claimReminderDelivery({ ...params, nowMs: start });
    assert.equal(first.claimed, true);
    await recordReminderDeliveryOutcome({ db: mockDb as any, claimRef: ref as any,
      expectedClaimId: first.claimId!, outcome: { status: 'failed', uncertain: true, nowMs: start } });
    const original = mockDb.getDoc(REMINDER_DELIVERIES_COL, 'retention-email');
    for (const override of [
      { emailPayloadHash: 'changed-recipient-or-content', nowMs: start + 3600000 },
      { nowMs: start + 23 * 3600000 },
      { nowMs: start - 1 }
    ]) {
      assert.deepEqual(await claimReminderDelivery({ ...params, ...override }),
        { claimed: false, reason: 'UNSAFE_RETRY' });
      assert.deepEqual(mockDb.getDoc(REMINDER_DELIVERIES_COL, 'retention-email'), original);
    }
    const safe = await claimReminderDelivery({ ...params, nowMs: start + 3600000 });
    assert.equal(safe.claimed, true);
    assert.equal(safe.previousUncertain, true);
    assert.equal(mockDb.getDoc(REMINDER_DELIVERIES_COL, 'retention-email').firstAttemptAtMs, start);
    mockDb.seed(REMINDER_DELIVERIES_COL, 'retention-email', { status: 'failed', uncertain: true, attempts: 1 });
    assert.equal((await claimReminderDelivery({ ...params, nowMs: start + 3600000 })).reason, 'UNSAFE_RETRY');
  });

  await t.test('Uncertain push and abandoned push are not replayed; dispatch checks current lease', async () => {
    mockDb.reset();
    const start = 1700000000000;
    const ref = mockDb.collection(REMINDER_DELIVERIES_COL).doc('uncertain-push');
    const params = { db: mockDb as any, claimRef: ref as any, deliveryDocId: 'uncertain-push',
      userId: 'push-user', channel: 'push' as const, localDate: '2026-10-25' };
    const first = await claimReminderDelivery({ ...params, nowMs: start });
    assert.equal(await ownsReminderClaim(mockDb as any, ref as any, first.claimId!, start), true);
    assert.equal(await ownsReminderClaim(mockDb as any, ref as any, 'other-worker', start), false);
    assert.equal(await ownsReminderClaim(mockDb as any, ref as any, first.claimId!, start + REMINDER_CLAIM_LEASE_MS - 15000), false);
    assert.equal((await claimReminderDelivery({ ...params, nowMs: start + REMINDER_CLAIM_LEASE_MS + 1 })).reason, 'UNSAFE_RETRY');
    await recordReminderDeliveryOutcome({ db: mockDb as any, claimRef: ref as any,
      expectedClaimId: first.claimId!, outcome: { status: 'failed', uncertain: true, nowMs: start } });
    assert.equal((await claimReminderDelivery({ ...params, nowMs: start + 3600000 })).reason, 'UNSAFE_RETRY');
    assert.equal(mockDb.getDoc(REMINDER_DELIVERIES_COL, 'uncertain-push').uncertain, true);
  });

  await t.test('Block inserted during email processing prevents partner-birthday push', async () => {
    mockDb.reset();
    const originalResendKey = process.env.RESEND_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.RESEND_API_KEY = 're_test_key_12345';

    try {
      const u1 = 'user_push_block_1';
      const u2 = 'user_push_block_2';
      mockAuth.onGetUser = (uid) => ({ uid, email: `${uid}@example.com`, emailVerified: true, disabled: false } as any);

      const relId = 'rel_push_block';
      mockDb.seed('relationships', relId, {
        id: relId, status: 'active', p1Uid: u1, p2Uid: u2,
        partner1: { name: 'User 1', birthDay: 1, birthMonth: 1, birthYear: 1990 },
        partner2: { name: 'User 2', birthDay: 25, birthMonth: 10, birthYear: 1995 },
        startDateIso: '2020-01-01'
      });
      mockDb.seed('users', u1, { uid: u1, email: `${u1}@example.com`, activeRecordId: relId });
      mockDb.seed('users', u2, { uid: u2, email: `${u2}@example.com`, activeRecordId: relId });
      mockDb.seed(REMINDER_SETTINGS_COL, u1, {
        userId: u1, emailEnabled: true, pushEnabled: true, timezone: 'UTC', language: 'en'
      });
      mockDb.seed(PUSH_SUBSCRIPTIONS_COL, 'sub_1', {
        id: 'sub_1', userId: u1, subscription: { endpoint: 'https://push.example.com/sub1', keys: { p256dh: 'k', auth: 'a' } }
      });

      let pushCallCount = 0;
      __setTestPushSender(async () => {
        pushCallCount++;
        return { success: true };
      });

      __setTestEmailSender(async () => {
        mockDb.seed('invitation_blocks', `${u1}_${u2}`, { p1Uid: u1, p2Uid: u2, blocked: true });
        return { success: true };
      });

      const processUrl = `${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`;
      const res = await fetch(processUrl, {
        method: 'POST',
        headers: { 'x-reminder-scheduler-secret': validTestSecret }
      });
      assert.equal(res.status, 200);

      assert.equal(pushCallCount, 0, 'Push must not be dispatched when block appears during email processing');
    } finally {
      process.env.RESEND_API_KEY = originalResendKey;
      globalThis.fetch = originalFetch;
      __setTestEmailSender(null);
      __setTestPushSender(null);
    }
  });

  await t.test('Missing RESEND_API_KEY returns SERVICE_UNCONFIGURED with permanent=false allowing retry when key restored', async () => {
    mockDb.reset();
    const originalResendKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    __setTestEmailSender(null);

    try {
      const u1 = 'user_unconfigured_retry';
      mockAuth.onGetUser = (uid) => ({ uid, email: `${uid}@example.com`, emailVerified: true, disabled: false } as any);
      mockDb.seed('users', u1, { uid: u1, email: `${u1}@example.com`, birthDay: 25, birthMonth: 10, birthYear: 1990 });
      mockDb.seed(REMINDER_SETTINGS_COL, u1, {
        userId: u1, emailEnabled: true, pushEnabled: false, timezone: 'UTC', language: 'en'
      });

      const processUrl1 = `${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`;
      const res1 = await fetch(processUrl1, { method: 'POST', headers: { 'x-reminder-scheduler-secret': validTestSecret } });
      assert.equal(res1.status, 200);

      const deliveryDoc1 = mockDb.getDoc(REMINDER_DELIVERIES_COL, `${u1}_email_2026-10-25`);
      assert.ok(deliveryDoc1);
      assert.equal(deliveryDoc1.status, 'failed');
      assert.equal(deliveryDoc1.permanent, false);

      deliveryDoc1.lastAttemptAtMs = Date.now() - (REMINDER_RETRY_BACKOFF_MS + 1000);
      mockDb.seed(REMINDER_DELIVERIES_COL, `${u1}_email_2026-10-25`, deliveryDoc1);

      process.env.RESEND_API_KEY = 're_test_restored_12345';
      let emailSentCount = 0;
      __setTestEmailSender(async () => {
        emailSentCount++;
        return { success: true };
      });

      const processUrl2 = `${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:20:00Z`;
      const res2 = await fetch(processUrl2, { method: 'POST', headers: { 'x-reminder-scheduler-secret': validTestSecret } });
      assert.equal(res2.status, 200);

      assert.equal(emailSentCount, 1, 'Email should be dispatched on retry after configuration is restored');
      const deliveryDoc2 = mockDb.getDoc(REMINDER_DELIVERIES_COL, `${u1}_email_2026-10-25`);
      assert.equal(deliveryDoc2.status, 'success');
    } finally {
      process.env.RESEND_API_KEY = originalResendKey;
      __setTestEmailSender(null);
    }
  });

  await t.test('Fresh per-channel consent and account eligibility stop push after email without losing email success', async () => {
    for (const change of ['disabled', 'removed', 'deletion', 'auth-disabled']) {
      mockDb.reset();
      const uid = `eligibility-${change}`;
      let disabled = false;
      mockAuth.onGetUser = id => ({ uid: id, email: `${id}@example.com`, emailVerified: true, disabled } as any);
      const settings = { userId: uid, emailEnabled: true, pushEnabled: true, timezone: 'UTC', language: 'en' };
      mockDb.seed(REMINDER_SETTINGS_COL, uid, settings);
      mockDb.seed(USERS_COL, uid, { uid, birthYear: '1990', birthMonth: '10', birthDay: '25' });
      mockDb.seed(PUSH_SUBSCRIPTIONS_COL, 'eligibility-sub', { userId: uid, subscription: { endpoint: 'https://example.com', keys: { auth: 'test', p256dh: 'test' } } });
      let pushes = 0;
      __setTestEmailSender(async () => {
        if (change === 'disabled') mockDb.seed(REMINDER_SETTINGS_COL, uid, { ...settings, pushEnabled: false });
        if (change === 'removed') await mockDb.collection(REMINDER_SETTINGS_COL).doc(uid).delete();
        if (change === 'deletion') mockDb.seed('account_deletions', uid, { uid });
        if (change === 'auth-disabled') disabled = true;
        return { success: true };
      });
      __setTestPushSender(async () => { pushes++; return { success: true }; });
      const response = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`, {
        method: 'POST', headers: { 'x-reminder-scheduler-secret': validTestSecret }
      });
      assert.equal(response.status, 200);
      assert.equal(pushes, 0, change);
      assert.equal(mockDb.getDoc(REMINDER_DELIVERIES_COL, `${uid}_email_2026-10-25`).status, 'success');
      assert.equal(mockDb.getDoc(REMINDER_DELIVERIES_COL, `${uid}_push_2026-10-25`), undefined);
    }
  });

  await t.test('Calendar reference never backdates provider failure or bypasses real retry backoff', async () => {
    mockDb.reset();
    const uid = 'live-clock-user';
    mockAuth.onGetUser = id => ({ uid: id, email: `${id}@example.com`, emailVerified: true, disabled: false } as any);
    mockDb.seed(REMINDER_SETTINGS_COL, uid, { userId: uid, emailEnabled: true, pushEnabled: false, timezone: 'UTC' });
    mockDb.seed(USERS_COL, uid, { uid, birthYear: '1990', birthMonth: '10', birthDay: '25' });
    const realNow = Date.now;
    const start = realNow();
    let clock = start;
    let calls = 0;
    Date.now = () => clock;
    __setTestEmailSender(async () => { calls++; clock += 60000; return { success: false, error: 'PROVIDER_503' }; });
    const url = `${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2020-10-25T09:00:00Z`;
    const options = { method: 'POST', headers: { 'x-reminder-scheduler-secret': validTestSecret } };
    try {
      assert.equal((await fetch(url, options)).status, 200);
      const first = mockDb.getDoc(REMINDER_DELIVERIES_COL, `${uid}_email_2020-10-25`);
      assert.equal(first.claimedAtMs, start);
      assert.equal(first.firstAttemptAtMs, start);
      assert.equal(first.lastAttemptAtMs, start + 60000);
      clock = start + 15 * 60000;
      assert.equal((await fetch(url, options)).status, 200);
      assert.equal(calls, 1, 'only 14 minutes elapsed since failure');
      clock = start + 16 * 60000;
      assert.equal((await fetch(url, options)).status, 200);
      assert.equal(calls, 2);
    } finally { Date.now = realNow; }
  });

  await t.test('Lease expiring during a claim read prevents actual email dispatch despite a calendar override', async () => {
    mockDb.reset();
    const uid = 'expired-dispatch-user';
    mockAuth.onGetUser = id => ({ uid: id, email: `${id}@example.com`, emailVerified: true, disabled: false } as any);
    mockDb.seed(REMINDER_SETTINGS_COL, uid, { userId: uid, emailEnabled: true, pushEnabled: false, timezone: 'UTC' });
    mockDb.seed(USERS_COL, uid, { uid, birthYear: '1990', birthMonth: '10', birthDay: '25' });
    const originalCollection = mockDb.collection.bind(mockDb);
    const realNow = Date.now;
    let clock = realNow();
    let reads = 0;
    let sends = 0;
    Date.now = () => clock;
    mockDb.collection = ((name: string) => {
      const collection = originalCollection(name);
      if (name !== REMINDER_DELIVERIES_COL) return collection;
      const originalDoc = collection.doc.bind(collection);
      collection.doc = ((id: string) => {
        const ref = originalDoc(id);
        const originalGet = ref.get.bind(ref);
        ref.get = async () => { if (++reads === 2) clock += REMINDER_CLAIM_LEASE_MS + 1; return originalGet(); };
        return ref;
      }) as any;
      return collection;
    }) as any;
    __setTestEmailSender(async () => { sends++; return { success: true }; });
    try {
      const response = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2020-10-25T09:00:00Z`, {
        method: 'POST', headers: { 'x-reminder-scheduler-secret': validTestSecret }
      });
      assert.equal(response.status, 200);
      assert.ok(reads >= 2);
      assert.equal(sends, 0);
    } finally { Date.now = realNow; mockDb.collection = originalCollection; }
  });

  await t.test('Lost email claim ownership skips email only and still dispatches push', async () => {
    mockDb.reset();
    const uid = 'lost-email-claim';
    mockAuth.onGetUser = id => ({ uid: id, email: `${id}@example.com`, emailVerified: true, disabled: false } as any);
    mockDb.seed(REMINDER_SETTINGS_COL, uid, { userId: uid, emailEnabled: true, pushEnabled: true, timezone: 'UTC' });
    mockDb.seed(USERS_COL, uid, { uid, birthYear: '1990', birthMonth: '10', birthDay: '25' });
    mockDb.seed(PUSH_SUBSCRIPTIONS_COL, 'lost-claim-sub', { userId: uid, subscription: { endpoint: 'https://example.com', keys: { auth: 'test', p256dh: 'test' } } });
    const originalCollection = mockDb.collection.bind(mockDb);
    let emails = 0;
    let pushes = 0;
    let reads = 0;
    mockDb.collection = ((name: string) => {
      const collection = originalCollection(name);
      if (name !== REMINDER_DELIVERIES_COL) return collection;
      const originalDoc = collection.doc.bind(collection);
      collection.doc = ((id: string) => {
        const ref = originalDoc(id);
        if (id !== `${uid}_email_2026-10-25`) return ref;
        const originalGet = ref.get.bind(ref);
        ref.get = async () => {
          if (++reads === 2) {
            const claimed = mockDb.getDoc(REMINDER_DELIVERIES_COL, id);
            mockDb.seed(REMINDER_DELIVERIES_COL, id, { ...claimed, claimId: 'replacement-worker' });
          }
          return originalGet();
        };
        return ref;
      }) as any;
      return collection;
    }) as any;
    __setTestEmailSender(async () => { emails++; return { success: true }; });
    __setTestPushSender(async () => { pushes++; return { success: true }; });
    try {
      const response = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`, {
        method: 'POST', headers: { 'x-reminder-scheduler-secret': validTestSecret }
      });
      assert.equal(response.status, 200);
      assert.equal(emails, 0);
      assert.equal(pushes, 1);
      assert.equal(mockDb.getDoc(REMINDER_DELIVERIES_COL, `${uid}_email_2026-10-25`).claimId, 'replacement-worker');
      assert.equal(mockDb.getDoc(REMINDER_DELIVERIES_COL, `${uid}_push_2026-10-25`).status, 'success');
    } finally {
      mockDb.collection = originalCollection;
      __setTestEmailSender(null);
      __setTestPushSender(null);
    }
  });

  await t.test('A user database error is logged without PII and does not stop later users', async () => {
    mockDb.reset();
    mockAuth.onGetUser = id => ({ uid: id, email: `${id}@example.com`, emailVerified: true, disabled: false } as any);
    for (const uid of ['broken-user', 'healthy-user']) {
      mockDb.seed(REMINDER_SETTINGS_COL, uid, { userId: uid, emailEnabled: true, pushEnabled: false, timezone: 'UTC' });
      mockDb.seed(USERS_COL, uid, { uid, birthYear: '1990', birthMonth: '10', birthDay: '25' });
    }
    const originalCollection = mockDb.collection.bind(mockDb);
    const originalError = console.error;
    const logs: unknown[][] = [];
    const recipients: string[] = [];
    mockDb.collection = ((name: string) => {
      const collection = originalCollection(name);
      if (name !== REMINDER_SETTINGS_COL) return collection;
      const originalDoc = collection.doc.bind(collection);
      collection.doc = ((id: string) => {
        const ref = originalDoc(id);
        if (id === 'broken-user') ref.get = async () => { throw new Error('private-person@example.com broken-user'); };
        return ref;
      }) as any;
      return collection;
    }) as any;
    console.error = (...args) => { logs.push(args); };
    __setTestEmailSender(async recipient => { recipients.push(recipient); return { success: true }; });
    try {
      const response = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-25T09:00:00Z`, {
        method: 'POST', headers: { 'x-reminder-scheduler-secret': validTestSecret }
      });
      assert.equal(response.status, 200);
      assert.deepEqual(recipients, ['healthy-user@example.com']);
      assert.deepEqual(logs, [['[reminders] User processing failed; skipping user']]);
      const result = await response.json();
      assert.equal(result.processedCount, 1);
      assert.equal(result.emailsSent, 1);
      assert.equal(mockDb.getDoc(REMINDER_DELIVERIES_COL, 'healthy-user_email_2026-10-25').status, 'success');
    } finally {
      mockDb.collection = originalCollection;
      console.error = originalError;
      __setTestEmailSender(null);
    }
  });

  await t.test('User outside the 09:00 window is skipped without Auth/deletion reads', async () => {
    mockDb.reset();
    const uid = 'outside-window';
    mockDb.seed(REMINDER_SETTINGS_COL, uid, { userId: uid, emailEnabled: true, timezone: 'UTC' });
    let authCalled = false;
    let deleteRead = false;
    const originalGetUser = mockAuth.getUser;
    mockAuth.getUser = async (id: string) => { authCalled = true; return originalGetUser(id); };
    const originalCollection = mockDb.collection.bind(mockDb);
    mockDb.collection = ((name: string) => {
      const col = originalCollection(name);
      if (name === ACCOUNT_DELETIONS_COL) {
        const originalDoc = col.doc.bind(col);
        col.doc = ((id: string) => {
          const ref = originalDoc(id);
          const originalGet = ref.get.bind(ref);
          ref.get = async () => { deleteRead = true; return originalGet(); };
          return ref;
        }) as any;
      }
      return col;
    }) as any;
    try {
      const response = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=false&referenceDate=2026-10-26T08:00:00Z`, {
        method: 'POST', headers: { 'x-reminder-scheduler-secret': validTestSecret }
      });
      assert.equal(response.status, 200);
      assert.equal(authCalled, false);
      assert.equal(deleteRead, false);
      assert.equal((await response.json()).processedCount, 1);
    } finally { mockAuth.getUser = originalGetUser; mockDb.collection = originalCollection; }
  });

  await t.test('User inside 09:00 window dispatches normally', async () => {
    mockDb.reset();
    const uid = 'inside-window';
    mockAuth.onGetUser = id => ({ uid: id, email: `${id}@example.com`, emailVerified: true, disabled: false } as any);
    mockDb.seed(REMINDER_SETTINGS_COL, uid, { userId: uid, emailEnabled: true, timezone: 'UTC' });
    mockDb.seed(USERS_COL, uid, { uid, birthYear: '1990', birthMonth: '10', birthDay: '26' });
    let emails = 0;
    __setTestEmailSender(async () => { emails++; return { success: true }; });
    try {
      const response = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=false&referenceDate=2026-10-26T09:00:00Z`, {
        method: 'POST', headers: { 'x-reminder-scheduler-secret': validTestSecret }
      });
      assert.equal(response.status, 200);
      assert.equal(emails, 1);
    } finally { __setTestEmailSender(null); }
  });

  await t.test('Consent removal between email and push still stops push', async () => {
    mockDb.reset();
    const uid = 'consent-removal';
    mockAuth.onGetUser = id => ({ uid: id, email: `${id}@example.com`, emailVerified: true, disabled: false } as any);
    mockDb.seed(REMINDER_SETTINGS_COL, uid, { userId: uid, emailEnabled: true, pushEnabled: true, timezone: 'UTC' });
    mockDb.seed(USERS_COL, uid, { uid, birthYear: '1990', birthMonth: '10', birthDay: '26' });
    mockDb.seed(PUSH_SUBSCRIPTIONS_COL, 'sub', { userId: uid, subscription: { endpoint: 'https://example.com', keys: { auth: 'test', p256dh: 'test' } } });
    let emails = 0;
    let pushes = 0;
    __setTestEmailSender(async () => {
      // Remove push consent during email dispatch
      mockDb.seed(REMINDER_SETTINGS_COL, uid, { userId: uid, emailEnabled: true, pushEnabled: false, timezone: 'UTC' });
      emails++; return { success: true };
    });
    __setTestPushSender(async () => { pushes++; return { success: true }; });
    try {
      const response = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=true&referenceDate=2026-10-26T09:00:00Z`, {
        method: 'POST', headers: { 'x-reminder-scheduler-secret': validTestSecret }
      });
      assert.equal(response.status, 200);
      assert.equal(emails, 1);
      assert.equal(pushes, 0);
    } finally { __setTestEmailSender(null); __setTestPushSender(null); }
  });

  await t.test('Invalid timezone falls through', async () => {
    mockDb.reset();
    const uid = 'invalid-timezone';
    mockAuth.onGetUser = id => ({ uid: id, email: `${id}@example.com`, emailVerified: true, disabled: false } as any);
    mockDb.seed(REMINDER_SETTINGS_COL, uid, { userId: uid, emailEnabled: true, timezone: 'Invalid/Zone' });
    mockDb.seed(USERS_COL, uid, { uid, birthYear: '1990', birthMonth: '10', birthDay: '26' });
    let emails = 0;
    __setTestEmailSender(async () => { emails++; return { success: true }; });
    try {
      const response = await fetch(`${baseUrl}/api/reminders/process?ignoreTimeWindow=false&referenceDate=2026-10-26T09:00:00Z`, {
        method: 'POST', headers: { 'x-reminder-scheduler-secret': validTestSecret }
      });
      assert.equal(response.status, 200);
      assert.equal(emails, 1);
    } finally { __setTestEmailSender(null); }
  });

});
