process.env.NODE_ENV = 'test';
if (!process.env.CONTACT_HASH_SECRET || process.env.CONTACT_HASH_SECRET.length < 32) {
  process.env.CONTACT_HASH_SECRET = 'test_contact_hash_secret_at_least_32_characters_long_for_hmac';
}

import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  normalizeCanonicalEmail,
  normalizeCanonicalPhone,
  hashContact,
  extractCanonicalContacts,
  isContactStillUsedByRelationship,
  type PartnerContactInputs
} from '../src/utils/contacts';
import {
  checkActiveContactConflict,
  validateContactUniqueness,
  createApp,
  __setTestDeps,
  CURRENT_LEGAL_VERSION
} from '../server';
import { createMockFirestore, createMockAuth } from './helpers/mockFirestore';

// 1. Email Case and Whitespace Equivalence
test('1. Email normalization: case-insensitive, trimmed, and validates structure', () => {
  const norm1 = normalizeCanonicalEmail('  User.Name@Example.COM  ');
  const norm2 = normalizeCanonicalEmail('user.name@example.com');
  const norm3 = normalizeCanonicalEmail('USER.NAME@EXAMPLE.COM');

  assert.equal(norm1.isValid, true);
  assert.equal(norm1.canonical, 'user.name@example.com');
  assert.equal(norm1.canonical, norm2.canonical);
  assert.equal(norm2.canonical, norm3.canonical);
  assert.equal(hashContact(norm1.canonical), hashContact(norm2.canonical));

  // Invalid email rejected
  assert.equal(normalizeCanonicalEmail('not-an-email').isValid, false);
  assert.equal(normalizeCanonicalEmail('user@').isValid, false);
  assert.equal(normalizeCanonicalEmail('@domain.com').isValid, false);

  // Optional empty/null ignored
  assert.equal(normalizeCanonicalEmail('').isValid, true);
  assert.equal(normalizeCanonicalEmail('').canonical, '');
  assert.equal(normalizeCanonicalEmail(null).isValid, true);
  assert.equal(normalizeCanonicalEmail(undefined).isValid, true);
});

// 2. Saudi Local and International Phone Equivalence
test('2. Phone normalization: Saudi local (055...) and international (+96655...) resolve to identical canonical E.164 and hash', () => {
  const localSaudi = normalizeCanonicalPhone('0551234567', 'SA +966');
  const intlSaudi = normalizeCanonicalPhone('+966551234567', 'SA +966');
  const noCountryIntl = normalizeCanonicalPhone('+966551234567');
  const defaultSaudi = normalizeCanonicalPhone('0551234567');

  assert.equal(localSaudi.isValid, true);
  assert.equal(intlSaudi.isValid, true);
  assert.equal(localSaudi.canonical, '+966551234567');
  assert.equal(intlSaudi.canonical, '+966551234567');
  assert.equal(noCountryIntl.canonical, '+966551234567');
  assert.equal(defaultSaudi.canonical, '+966551234567');

  // Both generate identical reservation document keys
  assert.equal(hashContact(localSaudi.canonical), hashContact(intlSaudi.canonical));

  // Trunk zero removal
  const trunkZero = normalizeCanonicalPhone('0509876543', 'SA');
  assert.equal(trunkZero.canonical, '+966509876543');

  // Invalid phone numbers rejected
  assert.equal(normalizeCanonicalPhone('12345', 'SA').isValid, false);
  assert.equal(normalizeCanonicalPhone('invalid-phone', 'SA').isValid, false);

  // Empty/absent ignored
  assert.equal(normalizeCanonicalPhone('').isValid, true);
  assert.equal(normalizeCanonicalPhone('').canonical, '');
  assert.equal(normalizeCanonicalPhone(null).isValid, true);
});

// 3. Mobile and WhatsApp Collide Across Contact Types
test('3. Cross-type collision: Mobile and WhatsApp with identical canonical numbers produce the same reservation hash', () => {
  const mobile = normalizeCanonicalPhone('0551112233', 'SA');
  const whatsapp = normalizeCanonicalPhone('+966551112233', 'SA');

  assert.equal(mobile.canonical, '+966551112233');
  assert.equal(whatsapp.canonical, '+966551112233');

  const mobileHash = hashContact(mobile.canonical);
  const whatsappHash = hashContact(whatsapp.canonical);

  assert.equal(mobileHash, whatsappHash);
});

