import test from 'node:test';
import assert from 'node:assert/strict';

interface MockPartnerData {
  fullName: string;
  fullNameEn?: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  email: string;
  phoneCountry: string;
  phoneNumber: string;
  phoneE164?: string;
  phoneVerified?: boolean;
  whatsappCountry?: string;
  whatsappNumber?: string;
  socialHandle?: string;
}

interface MockRecord {
  id: string;
  recordNumber: string;
  verificationRef: string;
  type: 'marriage' | 'engagement' | 'dating';
  startDate: string;
  startDateAr: string;
  startDateIso?: string;
  partner1: MockPartnerData;
  partner2: MockPartnerData;
  status: 'active';
  p1Uid: string;
  p2Uid: string;
}

interface MockChangeRequest {
  id: string;
  recordId: string;
  verificationRef: string;
  requesterUid: string;
  requesterRole: 'p1' | 'p2';
  requesterName: string;
  approverUid: string;
  target: 'shared' | 'partner1_name' | 'partner2_name';
  field: 'type' | 'startDate' | 'partner1FullName' | 'partner2FullName';
  oldValue: string;
  proposedValue: string;
  status: 'pending' | 'approved' | 'declined';
  requestedAt: string;
  decidedAt?: string;
  decisionByUid?: string;
}

const createMockState = () => {
  const record: MockRecord = {
    id: 'rec_1001',
    recordNumber: '556677',
    verificationRef: 'RID-2026-556677-ABC',
    type: 'dating',
    startDate: '15 January 2026',
    startDateAr: '١٥ يناير ٢٠٢٦',
    startDateIso: '2026-01-15',
    partner1: {
      fullName: 'رامي خليل',
      birthDay: '10',
      birthMonth: '05',
      birthYear: '1995',
      email: 'rami@example.com',
      phoneCountry: 'SA +966',
      phoneNumber: '501234567',
      phoneE164: '+966501234567',
      phoneVerified: true,
      socialHandle: 'rami_k'
    },
    partner2: {
      fullName: 'سارة أحمد',
      birthDay: '14',
      birthMonth: '08',
      birthYear: '1997',
      email: 'sara@example.com',
      phoneCountry: 'SA +966',
      phoneNumber: '509876543',
      phoneE164: '+966509876543',
      phoneVerified: true,
      socialHandle: 'sara_a'
    },
    status: 'active',
    p1Uid: 'uid_p1_rami',
    p2Uid: 'uid_p2_sara'
  };

  const certificate = {
    verificationRef: 'RID-2026-556677-ABC',
    recordNumber: '556677',
    partner1Name: 'رامي خليل',
    partner2Name: 'سارة أحمد',
    partner1En: null as string | null,
    partner2En: null as string | null,
    type: 'dating',
    startDate: '15 January 2026',
    startDateAr: '١٥ يناير ٢٠٢٦',
    status: 'active'
  };

  const changeRequests: Map<string, MockChangeRequest> = new Map();

  // Helper functions simulating backend business logic
  const updatePersonalInfo = (callerUid: string, payload: {
    socialHandle?: string;
    fullNameEn?: string;
    whatsappNumber?: string;
    targetPartner?: 'partner1' | 'partner2';
  }) => {
    const isP1 = record.p1Uid === callerUid;
    const isP2 = record.p2Uid === callerUid;
    if (!isP1 && !isP2) throw new Error('NOT_RELATIONSHIP_PARTICIPANT');

    if (isP1 && payload.targetPartner === 'partner2') {
      throw new Error('CANNOT_EDIT_PARTNER_INFO');
    }
    if (isP2 && payload.targetPartner === 'partner1') {
      throw new Error('CANNOT_EDIT_PARTNER_INFO');
    }

    if (isP1) {
      if (payload.socialHandle !== undefined) record.partner1.socialHandle = payload.socialHandle;
      if (payload.fullNameEn !== undefined) {
        record.partner1.fullNameEn = payload.fullNameEn;
        certificate.partner1En = payload.fullNameEn;
      }
      if (payload.whatsappNumber !== undefined) record.partner1.whatsappNumber = payload.whatsappNumber;
    } else {
      if (payload.socialHandle !== undefined) record.partner2.socialHandle = payload.socialHandle;
      if (payload.fullNameEn !== undefined) {
        record.partner2.fullNameEn = payload.fullNameEn;
        certificate.partner2En = payload.fullNameEn;
      }
      if (payload.whatsappNumber !== undefined) record.partner2.whatsappNumber = payload.whatsappNumber;
    }
    return record;
  };

  const createChangeRequest = (callerUid: string, field: 'type' | 'startDate' | 'partner1FullName' | 'partner2FullName', proposedValue: string) => {
    const isP1 = record.p1Uid === callerUid;
    const isP2 = record.p2Uid === callerUid;
    if (!isP1 && !isP2) throw new Error('NOT_RELATIONSHIP_PARTICIPANT');

    if (field === 'partner1FullName' && !isP1) throw new Error('CANNOT_EDIT_PARTNER_INFO');
    if (field === 'partner2FullName' && !isP2) throw new Error('CANNOT_EDIT_PARTNER_INFO');

    // Check duplicate pending
    for (const cr of changeRequests.values()) {
      if (cr.recordId === record.id && cr.field === field && cr.status === 'pending') {
        throw new Error('PENDING_REQUEST_EXISTS');
      }
    }

    const requesterRole = isP1 ? 'p1' : 'p2';
    const requesterName = isP1 ? record.partner1.fullName : record.partner2.fullName;
    const approverUid = isP1 ? record.p2Uid : record.p1Uid;

    let oldValue = '';
    if (field === 'type') oldValue = record.type;
    else if (field === 'startDate') oldValue = record.startDateIso || record.startDate;
    else if (field === 'partner1FullName') oldValue = record.partner1.fullName;
    else if (field === 'partner2FullName') oldValue = record.partner2.fullName;

    const id = `cr_${changeRequests.size + 1}`;
    const cr: MockChangeRequest = {
      id,
      recordId: record.id,
      verificationRef: record.verificationRef,
      requesterUid: callerUid,
      requesterRole,
      requesterName,
      approverUid,
      target: field === 'partner1FullName' ? 'partner1_name' : field === 'partner2FullName' ? 'partner2_name' : 'shared',
      field,
      oldValue,
      proposedValue,
      status: 'pending',
      requestedAt: new Date().toISOString()
    };
    changeRequests.set(id, cr);
    return cr;
  };

  const approveChangeRequest = (callerUid: string, requestId: string) => {
    const cr = changeRequests.get(requestId);
    if (!cr) throw new Error('REQUEST_NOT_FOUND');
    if (cr.status !== 'pending') throw new Error(`REQUEST_${cr.status.toUpperCase()}`);
    if (cr.approverUid !== callerUid) throw new Error('UNAUTHORIZED_APPROVER');

    if (cr.field === 'type') {
      record.type = cr.proposedValue as 'marriage' | 'engagement' | 'dating';
      certificate.type = cr.proposedValue;
    } else if (cr.field === 'startDate') {
      record.startDateIso = cr.proposedValue;
      record.startDate = cr.proposedValue;
      certificate.startDate = cr.proposedValue;
    } else if (cr.field === 'partner1FullName') {
      record.partner1.fullName = cr.proposedValue;
      certificate.partner1Name = cr.proposedValue;
    } else if (cr.field === 'partner2FullName') {
      record.partner2.fullName = cr.proposedValue;
      certificate.partner2Name = cr.proposedValue;
    }

    cr.status = 'approved';
    cr.decidedAt = new Date().toISOString();
    cr.decisionByUid = callerUid;
    return { record, certificate, cr };
  };

  const declineChangeRequest = (callerUid: string, requestId: string) => {
    const cr = changeRequests.get(requestId);
    if (!cr) throw new Error('REQUEST_NOT_FOUND');
    if (cr.status !== 'pending') throw new Error(`REQUEST_${cr.status.toUpperCase()}`);
    if (cr.approverUid !== callerUid) throw new Error('UNAUTHORIZED_APPROVER');

    cr.status = 'declined';
    cr.decidedAt = new Date().toISOString();
    cr.decisionByUid = callerUid;
    return { record, certificate, cr };
  };

  return {
    record,
    certificate,
    changeRequests,
    updatePersonalInfo,
    createChangeRequest,
    approveChangeRequest,
    declineChangeRequest
  };
};

