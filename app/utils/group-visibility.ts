export type Visibility = 'EVERYONE' | 'ADMINS' | 'ONLY_SELF';
export type ViewerRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export function isBudgetVisible({
  groupVisibility,
  memberOverride,
  viewerRole,
  isSelf,
}: {
  groupVisibility: Visibility;
  memberOverride?: Visibility | null;
  viewerRole: ViewerRole;
  isSelf: boolean;
}) {
  const effective = memberOverride ?? groupVisibility;
  if (effective === 'EVERYONE') return true;
  if (effective === 'ADMINS') return viewerRole === 'OWNER' || viewerRole === 'ADMIN' || isSelf;
  return isSelf;
}

