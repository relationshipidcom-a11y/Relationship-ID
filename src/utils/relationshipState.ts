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
