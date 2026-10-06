export interface AccountMenuItemsInput {
  signedIn: boolean;
  hasActiveRelationship: boolean;
  isDeleting?: boolean;
}

export interface AccountMenuItems {
  blockedPeople: boolean;
  signOut: boolean;
  endRelationship: boolean;
  deleteAccount: boolean;
}

export function getAccountMenuItems({
  signedIn,
  hasActiveRelationship,
  isDeleting = false
}: {
  signedIn: boolean;
  hasActiveRelationship: boolean;
  isDeleting?: boolean;
}): AccountMenuItems {
  return {
    blockedPeople: Boolean(signedIn),
    signOut: Boolean(signedIn),
    deleteAccount: Boolean(signedIn),
    endRelationship: Boolean(signedIn && (hasActiveRelationship || isDeleting))
  };
}

export function classifyRelationshipSnapshot({
  exists,
  status
}: {
  exists: boolean;
  status?: string;
}): 'keep' | 'cleared' {
  if (!exists || status === 'deleting' || status === 'ended' || status === 'cancelled') {
    return 'cleared';
  }
  return 'keep';
}

export interface P2AuthorizationDecisionInput {
  authInitialized: boolean;
  currentUserId: string | null | undefined;
  targetInviteId: string | null | undefined;
  invitationAuth: {
    authenticated: boolean;
    isP1: boolean;
    authorized: boolean;
    reason?: string;
    inviteId?: string;
    authorizedUid?: string;
  } | null | undefined;
  invitation?: {
    id?: string;
    p1Uid?: string;
  } | null;
  record?: {
    status?: string;
    p2Uid?: string | null;
  } | null;
  invitationLoading: boolean;
  hasAppError?: boolean;
}

export type P2AuthorizationOutcome =
  | { state: 'active_p2' }
  | { state: 'loading'; messageKey: 'auth_verifying' | 'invitation_verifying' }
  | { state: 'unauthenticated' }
  | { state: 'p1_rejected'; reason: 'CANNOT_ACCEPT_OWN_INVITATION' }
  | { state: 'unauthorized'; reason: string }
  | { state: 'authorized' };

export function evaluateP2Authorization(input: P2AuthorizationDecisionInput): P2AuthorizationOutcome {
  const {
    authInitialized,
    currentUserId,
    targetInviteId,
    invitationAuth,
    invitation,
    record,
    invitationLoading,
    hasAppError = false
  } = input;

  // 1. Existing active relationship where current user is confirmed P2
  if (record?.status === 'active' && Boolean(record?.p2Uid) && Boolean(currentUserId) && record.p2Uid === currentUserId) {
    return { state: 'active_p2' };
  }

  // 2. Auth initialization in progress
  if (!authInitialized) {
    return { state: 'loading', messageKey: 'auth_verifying' };
  }

  // 3. User is unauthenticated
  if (!currentUserId) {
    return { state: 'unauthenticated' };
  }

  // 4. Invitation loading or authorization evaluation in progress
  if (invitationLoading || (Boolean(targetInviteId) && !invitationAuth && !hasAppError)) {
    return { state: 'loading', messageKey: 'invitation_verifying' };
  }

  // 5. Missing invitation authorization data (e.g. failed load, 404, or network error)
  if (!invitationAuth) {
    return { state: 'unauthorized', reason: 'INVITATION_NOT_LOADED' };
  }

  // 6. Caller is P1 (inviter) attempting to access P2 form
  if (
    invitationAuth.isP1 ||
    invitationAuth.reason === 'CURRENTLY_SIGNED_IN_AS_INVITER' ||
    (Boolean(invitation?.p1Uid) && currentUserId === invitation?.p1Uid)
  ) {
    return { state: 'p1_rejected', reason: 'CANNOT_ACCEPT_OWN_INVITATION' };
  }

  // 7. Authorization explicitly denied or not authenticated
  if (!invitationAuth.authorized || !invitationAuth.authenticated) {
    return {
      state: 'unauthorized',
      reason: invitationAuth.reason || 'INVITATION_IDENTITY_MISMATCH'
    };
  }

  // 8. Authorization was issued for a different UID
  if (invitationAuth.authorizedUid && invitationAuth.authorizedUid !== currentUserId) {
    return { state: 'unauthorized', reason: 'INVITATION_IDENTITY_MISMATCH' };
  }

  // 9. Authorization was issued for a different invitation ID
  if (invitationAuth.inviteId && targetInviteId && invitationAuth.inviteId !== targetInviteId) {
    return { state: 'unauthorized', reason: 'INVITATION_IDENTITY_MISMATCH' };
  }

  // 10. Must have a valid target invitation ID
  if (!targetInviteId) {
    return { state: 'unauthorized', reason: 'INVITATION_NOT_FOUND' };
  }

  // 11. Confirmation verified: server confirmed authorization for current Firebase UID and exact invitation ID
  return { state: 'authorized' };
}

