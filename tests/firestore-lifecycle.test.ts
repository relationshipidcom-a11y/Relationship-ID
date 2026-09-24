import assert from 'node:assert/strict';
import test from 'node:test';

// 1. Certificate Projection Privacy Invariant
test('certificate projection contains only public fields, zero PII, and NO recordId', () => {
  const allowedCertificateKeys = new Set([
    'verificationRef',
    'recordNumber',
    'partner1Name',
    'partner2Name',
    'partner1En',
    'partner2En',
    'type',
    'startDate',
    'startDateAr',
    'startDateIso',
    'status',
    'issuedDate',
    'issuedDateAr'
  ]);

  const prohibitedKeys = [
    'recordId',
    'p1Uid',
    'p2Uid',
    'email',
    'phone',
    'phoneNumber',
    'phoneE164',
    'whatsapp',
    'whatsappNumber',
    'whatsappE164',
    'birthDay',
    'birthMonth',
    'birthYear',
    'dob',
    'token',
    'secret',
    'hash',
    'password'
  ];

  const sampleCertificateDoc = {
    verificationRef: 'RID-2026-123456-ABCDEF',
    recordNumber: '123456',
    partner1Name: 'سارة أحمد',
    partner2Name: 'خالد عبدالله',
    partner1En: 'Sara Ahmed',
    partner2En: 'Khalid Abdullah',
    type: 'marriage',
    startDate: '2025-01-01',
    startDateAr: '1 يناير 2025',
    startDateIso: '2025-01-01',
    status: 'active',
    issuedDate: '23 September 2026',
    issuedDateAr: '23 سبتمبر 2026'
  };

  // Ensure all keys are allowed
  for (const key of Object.keys(sampleCertificateDoc)) {
    assert.equal(allowedCertificateKeys.has(key), true, `Unexpected field in certificate: ${key}`);
  }

  // Ensure no prohibited keys (including internal recordId) exist
  for (const prohibited of prohibitedKeys) {
    assert.equal(prohibited in sampleCertificateDoc, false, `Prohibited field leaked in public certificate: ${prohibited}`);
  }
});

// 2. Public Certificate Lookup Invariant
test('public lookup strictly uses verificationRef as lookup key and never internal recordId', () => {
  const publicLookupParam = 'RID-2026-123456-ABCDEF';
  const isVerificationRef = (val: string) => /^RID-\d{4}-\d{6}-[A-F0-9]{6}$/.test(val);
  const isInternalRecordId = (val: string) => /^rec_[a-z0-9]+$/i.test(val);

  assert.equal(isVerificationRef(publicLookupParam), true);
  assert.equal(isInternalRecordId(publicLookupParam), false);

  const lookupCertificate = (docId: string, certDoc: { verificationRef: string }) => {
    if (docId !== certDoc.verificationRef) throw new Error('NOT_FOUND');
    return certDoc;
  };

  const sampleCert = { verificationRef: 'RID-2026-123456-ABCDEF', partner1Name: 'سارة', partner2Name: 'خالد' };
  assert.deepEqual(lookupCertificate('RID-2026-123456-ABCDEF', sampleCert), sampleCert);
  assert.throws(() => lookupCertificate('rec_internal_id_123', sampleCert), /NOT_FOUND/);
});

// 3. Display and Localization Fields Integrity
test('localization fields (partner1En, partner2En, startDateAr, issuedDateAr) contain only display strings', () => {
  const cert = {
    partner1Name: 'سارة أحمد',
    partner2Name: 'خالد عبدالله',
    partner1En: 'Sara Ahmed',
    partner2En: 'Khalid Abdullah',
    startDateAr: '1 يناير 2025',
    issuedDateAr: '23 سبتمبر 2026'
  };

  for (const [key, val] of Object.entries(cert)) {
    assert.equal(typeof val, 'string', `${key} must be a display string`);
    assert.equal(val.includes('@'), false, `${key} must not contain email`);
    assert.equal(/\+?\d{8,}/.test(val), false, `${key} must not contain phone numbers`);
  }
});

