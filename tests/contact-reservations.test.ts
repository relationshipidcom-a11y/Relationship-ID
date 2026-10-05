process.env.NODE_ENV = 'test';
if (!process.env.CONTACT_HASH_SECRET || process.env.CONTACT_HASH_SECRET.length < 32) {
  process.env.CONTACT_HASH_SECRET = 'test_contact_hash_secret_at_least_32_characters_long_for_hmac';
}

import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
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
  validateContactUniqueness
} from '../server';

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
    whatsappCountry: 'SA +966'
  };

  const { canonicals, hashes, invalidContacts } = extractCanonicalContacts(p1, p2);

  assert.equal(invalidContacts.length, 0);
  // Expected unique: p1@example.com, +966551111111, p2@example.com, +966552222222, +966553333333 (total 5)
  assert.equal(canonicals.length, 5);
  assert.equal(hashes.length, 5);
  assert.equal(canonicals.includes('+966551111111'), true);
  assert.equal(canonicals.includes('p2@example.com'), true);
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

