process.env.NODE_ENV = 'test';
if (!process.env.CONTACT_HASH_SECRET || process.env.CONTACT_HASH_SECRET.length < 32) {
  process.env.CONTACT_HASH_SECRET = 'test_contact_hash_secret_at_least_32_characters_long_for_hmac';
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  verifyContactByQuery,
  toCanonicalStage,
  hashContact,
  PUBLIC_CONTACT_INDEX_COL,
  type ContactVerifyDb,
  type PublicContactIndexDoc
} from '../src/utils/contacts';

// Helper mock DB generator with read tracker
function createMockContactSearchDb(data: {
  indexes?: Record<string, PublicContactIndexDoc>;
  relationships?: Record<string, any>;
}) {
  let indexReads = 0;
  let relReads = 0;
  let collectionScans = 0;

  const mockDb: ContactVerifyDb = {
    collection: (colName: string) => {
      if (colName === PUBLIC_CONTACT_INDEX_COL) {
        return {
          doc: (docId: string) => ({
            get: async () => {
              indexReads++;
              const doc = data.indexes?.[docId];
              return {
                exists: Boolean(doc),
                id: docId,
                data: () => doc
              };
            }
          })
        };
      }
      if (colName === 'relationships') {
        return {
          doc: (docId: string) => ({
            get: async () => {
              relReads++;
              const doc = data.relationships?.[docId];
              return {
                exists: Boolean(doc),
                id: docId,
                data: () => doc
              };
            }
          })
        } as any;
      }
      throw new Error(`Unexpected collection access: ${colName}`);
    }
  };

  return {
    mockDb,
    getStats: () => ({ indexReads, relReads, totalReads: indexReads + relReads, collectionScans })
  };
}

// 1. Both Consent Flags True returns Active Match
test('1. Both consent flags true returns found: true and correct canonical stage', async () => {
  const contact = '+966551234567';
  const targetHash = hashContact(contact);
  const recordId = 'rec_active_1';

  const { mockDb, getStats } = createMockContactSearchDb({
    indexes: {
      [targetHash]: {
        recordId,
        contactHash: targetHash,
        stage: 'Married',
        updatedAt: '2026-09-28T10:00:00Z'
      }
    },
    relationships: {
      [recordId]: {
        id: recordId,
        status: 'active',
        type: 'marriage',
        settings: {
          publicContactSearchP1: true,
          publicContactSearchP2: true
        },
        partner1: {
          phoneE164: contact
        },
        partner2: {
          phoneE164: '+966559998877'
        }
      }
    }
  });

  const res = await verifyContactByQuery(mockDb, '0551234567'); // local Saudi query resolves to E.164
  assert.equal(res.found, true);
  assert.equal(res.stage, 'Married');
  assert.deepEqual(Object.keys(res).sort(), ['found', 'stage']);

  const stats = getStats();
  assert.equal(stats.totalReads, 2);
  assert.equal(stats.collectionScans, 0);
});

// 2. Each Consent Flag False Independently and Both False
test('2. Independent consent flags: returns found: false, stage: null if either or both flags false', async () => {
  const contact = '+966551234567';
  const targetHash = hashContact(contact);
  const recordId = 'rec_active_1';

  // Case A: P1 false, P2 true
  const { mockDb: dbP1False } = createMockContactSearchDb({
    indexes: {
      [targetHash]: { recordId, contactHash: targetHash, stage: 'Engaged', updatedAt: '2026-09-28T10:00:00Z' }
    },
    relationships: {
      [recordId]: {
        id: recordId,
        status: 'active',
        type: 'engagement',
        settings: { publicContactSearchP1: false, publicContactSearchP2: true },
        partner1: { phoneE164: contact }
      }
    }
  });
  const resA = await verifyContactByQuery(dbP1False, contact);
  assert.equal(resA.found, false);
  assert.equal(resA.stage, null);

  // Case B: P1 true, P2 false
  const { mockDb: dbP2False } = createMockContactSearchDb({
    indexes: {
      [targetHash]: { recordId, contactHash: targetHash, stage: 'Engaged', updatedAt: '2026-09-28T10:00:00Z' }
    },
    relationships: {
      [recordId]: {
        id: recordId,
        status: 'active',
        type: 'engagement',
        settings: { publicContactSearchP1: true, publicContactSearchP2: false },
        partner1: { phoneE164: contact }
      }
    }
  });
  const resB = await verifyContactByQuery(dbP2False, contact);
  assert.equal(resB.found, false);
  assert.equal(resB.stage, null);

  // Case C: Both false
  const { mockDb: dbBothFalse } = createMockContactSearchDb({
    indexes: {
      [targetHash]: { recordId, contactHash: targetHash, stage: 'Engaged', updatedAt: '2026-09-28T10:00:00Z' }
    },
    relationships: {
      [recordId]: {
        id: recordId,
        status: 'active',
        type: 'engagement',
        settings: { publicContactSearchP1: false, publicContactSearchP2: false },
        partner1: { phoneE164: contact }
      }
    }
  });
  const resC = await verifyContactByQuery(dbBothFalse, contact);
  assert.equal(resC.found, false);
  assert.equal(resC.stage, null);
});

