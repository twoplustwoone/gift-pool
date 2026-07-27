/**
 * The privacy ladder for wishlist claims, as a pure function.
 *
 * Governing rule: never disclose anything the viewer could not already
 * discover through an existing surface. Kept pure and DB-free (like
 * canViewBirthday in birthday-visibility.server.ts) so the ladder can be
 * exhaustively tested — including the negative cases, where a leak would
 * otherwise be a silent pass.
 */

export type ClaimHolder =
  | { kind: 'user'; userId: string; displayName: string | null }
  | {
      kind: 'pool';
      poolId: string;
      poolTitle: string;
      giftGroupName: string | null;
    };

export type ViewerRelationship = {
  isOwner: boolean;
  /**
   * The surface this viewer sees must not attribute the claim to any name,
   * pool, or group — regardless of whether the viewer is signed in. This is
   * NOT "there is no logged-in user": a signed-in user can open someone's
   * public wishlist share link, and that surface must show zero attribution
   * even though a session exists. Set this from the surface's disclosure
   * policy (e.g. "is this the public share view?"), never from viewer
   * identity.
   */
  isAnonymous: boolean;
  /** Viewer contributes to the pool that holds the claim. */
  contributesToHolderPool: boolean;
  /** Viewer is in the group owning the holding pool, but not the pool itself. */
  memberOfHolderGroup: boolean;
  /** Badge surface: the solo claimer contributes to the pool being viewed. */
  sharesPoolWithHolderUser: boolean;
};

export type ClaimDisclosureTone = 'none' | 'pool' | 'warning';

export type ClaimDisclosure = {
  show: boolean;
  tone: ClaimDisclosureTone;
  text: string;
  name: string | null;
  poolLink: string | null;
  canJoinPool: boolean;
};

export type ClaimSurface = 'label' | 'badge' | 'row';

const HIDDEN: ClaimDisclosure = {
  show: false,
  tone: 'none',
  text: '',
  name: null,
  poolLink: null,
  canJoinPool: false,
};

const anonymous = (tone: ClaimDisclosureTone, text: string): ClaimDisclosure => ({
  show: true,
  tone,
  text,
  name: null,
  poolLink: null,
  canJoinPool: false,
});

export function resolveClaimDisclosure(
  holder: ClaimHolder | null,
  viewer: ViewerRelationship,
  surface: ClaimSurface,
): ClaimDisclosure {
  // The surprise boundary. Nothing below this line can reach the owner.
  if (holder === null || viewer.isOwner) return HIDDEN;

  // The picker is a compose-time list; attribution there is noise, and the
  // idea card resolves the who once the idea is proposed.
  if (surface === 'row') return anonymous('warning', 'Already claimed');

  if (holder.kind === 'user') {
    const canName =
      !viewer.isAnonymous && viewer.sharesPoolWithHolderUser && holder.displayName !== null;
    return canName
      ? {
          show: true,
          tone: 'warning',
          text: `Claimed by ${holder.displayName}`,
          name: holder.displayName,
          poolLink: null,
          canJoinPool: false,
        }
      : anonymous('warning', 'Already claimed');
  }

  // Anonymous viewers never get attribution, regardless of any other fact.
  if (viewer.isAnonymous) return anonymous('warning', 'Already claimed');

  if (viewer.contributesToHolderPool) {
    // Reassurance, not a conflict — so pool tone, never warning. --warning is
    // reserved for states that advise against an action.
    return {
      show: true,
      tone: 'pool',
      text: `Your pool ${holder.poolTitle} is getting this`,
      name: holder.poolTitle,
      poolLink: `/pools/${holder.poolId}`,
      canJoinPool: false,
    };
  }

  if (viewer.memberOfHolderGroup && holder.giftGroupName !== null) {
    // Safe: group members already see every active pool in their group via
    // queryActivePools, so naming it discloses nothing new.
    return {
      show: true,
      tone: 'pool',
      text: `${holder.giftGroupName} is getting this`,
      name: holder.giftGroupName,
      poolLink: `/pools/${holder.poolId}`,
      canJoinPool: true,
    };
  }

  // A pool the viewer has no relationship to: reveal that a group exists —
  // discoverable from the item anyway — but never which one.
  return anonymous(
    'warning',
    surface === 'badge' ? 'Another group is getting this' : 'Already claimed',
  );
}