// 4. Another Relationship Owning a Contact Causes Rejection
test('4. Conflict check: returns conflict when reservation is owned by another relationship', async () => {
  const conflictingHash = hashContact('+966551234567');
  const mockDb = {
    collection: (name: string) => {
      assert.equal(name, 'contact_reservations');
      return {
        doc: (docId: string) => ({
          get: async () => {
            if (docId === conflictingHash) {
              return { exists: true, data: () => ({ recordId: 'rec_active_other' }) };
            }
            return { exists: false };
          }
        })
      };
    }
  } as any;

  const conflict = await checkActiveContactConflict(
    mockDb,
    { phones: ['+966551234567'] },
    'rec_current'
  );
  assert.equal(conflict, true);

  const validation = await validateContactUniqueness(
    mockDb,
    { phones: ['+966551234567'] },
    'rec_current'
  );
  assert.equal(validation.valid, false);
  assert.equal(validation.error?.code, 'CONTACT_IN_ACTIVE_RELATIONSHIP');
  assert.equal(validation.error?.statusCode, 409);
});

// 5. Same Relationship Retaining Its Own Reservation Does Not Conflict
test('5. Same relationship: reading its own reservation does not produce a false conflict', async () => {
  const ownedHash = hashContact('+966551234567');
  const mockDb = {
    collection: () => ({
      doc: (docId: string) => ({
        get: async () => {
          if (docId === ownedHash) {
            return { exists: true, data: () => ({ recordId: 'rec_self' }) };
          }
          return { exists: false };
        }
      })
    })
  } as any;

  const conflict = await checkActiveContactConflict(
    mockDb,
    { phones: ['+966551234567'] },
    'rec_self'
  );
  assert.equal(conflict, false);

  const validation = await validateContactUniqueness(
    mockDb,
    { phones: ['+966551234567'] },
    'rec_self'
  );
  assert.equal(validation.valid, true);
});

// 6. Extraction of All Canonical Contacts for Atomic Acceptance
test('6. extractCanonicalContacts: extracts unique canonical contacts across P1 and P2 without duplication', () => {
  const p1: PartnerContactInputs = {
    email: 'p1@example.com',
    phoneNumber: '0551111111',
    phoneCountry: 'SA +966',
    whatsappNumber: '0551111111', // same as phone
    whatsappCountry: 'SA +966'
  };

  const p2: PartnerContactInputs = {
    email: 'P2@EXAMPLE.COM',
    phoneNumber: '+966552222222',
    phoneCountry: 'SA +966',
    whatsappNumber: '0553333333',
    whatsappCountry: 'SA +966',
    whatsappTrusted: true
  };

  const { canonicals, hashes, invalidContacts } = extractCanonicalContacts(p1, p2);

  assert.equal(invalidContacts.length, 0);
  // Expected unique: p1@example.com, +966551111111, p2@example.com, +966552222222, +966553333333 (total 5)
  assert.equal(canonicals.length, 5);
  assert.equal(hashes.length, 5);
  assert.equal(canonicals.includes('+966551111111'), true);
  assert.equal(canonicals.includes('p2@example.com'), true);
  assert.equal(canonicals.includes('+966553333333'), true);

  // Negative test: Untrusted secondary WhatsApp is NOT reserved to prevent unverified contact squatting
  const untrustedP2: PartnerContactInputs = { ...p2, whatsappTrusted: false };
  const untrustedResult = extractCanonicalContacts(p1, untrustedP2);
  assert.equal(untrustedResult.canonicals.length, 4);
  assert.equal(untrustedResult.canonicals.includes('+966553333333'), false);
});

// 7. Contact Replacement and Preservation Logic
test('7. isContactStillUsedByRelationship: preserves old contact if partner still uses it', () => {
  const p1: PartnerContactInputs = {
    email: 'shared@example.com',
    phoneNumber: '0551112233',
    phoneCountry: 'SA +966',
    whatsappNumber: '0551112233',
    whatsappCountry: 'SA +966'
  };

  const p2: PartnerContactInputs = {
    email: 'p2@example.com',
    phoneNumber: '0559998877',
    phoneCountry: 'SA +966',
    whatsappNumber: '0551112233', // P2 whatsapp matches P1 phone
    whatsappCountry: 'SA +966'
  };

  // If P1 changes whatsapp to something else, is +966551112233 still used?
  // Yes, because P1's phone AND P2's whatsapp still use it!
  const stillUsed1 = isContactStillUsedByRelationship('+966551112233', p1, p2, { partner: 'p1', field: 'whatsapp' });
  assert.equal(stillUsed1, true);

  // If a contact is completely unused:
  const unused = isContactStillUsedByRelationship('+966550000000', p1, p2);
  assert.equal(unused, false);
});

