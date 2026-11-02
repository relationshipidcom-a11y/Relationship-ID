import type { ScreenId } from '../types';

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
  invitationNotFound?: boolean;
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
    invitationNotFound = false,
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
  if (invitationLoading || (Boolean(targetInviteId) && !invitationAuth && !hasAppError && !invitationNotFound)) {
    return { state: 'loading', messageKey: 'invitation_verifying' };
  }

  // 5. Missing invitation authorization data (e.g. failed load, 404, or network error)
  if (invitationNotFound || !targetInviteId) {
    return { state: 'unauthorized', reason: 'INVITATION_NOT_FOUND' };
  }

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
  if (!invitationAuth.authenticated || invitationAuth.reason === 'AUTH_REQUIRED') {
    return {
      state: 'unauthorized',
      reason: 'AUTH_REQUIRED'
    };
  }

  if (!invitationAuth.authorized) {
    return {
      state: 'unauthorized',
      reason: invitationAuth.reason || 'INVITATION_IDENTITY_MISMATCH'
    };
  }

  // 8. Authorization was issued for a different UID
  if (invitationAuth.authorizedUid && invitationAuth.authorizedUid !== currentUserId) {
    return { state: 'unauthorized', reason: 'INVITATION_IDENTITY_MISMATCH' };
  }
  if ((invitationAuth as any).requestUid && (invitationAuth as any).requestUid !== currentUserId) {
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

export interface P2LandingStateInput {
  authInitialized: boolean;
  currentUserId: string | null | undefined;
  targetInviteId: string | null | undefined;
  invitationAuth: {
    authenticated?: boolean;
    isP1?: boolean;
    authorized?: boolean;
    reason?: string;
    inviteId?: string;
    authorizedUid?: string;
    requestUid?: string;
    requestId?: number;
  } | null | undefined;
  invitation?: {
    id?: string;
    status?: string;
    p1Uid?: string;
  } | null;
  invitationLoading: boolean;
  invitationNotFound?: boolean;
  hasAppError?: boolean;
}

export type P2LandingStateOutcome =
  | { state: 'not_found' }
  | { state: 'load_failed' }
  | { state: 'declined' }
  | { state: 'expired' }
  | { state: 'cancelled' }
  | { state: 'accepted' }
  | { state: 'auth_loading' }
  | { state: 'invitation_loading' }
  | { state: 'authorization_pending' }
  | { state: 'signed_out' }
  | { state: 'p1_own_invitation'; reason: string }
  | { state: 'confirmed_mismatch'; reason: string }
  | { state: 'session_not_verified'; reason: string }
  | { state: 'verification_required'; reason: string }
  | { state: 'invalid_contacts'; reason: string }
  | { state: 'authorized' };

export function evaluateP2LandingState(input: P2LandingStateInput): P2LandingStateOutcome {
  const {
    authInitialized,
    currentUserId,
    targetInviteId,
    invitationAuth,
    invitation,
    invitationLoading,
    invitationNotFound = false,
    hasAppError = false
  } = input;

  // 1. Explicitly not found on server
  if (invitationNotFound) {
    return { state: 'not_found' };
  }


  // 3. Terminal invitation statuses
  if (invitation?.status === 'declined') {
    return { state: 'declined' };
  }
  if (invitation?.status === 'expired') {
    return { state: 'expired' };
  }
  if (invitation?.status === 'cancelled') {
    return { state: 'cancelled' };
  }
  if (invitation?.status === 'accepted') {
    return { state: 'accepted' };
  }

  // 2. Auth initialization in progress
  if (!authInitialized) {
    return { state: 'auth_loading' };
  }

  // 3. User is signed out: show clean minimal public preview, NEVER mismatch
  if (!currentUserId) {
    return { state: 'signed_out' };
  }

  // 4. Invitation loading or not yet loaded
  if (!invitation || !invitation.id || invitationLoading) {
    if (hasAppError && !invitationLoading) {
      return { state: 'load_failed' };
    }
    return { state: 'invitation_loading' };
  }

  // 5. Terminal invitation statuses
  if (invitation?.status === 'declined') {
    return { state: 'declined' };
  }
  if (invitation?.status === 'expired') {
    return { state: 'expired' };
  }
  if (invitation?.status === 'cancelled') {
    return { state: 'cancelled' };
  }
  if (invitation?.status === 'accepted') {
    return { state: 'accepted' };
  }

  // 6. Invitation loaded but authorization check pending
  if (!invitationAuth) {
    if (hasAppError) {
      return { state: 'load_failed' };
    }
    return { state: 'authorization_pending' };
  }

  // 7. Authorization is for a different user or invite (stale state)
  if (invitationAuth.authorizedUid && invitationAuth.authorizedUid !== currentUserId) {
    return { state: 'authorization_pending' };
  }
  if (invitationAuth.requestUid && invitationAuth.requestUid !== currentUserId) {
    return { state: 'authorization_pending' };
  }
  if (invitationAuth.inviteId && targetInviteId && invitationAuth.inviteId !== targetInviteId) {
    return { state: 'authorization_pending' };
  }

  // 8. Caller is P1 (inviter) attempting to accept own invitation
  if (
    invitationAuth.isP1 ||
    invitationAuth.reason === 'CURRENTLY_SIGNED_IN_AS_INVITER' ||
    invitationAuth.reason === 'CANNOT_ACCEPT_OWN_INVITATION' ||
    (Boolean(invitation?.p1Uid) && currentUserId === invitation?.p1Uid)
  ) {
    return { state: 'p1_own_invitation', reason: 'CANNOT_ACCEPT_OWN_INVITATION' };
  }

  // 9. Session not verified: user signed in locally, but server reported AUTH_REQUIRED
  if (invitationAuth.authenticated === false || invitationAuth.reason === 'AUTH_REQUIRED') {
    return { state: 'session_not_verified', reason: 'AUTH_REQUIRED' };
  }

  // 10. Server authorization evaluation
  if (invitationAuth.authorized) {
    return { state: 'authorized' };
  }

  // 11. Unauthorized states: accurately classify based on server reason
  if (invitationAuth.reason === 'VERIFICATION_REQUIRED') {
    return { state: 'verification_required', reason: 'VERIFICATION_REQUIRED' };
  }

  if (invitationAuth.reason === 'INVALID_INVITATION_CONTACTS') {
    return { state: 'invalid_contacts', reason: 'INVALID_INVITATION_CONTACTS' };
  }

  if (invitationAuth.reason === 'INVITATION_IDENTITY_MISMATCH') {
    return {
      state: 'confirmed_mismatch',
      reason: 'INVITATION_IDENTITY_MISMATCH'
    };
  }

  // Fail closed on unknown/missing reason without inventing a mismatch
  return { state: 'load_failed' };
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
  if (!authCheck.authenticated || authCheck.reason === 'AUTH_REQUIRED') {
    return {
      canNavigateToDetails: false,
      error: 'AUTH_REQUIRED',
      redirectScreen: 'p2_landing'
    };
  }
  if (!authCheck.authorized) {
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
  forceRefreshToken?: () => Promise<void>;
  setInvitation: (invitation: any) => void;
  setInvitationAuth: (auth: any) => void;
  setRecord: (updater: (prev: any) => any) => void;
  setAppError: (errorMsg: string) => void;
  setInvitationLoading: (loading: boolean) => void;
  setInvitationNotFound?: (notFound: boolean) => void;
  resetInvitation: () => void;
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
    forceRefreshToken,
    setInvitation,
    setInvitationAuth,
    setRecord,
    setAppError,
    setInvitationLoading,
    setInvitationNotFound,
    resetInvitation,
    formatErrorMessage = (err) => (err instanceof Error ? err.message : String(err))
  } = ctx;

  if (!inviteId || inviteId === 'current') return null;

  const isCurrent = () =>
    getCurrentRequestId() === requestId &&
    getActiveAuthUid() === requestUid &&
    getCurrentAuthUid() === requestUid;

  setInvitationLoading(true);
  setInvitationNotFound?.(false);

  try {
    let data = await fetchInvitation();

    // Guard against stale asynchronous responses after sign-out, account switch, or superseded requests
    if (!isCurrent()) {
      return null;
    }

    // Session recovery: If a Firebase user existed (requestUid truthy), Bearer token was sent,
    // but the server explicitly reports AUTH_REQUIRED session failure on a pending invitation:
    // Allow at most ONE forced ID-token refresh and retry for that load.
    if (
      requestUid &&
      data?.invitation?.status === 'pending' &&
      data?.authorization &&
      data.authorization.authenticated === false &&
      data.authorization.reason === 'AUTH_REQUIRED' &&
      forceRefreshToken
    ) {
      try {
        await forceRefreshToken();
        if (!isCurrent()) return null;

        const retriedData = await fetchInvitation();
        if (!isCurrent()) return null;

        if (retriedData) {
          data = retriedData;
        }
      } catch {
        // Safe catch: if forced refresh fails, check if still current before proceeding
        if (!isCurrent()) return null;
      }
    }

    // Guard against stale state writes after token refresh, retry, or superseded loads
    if (!isCurrent()) {
      return null;
    }

    if (data?.invitation?.id) {
      setInvitationNotFound?.(false);
      setInvitation(data.invitation);
    } else {
      setInvitationNotFound?.(true);
    }

    if (data.authorization) {
      setInvitationAuth({
        authenticated: Boolean(data.authorization.authenticated),
        isP1: Boolean(data.authorization.isP1),
        authorized: Boolean(data.authorization.authorized),
        reason: typeof data.authorization.reason === 'string' ? data.authorization.reason : undefined,
        inviteId: data.authorization.inviteId || inviteId,
        authorizedUid: data.authorization.authorizedUid || (data.authorization.authenticated && requestUid ? requestUid : undefined),
        requestUid: requestUid || undefined,
        requestId
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
      // Only the server's explicit INVITATION_NOT_FOUND means the invitation does not exist.
      // Network, timeout, rate-limit and server errors are load failures, not "not found".
      const errorCode = error instanceof Error ? error.message : '';
      setInvitationNotFound?.(errorCode === 'INVITATION_NOT_FOUND');
      // Clear any previously loaded invitation so stale details are never shown under a new link
      resetInvitation();
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

export interface PrivateRecordLoadingContext<T = any> {
  requestUid: string | null;
  requestId: number;
  getCurrentRequestId: () => number;
  getActiveAuthUid: () => string | null;
  getCurrentAuthUid: () => string | null;
  fetchRecord: () => Promise<T>;
  setRecord: (record: any) => void;
  setInvitation: (invitation: any) => void;
  setAppError: (errorMsg: string) => void;
  formatErrorMessage?: (err: any) => string;
  routeAfterLoad?: boolean | (() => boolean);
  onNavigate?: (screen: ScreenId, path?: string) => void;
  initialRecord: any;
  initialInvitation: any;
}

export async function executePrivateRecordLoad<T extends { record?: any; invitation?: any } = any>(
  ctx: PrivateRecordLoadingContext<T>
): Promise<T | null> {
  const {
    requestUid,
    requestId,
    getCurrentRequestId,
    getActiveAuthUid,
    getCurrentAuthUid,
    fetchRecord,
    setRecord,
    setInvitation,
    setAppError,
    formatErrorMessage = (err) => (err instanceof Error ? err.message : String(err)),
    routeAfterLoad = false,
    onNavigate,
    initialRecord,
    initialInvitation
  } = ctx;

  if (!requestUid) return null;

  const isCurrent = () =>
    getCurrentRequestId() === requestId &&
    getActiveAuthUid() === requestUid &&
    getCurrentAuthUid() === requestUid;

  try {
    const data = await fetchRecord();

    // Guard against stale async responses after sign-out, account switch, or superseded requests
    if (!isCurrent()) {
      return null;
    }

    const loadedRecord = data.record || null;
    const loadedInvitation = data.invitation || null;
    const userProfile = (data as any)?.userProfile || null;

    if (loadedRecord) {
      setRecord(loadedRecord);
    } else if (userProfile) {
      setRecord({
        ...initialRecord,
        partner1: {
          ...initialRecord.partner1,
          ...userProfile
        }
      });
    } else {
      setRecord(initialRecord);
    }

    if (loadedInvitation) setInvitation(loadedInvitation);
    else setInvitation(initialInvitation);

    // On verified successful load or retry, clear any active error
    setAppError('');

    const shouldRoute = typeof routeAfterLoad === 'function' ? routeAfterLoad() : routeAfterLoad;
    if (shouldRoute && onNavigate) {
      if (!isCurrent()) return null;

      if (!loadedRecord) {
        onNavigate('p1_details', '/');
      } else if (loadedRecord.status === 'active') {
        if (loadedRecord.p2Uid === requestUid) {
          const p2InviteId = (loadedRecord.inviteId && loadedRecord.inviteId !== 'current')
            ? loadedRecord.inviteId
            : (loadedInvitation?.id && loadedInvitation.id !== 'current' ? loadedInvitation.id : '');
          onNavigate('p2_details', p2InviteId ? `/invite/${p2InviteId}/details` : '/p2');
        } else {
          onNavigate('p1_details', '/');
        }
      } else if (loadedRecord.status === 'pending_partner' && loadedInvitation?.id) {
        onNavigate('p1_waiting', '/waiting');
      } else if (loadedRecord.partner1?.fullName) {
        onNavigate('p1_invite_create', '/');
      } else {
        onNavigate('p1_details', '/');
      }
    }

    return data;
  } catch (error) {
    if (isCurrent()) {
      // Preserve existing record and invitation in state, never catch a database failure and pretend success
      setAppError(formatErrorMessage(error));
    }
    return null;
  }
}

export interface RelationshipSnapshotRecoveryContext<T = any> {
  currentRelId: string;
  requestUid: string | null;
  requestId: number;
  isSubscriptionActive: () => boolean;
  getCurrentRequestId: () => number;
  getActiveAuthUid: () => string | null;
  getCurrentAuthUid: () => string | null;
  fetchRecord: () => Promise<T>;
  onRelationshipCleared: (relId: string) => void;
  setRecord: (record: any) => void;
  setAppError: (errorMsg: string) => void;
  formatErrorMessage?: (err: any) => string;
}

export async function executeRelationshipSnapshotRecovery<T extends { record?: any } = any>(
  ctx: RelationshipSnapshotRecoveryContext<T>
): Promise<T | null> {
  const {
    currentRelId,
    requestUid,
    requestId,
    isSubscriptionActive,
    getCurrentRequestId,
    getActiveAuthUid,
    getCurrentAuthUid,
    fetchRecord,
    onRelationshipCleared,
    setRecord,
    setAppError,
    formatErrorMessage = (err) => (err instanceof Error ? err.message : String(err))
  } = ctx;

  if (!requestUid) return null;

  const isCurrent = () =>
    isSubscriptionActive() &&
    getCurrentRequestId() === requestId &&
    getActiveAuthUid() === requestUid &&
    getCurrentAuthUid() === requestUid;

  try {
    const data = await fetchRecord();
    if (!isCurrent()) {
      return null;
    }
    if (!data.record || data.record.id !== currentRelId) {
      onRelationshipCleared(currentRelId);
    } else {
      setRecord(data.record);
      setAppError('');
    }
    return data;
  } catch (serverErr) {
    if (!isCurrent()) {
      return null;
    }
    setAppError(formatErrorMessage(serverErr));
    return null;
  }
}

export interface RelationshipSubscriptionErrorContext<T = any> {
  error: { code?: string; message?: string };
  currentRelId: string;
  subscriptionUid: string;
  isSubscribed: () => boolean;
  getActiveAuthUid: () => string | null;
  getCurrentAuthUid: () => string | null;
  incrementRequestId: () => number;
  getCurrentRequestId: () => number;
  fetchRecord: () => Promise<T>;
  onRelationshipCleared: (relId: string) => void;
  setRecord: (record: any) => void;
  setAppError: (errorMsg: string) => void;
  formatErrorMessage?: (err: any) => string;
}

export async function handleRelationshipSubscriptionError<T extends { record?: any } = any>(
  ctx: RelationshipSubscriptionErrorContext<T>
): Promise<T | null> {
  const {
    error,
    currentRelId,
    subscriptionUid,
    isSubscribed,
    getActiveAuthUid,
    getCurrentAuthUid,
    incrementRequestId,
    getCurrentRequestId,
    fetchRecord,
    onRelationshipCleared,
    setRecord,
    setAppError,
    formatErrorMessage
  } = ctx;

  if (error.code !== 'permission-denied' && (error as any).code !== 'not-found') {
    return null;
  }
  if (
    !isSubscribed() ||
    getActiveAuthUid() !== subscriptionUid ||
    getCurrentAuthUid() !== subscriptionUid
  ) {
    return null;
  }
  const requestId = incrementRequestId();
  return executeRelationshipSnapshotRecovery({
    currentRelId,
    requestUid: subscriptionUid,
    requestId,
    isSubscriptionActive: isSubscribed,
    getCurrentRequestId,
    getActiveAuthUid,
    getCurrentAuthUid,
    fetchRecord,
    onRelationshipCleared,
    setRecord,
    setAppError,
    formatErrorMessage
  });
}

export interface NotificationsFetchContext<T = any> {
  requestUid: string;
  requestId: number;
  getCurrentRequestId: () => number;
  getActiveAuthUid: () => string | null;
  getCurrentAuthUid: () => string | null;
  fetchNotifications: () => Promise<T>;
  setActiveNotification: (notification: any) => void;
  onRelationshipEnded?: (requestUid: string) => void;
}

export async function executeNotificationsFetch<T extends { notifications?: any[] } = any>(
  ctx: NotificationsFetchContext<T>
): Promise<T | null> {
  const {
    requestUid,
    requestId,
    getCurrentRequestId,
    getActiveAuthUid,
    getCurrentAuthUid,
    fetchNotifications,
    setActiveNotification,
    onRelationshipEnded
  } = ctx;

  const isCurrent = () =>
    getCurrentRequestId() === requestId &&
    getActiveAuthUid() === requestUid &&
    getCurrentAuthUid() === requestUid;

  try {
    const data = await fetchNotifications();
    if (!isCurrent()) {
      return null;
    }
    if (Array.isArray(data?.notifications) && data.notifications.length > 0) {
      const latest = data.notifications[0];
      setActiveNotification(latest);
      if (latest.type === 'relationship_ended' && onRelationshipEnded) {
        onRelationshipEnded(requestUid);
      }
    }
    return data;
  } catch {
    // Ignore background notification fetch errors
    return null;
  }
}

