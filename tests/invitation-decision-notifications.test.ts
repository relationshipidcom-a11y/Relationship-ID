import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createApp,
  __setTestDeps,
  __setTestAppCheck,
  __setTestEmailSender,
  __setTestPushSender,
  CURRENT_LEGAL_VERSION,
  rateLimitMap
} from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

const SAUDI_P1_PHONE = '+966500000001';
const SAUDI_P2_PHONE = '+966500000002';

function authHeaders(token = 'token_p2') {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Firebase-AppCheck': 'valid-token'
  };
}

function validPartner2() {
  return {
    fullName: 'Sara Al-Otaibi',
    fullNameEn: 'Sara Al-Otaibi',
    birthDay: '15',
    birthMonth: '05',
    birthYear: '1995',
    email: 'p2@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '0500000002',
    phoneE164: SAUDI_P2_PHONE,
    whatsappCountry: 'SA +966',
    whatsappNumber: '0500000002',
    whatsappE164: SAUDI_P2_PHONE
  };
}

function seedBaseline(mockDb: any, options: { p1Email?: string; p1Uid?: string } = {}) {
  rateLimitMap.clear();
  mockDb.reset();

  const p1Uid = options.p1Uid || 'uid_p1';
  const p1Email = options.p1Email !== undefined ? options.p1Email : 'p1@example.com';

  const p1 = {
    fullName: 'Fahad Al-Harbi',
    fullNameEn: 'Fahad Al-Harbi',
    birthDay: '10',
    birthMonth: '04',
    birthYear: '1992',
    email: p1Email,
    phoneCountry: 'SA +966',
    phoneNumber: '0500000001',
    phoneE164: SAUDI_P1_PHONE,
    whatsappCountry: 'SA +966',
    whatsappNumber: '0500000001',
    whatsappE164: SAUDI_P1_PHONE
  };

  const p1UserData: any = {
    uid: p1Uid,
    phoneE164: SAUDI_P1_PHONE,
    whatsappTrusted: true,
    whatsappE164: SAUDI_P1_PHONE,
    profile: p1
  };
  if (p1Email) {
    p1UserData.email = p1Email;
  }

  mockDb.seed('users', p1Uid, p1UserData);

  mockDb.seed('users', 'uid_p2', {
    uid: 'uid_p2',
    email: 'p2@example.com',
    phoneE164: SAUDI_P2_PHONE,
    whatsappTrusted: true,
    whatsappE164: SAUDI_P2_PHONE
  });

  mockDb.seed('relationships', 'rel_1', {
    id: 'rel_1',
    recordNumber: '123456',
    type: 'marriage',
    status: 'pending_partner',
    p1Uid,
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
    updatedAt: '2024-01-01T00:00:00Z',
    inviteId: 'inv_1'
  });

  mockDb.seed('invitations', 'inv_1', {
    id: 'inv_1',
    recordId: 'rel_1',
    p1Uid,
    p2Uid: null,
    inviterName: 'Fahad Al-Harbi',
    relationshipType: 'marriage',
    partner2Name: 'Sara Al-Otaibi',
    partner2Email: 'p2@example.com',
    partner2Phone: '0500000002',
    partner2PhoneCountry: 'SA +966',
    partner2Whatsapp: '0500000002',
    partner2WhatsappCountry: 'SA +966',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00Z',
    expiresAt: '2099-01-01T00:00:00Z'
  });
}