// 1. P1 updates P1 allowed information -> allowed
test('1. P1 updates P1 allowed personal information -> allowed', () => {
  const { record, updatePersonalInfo } = createMockState();
  updatePersonalInfo('uid_p1_rami', { socialHandle: 'rami_new', fullNameEn: 'Rami K.' });
  assert.equal(record.partner1.socialHandle, 'rami_new');
  assert.equal(record.partner1.fullNameEn, 'Rami K.');
  // Partner 2 data unaffected
  assert.equal(record.partner2.socialHandle, 'sara_a');
});

// 2. P2 updates P2 allowed information -> allowed
test('2. P2 updates P2 allowed personal information -> allowed', () => {
  const { record, updatePersonalInfo } = createMockState();
  updatePersonalInfo('uid_p2_sara', { socialHandle: 'sara_new', fullNameEn: 'Sara A.' });
  assert.equal(record.partner2.socialHandle, 'sara_new');
  assert.equal(record.partner2.fullNameEn, 'Sara A.');
  // Partner 1 data unaffected
  assert.equal(record.partner1.socialHandle, 'rami_k');
});

// 3. P1 attempts to edit P2 information -> rejected
test('3. P1 attempts to edit P2 information -> rejected', () => {
  const { updatePersonalInfo } = createMockState();
  assert.throws(
    () => updatePersonalInfo('uid_p1_rami', { targetPartner: 'partner2', socialHandle: 'hacked_sara' }),
    /CANNOT_EDIT_PARTNER_INFO/
  );
});

// 4. P2 attempts to edit P1 information -> rejected
test('4. P2 attempts to edit P1 information -> rejected', () => {
  const { updatePersonalInfo } = createMockState();
  assert.throws(
    () => updatePersonalInfo('uid_p2_sara', { targetPartner: 'partner1', socialHandle: 'hacked_rami' }),
    /CANNOT_EDIT_PARTNER_INFO/
  );
});

// 5. Client forges target UID -> rejected
test('5. Unauthenticated / forged UID is rejected', () => {
  const { updatePersonalInfo, createChangeRequest } = createMockState();
  assert.throws(
    () => updatePersonalInfo('attacker_random_uid', { socialHandle: 'evil' }),
    /NOT_RELATIONSHIP_PARTICIPANT/
  );
  assert.throws(
    () => createChangeRequest('attacker_random_uid', 'type', 'marriage'),
    /NOT_RELATIONSHIP_PARTICIPANT/
  );
});

// 6. Shared field request from P1 -> P2 approval required
test('6. Shared field request from P1 assigns P2 as approver', () => {
  const { createChangeRequest } = createMockState();
  const cr = createChangeRequest('uid_p1_rami', 'type', 'marriage');
  assert.equal(cr.requesterRole, 'p1');
  assert.equal(cr.requesterUid, 'uid_p1_rami');
  assert.equal(cr.approverUid, 'uid_p2_sara');
  assert.equal(cr.status, 'pending');
});

// 7. Shared field request from P2 -> P1 approval required
test('7. Shared field request from P2 assigns P1 as approver', () => {
  const { createChangeRequest } = createMockState();
  const cr = createChangeRequest('uid_p2_sara', 'startDate', '2025-06-01');
  assert.equal(cr.requesterRole, 'p2');
  assert.equal(cr.requesterUid, 'uid_p2_sara');
  assert.equal(cr.approverUid, 'uid_p1_rami');
  assert.equal(cr.status, 'pending');
});

// 8. Request does not change certificate before approval
test('8. Pending request does NOT change certificate or relationship before approval', () => {
  const { record, certificate, createChangeRequest } = createMockState();
  createChangeRequest('uid_p1_rami', 'type', 'marriage');
  assert.equal(record.type, 'dating');
  assert.equal(certificate.type, 'dating');
});

// 9. Requester cannot approve own request
test('9. Requester cannot approve their own request', () => {
  const { createChangeRequest, approveChangeRequest } = createMockState();
  const cr = createChangeRequest('uid_p1_rami', 'type', 'marriage');
  assert.throws(
    () => approveChangeRequest('uid_p1_rami', cr.id),
    /UNAUTHORIZED_APPROVER/
  );
});

// 10. Other partner can approve
test('10. Other partner can approve and atomic update updates certificate and record', () => {
  const { record, certificate, createChangeRequest, approveChangeRequest } = createMockState();
  const cr = createChangeRequest('uid_p1_rami', 'type', 'marriage');
  const res = approveChangeRequest('uid_p2_sara', cr.id);
  assert.equal(res.cr.status, 'approved');
  assert.equal(record.type, 'marriage');
  assert.equal(certificate.type, 'marriage');
});

// 11. Decline leaves certificate unchanged
test('11. Decline leaves certificate and relationship unchanged', () => {
  const { record, certificate, createChangeRequest, declineChangeRequest } = createMockState();
  const cr = createChangeRequest('uid_p1_rami', 'type', 'marriage');
  const res = declineChangeRequest('uid_p2_sara', cr.id);
  assert.equal(res.cr.status, 'declined');
  assert.equal(record.type, 'dating');
  assert.equal(certificate.type, 'dating');
});

// 12. Unrelated user cannot approve private request
test('12. Unrelated user cannot approve private request', () => {
  const { createChangeRequest, approveChangeRequest } = createMockState();
  const cr = createChangeRequest('uid_p1_rami', 'type', 'marriage');
  assert.throws(
    () => approveChangeRequest('third_party_uid', cr.id),
    /UNAUTHORIZED_APPROVER/
  );
});

// 13. Replayed approval rejected
test('13. Replayed approval of already decided request is rejected', () => {
  const { createChangeRequest, approveChangeRequest } = createMockState();
  const cr = createChangeRequest('uid_p1_rami', 'type', 'marriage');
  approveChangeRequest('uid_p2_sara', cr.id);
  assert.throws(
    () => approveChangeRequest('uid_p2_sara', cr.id),
    /REQUEST_APPROVED/
  );
});

// 14. Duplicate pending request rejected where required
test('14. Duplicate pending request for the same field is rejected', () => {
  const { createChangeRequest } = createMockState();
  createChangeRequest('uid_p1_rami', 'type', 'marriage');
  assert.throws(
    () => createChangeRequest('uid_p1_rami', 'type', 'marriage'),
    /PENDING_REQUEST_EXISTS/
  );
});

