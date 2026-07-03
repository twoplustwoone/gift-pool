// Single source of truth for "can this viewer see this target's birthday?".
//
// Two independent gates used to guard different surfaces and never composed:
// the group overview filtered only on the per-group `shareBirthday` membership
// flag, while the home panel checked only the user's global
// `birthdayVisibility`. As a result a user with `birthdayVisibility === 'NOBODY'`
// still leaked into the group-overview birthday feed. This helper unifies the
// rule so every birthday surface agrees.
//
// The function is pure (no Prisma) — callers gather the relationship/group facts
// however is efficient for their surface (single lookup, batch query, or a value
// already implied by the population) and pass them in. It lives in a `.server.ts`
// file because only server code consults it; client surfaces receive a computed
// boolean.

export type BirthdayVisibilityFacts = {
  // Viewer and target have a confirmed direct friendship.
  isDirectFriend: boolean;
  // Viewer and target share ≥1 mutual friend (friend-of-friend), but are not
  // direct friends. Only consulted for `FRIENDS_OF_FRIENDS`.
  isMutualFriend: boolean;
  // Viewer and target share ≥1 active group membership (removedAt: null) where
  // the TARGET's `shareBirthday === true` for that group. This is the
  // group-share override — condition (b) below.
  sharesActiveBirthdayGroup: boolean;
};

// Rule:
// - `NOBODY` → false, unconditionally (even a direct friend or a shared
//   birthday-group can't override it).
// - Otherwise true if EITHER:
//   (a) the relationship satisfies `birthdayVisibility`, OR
//   (b) the target opted into `shareBirthday` for a group they actively share
//       with the viewer.
export function canViewBirthday(
  target: { birthdayVisibility: string },
  facts: BirthdayVisibilityFacts,
): boolean {
  if (target.birthdayVisibility === 'NOBODY') return false;

  // Condition (b): group-share override.
  if (facts.sharesActiveBirthdayGroup) return true;

  // Condition (a): the relationship satisfies the visibility setting.
  switch (target.birthdayVisibility) {
    case 'EVERYONE':
      return true;
    case 'FRIENDS_OF_FRIENDS':
      return facts.isDirectFriend || facts.isMutualFriend;
    default:
      // 'FRIENDS' or any unrecognised value → require a direct friendship.
      return facts.isDirectFriend;
  }
}