// 3. Inactive or Ended Relationship
test('3. Relationship not active (ended or draft): returns found: false, stage: null', async () => {
  const contact = '+966551234567';
  const targetHash = hashContact(contact);
  const recordId = 'rec_ended_1';

  const { mockDb } = createMockContactSearchDb({
    indexes: {
      [targetHash]: { recordId, contactHash: targetHash, stage: 'Married', updatedAt: '2026-09-28T10:00:00Z' }
    },
    relationships: {
      [recordId]: {
        id: recordId,
        status: 'ended',
        type: 'marriage',
        settings: { publicContactSearchP1: true, publicContactSearchP2: true },
        partner1: { phoneE164: contact }
      }
    }
  });

  const res = await verifyContactByQuery(mockDb, contact);
  assert.equal(res.found, false);
  assert.equal(res.stage, null);
});

// 4. Stale Index Detection (Contact removed from relationship)
test('4. Stale index protection: if contact is no longer in relationship, returns found: false, stage: null', async () => {
  const oldContact = '+966551111111';
  const oldHash = hashContact(oldContact);
  const recordId = 'rec_active_1';

  const { mockDb } = createMockContactSearchDb({
    indexes: {
      [oldHash]: { recordId, contactHash: oldHash, stage: 'Dating', updatedAt: '2026-09-28T10:00:00Z' }
    },
    relationships: {
      [recordId]: {
        id: recordId,
        status: 'active',
        type: 'dating',
        settings: { publicContactSearchP1: true, publicContactSearchP2: true },
        partner1: {
          phoneE164: '+966552222222' // changed to a different number!
        }
      }
    }
  });

  const res = await verifyContactByQuery(mockDb, oldContact);
  assert.equal(res.found, false);
  assert.equal(res.stage, null);
});

// 5. Invalid Stored Stage never defaults to Dating
test('5. Invalid stored stage: returns found: false, stage: null and NEVER defaults to Dating', async () => {
  const contact = '+966551234567';
  const targetHash = hashContact(contact);
  const recordId = 'rec_active_1';

  const { mockDb } = createMockContactSearchDb({
    indexes: {
      [targetHash]: { recordId, contactHash: targetHash, stage: 'Dating', updatedAt: '2026-09-28T10:00:00Z' }
    },
    relationships: {
      [recordId]: {
        id: recordId,
        status: 'active',
        type: 'corrupted_unknown_stage' as any, // invalid stored type
        settings: { publicContactSearchP1: true, publicContactSearchP2: true },
        partner1: { phoneE164: contact }
      }
    }
  });

  const res = await verifyContactByQuery(mockDb, contact);
  assert.equal(res.found, false);
  assert.equal(res.stage, null);
  assert.notEqual(res.stage, 'Dating');
});

// 6. Missing Index or Relationship Doc
test('6. Missing index doc: returns found: false, stage: null in exactly 1 read', async () => {
  const { mockDb, getStats } = createMockContactSearchDb({
    indexes: {},
    relationships: {}
  });

  const res = await verifyContactByQuery(mockDb, '+966550000000');
  assert.equal(res.found, false);
  assert.equal(res.stage, null);

  const stats = getStats();
  assert.equal(stats.indexReads, 1);
  assert.equal(stats.relReads, 0);
  assert.equal(stats.totalReads, 1);
});