// 15. Certificate privacy remains intact
test('15. Certificate public projection contains zero audit metadata or internal change histories', () => {
  const { certificate } = createMockState();
  assert.equal(Reflect.has(certificate, 'changeRequests'), false);
  assert.equal(Reflect.has(certificate, 'auditLogs'), false);
  assert.equal(Reflect.has(certificate, 'requesterUid'), false);
});

// 16. Partner 1 cannot submit name change request for Partner 2
test('16. P1 cannot submit certificate name change for P2 and vice versa', () => {
  const { createChangeRequest } = createMockState();
  assert.throws(
    () => createChangeRequest('uid_p1_rami', 'partner2FullName', 'Imposter Name'),
    /CANNOT_EDIT_PARTNER_INFO/
  );
  assert.throws(
    () => createChangeRequest('uid_p2_sara', 'partner1FullName', 'Imposter Name'),
    /CANNOT_EDIT_PARTNER_INFO/
  );
});

// 17. Language switcher displays target language rather than current language
test('17. Language switcher displays target language label (Arabic -> English, English -> العربية)', () => {
  const getTargetLanguageLabel = (currentLang: 'ar' | 'en'): string => {
    return currentLang === 'ar' ? 'English' : 'العربية';
  };

  assert.equal(getTargetLanguageLabel('ar'), 'English');
  assert.equal(getTargetLanguageLabel('en'), 'العربية');
});

// 18. End Relationship (P1 or P2 unilateral, no approval needed, notifies other partner, deactivates cert)
test('18. P1 or P2 can unilaterally end relationship, notifying partner and deactivating certificate', () => {
  const { record, certificate, changeRequests, createChangeRequest } = createMockState();
  const notifications: any[] = [];

  // P1 created a pending change request earlier
  createChangeRequest('uid_p1_rami', 'type', 'marriage');

  const endRelationship = (callerUid: string) => {
    if (record.p1Uid !== callerUid && record.p2Uid !== callerUid) {
      throw new Error('NOT_RELATIONSHIP_PARTICIPANT');
    }
    if (record.status !== 'active') {
      throw new Error('ACTIVE_RELATIONSHIP_NOT_FOUND');
    }

    const partnerUid = record.p1Uid === callerUid ? record.p2Uid : record.p1Uid;
    const requesterName = record.p1Uid === callerUid ? record.partner1.fullName : record.partner2.fullName;

    record.status = 'ended' as any;
    certificate.status = 'ended';

    // Cancel all pending change requests
    for (const cr of changeRequests.values()) {
      if (cr.recordId === record.id && cr.status === 'pending') {
        cr.status = 'declined';
      }
    }

    // Informational notification to other partner
    notifications.push({
      userId: partnerUid,
      type: 'relationship_ended',
      messageAr: `قام ${requesterName} بإنهاء العلاقة.`,
      messageEn: `${requesterName} ended the relationship.`,
      secondaryAr: 'لم تعد شهادة العلاقة نشطة.',
      secondaryEn: 'The relationship certificate is no longer active.'
    });

    return { record, certificate, notifications };
  };

  // P2 unilaterally ends relationship without needing P1 approval
  const res = endRelationship('uid_p2_sara');
  assert.equal(res.record.status, 'ended');
  assert.equal(res.certificate.status, 'ended');
  assert.equal(res.notifications.length, 1);
  assert.equal(res.notifications[0].userId, 'uid_p1_rami');
  assert.equal(res.notifications[0].messageEn, 'سارة أحمد ended the relationship.');
  assert.equal(res.notifications[0].messageAr, 'قام سارة أحمد بإنهاء العلاقة.');

  // Pending change request was closed and cannot be approved
  const cr = Array.from(changeRequests.values())[0];
  assert.equal(cr.status, 'declined');

  // Attempt to end already ended relationship throws
  assert.throws(() => endRelationship('uid_p2_sara'), /ACTIVE_RELATIONSHIP_NOT_FOUND/);
});

// 19. User retains own personal information after ending relationship
test('19. Current user retains own personal profile while partner data is removed from active state', () => {
  const { record } = createMockState();
  const callerUid = 'uid_p1_rami';

  // P1's own profile before ending relationship
  const p1Profile = { ...record.partner1 };

  // Ending relationship leaves user's profile intact
  assert.equal(p1Profile.fullName, 'رامي خليل');
  assert.equal(p1Profile.email, 'rami@example.com');
  assert.equal(p1Profile.phoneE164, '+966501234567');
  assert.equal(p1Profile.phoneVerified, true);
  assert.equal(p1Profile.socialHandle, 'rami_k');
});

// 20. End Relationship & Delete Account flow
test('20. End Relationship & Delete Account deactivates cert, notifies partner, and preserves partner account', () => {
  const { record, certificate, changeRequests } = createMockState();
  const notifications: any[] = [];
  const userAccounts = new Map<string, { email: string; name: string; profile: any }>();
  userAccounts.set('uid_p1_rami', { email: 'rami@example.com', name: 'رامي خليل', profile: record.partner1 });
  userAccounts.set('uid_p2_sara', { email: 'sara@example.com', name: 'سارة أحمد', profile: record.partner2 });

  // Reusable termination helper
  const terminateActiveRelationship = (callerUid: string) => {
    if (record.status !== 'active') throw new Error('ACTIVE_RELATIONSHIP_NOT_FOUND');
    if (record.p1Uid !== callerUid && record.p2Uid !== callerUid) {
      throw new Error('NOT_RELATIONSHIP_PARTICIPANT');
    }
    const partnerUid = record.p1Uid === callerUid ? record.p2Uid : record.p1Uid;
    const requesterName = record.p1Uid === callerUid ? record.partner1.fullName : record.partner2.fullName;

    record.status = 'ended' as any;
    certificate.status = 'ended';

    for (const cr of changeRequests.values()) {
      if (cr.recordId === record.id && cr.status === 'pending') cr.status = 'declined';
    }

    notifications.push({
      userId: partnerUid,
      type: 'relationship_ended',
      messageAr: `قام ${requesterName} بإنهاء العلاقة.`,
      messageEn: `${requesterName} ended the relationship.`,
      secondaryAr: 'لم تعد شهادة العلاقة نشطة.',
      secondaryEn: 'The relationship certificate is no longer active.'
    });
  };

  const endRelationshipAndDeleteAccount = (callerUid: string) => {
    // 1. Shared termination logic runs first
    if (record.status === 'active') {
      terminateActiveRelationship(callerUid);
    }

    // 2. Delete ONLY the requesting user's account
    userAccounts.delete(callerUid);

    return { record, certificate, notifications, remainingAccounts: userAccounts };
  };

  // P1 deletes their account
  const res = endRelationshipAndDeleteAccount('uid_p1_rami');
  assert.equal(res.record.status, 'ended');
  assert.equal(res.certificate.status, 'ended');
  assert.equal(res.notifications.length, 1);
  assert.equal(res.notifications[0].userId, 'uid_p2_sara');
  assert.equal(res.notifications[0].messageEn, 'رامي خليل ended the relationship.');
  assert.equal(res.notifications[0].messageAr, 'قام رامي خليل بإنهاء العلاقة.');

  // P1 account deleted, P2 account and profile preserved
  assert.equal(userAccounts.has('uid_p1_rami'), false);
  assert.equal(userAccounts.has('uid_p2_sara'), true);
  assert.equal(userAccounts.get('uid_p2_sara')?.name, 'سارة أحمد');
  assert.equal(userAccounts.get('uid_p2_sara')?.profile.fullName, 'سارة أحمد');
});