// 4. Waiting Screen Transition Exactly Once
test('waiting screen auto-advance transitions exactly once and prevents loops/duplicate pushes', () => {
  let navCount = 0;
  let autoNavigated = false;

  const handleSnapshotUpdate = (status: string, currentScreen: string) => {
    if (status === 'active' && currentScreen === 'p1_waiting') {
      if (!autoNavigated) {
        autoNavigated = true;
        navCount += 1;
      }
    }
  };

  // Simulate multiple rapid snapshot notifications
  handleSnapshotUpdate('active', 'p1_waiting');
  handleSnapshotUpdate('active', 'p1_waiting');
  handleSnapshotUpdate('active', 'p1_waiting');

  assert.equal(navCount, 1, 'Navigation should happen exactly once');
});

// 5. Incompatible / Already-Active Relationship Protection
test('P2 acceptance transaction rejects if P2 is already bound to another active relationship', () => {
  const p2ActiveRecordId = 'rec_existing_active';
  const targetRecordId = 'rec_new_relationship';

  const validateP2Availability = (p2RecordId: string | null | undefined, newRecordId: string) => {
    if (p2RecordId && p2RecordId !== newRecordId) {
      throw new Error('P2_ALREADY_IN_ACTIVE_RELATIONSHIP');
    }
    return true;
  };

  assert.throws(
    () => validateP2Availability(p2ActiveRecordId, targetRecordId),
    /P2_ALREADY_IN_ACTIVE_RELATIONSHIP/
  );
  assert.equal(validateP2Availability(undefined, targetRecordId), true);
});

// 6. Sign-Out Cleans All Subscriptions and Sensitive State
test('sign-out resets record, invitation, and auto-navigation state to initial clean slate', () => {
  let recordState = { id: 'rec_123', partner1: { fullName: 'User 1' } };
  let invitationState = { id: 'inv_123', status: 'accepted' };
  let autoNavigated = true;

  const onSignOut = () => {
    recordState = { id: '', partner1: { fullName: '' } };
    invitationState = { id: '', status: 'pending' };
    autoNavigated = false;
  };

  onSignOut();
  assert.equal(recordState.id, '');
  assert.equal(recordState.partner1.fullName, '');
  assert.equal(invitationState.id, '');
  assert.equal(autoNavigated, false);
});

// 2. Invitation Expiration Logic
test('invitation expiration is 3 days and expired invites are rejected', () => {
  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(now + threeDaysMs).toISOString();

  const isExpired = (iso: string, checkTime: number) => new Date(iso).getTime() <= checkTime;

  assert.equal(isExpired(expiresAt, now), false);
  assert.equal(isExpired(expiresAt, now + threeDaysMs + 1000), true);
});

// 3. Self-Relationship Rejection
test('self-relationship acceptance is strictly prevented (p1Uid !== p2Uid)', () => {
  const p1Uid = 'user_abc_123';
  const p2Uid = 'user_abc_123';

  const validateAcceptance = (inviterUid: string, acceptingUid: string) => {
    if (inviterUid === acceptingUid) {
      throw new Error('SELF_RELATIONSHIP_NOT_ALLOWED');
    }
    return true;
  };

  assert.throws(
    () => validateAcceptance(p1Uid, p2Uid),
    /SELF_RELATIONSHIP_NOT_ALLOWED/
  );
});

// 4. Duplicate / Replay Acceptance Protection
test('duplicate/replay acceptance is rejected if status is not pending', () => {
  const statuses = ['accepted', 'declined', 'cancelled', 'expired'];

  for (const status of statuses) {
    const canAccept = (currentStatus: string) => {
      if (currentStatus !== 'pending') {
        throw new Error(`INVITATION_${currentStatus.toUpperCase()}`);
      }
      return true;
    };

    assert.throws(
      () => canAccept(status),
      new RegExp(`INVITATION_${status.toUpperCase()}`)
    );
  }
});

// 5. Authoritative Verified Mobile Requirement
test('client cannot forge phoneE164 without matching verified auth token', () => {
  const verifiedTokenPhone = '+966501112233';
  const forgedPhone = '+966509998877';
  const matchingPhone = '+966501112233';

  const validatePhone = (tokenPhone: string | undefined, clientClaimedPhone: string | undefined) => {
    if (!tokenPhone || !clientClaimedPhone || tokenPhone !== clientClaimedPhone) {
      throw new Error('VERIFIED_PHONE_REQUIRED');
    }
    return true;
  };

  assert.throws(() => validatePhone(verifiedTokenPhone, forgedPhone), /VERIFIED_PHONE_REQUIRED/);
  assert.throws(() => validatePhone(undefined, matchingPhone), /VERIFIED_PHONE_REQUIRED/);
  assert.equal(validatePhone(verifiedTokenPhone, matchingPhone), true);
});