test('Invitation decision notifications suite', async (t) => {
  const mockDb = createMockFirestore();
  const mockAuth = createMockAuth();
  __setTestDeps(mockDb, mockAuth);
  __setTestAppCheck({
    verifyToken: async () => ({ token: 'valid-test-app-check' })
  });

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

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  t.after(async () => {
    __setTestEmailSender(null as any);
    __setTestPushSender(null as any);
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // 1. Accept -> one notification doc ${inviteId}_accepted, userId = p1Uid, type invitation_accepted, read false, exact AR/EN texts.
  await t.test('1. Accept creates notification doc inv_1_accepted with correct fields and exact texts', async () => {
    seedBaseline(mockDb);
    __setTestEmailSender(async () => ({ success: true }));
    __setTestPushSender(async () => ({ success: true }));

    const res = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ partner2: validPartner2(), acceptedLegalVersion: CURRENT_LEGAL_VERSION })
    });

    assert.equal(res.status, 200);
    const notif = mockDb.getDoc('notifications', 'inv_1_accepted');
    assert.ok(notif, 'Notification doc inv_1_accepted must exist');
    assert.equal(notif.id, 'inv_1_accepted');
    assert.equal(notif.userId, 'uid_p1');
    assert.equal(notif.type, 'invitation_accepted');
    assert.equal(notif.recordId, 'rel_1');
    assert.equal(notif.senderName, 'Sara Al-Otaibi');
    assert.equal(notif.read, false);
    assert.equal(notif.messageAr, 'تم قبول دعوتك من Sara Al-Otaibi');
    assert.equal(notif.messageEn, 'Sara Al-Otaibi accepted your invitation');
    assert.equal(notif.secondaryAr, 'يمكنك الآن مراجعة سجل الارتباط.');
    assert.equal(notif.secondaryEn, 'You can now review your relationship record.');
    assert.ok(notif.createdAt, 'createdAt must be defined');
  });

  // 2. Decline -> one notification doc ${inviteId}_declined, exact AR/EN texts, no secondary fields.
  await t.test('2. Decline creates notification doc inv_1_declined with exact texts and no secondary fields', async () => {
    seedBaseline(mockDb);
    __setTestEmailSender(async () => ({ success: true }));
    __setTestPushSender(async () => ({ success: true }));

    const res = await fetch(`${baseUrl}/api/invitations/inv_1/decline`, {
      method: 'POST',
      headers: authHeaders()
    });

    assert.equal(res.status, 200);
    const notif = mockDb.getDoc('notifications', 'inv_1_declined');
    assert.ok(notif, 'Notification doc inv_1_declined must exist');
    assert.equal(notif.id, 'inv_1_declined');
    assert.equal(notif.userId, 'uid_p1');
    assert.equal(notif.type, 'invitation_declined');
    assert.equal(notif.recordId, 'rel_1');
    assert.equal(notif.senderName, 'Sara Al-Otaibi');
    assert.equal(notif.read, false);
    assert.equal(notif.messageAr, 'تم رفض دعوتك من Sara Al-Otaibi');
    assert.equal(notif.messageEn, 'Sara Al-Otaibi declined your invitation');
    assert.equal(notif.secondaryAr, undefined, 'secondaryAr must not be present on decline');
    assert.equal(notif.secondaryEn, undefined, 'secondaryEn must not be present on decline');
  });

  // 3. Decline with block -> notification text contains no 'block' / 'حظر'.
  await t.test('3. Decline with block creates notification text that never mentions block or حظر', async () => {
    seedBaseline(mockDb);
    __setTestEmailSender(async () => ({ success: true }));
    __setTestPushSender(async () => ({ success: true }));

    const res = await fetch(`${baseUrl}/api/invitations/inv_1/decline`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ block: true })
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as any;
    assert.equal(json.blocked, true);

    const notif = mockDb.getDoc('notifications', 'inv_1_declined');
    assert.ok(notif, 'Notification doc exists');
    assert.ok(!notif.messageAr.toLowerCase().includes('حظر'), 'messageAr must not mention حظر');
    assert.ok(!notif.messageAr.toLowerCase().includes('block'), 'messageAr must not mention block');
    assert.ok(!notif.messageEn.toLowerCase().includes('block'), 'messageEn must not mention block');
    assert.ok(!notif.messageEn.toLowerCase().includes('حظر'), 'messageEn must not mention حظر');
  });

  // 4. Email sender called once per decision, to P1's email, idempotency key = notification id; body has no P2 email/phone.
  await t.test('4. Email sender called once per decision with idempotency key, correct recipient and no P2 contacts in body', async () => {
    seedBaseline(mockDb);
    const emailCalls: Array<{ toEmail: string; subject: string; textBody: string; idempotencyKey?: string }> = [];
    __setTestEmailSender(async (toEmail, subject, textBody, idempotencyKey) => {
      emailCalls.push({ toEmail, subject, textBody, idempotencyKey });
      return { success: true };
    });
    __setTestPushSender(async () => ({ success: true }));

    // Accept test
    const resAccept = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ partner2: validPartner2(), acceptedLegalVersion: CURRENT_LEGAL_VERSION })
    });
    assert.equal(resAccept.status, 200);

    assert.equal(emailCalls.length, 1);
    const acceptCall = emailCalls[0];
    assert.equal(acceptCall.toEmail, 'p1@example.com');
    assert.equal(acceptCall.idempotencyKey, 'inv_1_accepted');
    assert.equal(acceptCall.subject, 'Relationship ID — تم قبول دعوتك | Your invitation was accepted');
    assert.ok(acceptCall.textBody.includes('تم قبول دعوتك من Sara Al-Otaibi'));
    assert.ok(acceptCall.textBody.includes('Sara Al-Otaibi accepted your invitation'));
    assert.ok(acceptCall.textBody.includes('https://www.relationshipid.org'));
    assert.ok(!acceptCall.textBody.includes('p2@example.com'), 'Email body must not contain P2 email');
    assert.ok(!acceptCall.textBody.includes('0500000002'), 'Email body must not contain P2 local phone');
    assert.ok(!acceptCall.textBody.includes(SAUDI_P2_PHONE), 'Email body must not contain P2 phone');
    assert.ok(!acceptCall.textBody.includes('uid_p2'), 'Email body must not contain P2 UID');

    // Decline test
    seedBaseline(mockDb);
    emailCalls.length = 0;
    const resDecline = await fetch(`${baseUrl}/api/invitations/inv_1/decline`, {
      method: 'POST',
      headers: authHeaders()
    });
    assert.equal(resDecline.status, 200);

    assert.equal(emailCalls.length, 1);
    const declineCall = emailCalls[0];
    assert.equal(declineCall.toEmail, 'p1@example.com');
    assert.equal(declineCall.idempotencyKey, 'inv_1_declined');
    assert.equal(declineCall.subject, 'Relationship ID — تم رفض دعوتك | Your invitation was declined');
    assert.ok(declineCall.textBody.includes('تم رفض دعوتك من Sara Al-Otaibi'));
    assert.ok(declineCall.textBody.includes('Sara Al-Otaibi declined your invitation'));
    assert.ok(!declineCall.textBody.includes('p2@example.com'), 'Email body must not contain P2 email');
    assert.ok(!declineCall.textBody.includes('0500000002'), 'Email body must not contain P2 local phone');
    assert.ok(!declineCall.textBody.includes(SAUDI_P2_PHONE), 'Email body must not contain P2 phone');
    assert.ok(!declineCall.textBody.includes('uid_p2'), 'Email body must not contain P2 UID');
  });

  // 5. Push sender called once per P1 subscription with the exact generic payload; payload does NOT contain partner2Name.
  await t.test('5. Push sender called with exact generic payload without partner2Name for each P1 subscription', async () => {
    seedBaseline(mockDb);
    mockDb.seed('push_subscriptions', 'sub_p1_a', {
      userId: 'uid_p1',
      subscription: { endpoint: 'https://push.example.com/sub_p1_a', keys: { p256dh: 'k1', auth: 'a1' } }
    });
    mockDb.seed('push_subscriptions', 'sub_p1_b', {
      userId: 'uid_p1',
      subscription: { endpoint: 'https://push.example.com/sub_p1_b', keys: { p256dh: 'k2', auth: 'a2' } }
    });
    mockDb.seed('push_subscriptions', 'sub_other', {
      userId: 'uid_other',
      subscription: { endpoint: 'https://push.example.com/sub_other', keys: { p256dh: 'k3', auth: 'a3' } }
    });

    const pushCalls: Array<{ sub: any; payload: any }> = [];
    __setTestEmailSender(async () => ({ success: true }));
    __setTestPushSender(async (sub, payload) => {
      pushCalls.push({ sub, payload });
      return { success: true };
    });

    const res = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ partner2: validPartner2(), acceptedLegalVersion: CURRENT_LEGAL_VERSION })
    });
    assert.equal(res.status, 200);

    assert.equal(pushCalls.length, 2, 'Must call push sender exactly twice (once per P1 subscription)');
    for (const call of pushCalls) {
      assert.deepEqual(call.payload, {
        title: 'Relationship ID',
        body: 'لديك تحديث على دعوتك. افتح التطبيق للاطلاع عليه.\nYour invitation has an update. Open the app to view it.',
        data: { url: '/' }
      });
      assert.ok(!JSON.stringify(call.payload).includes('Sara Al-Otaibi'), 'Push payload must not contain partner2Name');
    }
  });

  // 6. Push returns {expired:true} -> that subscription doc is deleted.
  await t.test('6. Push returning expired: true causes that subscription doc to be deleted', async () => {
    seedBaseline(mockDb);
    mockDb.seed('push_subscriptions', 'sub_expired', {
      userId: 'uid_p1',
      subscription: { endpoint: 'https://push.example.com/sub_expired', keys: { p256dh: 'k', auth: 'a' } }
    });

    __setTestEmailSender(async () => ({ success: true }));
    __setTestPushSender(async () => ({ success: false, expired: true }));

    const res = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ partner2: validPartner2(), acceptedLegalVersion: CURRENT_LEGAL_VERSION })
    });
    assert.equal(res.status, 200);

    const docAfter = mockDb.getDoc('push_subscriptions', 'sub_expired');
    assert.equal(docAfter, undefined, 'Expired subscription doc must be deleted');
  });

  // 7. Email returns {success:false} AND push returns {success:false} -> accept still returns 200 with the same body as before; console.error called with 'P1_DECISION_EMAIL_FAILED' and 'P1_DECISION_PUSH_FAILED'.
  await t.test('7. Delivery failures do not disrupt 200 accept response, and log P1_DECISION_EMAIL_FAILED and P1_DECISION_PUSH_FAILED', async () => {
    seedBaseline(mockDb);
    mockDb.seed('push_subscriptions', 'sub_fail', {
      userId: 'uid_p1',
      subscription: { endpoint: 'https://push.example.com/sub_fail', keys: { p256dh: 'k', auth: 'a' } }
    });

    __setTestEmailSender(async () => ({ success: false, error: 'RESEND_TIMEOUT' }));
    __setTestPushSender(async () => ({ success: false, error: 'WEB_PUSH_ERROR' }));

    const errorsLogged: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      errorsLogged.push(args.map(String).join(' '));
      origError(...args);
    };

    try {
      const res = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ partner2: validPartner2(), acceptedLegalVersion: CURRENT_LEGAL_VERSION })
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);
      assert.equal(data.invitation.status, 'accepted');
      assert.equal(data.record.status, 'active');

      const emailFailedLogged = errorsLogged.some((msg) => msg.includes('P1_DECISION_EMAIL_FAILED'));
      const pushFailedLogged = errorsLogged.some((msg) => msg.includes('P1_DECISION_PUSH_FAILED'));
      assert.ok(emailFailedLogged, 'Must log P1_DECISION_EMAIL_FAILED');
      assert.ok(pushFailedLogged, 'Must log P1_DECISION_PUSH_FAILED');
    } finally {
      console.error = origError;
    }
  });

  // 8. P1 user doc without email and no subscriptions -> no sends, 200, warn/info logged.
  await t.test('8. P1 user doc without email and no subscriptions results in no sends, 200, and logged warn/info', async () => {
    seedBaseline(mockDb, { p1Email: '' });

    let emailSent = false;
    let pushSent = false;
    __setTestEmailSender(async () => {
      emailSent = true;
      return { success: true };
    });
    __setTestPushSender(async () => {
      pushSent = true;
      return { success: true };
    });

    const warnsLogged: string[] = [];
    const infosLogged: string[] = [];
    const origWarn = console.warn;
    const origInfo = console.info;
    console.warn = (...args: any[]) => {
      warnsLogged.push(args.map(String).join(' '));
      origWarn(...args);
    };
    console.info = (...args: any[]) => {
      infosLogged.push(args.map(String).join(' '));
      origInfo(...args);
    };

    try {
      const res = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ partner2: validPartner2(), acceptedLegalVersion: CURRENT_LEGAL_VERSION })
      });

      assert.equal(res.status, 200);
      assert.equal(emailSent, false, 'Email must not be sent when P1 email is missing');
      assert.equal(pushSent, false, 'Push must not be sent when no subscriptions exist');

      const skippedLogged = warnsLogged.some((msg) => msg.includes('P1_DECISION_EMAIL_SKIPPED'));
      const noSubLogged = infosLogged.some((msg) => msg.includes('P1_DECISION_PUSH_NO_SUBSCRIPTION'));
      assert.ok(skippedLogged, 'Must log P1_DECISION_EMAIL_SKIPPED');
      assert.ok(noSubLogged, 'Must log P1_DECISION_PUSH_NO_SUBSCRIPTION');
    } finally {
      console.warn = origWarn;
      console.info = origInfo;
    }
  });

  // 9. Retrying accept on the same invite does not create a second notification doc.
  await t.test('9. Retrying accept on the same invite does not create a second notification doc', async () => {
    seedBaseline(mockDb);
    __setTestEmailSender(async () => ({ success: true }));
    __setTestPushSender(async () => ({ success: true }));

    const res1 = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ partner2: validPartner2(), acceptedLegalVersion: CURRENT_LEGAL_VERSION })
    });
    assert.equal(res1.status, 200);

    // Second accept attempt
    const res2 = await fetch(`${baseUrl}/api/invitations/inv_1/accept`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ partner2: validPartner2(), acceptedLegalVersion: CURRENT_LEGAL_VERSION })
    });
    assert.equal(res2.status, 409);

    const notifs = mockDb.store.get('notifications');
    const acceptedNotifs = Array.from(notifs?.entries() || []).filter(([k]) => k.startsWith('inv_1_accepted'));
    assert.equal(acceptedNotifs.length, 1, 'Exactly one notification doc must exist for inv_1_accepted');
  });
});