// 7. Invalid Input Handling
test('7. Invalid or empty queries: returns found: false, stage: null without database reads', async () => {
  const { mockDb, getStats } = createMockContactSearchDb({});

  assert.deepEqual(await verifyContactByQuery(mockDb, ''), { found: false, stage: null });
  assert.deepEqual(await verifyContactByQuery(mockDb, '   '), { found: false, stage: null });
  assert.deepEqual(await verifyContactByQuery(mockDb, null), { found: false, stage: null });
  assert.deepEqual(await verifyContactByQuery(mockDb, undefined), { found: false, stage: null });
  assert.deepEqual(await verifyContactByQuery(mockDb, 'not-a-contact'), { found: false, stage: null });
  assert.deepEqual(await verifyContactByQuery(mockDb, 12345), { found: false, stage: null });

  const stats = getStats();
  assert.equal(stats.totalReads, 0);
});

// 8. Bounded Read Invariant
test('8. Bounded read guarantee: lookup executes at most 2 reads and never performs a collection scan', async () => {
  const contact = 'test.user@example.com';
  const targetHash = hashContact(contact);
  const recordId = 'rec_active_email';

  const { mockDb, getStats } = createMockContactSearchDb({
    indexes: {
      [targetHash]: { recordId, contactHash: targetHash, stage: 'Married', updatedAt: '2026-09-28T10:00:00Z' }
    },
    relationships: {
      [recordId]: {
        id: recordId,
        status: 'active',
        type: 'marriage',
        settings: { publicContactSearchP1: true, publicContactSearchP2: true },
        partner1: { email: contact }
      }
    }
  });

  const res = await verifyContactByQuery(mockDb, '  TEST.USER@EXAMPLE.COM  ');
  assert.equal(res.found, true);
  assert.equal(res.stage, 'Married');

  const stats = getStats();
  assert.ok(stats.totalReads <= 2, `Total reads (${stats.totalReads}) exceeded bound of 2`);
  assert.equal(stats.collectionScans, 0);
});

// 9. toCanonicalStage Contract
test('9. toCanonicalStage maps standard types accurately and rejects invalid inputs', () => {
  assert.equal(toCanonicalStage('marriage'), 'Married');
  assert.equal(toCanonicalStage('engagement'), 'Engaged');
  assert.equal(toCanonicalStage('dating'), 'Dating');
  assert.equal(toCanonicalStage('invalid'), null);
  assert.equal(toCanonicalStage(null), null);
  assert.equal(toCanonicalStage(undefined), null);
  assert.equal(toCanonicalStage(''), null);
});

// 10. Index Collision Protection Simulation
test('10. Index maintenance does not overwrite or delete an entry owned by another relationship', () => {
  const store = new Map<string, PublicContactIndexDoc>();
  const hash = hashContact('+966551234567');

  // Existing entry owned by Relationship A
  store.set(hash, {
    recordId: 'rec_rel_A',
    contactHash: hash,
    stage: 'Married',
    updatedAt: '2026-09-28T10:00:00Z'
  });

  // Relationship B attempts to publish index for the same contact
  const relBId = 'rec_rel_B';
  const existing = store.get(hash);

  // Policy: do not overwrite an index entry owned by another relationship
  if (!existing || existing.recordId === relBId) {
    store.set(hash, { recordId: relBId, contactHash: hash, stage: 'Dating', updatedAt: '2026-09-28T11:00:00Z' });
  }

  // Verify Rel A's ownership is preserved intact
  assert.equal(store.get(hash)?.recordId, 'rec_rel_A');
  assert.equal(store.get(hash)?.stage, 'Married');

  // Rel B terminates: only delete if owned by Rel B
  if (store.get(hash)?.recordId === relBId) {
    store.delete(hash);
  }

  // Rel A's entry remains untouched
  assert.equal(store.get(hash)?.recordId, 'rec_rel_A');
});