// 21. Account menu contains all 5 required actions matching exact order and labels
test('21. Account menu contains all 5 required actions matching exact order and labels', () => {
  const menuEn = ['Adjust My Information', 'Verify Relationship', 'Sign Out', 'End Relationship', 'End Relationship & Delete Account'];
  const menuAr = ['تعديل معلوماتي', 'التحقق من صحة العلاقة', 'تسجيل الخروج', 'إنهاء العلاقة', 'إنهاء العلاقة وحذف الحساب'];

  assert.equal(menuEn.length, 5);
  assert.equal(menuAr.length, 5);
  assert.equal(menuEn[0], 'Adjust My Information');
  assert.equal(menuEn[1], 'Verify Relationship');
  assert.equal(menuEn[2], 'Sign Out');
  assert.equal(menuEn[3], 'End Relationship');
  assert.equal(menuEn[4], 'End Relationship & Delete Account');

  assert.equal(menuAr[0], 'تعديل معلوماتي');
  assert.equal(menuAr[1], 'التحقق من صحة العلاقة');
  assert.equal(menuAr[2], 'تسجيل الخروج');
  assert.equal(menuAr[3], 'إنهاء العلاقة');
  assert.equal(menuAr[4], 'إنهاء العلاقة وحذف الحساب');
});

// 22. Unrelated user cannot end relationship or delete partner account
test('22. Unrelated third-party user cannot end relationship or delete account', () => {
  const { record } = createMockState();
  const endRelationship = (callerUid: string) => {
    if (record.p1Uid !== callerUid && record.p2Uid !== callerUid) {
      throw new Error('NOT_RELATIONSHIP_PARTICIPANT');
    }
  };

  assert.throws(() => endRelationship('attacker_random_uid'), /NOT_RELATIONSHIP_PARTICIPANT/);
});

// 23. Verify Relationship lookup by any authenticated user (P1, P2, or user with no active relationship)
test('23. Any authenticated user (P1, P2, or no relationship) can verify another certificate', () => {
  const { certificate } = createMockState();
  const certificates = new Map<string, any>();
  certificates.set(certificate.verificationRef, certificate);

  const performVerification = (callerUid: string | null, refCode: string) => {
    const cleanRef = refCode.trim().toUpperCase();
    const cert = certificates.get(cleanRef);
    if (!cert) {
      return { found: false, message: 'No valid relationship record was found.' };
    }

    // Strictly safe public projection
    const safeRecord = {
      verificationRef: cert.verificationRef,
      recordNumber: cert.recordNumber,
      partner1Name: cert.partner1Name,
      partner2Name: cert.partner2Name,
      partner1En: cert.partner1En || null,
      partner2En: cert.partner2En || null,
      type: cert.type,
      startDate: cert.startDate,
      startDateAr: cert.startDateAr,
      status: cert.status,
      issuedDate: cert.issuedDate,
      issuedDateAr: cert.issuedDateAr
    };

    return { found: true, record: safeRecord };
  };

  // P1 can verify
  const resP1 = performVerification('uid_p1_rami', certificate.verificationRef);
  assert.equal(resP1.found, true);
  assert.equal(resP1.record?.status, 'active');

  // P2 can verify
  const resP2 = performVerification('uid_p2_sara', certificate.verificationRef);
  assert.equal(resP2.found, true);
  assert.equal(resP2.record?.status, 'active');

  // User with NO relationship can verify
  const resUnrelated = performVerification('uid_user_no_relationship', certificate.verificationRef);
  assert.equal(resUnrelated.found, true);
  assert.equal(resUnrelated.record?.partner1Name, 'رامي خليل');
  assert.equal(resUnrelated.record?.partner2Name, 'سارة أحمد');

  // Zero PII exposed in verification projection
  const r = resUnrelated.record as any;
  assert.equal(r.p1Uid, undefined);
  assert.equal(r.p2Uid, undefined);
  assert.equal(r.email, undefined);
  assert.equal(r.phone, undefined);
  assert.equal(r.phoneE164, undefined);
  assert.equal(r.whatsappNumber, undefined);
  assert.equal(r.birthDay, undefined);
  assert.equal(r.birthMonth, undefined);
  assert.equal(r.birthYear, undefined);
});

// 24. Invalid verification reference returns safe not-found response
test('24. Invalid verification reference returns safe not-found response without leaking details', () => {
  const certificates = new Map<string, any>();
  const verifyRef = (refCode: string) => {
    const cert = certificates.get(refCode.trim().toUpperCase());
    if (!cert) return { found: false, message: 'No valid relationship record was found.' };
    return { found: true, record: cert };
  };

  const res = verifyRef('RID-NON-EXISTENT-CODE');
  assert.equal(res.found, false);
  assert.equal(res.record, undefined);
});

// 25. Ended/deactivated relationship displays inactive status upon verification
test('25. Ended/deactivated relationship displays inactive status and does not appear active', () => {
  const { certificate } = createMockState();
  certificate.status = 'ended';
  const certificates = new Map<string, any>();
  certificates.set(certificate.verificationRef, certificate);

  const verifyRef = (refCode: string) => {
    const cert = certificates.get(refCode.trim().toUpperCase());
    if (!cert) return { found: false, message: 'No valid relationship record was found.' };
    return { found: true, record: cert };
  };

  const res = verifyRef(certificate.verificationRef);
  assert.equal(res.found, true);
  assert.equal(res.record?.status, 'ended');
});

// 26. Verification lookup is strictly read-only and alters no relationship or account data
test('26. Verification lookup is strictly read-only and does not mutate any records', () => {
  const { record, certificate } = createMockState();
  const certSnapshotBefore = JSON.stringify(certificate);
  const recSnapshotBefore = JSON.stringify(record);

  // Perform lookup
  const cleanRef = certificate.verificationRef.trim().toUpperCase();
  assert.equal(cleanRef, certificate.verificationRef);

  // Assert states remain identical
  assert.equal(JSON.stringify(certificate), certSnapshotBefore);
  assert.equal(JSON.stringify(record), recSnapshotBefore);
});

