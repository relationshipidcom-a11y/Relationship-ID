process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createApp,
  __setTestDeps,
  CURRENT_LEGAL_VERSION
} from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';
import {
  getDisplaySocialAccounts,
  validateSocialAccounts,
  isSafeSocialHandleOrUrl
} from '../src/utils/social';
import type { SocialAccount } from '../src/types';

const P1_PHONE = '+966500000001';
const P2_PHONE = '+966500000002';

function samplePartner1() {
  return {
    fullName: 'Partner One',
    fullNameEn: 'Partner One',
    birthDay: '10',
    birthMonth: '04',
    birthYear: '1992',
    email: 'p1@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '500000001',
    phoneE164: P1_PHONE,
    whatsappCountry: 'SA +966',
    whatsappNumber: '500000001',
    whatsappE164: P1_PHONE,
    socialAccounts: [
      { platform: 'instagram', handle: 'p1_insta' },
      { platform: 'x', handle: 'p1_twitter' }
    ] as SocialAccount[]
  };
}

function samplePartner2() {
  return {
    fullName: 'Partner Two',
    fullNameEn: 'Partner Two',
    birthDay: '15',
    birthMonth: '08',
    birthYear: '1994',
    email: 'p2@example.com',
    phoneCountry: 'SA +966',
    phoneNumber: '500000002',
    phoneE164: P2_PHONE,
    whatsappCountry: 'SA +966',
    whatsappNumber: '500000002',
    whatsappE164: P2_PHONE,
    socialAccounts: [
      { platform: 'tiktok', handle: 'p2_tiktok' },
      { platform: 'snapchat', handle: 'p2_snap' }
    ] as SocialAccount[]
  };
}