export function shouldRenderP2RegistrationScreen(outcome: P2AuthorizationOutcome): boolean {
  return outcome.state === 'active_p2' || outcome.state === 'authorized';
}

export function evaluateP2AuthNavigation({
  currentUserId,
  targetInviteId,
  loadedData,
  existingInvitation
}: {
  currentUserId: string;
  targetInviteId: string | null | undefined;
  loadedData: {
    invitation?: { id?: string; p1Uid?: string };
    authorization?: {
      authenticated: boolean;
      isP1: boolean;
      authorized: boolean;
      reason?: string;
      inviteId?: string;
      authorizedUid?: string;
    };
  } | null | undefined;
  existingInvitation?: { id?: string; p1Uid?: string } | null;
}): { canNavigateToDetails: boolean; error?: string; redirectScreen: 'p2_details' | 'p2_landing' } {
  if (!targetInviteId) {
    return { canNavigateToDetails: false, error: 'INVITATION_NOT_FOUND', redirectScreen: 'p2_landing' };
  }
  if (!loadedData || !loadedData.authorization) {
    return { canNavigateToDetails: false, error: 'INVITATION_NOT_LOADED', redirectScreen: 'p2_landing' };
  }
  const authCheck = loadedData.authorization;
  const p1Uid = loadedData.invitation?.p1Uid || existingInvitation?.p1Uid;
  if (authCheck.isP1 || (p1Uid && currentUserId === p1Uid)) {
    return { canNavigateToDetails: false, error: 'CANNOT_ACCEPT_OWN_INVITATION', redirectScreen: 'p2_landing' };
  }
  if (!authCheck.authorized || !authCheck.authenticated) {
    return {
      canNavigateToDetails: false,
      error: authCheck.reason || 'INVITATION_IDENTITY_MISMATCH',
      redirectScreen: 'p2_landing'
    };
  }
  if (authCheck.authorizedUid && authCheck.authorizedUid !== currentUserId) {
    return { canNavigateToDetails: false, error: 'INVITATION_IDENTITY_MISMATCH', redirectScreen: 'p2_landing' };
  }
  if (authCheck.inviteId && authCheck.inviteId !== targetInviteId) {
    return { canNavigateToDetails: false, error: 'INVITATION_IDENTITY_MISMATCH', redirectScreen: 'p2_landing' };
  }
  return { canNavigateToDetails: true, redirectScreen: 'p2_details' };
}

export interface InvitationLoadingContext<T = any> {
  inviteId: string;
  skipRecordOverwrite?: boolean;
  requestUid: string | null;
  requestId: number;
  getCurrentRequestId: () => number;
  getActiveAuthUid: () => string | null;
  getCurrentAuthUid: () => string | null;
  fetchInvitation: () => Promise<T>;
  setInvitation: (invitation: any) => void;
  setInvitationAuth: (auth: any) => void;
  setRecord: (updater: (prev: any) => any) => void;
  setAppError: (errorMsg: string) => void;
  setInvitationLoading: (loading: boolean) => void;
  formatErrorMessage?: (err: any) => string;
}

export async function executeInvitationLoad<T extends { invitation?: any; authorization?: any; record?: any } = any>(
  ctx: InvitationLoadingContext<T>
): Promise<T | null> {
  const {
    inviteId,
    skipRecordOverwrite = false,
    requestUid,
    requestId,
    getCurrentRequestId,
    getActiveAuthUid,
    getCurrentAuthUid,
    fetchInvitation,
    setInvitation,
    setInvitationAuth,
    setRecord,
    setAppError,
    setInvitationLoading,
    formatErrorMessage = (err) => (err instanceof Error ? err.message : String(err))
  } = ctx;

  if (!inviteId || inviteId === 'current') return null;

  const isCurrent = () =>
    getCurrentRequestId() === requestId &&
    getActiveAuthUid() === requestUid &&
    getCurrentAuthUid() === requestUid;

  setInvitationLoading(true);

  try {
    const data = await fetchInvitation();

    // Guard against stale asynchronous responses after sign-out, account switch, or superseded requests
    if (!isCurrent()) {
      return null;
    }

    if (data.invitation) setInvitation(data.invitation);
    if (data.authorization) {
      setInvitationAuth({
        ...data.authorization,
        inviteId: data.authorization.inviteId || inviteId,
        authorizedUid: data.authorization.authorizedUid || requestUid || undefined
      });
    } else {
      setInvitationAuth(null);
    }

    // A public invitation preview must never replace an authorized private active record
    if (!skipRecordOverwrite && data.record) {
      setRecord((prev: any) => {
        if (prev?.status === 'active' && prev?.p1Uid && (prev.p1Uid === requestUid || prev.p2Uid === requestUid)) {
          return prev;
        }
        return data.record;
      });
    }

    return data;
  } catch (error) {
    if (isCurrent()) {
      setInvitationAuth(null);
      setAppError(formatErrorMessage(error));
    }
    return null;
  } finally {
    if (isCurrent()) {
      setInvitationLoading(false);
    }
  }
}