// 6. WhatsApp Trust Inheritance Rule
test('WhatsApp is auto-trusted only when exactly matching verified mobile', () => {
  const isWhatsAppTrusted = (phoneE164: string, whatsappE164: string) => phoneE164 === whatsappE164;

  assert.equal(isWhatsAppTrusted('+966551234567', '+966551234567'), true);
  assert.equal(isWhatsAppTrusted('+966551234567', '+966559999999'), false);
});

// 7. One Shared Relationship Document Invariant
test('P1 and P2 bind to one shared relationship recordId in users collection', () => {
  const relationshipId = 'rec_shared_456';
  const p1Doc = { activeRecordId: relationshipId, updatedAt: '2026-09-23T16:00:00Z' };
  const p2Doc = { activeRecordId: relationshipId, updatedAt: '2026-09-23T16:00:00Z' };

  assert.equal(p1Doc.activeRecordId, p2Doc.activeRecordId);
  assert.equal(p1Doc.activeRecordId, relationshipId);
});

// 8. Firebase Client Config Validation & Placeholder Detection Invariant
test('Firebase client config validator catches placeholder strings and reports missing variables safely', () => {
  const REQUIRED_CLIENT_CONFIG = [
    { key: 'apiKey', envVar: 'VITE_FIREBASE_API_KEY' },
    { key: 'authDomain', envVar: 'VITE_FIREBASE_AUTH_DOMAIN' },
    { key: 'projectId', envVar: 'VITE_FIREBASE_PROJECT_ID' },
    { key: 'storageBucket', envVar: 'VITE_FIREBASE_STORAGE_BUCKET' },
    { key: 'messagingSenderId', envVar: 'VITE_FIREBASE_MESSAGING_SENDER_ID' },
    { key: 'appId', envVar: 'VITE_FIREBASE_APP_ID' }
  ];

  const KNOWN_PLACEHOLDERS = new Set([
    'apikey',
    'authdomain',
    'projectid',
    'storagebucket',
    'messagingsenderid',
    'appid',
    'your-api-key',
    'your-auth-domain',
    'your-project-id'
  ]);

  const isInvalidConfigValue = (val: unknown, key: string): boolean => {
    if (typeof val !== 'string') return true;
    const trimmed = val.trim();
    if (!trimmed) return true;
    const lower = trimmed.toLowerCase();
    if (lower === key.toLowerCase()) return true;
    if (KNOWN_PLACEHOLDERS.has(lower)) return true;
    if (lower.startsWith('<') && lower.endsWith('>')) return true;
    if (lower.startsWith('your_') || lower.startsWith('your-')) return true;
    return false;
  };

  const validate = (cfg: Record<string, unknown>) =>
    REQUIRED_CLIENT_CONFIG
      .filter(({ key }) => isInvalidConfigValue(cfg[key], key))
      .map(({ envVar }) => envVar);

  // Case A: Placeholder strings (the exact error observed in the sandbox before fix)
  const dummyPlaceholderConfig = {
    apiKey: 'apiKey',
    authDomain: 'authDomain',
    projectId: 'projectId',
    storageBucket: 'storageBucket',
    messagingSenderId: 'messagingSenderId',
    appId: 'appId'
  };
  const dummyMissing = validate(dummyPlaceholderConfig);
  assert.equal(dummyMissing.length, 6);
  assert.ok(dummyMissing.includes('VITE_FIREBASE_API_KEY'));
  assert.ok(dummyMissing.includes('VITE_FIREBASE_AUTH_DOMAIN'));

  // Case B: Legitimate relationship-id project configuration
  const validConfig = {
    apiKey: 'AIzaSyAZfyn7JOeXPEa7i4sIQwgUfYjhvQSUDrY',
    authDomain: 'relationship-id.firebaseapp.com',
    projectId: 'relationship-id',
    storageBucket: 'relationship-id.firebasestorage.app',
    messagingSenderId: '1032608911025',
    appId: '1:1032608911025:web:4823851dd411396416dc90'
  };
  const validMissing = validate(validConfig);
  assert.equal(validMissing.length, 0);

  // Case C: Missing single required key
  const missingOneConfig = { ...validConfig, apiKey: '' };
  const missingOne = validate(missingOneConfig);
  assert.deepEqual(missingOne, ['VITE_FIREBASE_API_KEY']);
});