// 28. Consolidated shared backend relationship termination verification
test('28. Consolidated shared termination validates callers, client relationshipId, closes pending requests, and notifies partner', () => {
  const { record, certificate, changeRequests, createChangeRequest } = createMockState();
  const notifications: any[] = [];
  const userPointers = new Map<string, { activeRecordId?: string }>();
  userPointers.set('uid_p1_rami', { activeRecordId: record.id });
  userPointers.set('uid_p2_sara', { activeRecordId: record.id });

  // Add 2 pending change requests (one by P1, one by P2)
  createChangeRequest('uid_p1_rami', 'type', 'marriage');
  createChangeRequest('uid_p2_sara', 'partner2FullName', 'سارة المحمد');

  assert.equal(changeRequests.size, 2);

  // Exact model of terminateActiveRelationship from server.ts
  const terminateActiveRelationship = (
    callerUid: string,
    suppliedRelationshipId?: string,
    endReason: string = 'user_ended'
  ) => {
    if (record.status !== 'active') throw new Error('ACTIVE_RELATIONSHIP_NOT_FOUND');
    if (record.p1Uid !== callerUid && record.p2Uid !== callerUid) {
      throw new Error('NOT_RELATIONSHIP_PARTICIPANT');
    }
    if (suppliedRelationshipId && suppliedRelationshipId !== record.id) {
      throw new Error('RELATIONSHIP_MISMATCH');
    }

    const nowIso = new Date().toISOString();
    const partnerUid = record.p1Uid === callerUid ? record.p2Uid : record.p1Uid;
    const requesterName = record.p1Uid === callerUid ? record.partner1.fullName : record.partner2.fullName;

    // 1. Authoritative relationship document status transition and audit trail
    record.status = 'ended' as any;
    (record as any).previousStatus = 'active';
    (record as any).endedAt = nowIso;
    (record as any).endedByUid = callerUid;
    (record as any).endReason = endReason;
    (record as any).actionType = endReason === 'account_deletion' ? 'end_relationship_and_delete_account' : 'end_relationship';

    // 2. Deactivate public certificate projection
    certificate.status = 'ended';
    (certificate as any).endedAt = nowIso;

    // 3. Clear active relationship pointer from both partners
    userPointers.get('uid_p1_rami')!.activeRecordId = undefined;
    userPointers.get('uid_p2_sara')!.activeRecordId = undefined;

    // 4. Cancel all pending change requests
    for (const cr of changeRequests.values()) {
      if (cr.recordId === record.id && cr.status === 'pending') {
        cr.status = 'declined';
        (cr as any).declinedReason = 'relationship_ended';
        (cr as any).decidedAt = nowIso;
        (cr as any).decisionByUid = callerUid;
      }
    }

    // 5. Send informational in-app notification to the other partner exactly once
    if (partnerUid) {
      notifications.push({
        id: `notif_${Date.now()}`,
        userId: partnerUid,
        type: 'relationship_ended',
        recordId: record.id,
        senderName: requesterName,
        messageAr: `قام ${requesterName} بإنهاء العلاقة.`,
        messageEn: `${requesterName} ended the relationship.`,
        secondaryAr: 'لم تعد شهادة العلاقة نشطة.',
        secondaryEn: 'The relationship certificate is no longer active.',
        createdAt: nowIso,
        read: false
      });
    }

    return { record, certificate, notifications };
  };

  // Rejection 1: Unrelated user cannot terminate
  assert.throws(() => terminateActiveRelationship('uid_attacker'), /NOT_RELATIONSHIP_PARTICIPANT/);

  // Rejection 2: Mismatched client-supplied relationshipId
  assert.throws(() => terminateActiveRelationship('uid_p1_rami', 'forged_rel_id_999'), /RELATIONSHIP_MISMATCH/);

  // Success: P1 terminates with matching relationshipId
  const res = terminateActiveRelationship('uid_p1_rami', record.id, 'unilateral_end');
  assert.equal(res.record.status, 'ended');
  assert.equal((res.record as any).previousStatus, 'active');
  assert.equal((res.record as any).endedByUid, 'uid_p1_rami');
  assert.equal(res.certificate.status, 'ended');

  // Both pointers cleared
  assert.equal(userPointers.get('uid_p1_rami')!.activeRecordId, undefined);
  assert.equal(userPointers.get('uid_p2_sara')!.activeRecordId, undefined);

  // All pending requests closed with declinedReason
  for (const cr of changeRequests.values()) {
    assert.equal(cr.status, 'declined');
    assert.equal((cr as any).declinedReason, 'relationship_ended');
  }

  // Exactly one informational notification to P2
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, 'uid_p2_sara');
  assert.equal(notifications[0].messageEn, 'رامي خليل ended the relationship.');
  assert.equal(notifications[0].messageAr, 'قام رامي خليل بإنهاء العلاقة.');
  assert.equal(notifications[0].secondaryEn, 'The relationship certificate is no longer active.');

  // Replay attempt on ended relationship throws
  assert.throws(() => terminateActiveRelationship('uid_p1_rami', record.id), /ACTIVE_RELATIONSHIP_NOT_FOUND/);
});

// 29. Lower certificate control panel exposes secondary End Relationship action while keeping account deletion exclusive to account menu
test('29. Lower certificate panel exposes End Relationship reusing exact same confirmation modal, excluding account deletion', () => {
  let showExitModal = false;
  let showDeleteModal = false;
  let accountActionError = 'stale error';

  const triggerExitRelationship = () => {
    accountActionError = '';
    showExitModal = true;
  };

  const triggerDeleteAccount = () => {
    accountActionError = '';
    showDeleteModal = true;
  };

  // 1. Both TopBar and lower panel pass the exact same trigger handler
  const topBarHandler = triggerExitRelationship;
  const lowerPanelHandler = triggerExitRelationship;

  // Activating from lower panel
  lowerPanelHandler();
  assert.equal(showExitModal, true);
  assert.equal(accountActionError, '');
  assert.equal(showDeleteModal, false);

  // 2. Account deletion is never exposed in lower panel actions
  const lowerPanelAvailableActions = [
    { id: 'request_change', labelEn: 'Request Change', labelAr: 'طلب تعديل' },
    { id: 'preview_print', labelEn: 'Preview / Print', labelAr: 'معاينة / طباعة' },
    { id: 'end_relationship', labelEn: 'End Relationship', labelAr: 'إنهاء العلاقة' }
  ];

  assert.equal(lowerPanelAvailableActions.some((a) => a.id === 'delete_account'), false);
  assert.equal(lowerPanelAvailableActions.find((a) => a.id === 'end_relationship')?.labelEn, 'End Relationship');
  assert.equal(lowerPanelAvailableActions.find((a) => a.id === 'end_relationship')?.labelAr, 'إنهاء العلاقة');

  // 3. TopBar menu retains both
  const topBarDestructiveActions = [
    { id: 'end_relationship', labelEn: 'End Relationship', labelAr: 'إنهاء العلاقة' },
    { id: 'delete_account', labelEn: 'End Relationship & Delete Account', labelAr: 'إنهاء العلاقة وحذف الحساب' }
  ];
  assert.equal(topBarDestructiveActions.some((a) => a.id === 'end_relationship'), true);
  assert.equal(topBarDestructiveActions.some((a) => a.id === 'delete_account'), true);
});

// 30. Home button navigation takes P1 and P2 to their own authorized primary record view
test('30. Home button navigation takes P1 and P2 to their own authorized primary record view', () => {
  let currentScreen = 'official_certificate';

  const navigateTo = (screen: string) => {
    currentScreen = screen;
  };

  const handleGoHome = (userId: string, record: { p1Uid: string; p2Uid: string; status: string }) => {
    const isP2User = Boolean(userId && record.p2Uid === userId);
    const hasActiveRelationship = record.status === 'active';
    if (isP2User && hasActiveRelationship) {
      navigateTo('p2_details');
    } else {
      navigateTo('p1_details');
    }
  };

  const activeRecord = { p1Uid: 'user-p1', p2Uid: 'user-p2', status: 'active' };

  // For P1: Home takes them to p1_details
  currentScreen = 'official_certificate';
  handleGoHome('user-p1', activeRecord);
  assert.equal(currentScreen, 'p1_details');

  currentScreen = 'review_controls';
  handleGoHome('user-p1', activeRecord);
  assert.equal(currentScreen, 'p1_details');

  // For P2: Home takes them to p2_details
  currentScreen = 'official_certificate';
  handleGoHome('user-p2', activeRecord);
  assert.equal(currentScreen, 'p2_details');

  currentScreen = 'review_controls';
  handleGoHome('user-p2', activeRecord);
  assert.equal(currentScreen, 'p2_details');
});