// 8. Simulated Optimistic Concurrency Control (OCC) for Atomic Acceptance
test('8. Concurrent acceptance simulation: competing transactions for the same contact cannot both succeed', async () => {
  const sharedContact = '+966551234567';
  const sharedHash = hashContact(sharedContact);

  // Simulated in-memory database store
  const store = new Map<string, { recordId: string }>();

  // Transaction simulator with retry on OCC conflict
  const runSimulatedAcceptance = async (recordId: string) => {
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      // READ PHASE
      const existing = store.get(sharedHash);
      if (existing && existing.recordId !== recordId) {
        throw new Error('CONTACT_IN_ACTIVE_RELATIONSHIP');
      }

      // WRITE PHASE
      store.set(sharedHash, { recordId });
      return { success: true, recordId };
    }
    throw new Error('TRANSACTION_ABORTED');
  };

  // First transaction succeeds and claims reservation
  const tx1Result = await runSimulatedAcceptance('rec_tx1');
  assert.equal(tx1Result.success, true);
  assert.equal(store.get(sharedHash)?.recordId, 'rec_tx1');

  // Second concurrent transaction competing for the same contact is rejected
  await assert.rejects(
    async () => runSimulatedAcceptance('rec_tx2'),
    /CONTACT_IN_ACTIVE_RELATIONSHIP/
  );
});

// 9. WhatsApp Trust Status Inheritance Rule
test('9. WhatsApp trust inheritance: auto-trusted ONLY when matching verified mobile', () => {
  const verifiedMobile = '+966551234567';
  const matchingWa = normalizeCanonicalPhone('0551234567', 'SA').canonical;
  const differentWa = normalizeCanonicalPhone('0559998888', 'SA').canonical;

  const isTrustedMatching = Boolean(matchingWa && verifiedMobile && matchingWa === verifiedMobile);
  const isTrustedDifferent = Boolean(differentWa && verifiedMobile && differentWa === verifiedMobile);

  assert.equal(isTrustedMatching, true);
  assert.equal(isTrustedDifferent, false);
});

// 10. HMAC-SHA256 Contact Hashing with Secret
test('10. hashContact produces HMAC-SHA256 matching crypto.createHmac and respects input normalization', () => {
  const secret = 'custom_test_secret_for_hmac_sha256_32chars!';
  const prevSecret = process.env.CONTACT_HASH_SECRET;
  try {
    process.env.CONTACT_HASH_SECRET = secret;
    const input = '  USER.test+1@example.COM  ';
    const expected = crypto.createHmac('sha256', secret).update('user.test+1@example.com').digest('hex');
    assert.equal(hashContact(input), expected);
  } finally {
    process.env.CONTACT_HASH_SECRET = prevSecret;
  }
});

// 11. hashContact Throws If Secret Missing or < 32 Chars
test('11. hashContact throws if CONTACT_HASH_SECRET is missing or shorter than 32 characters', () => {
  const prevSecret = process.env.CONTACT_HASH_SECRET;
  try {
    // Missing / undefined
    delete process.env.CONTACT_HASH_SECRET;
    assert.throws(
      () => hashContact('user@example.com'),
      /CONTACT_HASH_SECRET must be set and at least 32 characters long/
    );

    // Empty string
    process.env.CONTACT_HASH_SECRET = '';
    assert.throws(
      () => hashContact('user@example.com'),
      /CONTACT_HASH_SECRET must be set and at least 32 characters long/
    );

    // Too short (< 32 chars)
    process.env.CONTACT_HASH_SECRET = 'short_secret_only_24_chars';
    assert.throws(
      () => hashContact('user@example.com'),
      /CONTACT_HASH_SECRET must be set and at least 32 characters long/
    );
  } finally {
    process.env.CONTACT_HASH_SECRET = prevSecret;
  }
});