test('Multiple Social Accounts Suite: P1, P2, Persistence, Editing, Validation & Privacy', async (t) => {
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

  const setupAuth = () => {
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
  };

  await t.test('1. P1 can register and save two social accounts; legacy socialHandle is populated for backwards-compat', async () => {
    mockDb.reset();
    setupAuth();

    const p1Payload = {
      partner1: samplePartner1(),
      type: 'dating',
      startDate: '2023-01-01',
      acceptedLegalVersion: CURRENT_LEGAL_VERSION
    };

    const res = await fetch(`${baseUrl}/api/relationship`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(p1Payload)
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.record);
    assert.equal(data.record.partner1.socialAccounts?.length, 2);
    assert.equal(data.record.partner1.socialAccounts[0].platform, 'instagram');
    assert.equal(data.record.partner1.socialAccounts[0].handle, 'p1_insta');
    assert.equal(data.record.partner1.socialAccounts[1].platform, 'x');
    assert.equal(data.record.partner1.socialAccounts[1].handle, 'p1_twitter');
  });

  await t.test('2. Full relationship reload returns P1 and P2 multiple social accounts', async () => {
    mockDb.reset();
    setupAuth();

    const recordId = 'rec_multi_social_1';
    const inviteId = 'inv_multi_social_1';

    await mockDb.collection('users').doc('uid_p1').set({
      activeRecordId: recordId,
      phoneE164: P1_PHONE,
      legalConsentVersion: CURRENT_LEGAL_VERSION
    });
    await mockDb.collection('users').doc('uid_p2').set({
      activeRecordId: recordId,
      phoneE164: P2_PHONE,
      legalConsentVersion: CURRENT_LEGAL_VERSION
    });

    await mockDb.collection('relationships').doc(recordId).set({
      id: recordId,
      status: 'pending_partner',
      type: 'dating',
      startDate: '2023-01-01',
      startDateAr: '1 يناير 2023',
      startDateIso: '2023-01-01',
      p1Uid: 'uid_p1',
      p2Uid: null,
      inviteId,
      partner1: samplePartner1(),
      partner2: {
        fullName: 'Partner Two',
        email: 'p2@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '500000002',
        phoneE164: P2_PHONE,
        birthDay: '',
        birthMonth: '',
        birthYear: ''
      },
      settings: { showSocialHandles: true, showContactDetails: false, showQrMatrix: true },
      createdAt: new Date().toISOString()
    });

    await mockDb.collection('invitations').doc(inviteId).set({
      id: inviteId,
      recordId,
      inviterName: 'Partner One',
      partner2Name: 'Partner Two',
      partner2Email: 'p2@example.com',
      partner2Phone: P2_PHONE,
      partner2PhoneCountry: 'SA +966',
      relationshipType: 'dating',
      startDate: '2023-01-01',
      startDateAr: '1 يناير 2023',
      startDateIso: '2023-01-01',
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      reminderCount: 0,
      p1Uid: 'uid_p1'
    });

    // P2 accepts with 2 social accounts
    const p2AcceptRes = await fetch(`${baseUrl}/api/invitations/${inviteId}/accept`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p2',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner2: samplePartner2(),
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(p2AcceptRes.status, 200);

    // Now reload relationship as P1
    const getResP1 = await fetch(`${baseUrl}/api/relationship`, {
      headers: { Authorization: 'Bearer token_p1' }
    });
    assert.equal(getResP1.status, 200);
    const dataP1 = await getResP1.json();
    assert.equal(dataP1.record.partner1.socialAccounts.length, 2);
    assert.equal(dataP1.record.partner2.socialAccounts.length, 2);
    assert.equal(dataP1.record.partner2.socialAccounts[0].platform, 'tiktok');
    assert.equal(dataP1.record.partner2.socialAccounts[0].handle, 'p2_tiktok');
    assert.equal(dataP1.record.partner2.socialAccounts[1].platform, 'snapchat');
    assert.equal(dataP1.record.partner2.socialAccounts[1].handle, 'p2_snap');

    // Reload relationship as P2
    const getResP2 = await fetch(`${baseUrl}/api/relationship`, {
      headers: { Authorization: 'Bearer token_p2' }
    });
    assert.equal(getResP2.status, 200);
    const dataP2 = await getResP2.json();
    assert.equal(dataP2.record.partner1.socialAccounts.length, 2);
    assert.equal(dataP2.record.partner2.socialAccounts.length, 2);
  });

  await t.test('3. Editing personal info updates existing accounts and can remove one account', async () => {
    // Current P2 has 2 accounts: tiktok and snapchat.
    // P2 edits to remove snapchat and change tiktok to youtube
    const editRes = await fetch(`${baseUrl}/api/profile/me`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token_p2',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        socialAccounts: [
          { platform: 'youtube', handle: 'p2_channel' }
        ]
      })
    });
    assert.equal(editRes.status, 200);
    const editData = await editRes.json();
    assert.equal(editData.record.partner2.socialAccounts.length, 1);
    assert.equal(editData.record.partner2.socialAccounts[0].platform, 'youtube');
    assert.equal(editData.record.partner2.socialAccounts[0].handle, 'p2_channel');

    // Verify P1 still has their 2 accounts intact
    assert.equal(editData.record.partner1.socialAccounts.length, 2);
  });

  await t.test('4. Unrelated profile update does NOT erase existing social accounts', async () => {
    // P2 updates only fullNameEn without providing socialAccounts
    const updateNameRes = await fetch(`${baseUrl}/api/profile/me`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token_p2',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fullNameEn: 'Partner Two Updated'
      })
    });
    assert.equal(updateNameRes.status, 200);
    const data = await updateNameRes.json();
    assert.equal(data.record.partner2.fullNameEn, 'Partner Two Updated');
    // Ensure socialAccounts was NOT erased!
    assert.equal(data.record.partner2.socialAccounts.length, 1);
    assert.equal(data.record.partner2.socialAccounts[0].platform, 'youtube');
    assert.equal(data.record.partner2.socialAccounts[0].handle, 'p2_channel');
  });

  await t.test('5. Rejecting unsafe input on registration and personal info update', async () => {
    // Unsafe handle on registration
    const unsafeRegistration = await fetch(`${baseUrl}/api/relationship`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_p1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner1: {
          ...samplePartner1(),
          socialAccounts: [
            { platform: 'instagram', handle: 'javascript:alert(1)' }
          ]
        },
        type: 'dating',
        startDate: '2023-01-01',
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(unsafeRegistration.status, 400);
    const regErr = await unsafeRegistration.json();
    assert.equal(regErr.error, 'UNSAFE_INPUT');

    // Unsafe script tag on profile update
    const unsafeUpdate = await fetch(`${baseUrl}/api/profile/me`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token_p2',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        socialAccounts: [
          { platform: 'x', handle: '<script>alert(1)</script>' }
        ]
      })
    });
    assert.equal(unsafeUpdate.status, 400);
    const updateErr = await unsafeUpdate.json();
    assert.equal(updateErr.error, 'UNSAFE_INPUT');
  });

  await t.test('6. Rejecting invalid platform or exceeding 6 accounts limit', async () => {
    // Invalid platform
    const invalidPlatformRes = await fetch(`${baseUrl}/api/profile/me`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token_p2',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        socialAccounts: [
          { platform: 'unsupported_platform', handle: 'my_handle' }
        ]
      })
    });
    assert.equal(invalidPlatformRes.status, 400);
    const platformErr = await invalidPlatformRes.json();
    assert.equal(platformErr.error, 'INVALID_PLATFORM');

    // Exceeding 6 accounts
    const tooManyAccountsRes = await fetch(`${baseUrl}/api/profile/me`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token_p2',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        socialAccounts: [
          { platform: 'instagram', handle: 'acc1' },
          { platform: 'x', handle: 'acc2' },
          { platform: 'tiktok', handle: 'acc3' },
          { platform: 'facebook', handle: 'acc4' },
          { platform: 'snapchat', handle: 'acc5' },
          { platform: 'youtube', handle: 'acc6' },
          { platform: 'other', handle: 'acc7' } // 7th account
        ]
      })
    });
    assert.equal(tooManyAccountsRes.status, 400);
    const tooManyErr = await tooManyAccountsRes.json();
    assert.equal(tooManyErr.error, 'FIELD_TOO_LONG');
  });

  await t.test('7. Reading and displaying legacy records with only socialHandle', async () => {
    // Partner with legacy socialHandle only
    const legacyPartner = {
      fullName: 'Legacy User',
      socialHandle: 'classic_vintage_user'
    };

    const displayed = getDisplaySocialAccounts(legacyPartner);
    assert.equal(displayed.length, 1);
    assert.equal(displayed[0].platform, 'other');
    assert.equal(displayed[0].handle, 'classic_vintage_user');
    assert.equal(displayed[0].display, '@classic_vintage_user');
  });

  await t.test('8. Public certificate and invitation preview do NOT leak socialAccounts', async () => {
    // Retrieve public certificate
    const recDoc = await mockDb.collection('relationships').doc('rec_multi_social_1').get();
    const verificationRef = recDoc.data().verificationRef;

    if (verificationRef) {
      const publicCertRes = await fetch(`${baseUrl}/api/verify/${verificationRef}`);
      if (publicCertRes.status === 200) {
        const publicCert = await publicCertRes.json();
        assert.equal(publicCert.record?.socialAccounts, undefined);
        assert.equal(publicCert.record?.partner1?.socialAccounts, undefined);
        assert.equal(publicCert.record?.partner2?.socialAccounts, undefined);
      }
    }

    // Retrieve public preview of invitation
    const previewRes = await fetch(`${baseUrl}/api/invitations/inv_multi_social_1`);
    assert.equal(previewRes.status, 200);
    const preview = await previewRes.json();
    assert.equal(preview.invitation?.socialAccounts, undefined);
    assert.equal(preview.record, null);
  });
});