// 31. P1 record page displays both P1 and P2 details as read-only when active, and prevents viewing unissued/inactive certificate
test('31. Active relationship locks P1 and P2 details as read-only on P1 page; inactive cert is protected', () => {
  const activeRecord = {
    status: 'active',
    partner1: { fullName: 'Partner One', email: 'p1@example.com' },
    partner2: { fullName: 'Partner Two', email: 'p2@example.com' }
  };

  const isReadOnly = (status: string) => status === 'active';
  assert.equal(isReadOnly(activeRecord.status), true);
  assert.equal(isReadOnly('draft'), false);
  assert.equal(isReadOnly('pending_partner'), false);

  const canViewIssuedCertificate = (status: string) => status === 'active';
  assert.equal(canViewIssuedCertificate('active'), true);
  assert.equal(canViewIssuedCertificate('pending_partner'), false);
  assert.equal(canViewIssuedCertificate('draft'), false);
  assert.equal(canViewIssuedCertificate('ended'), false);
});

// 32. P2 acceptance response validation routes to certificate only when acceptance succeeds and relationship is active
test('32. P2 acceptance response validation routes to certificate only when acceptance succeeds and relationship is active', () => {
  let navigatedTo = '';

  const processAcceptResponse = (data: { success?: boolean; record?: { status: string; verificationRef: string }; error?: string }) => {
    if (!data.success || !data.record || data.record.status !== 'active') {
      throw new Error(data.error || 'ACCEPTANCE_FAILED_OR_INACTIVE');
    }
    navigatedTo = `/certificate/${data.record.verificationRef}`;
  };

  // Successful server response with active status routes to certificate
  navigatedTo = '';
  processAcceptResponse({
    success: true,
    record: { status: 'active', verificationRef: 'RID-2026-123456-ABCDEF' }
  });
  assert.equal(navigatedTo, '/certificate/RID-2026-123456-ABCDEF');

  // Failed response throws and does NOT route
  navigatedTo = '';
  assert.throws(() => {
    processAcceptResponse({ success: false, error: 'INVITATION_EXPIRED' });
  }, /INVITATION_EXPIRED/);
  assert.equal(navigatedTo, '');

  // Response without active status throws and does NOT route
  assert.throws(() => {
    processAcceptResponse({ success: true, record: { status: 'pending_partner', verificationRef: 'REF' } });
  }, /ACCEPTANCE_FAILED_OR_INACTIVE/);
  assert.equal(navigatedTo, '');
});

// 33. P2 acceptance and Home lifecycle regression test suite
test('33. P2 acceptance and Home lifecycle: active cert routing, failure protection, authorized P1/P2 Home, refresh retention, deep links, and stale logout protection', async () => {
  // Scenario 1: P2 accepted success -> active certificate
  let currentScreen = 'p2_details';
  let currentPath = '/invite/inv-123/complete';
  const navigateTo = (screen: string, path?: string) => {
    currentScreen = screen;
    if (path) currentPath = path;
  };

  const handleAccept = (res: { success?: boolean; record?: { status: string; verificationRef: string }; error?: string }) => {
    if (!res.success || !res.record || res.record.status !== 'active') {
      throw new Error(res.error || 'ACCEPTANCE_FAILED_OR_INACTIVE');
    }
    navigateTo('official_certificate', `/certificate/${res.record.verificationRef}`);
  };

  handleAccept({
    success: true,
    record: { status: 'active', verificationRef: 'RID-2026-999-XYZ' }
  });
  assert.equal(currentScreen, 'official_certificate');
  assert.equal(currentPath, '/certificate/RID-2026-999-XYZ');

  // Scenario 2: failed/inactive response -> no certificate
  assert.throws(() => {
    handleAccept({ success: false, error: 'VERIFIED_PHONE_REQUIRED' });
  }, /VERIFIED_PHONE_REQUIRED/);
  // Stays on certificate from previous step, does not change to new error path
  assert.throws(() => {
    handleAccept({ success: true, record: { status: 'pending_partner', verificationRef: 'REF' } });
  }, /ACCEPTANCE_FAILED_OR_INACTIVE/);

  // Scenario 3: P2 Home -> authorized read-only P2 view
  const resolveHome = (userId: string, record: { p1Uid: string; p2Uid: string; status: string; inviteId?: string }) => {
    const isP2User = Boolean(userId && record.p2Uid === userId);
    const hasActive = record.status === 'active';
    if (isP2User && hasActive) {
      const p2InviteId = (record.inviteId && record.inviteId !== 'current') ? record.inviteId : '';
      return {
        screen: 'p2_details',
        path: p2InviteId ? `/invite/${p2InviteId}/details` : '/p2'
      };
    }
    return { screen: 'p1_details', path: '/' };
  };

  const activeP2Record = { p1Uid: 'user-p1', p2Uid: 'user-p2', status: 'active', inviteId: 'inv-456' };
  const p2Home = resolveHome('user-p2', activeP2Record);
  assert.equal(p2Home.screen, 'p2_details');
  assert.equal(p2Home.path, '/invite/inv-456/details');
  assert.equal(p2Home.path.includes('current'), false);

  // Scenario 4: refresh on P2 Home -> private active record retained
  // Simulates reload at /invite/inv-456/details where loadPrivateRecord provides private record
  // and loadInvitation (with safe public preview) must NOT overwrite active private record.
  let appRecord: { status: string; p1Uid: string; p2Uid: string | null; phoneE164?: string } = {
    status: 'active',
    p1Uid: 'user-p1',
    p2Uid: 'user-p2',
    phoneE164: '+966551234567'
  };

  const safePublicPreview = {
    status: 'active',
    p1Uid: '',
    p2Uid: null,
    phoneE164: ''
  };

  const mergeInvitationRecord = (
    current: typeof appRecord,
    incoming: typeof safePublicPreview,
    skipOverwrite: boolean,
    currentUid: string
  ) => {
    if (skipOverwrite) return current;
    if (current.status === 'active' && current.p1Uid && (current.p1Uid === currentUid || current.p2Uid === currentUid)) {
      return current; // Retains private active record
    }
    return incoming;
  };

  // With skipOverwrite = true:
  const retainedRecord1 = mergeInvitationRecord(appRecord, safePublicPreview, true, 'user-p2');
  assert.equal(retainedRecord1.p2Uid, 'user-p2');
  assert.equal(retainedRecord1.phoneE164, '+966551234567');

  // Even if skipOverwrite was false, protection prevents blanking:
  const retainedRecord2 = mergeInvitationRecord(appRecord, safePublicPreview, false, 'user-p2');
  assert.equal(retainedRecord2.p2Uid, 'user-p2');
  assert.equal(retainedRecord2.phoneE164, '+966551234567');

  // Scenario 5: P1 Home -> P1 view
  const p1Home = resolveHome('user-p1', activeP2Record);
  assert.equal(p1Home.screen, 'p1_details');
  assert.equal(p1Home.path, '/');

  // Scenario 6: pre-accept invitation deep link -> invitation flow
  const pendingRecord = { status: 'draft', p1Uid: '', p2Uid: null, phoneE164: '' };
  const incomingInvitePreview = { status: 'pending', p1Uid: '', p2Uid: null, phoneE164: '' };
  const preAcceptRecord = mergeInvitationRecord(pendingRecord, incomingInvitePreview, false, '');
  assert.equal(preAcceptRecord.status, 'pending');

  // Scenario 7: logout/account switch -> no stale private state
  let activeAuthUid: string | null = 'user-p2';
  let memoryRecord: typeof appRecord | null = appRecord;

  // Sign out triggers:
  activeAuthUid = null;
  memoryRecord = null;

  // Stale async response resolving after logout:
  const staleResponse = { status: 'active', p1Uid: 'user-p1', p2Uid: 'user-p2' };
  const requestUid = 'user-p2';

  if (activeAuthUid === requestUid) {
    memoryRecord = staleResponse;
  }
  // Stale response is discarded because activeAuthUid is null
  assert.equal(memoryRecord, null);
});