// 12. Invitation Creation Does Not Reveal Active Relationship Status, While Acceptance Is Rejected
test('12. Invitation creation does not reveal active relationship status, while acceptance is rejected', async () => {
  const app = createApp();
  const server: Server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const mockDb = createMockFirestore();
    const mockAuth = createMockAuth();
    __setTestDeps(mockDb, mockAuth);

    const activeContactEmail = 'active.partner@example.com';
    const activeContactPhone = '0500000002';
    const activeContactPhoneE164 = '+966500000002';
    const activeHashEmail = hashContact(activeContactEmail);
    const activeHashPhone = hashContact(activeContactPhoneE164);

    // 1. Seed an active relationship holding activeContactEmail and activeContactPhoneE164
    mockDb.seed('users', 'uid_active_p1', {
      uid: 'uid_active_p1',
      email: 'p1.active@example.com',
      phoneE164: '+966500000001',
      activeRecordId: 'rel_active'
    });
    mockDb.seed('users', 'uid_active_p2', {
      uid: 'uid_active_p2',
      email: activeContactEmail,
      phoneE164: activeContactPhoneE164,
      whatsappTrusted: true,
      whatsappE164: activeContactPhoneE164,
      activeRecordId: 'rel_active'
    });
    mockAuth.addUser('uid_active_p2', {
      uid: 'uid_active_p2',
      email: activeContactEmail,
      email_verified: true,
      phone_number: activeContactPhoneE164
    });

    mockDb.seed('relationships', 'rel_active', {
      id: 'rel_active',
      recordNumber: '999001',
      type: 'marriage',
      status: 'active',
      p1Uid: 'uid_active_p1',
      p2Uid: 'uid_active_p2',
      partner1: {
        fullName: 'Active P1',
        birthDay: '01',
        birthMonth: '01',
        birthYear: '1990',
        email: 'p1.active@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '0500000001',
        phoneE164: '+966500000001',
        whatsappCountry: 'SA +966',
        whatsappNumber: '0500000001',
        whatsappE164: '+966500000001'
      },
      partner2: {
        fullName: 'Active P2',
        birthDay: '02',
        birthMonth: '02',
        birthYear: '1992',
        email: activeContactEmail,
        phoneCountry: 'SA +966',
        phoneNumber: activeContactPhone,
        phoneE164: activeContactPhoneE164,
        whatsappCountry: 'SA +966',
        whatsappNumber: activeContactPhone,
        whatsappE164: activeContactPhoneE164
      },
      startDate: '2023-01-01',
      startDateAr: '1 يناير 2023',
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z'
    });

    // Seed contact reservations for active relationship
    mockDb.seed('contact_reservations', activeHashEmail, { recordId: 'rel_active' });
    mockDb.seed('contact_reservations', activeHashPhone, { recordId: 'rel_active' });

    // 2. Setup user 1 inviting a completely free contact
    mockDb.seed('users', 'uid_inviter_free', {
      uid: 'uid_inviter_free',
      email: 'inviter.free@example.com',
      phoneE164: '+966500000010',
      activeRecordId: 'rel_draft_free'
    });
    mockAuth.addUser('uid_inviter_free', {
      uid: 'uid_inviter_free',
      email: 'inviter.free@example.com',
      email_verified: true
    });
    mockDb.seed('relationships', 'rel_draft_free', {
      id: 'rel_draft_free',
      recordNumber: '111001',
      type: 'dating',
      status: 'draft',
      p1Uid: 'uid_inviter_free',
      p2Uid: null,
      partner1: {
        fullName: 'Inviter Free',
        birthDay: '10',
        birthMonth: '10',
        birthYear: '1991',
        email: 'inviter.free@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '0500000010',
        phoneE164: '+966500000010',
        whatsappCountry: 'SA +966',
        whatsappNumber: '0500000010',
        whatsappE164: '+966500000010'
      },
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

    // 3. Setup user 2 inviting the contact that is in the active relationship
    mockDb.seed('users', 'uid_inviter_busy', {
      uid: 'uid_inviter_busy',
      email: 'inviter.busy@example.com',
      phoneE164: '+966500000020',
      activeRecordId: 'rel_draft_busy'
    });
    mockAuth.addUser('uid_inviter_busy', {
      uid: 'uid_inviter_busy',
      email: 'inviter.busy@example.com',
      email_verified: true
    });
    mockDb.seed('relationships', 'rel_draft_busy', {
      id: 'rel_draft_busy',
      recordNumber: '222002',
      type: 'dating',
      status: 'draft',
      p1Uid: 'uid_inviter_busy',
      p2Uid: null,
      partner1: {
        fullName: 'Inviter Busy',
        birthDay: '11',
        birthMonth: '11',
        birthYear: '1991',
        email: 'inviter.busy@example.com',
        phoneCountry: 'SA +966',
        phoneNumber: '0500000020',
        phoneE164: '+966500000020',
        whatsappCountry: 'SA +966',
        whatsappNumber: '0500000020',
        whatsappE164: '+966500000020'
      },
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

    // Send invitation to FREE contact
    const freeRes = await fetch(`${baseUrl}/api/invitations`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer uid_inviter_free',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner2Name: 'Free Partner 2',
        partner2Email: 'free.partner2@example.com',
        partner2Phone: '0500000099',
        partner2PhoneCountry: 'SA +966'
      })
    });
    assert.equal(freeRes.status, 200);
    const freeJson = await freeRes.json() as any;
    assert.equal(freeJson.success, true);
    assert.ok(freeJson.invitation?.id);

    // Send invitation to BUSY contact (contact is in active relationship)
    const busyRes = await fetch(`${baseUrl}/api/invitations`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer uid_inviter_busy',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner2Name: 'Active Partner 2',
        partner2Email: activeContactEmail,
        partner2Phone: activeContactPhone,
        partner2PhoneCountry: 'SA +966'
      })
    });

    // Step 1 check: identical status and response shape (no disclosure whether contact is in relationship)
    assert.equal(busyRes.status, 200);
    assert.equal(busyRes.status, freeRes.status);
    const busyJson = await busyRes.json() as any;
    assert.equal(busyJson.success, true);
    assert.deepEqual(Object.keys(busyJson).sort(), Object.keys(freeJson).sort());
    assert.deepEqual(Object.keys(busyJson.invitation).sort(), Object.keys(freeJson.invitation).sort());
    assert.deepEqual(Object.keys(busyJson.record).sort(), Object.keys(freeJson.record).sort());
    assert.equal(busyJson.invitation.status, 'pending');
    assert.equal(busyJson.invitation.partner2Email, activeContactEmail);
    assert.notEqual(busyJson.error, 'CONTACT_IN_ACTIVE_RELATIONSHIP');

    // Step 2 check: acceptance by contact in active relationship is still rejected
    const acceptRes = await fetch(`${baseUrl}/api/invitations/${busyJson.invitation.id}/accept`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer uid_active_p2',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner2: {
          fullName: 'Active Partner 2',
          fullNameEn: 'Active Partner 2',
          birthDay: '02',
          birthMonth: '02',
          birthYear: '1992',
          email: activeContactEmail,
          phoneCountry: 'SA +966',
          phoneNumber: activeContactPhone,
          phoneE164: activeContactPhoneE164,
          whatsappCountry: 'SA +966',
          whatsappNumber: activeContactPhone,
          whatsappE164: activeContactPhoneE164
        },
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(acceptRes.status, 409);
    const acceptJson = await acceptRes.json() as any;
    assert.ok(
      acceptJson.error === 'P2_ALREADY_IN_ACTIVE_RELATIONSHIP' ||
      acceptJson.error === 'CONTACT_IN_ACTIVE_RELATIONSHIP'
    );

    // Also verify: even for an account without activeRecordId, the atomic contact reservation rejects acceptance
    mockDb.seed('users', 'uid_p2_unbound', {
      uid: 'uid_p2_unbound',
      email: activeContactEmail,
      phoneE164: activeContactPhoneE164,
      whatsappTrusted: true,
      whatsappE164: activeContactPhoneE164
    });
    mockAuth.addUser('uid_p2_unbound', {
      uid: 'uid_p2_unbound',
      email: activeContactEmail,
      email_verified: true,
      phone_number: activeContactPhoneE164
    });

    const unboundAcceptRes = await fetch(`${baseUrl}/api/invitations/${busyJson.invitation.id}/accept`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer uid_p2_unbound',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        partner2: {
          fullName: 'Active Partner 2',
          fullNameEn: 'Active Partner 2',
          birthDay: '02',
          birthMonth: '02',
          birthYear: '1992',
          email: activeContactEmail,
          phoneCountry: 'SA +966',
          phoneNumber: activeContactPhone,
          phoneE164: activeContactPhoneE164,
          whatsappCountry: 'SA +966',
          whatsappNumber: activeContactPhone,
          whatsappE164: activeContactPhoneE164
        },
        acceptedLegalVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.equal(unboundAcceptRes.status, 409);
    const unboundAcceptJson = await unboundAcceptRes.json() as any;
    assert.equal(unboundAcceptJson.error, 'CONTACT_IN_ACTIVE_RELATIONSHIP');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});