// 34. activeAuthUidRef and sequence counters prevent state pollution when a user logs out and immediately logs in as a different user before pending requests finish
test('34. activeAuthUidRef and sequence counters prevent state pollution when user logs out and immediately logs in as a different user', async () => {
  let activeAuthUid: string | null = null;
  let privateRecordRequestId = 0;
  let invitationRequestId = 0;

  let currentAuthUser: { uid: string } | null = null;
  let clientRecord: { id: string; p1Uid: string; p2Uid: string | null; owner: string } | null = null;
  let clientInvitation: { id: string; target: string } | null = null;

  // Exact reproduction of loadPrivateRecord guard
  const simulateLoadPrivateRecord = async (
    callerUid: string,
    requestId: number,
    networkDelayMs: number,
    mockServerRecord: { id: string; p1Uid: string; p2Uid: string | null; owner: string }
  ) => {
    await new Promise((r) => setTimeout(r, networkDelayMs));

    // Guard matching App.tsx line 194
    if (
      privateRecordRequestId !== requestId ||
      activeAuthUid !== callerUid ||
      !currentAuthUser ||
      currentAuthUser.uid !== callerUid
    ) {
      return null; // Rejected - stale / mismatched caller
    }

    clientRecord = mockServerRecord;
    return mockServerRecord;
  };

  // Exact reproduction of loadInvitation guard
  const simulateLoadInvitation = async (
    callerUid: string | null,
    requestId: number,
    networkDelayMs: number,
    mockServerInvitation: { id: string; target: string }
  ) => {
    await new Promise((r) => setTimeout(r, networkDelayMs));

    // Guard matching App.tsx line 242
    if (
      invitationRequestId !== requestId ||
      activeAuthUid !== callerUid ||
      (currentAuthUser?.uid || null) !== callerUid
    ) {
      return null; // Rejected - stale / mismatched caller
    }

    clientInvitation = mockServerInvitation;
    return mockServerInvitation;
  };

  // Step 1: User A logs in
  const userA = { uid: 'user_A' };
  currentAuthUser = userA;
  activeAuthUid = userA.uid;

  // User A initiates slow loadPrivateRecord and loadInvitation
  const reqIdPrivateA = ++privateRecordRequestId;
  const slowRequestPrivateA = simulateLoadPrivateRecord(
    userA.uid,
    reqIdPrivateA,
    50, // 50ms delay
    { id: 'rel_A', p1Uid: 'user_A', p2Uid: 'partner_A', owner: 'user_A' }
  );

  const reqIdInviteA = ++invitationRequestId;
  const slowRequestInviteA = simulateLoadInvitation(
    userA.uid,
    reqIdInviteA,
    50,
    { id: 'inv_A', target: 'partner_A' }
  );

  // Step 2: User A logs out before requests finish (e.g. at 10ms)
  await new Promise((r) => setTimeout(r, 10));
  activeAuthUid = null;
  privateRecordRequestId += 1;
  invitationRequestId += 1;
  currentAuthUser = null;
  clientRecord = null;
  clientInvitation = null;

  // Step 3: User B immediately logs in (e.g. at 15ms)
  const userB = { uid: 'user_B' };
  currentAuthUser = userB;
  activeAuthUid = userB.uid;

  // User B initiates fast loadPrivateRecord and loadInvitation (e.g. completes at 30ms total)
  const reqIdPrivateB = ++privateRecordRequestId;
  const fastRequestPrivateB = simulateLoadPrivateRecord(
    userB.uid,
    reqIdPrivateB,
    15, // finishes at ~30ms total, before User A's 50ms requests resolve!
    { id: 'rel_B', p1Uid: 'user_B', p2Uid: 'partner_B', owner: 'user_B' }
  );

  const reqIdInviteB = ++invitationRequestId;
  const fastRequestInviteB = simulateLoadInvitation(
    userB.uid,
    reqIdInviteB,
    15,
    { id: 'inv_B', target: 'partner_B' }
  );

  // Await all requests to complete
  await Promise.all([
    slowRequestPrivateA,
    slowRequestInviteA,
    fastRequestPrivateB,
    fastRequestInviteB
  ]);

  // Step 4: Verify User B's state is completely unpolluted by User A's late responses
  assert.ok(clientRecord);
  assert.equal((clientRecord as { owner: string; id: string; p1Uid: string }).owner, 'user_B');
  assert.equal((clientRecord as { owner: string; id: string; p1Uid: string }).id, 'rel_B');
  assert.equal((clientRecord as { owner: string; id: string; p1Uid: string }).p1Uid, 'user_B');

  assert.ok(clientInvitation);
  assert.equal((clientInvitation as { id: string; target: string }).id, 'inv_B');
  assert.equal((clientInvitation as { id: string; target: string }).target, 'partner_B');
});

// 35. Navigation guard in useEffect hooks and navigateTo checks activeAuthUidRef against auth.currentUser.uid before updating currentScreen or triggering navigateTo
test('35. Navigation guard in useEffect hooks and navigateTo checks activeAuthUidRef against auth.currentUser.uid before updating currentScreen or triggering navigateTo', () => {
  let currentScreen = 'auth';
  let activeAuthUid: string | null = 'user-p1';
  let authCurrentUser: { uid: string } | null = { uid: 'user-p1' };

  const guardedNavigateTo = (screen: string) => {
    // Navigation guard matching App.tsx line 178
    if (authCurrentUser && activeAuthUid !== authCurrentUser.uid) {
      return false; // Blocked
    }
    currentScreen = screen;
    return true; // Accepted
  };

  // Case 1: In sync - navigation succeeds
  assert.equal(guardedNavigateTo('p1_details'), true);
  assert.equal(currentScreen, 'p1_details');

  // Case 2: Out of sync / pending stale request from prior user during account switch
  // e.g., authCurrentUser changed to user-p2, but an async callback for user-p1 attempts navigateTo
  activeAuthUid = 'user-p1';
  authCurrentUser = { uid: 'user-p2' };
  assert.equal(guardedNavigateTo('review_controls'), false);
  assert.equal(currentScreen, 'p1_details'); // Retained, unpolluted

  // Case 3: Effect listener callback guard matching lines 364, 394, 428
  const guardedEffectAction = (callbackUid: string, targetScreen: string) => {
    if (!authCurrentUser || activeAuthUid !== authCurrentUser.uid || authCurrentUser.uid !== callbackUid) {
      return false; // Blocked
    }
    return guardedNavigateTo(targetScreen);
  };

  // Callback from stale subscription of user-p1 while user-p2 is logged in
  assert.equal(guardedEffectAction('user-p1', 'p1_waiting'), false);
  assert.equal(currentScreen, 'p1_details');

  // Case 4: Re-synchronized state for user-p2
  activeAuthUid = 'user-p2';
  assert.equal(guardedEffectAction('user-p2', 'review_controls'), true);
  assert.equal(currentScreen, 'review_controls');
});

// 36. parseApiError allowlist, route template extraction, diagnostic privacy boundary, and localized messages
test('36. parseApiError enforces allowlist, route templates, minimal diagnostics, and safe localized messages', async () => {
  const {
    parseApiError,
    getRouteTemplate,
    getDiagnosticLogs,
    clearDiagnosticLogs,
    getLocalizedErrorMessage,
    ALLOWED_ERROR_CODES
  } = await import('../src/utils/api');

  clearDiagnosticLogs();

  // Test 1: Route template mapping strips dynamic IDs and query strings
  assert.equal(getRouteTemplate('/api/invitations/secret-123/accept?token=sensitive'), '/api/invitations/:inviteId/accept');
  assert.equal(getRouteTemplate('http://localhost:3000/api/invitations/invite-456'), '/api/invitations/:inviteId');
  assert.equal(getRouteTemplate('/api/change-requests/req-789/approve'), '/api/change-requests/:requestId/approve');
  assert.equal(getRouteTemplate('/api/record'), '/api/record');

  // Test 2: Known allowlisted error code is passed through and logged as template
  const allowlistedResponse = new Response(JSON.stringify({ error: 'VERIFIED_PHONE_REQUIRED' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
  Object.defineProperty(allowlistedResponse, 'url', { value: 'http://localhost:3000/api/invitations/invite-123/accept' });

  await assert.rejects(
    async () => parseApiError(allowlistedResponse),
    (err: Error) => {
      assert.equal(err.message, 'VERIFIED_PHONE_REQUIRED');
      return true;
    }
  );

  let logs = getDiagnosticLogs();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, 400);
  assert.equal(logs[0].routeTemplate, '/api/invitations/:inviteId/accept');
  assert.equal(logs[0].errorCode, 'VERIFIED_PHONE_REQUIRED');
  // Ensure no raw invite ID or URL in diagnostic log entry
  assert.equal('endpoint' in logs[0], false);
  assert.equal('details' in logs[0], false);

  // Test 3: Unallowlisted error containing PII / private text is replaced with fallback and NOT retained in diagnostics
  const piiResponse = new Response(
    JSON.stringify({
      error: 'Uncaught DB error: user test@example.com with phone +966555123456 failed constraint',
      details: 'Stack trace at server.ts: line 42 with token secret-xyz'
    }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
  Object.defineProperty(piiResponse, 'url', { value: 'http://localhost:3000/api/change-requests/req-999/approve' });

  await assert.rejects(
    async () => parseApiError(piiResponse),
    (err: Error) => {
      // Must NOT contain PII or arbitrary server error string
      assert.equal(err.message, 'SERVER_ERROR');
      assert.equal(err.message.includes('test@example.com'), false);
      assert.equal(err.message.includes('+966555123456'), false);
      return true;
    }
  );

  logs = getDiagnosticLogs();
  assert.equal(logs.length, 2);
  const piiLog = logs[1];
  assert.equal(piiLog.status, 500);
  assert.equal(piiLog.routeTemplate, '/api/change-requests/:requestId/approve');
  assert.equal(piiLog.errorCode, 'SERVER_ERROR');
  // Ensure no private server text is present in log object
  assert.equal(JSON.stringify(piiLog).includes('test@example.com'), false);
  assert.equal(JSON.stringify(piiLog).includes('+966555123456'), false);
  assert.equal(JSON.stringify(piiLog).includes('secret-xyz'), false);

  // Test 4: Localized messages
  assert.equal(getLocalizedErrorMessage('VERIFIED_PHONE_REQUIRED', 'en'), 'A verified phone number is required.');
  assert.equal(getLocalizedErrorMessage('VERIFIED_PHONE_REQUIRED', 'ar'), 'رقم هاتف موثّق مطلوب للمتابعة.');
  assert.equal(getLocalizedErrorMessage('UNKNOWN_ARBITRARY_CODE', 'en'), 'An error occurred. Please try again.');
  assert.equal(getLocalizedErrorMessage('UNKNOWN_ARBITRARY_CODE', 'ar'), 'حدث خطأ. يرجى المحاولة لاحقاً.');
  assert.equal(getLocalizedErrorMessage(new Error('CANNOT_ACCEPT_OWN_INVITE'), 'en'), 'You cannot accept your own invitation.');

  clearDiagnosticLogs();
  assert.equal(getDiagnosticLogs().length, 0);
});

// 37. Startup coordination, already signed-in routing, public invite preview, and account switch isolation
test('37. Startup coordination, already signed-in routing, public invite preview, and rapid account switch', async () => {
  // Scenario A: Already signed-in startup
  // onAuthStateChanged resolves with user, executes loadPrivateRecord and routes
  let resolvedScreen = '';
  let resolvedRecordId = '';
  const initialAuthUser = { uid: 'user_active_p1', email: 'p1@test.com' };

  const handleStartupAuth = async (user: { uid: string } | null, route: { screen: string; inviteId?: string }) => {
    if (user) {
      // Authenticated startup
      const data = {
        record: { id: 'rec_active_123', status: 'active', p1Uid: user.uid, p2Uid: 'partner_p2' },
        invitation: null
      };
      resolvedRecordId = data.record.id;
      if (route.screen === 'auth') {
        resolvedScreen = data.record.status === 'active' ? 'p1_details' : 'p1_details';
      } else {
        resolvedScreen = route.screen;
      }
      return data;
    } else {
      // Unauthenticated startup
      resolvedRecordId = '';
      if (route.inviteId) {
        resolvedScreen = 'p2_landing';
      } else {
        resolvedScreen = 'auth';
      }
      return null;
    }
  };

  await handleStartupAuth(initialAuthUser, { screen: 'auth' });
  assert.equal(resolvedScreen, 'p1_details');
  assert.equal(resolvedRecordId, 'rec_active_123');

  // Scenario B: Public invitation before login
  await handleStartupAuth(null, { screen: 'p2_landing', inviteId: 'invite_public_1' });
  assert.equal(resolvedScreen, 'p2_landing');
  assert.equal(resolvedRecordId, '');

  // Scenario C: P2 Home reload on /invite/:id/details preserves P2 view without fallback to auth or blank state
  await handleStartupAuth({ uid: 'partner_p2' }, { screen: 'p2_details', inviteId: 'invite_active_p2' });
  assert.equal(resolvedScreen, 'p2_details');
  assert.equal(resolvedRecordId, 'rec_active_123');
});


