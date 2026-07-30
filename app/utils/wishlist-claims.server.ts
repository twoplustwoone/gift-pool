/**
 * Wishlist claims — the only code in the app permitted to write WishlistClaim.
 *
 * Owns one invariant: exactly one claim per item, and an item that becomes free
 * goes immediately to the longest-waiting pool that has intent on it.
 *
 * Claim intent is never stored. It is derived: a pool in a live decided status
 * whose chosen idea links the item. Cancellation, re-decision, and idea deletion
 * therefore invalidate intent automatically — there is nothing to keep in sync.
 */
import { Prisma } from '@prisma/client';
import { prisma } from './db.server.ts';
import { POOL_STATUS } from './pool-constants.ts';
import {
  resolveClaimDisclosure,
  type ClaimDisclosure,
  type ClaimHolder,
  type ClaimSurface,
} from './wishlist-claim-disclosure.ts';

export const POOL_INTENT_STATUSES = [
  POOL_STATUS.DECIDED,
  POOL_STATUS.PURCHASED,
  POOL_STATUS.DELIVERED,
] as const;

type Tx = Prisma.TransactionClient;

type IntentCandidate = { id: string; decidedAt: Date | null; createdAt: Date };

// SQLite sorts NULL before every value in `ORDER BY ... ASC` — Prisma's
// `nulls: 'last'` support on SQLite isn't something to rely on either — so a
// pool that hasn't had `decidedAt` backfilled yet would permanently outrank
// every correctly-dated pool if we sorted this in the query. The candidate
// set is tiny (pools with intent on one wishlist item — normally zero or
// one), so sort in JS instead: a real `decidedAt` always beats a null one,
// and null-dated pools fall back to `createdAt` among themselves.
function waitedLonger(a: IntentCandidate, b: IntentCandidate): boolean {
  if (a.decidedAt && b.decidedAt) return a.decidedAt.getTime() <= b.decidedAt.getTime();
  if (a.decidedAt && !b.decidedAt) return true;
  if (!a.decidedAt && b.decidedAt) return false;
  return a.createdAt.getTime() <= b.createdAt.getTime();
}

// The settlement outcome: which pool inherited the item, and — new — the id
// of the WishlistClaim row that was just created for it. Callers that fan
// this settlement out as a notification (queueWishlistClaimTransferredNotification)
// need the claim id, not just the pool id: it is what makes a later,
// genuinely new settlement onto the same pool+item distinct from a retry of
// this one in the notification ledger key. See that function's docstring.
type ClaimSettlement = { poolId: string; claimId: string };

/**
 * The settlement hook. Runs whenever a claim disappears — and MUST run inside
 * the same transaction as the release. Split them and there is a window where
 * the item reads as unclaimed, letting a third party take an item a pool is
 * actively buying: exactly the bug this feature exists to close.
 */
async function settleItem(tx: Tx, wishlistItemId: string): Promise<ClaimSettlement | null> {
  const existing = await tx.wishlistClaim.findUnique({
    where: { wishlistItemId },
    select: { id: true },
  });
  if (existing) return null;

  const candidates = await tx.pool.findMany({
    where: {
      status: { in: [...POOL_INTENT_STATUSES] },
      chosenIdea: { wishlistItemId },
    },
    select: { id: true, decidedAt: true, createdAt: true },
  });
  const [first, ...rest] = candidates;
  if (!first) return null;

  const heir = rest.reduce(
    (longestWaiting, candidate) =>
      waitedLonger(candidate, longestWaiting) ? candidate : longestWaiting,
    first,
  );

  const created = await tx.wishlistClaim.create({
    data: { wishlistItemId, poolId: heir.id },
    select: { id: true },
  });
  return { poolId: heir.id, claimId: created.id };
}

export type ClaimForUserFailure = {
  ok: false;
  reason: 'held-by-user' | 'held-by-pool';
  // The claim as it actually stands after the attempt — never the
  // pre-attempt read. A loser of a concurrent race must be told the winner's
  // claim exists, or its UI reconciles back to "unclaimed" while the winner's
  // row sits in the DB. `claimedByUserId: null` here means a pool holds it
  // (same sentinel shape used across the module for a pool-held claim).
  claim: { claimedByUserId: string | null };
};

export async function claimForUser(
  wishlistItemId: string,
  userId: string,
): Promise<{ ok: true } | ClaimForUserFailure> {
  const existing = await prisma.wishlistClaim.findUnique({
    where: { wishlistItemId },
    select: { claimedByUserId: true, poolId: true },
  });

  if (existing) {
    if (existing.claimedByUserId === userId) return { ok: true };
    return {
      ok: false,
      reason: existing.poolId ? 'held-by-pool' : 'held-by-user',
      claim: { claimedByUserId: existing.claimedByUserId },
    };
  }

  try {
    await prisma.wishlistClaim.create({ data: { wishlistItemId, claimedByUserId: userId } });
    return { ok: true };
  } catch (error) {
    // Two callers can both pass the existence check above and race to
    // `create`; the loser hits the DB's unique constraint on
    // `wishlistItemId`. Translate that into the documented result instead of
    // letting P2002 escape as an unhandled exception. Re-read rather than
    // assume the winner: it could be a user (a genuine duplicate claim
    // attempt) or a pool that settled onto the item in the same instant.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await prisma.wishlistClaim.findUnique({
        where: { wishlistItemId },
        select: { claimedByUserId: true, poolId: true },
      });
      if (winner?.claimedByUserId === userId) return { ok: true };
      return {
        ok: false,
        reason: winner?.poolId ? 'held-by-pool' : 'held-by-user',
        claim: { claimedByUserId: winner?.claimedByUserId ?? null },
      };
    }
    throw error;
  }
}

export type ReleaseUserClaimResult =
  | { ok: true; transferredToPoolId: string | null; transferredClaimId: string | null }
  // 'not-found' covers both "no claim exists" and "the caller doesn't hold
  // it" — the caller-facing distinction has never mattered here, only that
  // nothing was released. 'stale' is new: `expectedClaimId` was supplied and
  // didn't match the claim actually live on the item right now.
  | { ok: false; reason: 'not-found' | 'stale' };

export async function releaseUserClaim(
  wishlistItemId: string,
  userId: string,
  // The specific WishlistClaim occurrence the caller means to release — e.g.
  // the id a WISHLIST_CLAIM_CONFLICT notification was raised about, carried
  // back through its Release action. Omitted by callers acting on "whatever
  // claim is live right now" (the wishlist page's own release button), which
  // always passes once the ownership check above holds.
  //
  // Binding matters because a notification can outlive the claim it was
  // about: the claimant releases from the wishlist UI directly (notification
  // row survives), a pool decides away, the same user re-claims the item —
  // a brand new WishlistClaim row — and only then clicks Release on the
  // stale notification. Without this check that release would silently drop
  // the user's *new* claim, which nothing asked about. Rejecting instead
  // means the stale notification's action fails safely and the current claim
  // is left untouched; the caller surfaces this as a distinct, legible error
  // rather than the generic "not yours to release" message.
  expectedClaimId?: string,
): Promise<ReleaseUserClaimResult> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.wishlistClaim.findUnique({
      where: { wishlistItemId },
      select: { id: true, claimedByUserId: true },
    });
    // Only a claimer releases their own claim. No override exists, by design:
    // an override could erase evidence of a purchase that physically happened.
    if (!claim || claim.claimedByUserId !== userId) {
      return { ok: false, reason: 'not-found' };
    }
    if (expectedClaimId !== undefined && claim.id !== expectedClaimId) {
      return { ok: false, reason: 'stale' };
    }

    await tx.wishlistClaim.delete({ where: { id: claim.id } });
    // Do not pull this call out of the transaction, and do not await/queue it
    // after `$transaction` resolves. Delete-then-settle must commit as one
    // unit: if the delete were visible to other connections before settlement
    // runs, a concurrent `claimForUser` could win the free item in that gap,
    // and a pool actively buying it would silently lose out with no error —
    // the exact bug this module exists to close. See `settleItem`'s docstring.
    const settlement = await settleItem(tx, wishlistItemId);
    return {
      ok: true,
      transferredToPoolId: settlement?.poolId ?? null,
      transferredClaimId: settlement?.claimId ?? null,
    };
  });
}

/**
 * Owner-facing release: drops a *solo* claim on an item regardless of which
 * user holds it (unlike `releaseUserClaim`, this is not gated to the caller's
 * own claim — the owner archiving/restoring their item is not "the claimer").
 * A pool-held claim (`claimedByUserId: null`) is left untouched; pool claims
 * are released only by pool lifecycle events (decide/re-decide/cancel).
 *
 * Same atomicity requirement as `releaseUserClaim`: delete-then-settle must
 * commit as one transaction, or a waiting pool can lose the race for the item
 * it just watched become free.
 */
export async function releaseSoloClaimForItem(
  wishlistItemId: string,
): Promise<{
  ok: boolean;
  transferredToPoolId: string | null;
  transferredClaimId: string | null;
}> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.wishlistClaim.findUnique({
      where: { wishlistItemId },
      select: { id: true, claimedByUserId: true },
    });
    if (!claim || claim.claimedByUserId === null) {
      return { ok: false, transferredToPoolId: null, transferredClaimId: null };
    }

    await tx.wishlistClaim.delete({ where: { id: claim.id } });
    const settlement = await settleItem(tx, wishlistItemId);
    return {
      ok: true,
      transferredToPoolId: settlement?.poolId ?? null,
      transferredClaimId: settlement?.claimId ?? null,
    };
  });
}

/**
 * Reconcile a pool's claims with its current decision. Called after the pool
 * decides, re-decides, or is cancelled. Releasing an old item settles it, so a
 * pool switching from A to B frees A for whoever was waiting on it.
 */
export type SyncPoolClaimResult = {
  claimedItemId: string | null;
  conflictedItemId: string | null;
  released: Array<{
    wishlistItemId: string;
    transferredToPoolId: string | null;
    transferredClaimId: string | null;
  }>;
};

/**
 * Transaction-accepting core of `syncPoolClaim`. Callers that must commit the
 * sync together with another write (e.g. `chooseIdea`'s status transition)
 * pass their own transaction client in here instead of going through the
 * thin `syncPoolClaim` wrapper, which opens its own transaction.
 */
export async function syncPoolClaimInTx(tx: Tx, poolId: string): Promise<SyncPoolClaimResult> {
  const pool = await tx.pool.findUnique({
    where: { id: poolId },
    select: { status: true, chosenIdea: { select: { wishlistItemId: true } } },
  });

  const intendedItemId =
    pool && (POOL_INTENT_STATUSES as readonly string[]).includes(pool.status)
      ? (pool.chosenIdea?.wishlistItemId ?? null)
      : null;

  // Drop any claim this pool holds that is no longer what it intends.
  const stale = await tx.wishlistClaim.findMany({
    where: { poolId, ...(intendedItemId ? { NOT: { wishlistItemId: intendedItemId } } : {}) },
    select: { id: true, wishlistItemId: true },
  });
  const releasedItemIds: string[] = [];
  for (const claim of stale) {
    await tx.wishlistClaim.delete({ where: { id: claim.id } });
    releasedItemIds.push(claim.wishlistItemId);
  }
  // Settle only after every release, so an heir can't take an item this pool
  // is about to release and then re-take.
  const released: Array<{
    wishlistItemId: string;
    transferredToPoolId: string | null;
    transferredClaimId: string | null;
  }> = [];
  for (const itemId of releasedItemIds) {
    const settlement = await settleItem(tx, itemId);
    released.push({
      wishlistItemId: itemId,
      transferredToPoolId: settlement?.poolId ?? null,
      transferredClaimId: settlement?.claimId ?? null,
    });
  }

  if (!intendedItemId) {
    return { claimedItemId: null, conflictedItemId: null, released };
  }

  const holder = await tx.wishlistClaim.findUnique({
    where: { wishlistItemId: intendedItemId },
    select: { poolId: true },
  });
  if (holder) {
    return holder.poolId === poolId
      ? { claimedItemId: intendedItemId, conflictedItemId: null, released }
      : { claimedItemId: null, conflictedItemId: intendedItemId, released };
  }

  await tx.wishlistClaim.create({ data: { wishlistItemId: intendedItemId, poolId } });
  return { claimedItemId: intendedItemId, conflictedItemId: null, released };
}

export async function syncPoolClaim(poolId: string): Promise<SyncPoolClaimResult> {
  return prisma.$transaction((tx) => syncPoolClaimInTx(tx, poolId));
}

/**
 * Batch-capable release for callers that must drop many solo claims in one
 * pass — currently only `cleanupWishlistClaimsForOwner`, which is scoped by
 * owner rather than by item and so can match any number of claims at once.
 * `where` is a caller-supplied predicate over WishlistClaim (e.g. "solo
 * claims by users who no longer share access with this owner"); this
 * function owns none of that domain logic, only the release-and-settle
 * mechanics, so the invariant (never bare-delete a claim without settling
 * it) holds no matter how many rows match.
 *
 * Each matched claim is released in its own transaction: a per-item
 * find-then-delete-then-settle, exactly like `releaseSoloClaimForItem`. Items
 * are intentionally NOT all released in one shared transaction — there is no
 * cross-item invariant to protect, and holding one giant transaction open
 * across an unbounded number of rows is worse for LiteFS contention than many
 * small ones. The inner re-check re-applies the caller's full `where` (not
 * just the claim id) inside the transaction, so it atomically re-evaluates
 * the same predicate the outer `findMany` used, at delete time — exactly
 * what the bare `deleteMany` this replaced did. This matters because `where`
 * is not just "does this row still exist": it typically encodes an access
 * predicate (e.g. "no longer shares a group/friendship with the owner"), and
 * that predicate can flip back to false between the initial `findMany` and
 * this item's turn — e.g. a friendship accepted concurrently with an owner's
 * page-view cleanup. An id-only recheck would still delete (and possibly
 * transfer to a waiting pool) a claim that has become valid again; the
 * id-plus-`where` recheck skips it instead, matching what the atomic
 * `deleteMany` guaranteed.
 */
export async function releaseSoloClaimsMatching(
  where: Prisma.WishlistClaimWhereInput,
): Promise<
  Array<{
    wishlistItemId: string;
    transferredToPoolId: string | null;
    transferredClaimId: string | null;
  }>
> {
  const claims = await prisma.wishlistClaim.findMany({
    where,
    select: { id: true, wishlistItemId: true },
  });

  const released: Array<{
    wishlistItemId: string;
    transferredToPoolId: string | null;
    transferredClaimId: string | null;
  }> = [];
  for (const claim of claims) {
    const outcome = await prisma.$transaction(async (tx) => {
      const current = await tx.wishlistClaim.findFirst({
        where: { AND: [{ id: claim.id }, where] },
        select: { id: true },
      });
      if (!current) return { released: false as const };

      await tx.wishlistClaim.delete({ where: { id: claim.id } });
      const settlement = await settleItem(tx, claim.wishlistItemId);
      return {
        released: true as const,
        transferredToPoolId: settlement?.poolId ?? null,
        transferredClaimId: settlement?.claimId ?? null,
      };
    });

    if (outcome.released) {
      released.push({
        wishlistItemId: claim.wishlistItemId,
        transferredToPoolId: outcome.transferredToPoolId,
        transferredClaimId: outcome.transferredClaimId,
      });
    }
  }
  return released;
}

export type ClaimOutcomeFeedback = 'LOVED' | 'OKAY' | 'SKIPPED';

/**
 * Records post-occasion "did it land" feedback on a *solo* claim. Callers
 * (currently `recordWishlistClaimOutcome` in person-surface.server.ts) still
 * own authorization framing (throwing the caller-appropriate error shape);
 * this just keeps the actual write to WishlistClaim inside the module. Does
 * not touch a pool-held claim's outcome — that lives on `Pool.outcomeFeedback`
 * and is a separate write outside this module's remit.
 */
export async function setClaimOutcomeFeedback(
  wishlistItemId: string,
  userId: string,
  feedback: ClaimOutcomeFeedback,
): Promise<{ ok: boolean }> {
  const claim = await prisma.wishlistClaim.findUnique({
    where: { wishlistItemId },
    select: { claimedByUserId: true },
  });
  if (!claim || claim.claimedByUserId !== userId) {
    return { ok: false };
  }

  await prisma.wishlistClaim.update({
    where: { wishlistItemId },
    data: { outcomeFeedback: feedback },
  });
  return { ok: true };
}

/**
 * The read model for wishlist claims: gathers the facts (who holds the
 * claim, whether the viewer contributes to or is a current member of the
 * holding pool's group) and hands them to the pure privacy ladder in
 * wishlist-claim-disclosure.ts, which is the only place that decides what
 * gets shown. This function never re-derives or second-guesses that
 * decision — it only assembles the inputs.
 */
export async function loadClaimStates(
  wishlistItemIds: string[],
  viewer: { userId: string | null; isOwner: boolean },
  surface: ClaimSurface = 'label',
): Promise<Map<string, ClaimDisclosure>> {
  const states = new Map<string, ClaimDisclosure>();
  if (wishlistItemIds.length === 0) return states;

  const claims = await prisma.wishlistClaim.findMany({
    where: { wishlistItemId: { in: wishlistItemIds } },
    select: {
      wishlistItemId: true,
      claimedByUserId: true,
      claimedByUser: { select: { name: true, username: true } },
      pool: {
        select: {
          id: true,
          title: true,
          giftGroupId: true,
          giftGroup: { select: { name: true } },
          contributors: viewer.userId
            ? { where: { userId: viewer.userId }, select: { id: true } }
            : false,
        },
      },
    },
  });

  const groupIds = claims
    .map((claim) => claim.pool?.giftGroupId)
    .filter((id): id is string => Boolean(id));
  const memberGroupIds = new Set(
    viewer.userId && groupIds.length
      ? (
          await prisma.usersInGiftGroups.findMany({
            where: {
              userId: viewer.userId,
              giftGroupId: { in: groupIds },
              // A membership row survives removal — `removedAt` is what makes
              // it current. Without this filter a removed member would keep
              // being told the group's name, which is exactly the leak the
              // ladder exists to prevent. Same predicate the repo uses in
              // group-overview.server.ts and occasion-reminders.server.ts.
              removedAt: null,
            },
            select: { giftGroupId: true },
          })
        ).map((membership) => membership.giftGroupId)
      : [],
  );

  for (const claim of claims) {
    const holder: ClaimHolder = claim.pool
      ? {
          kind: 'pool',
          poolId: claim.pool.id,
          poolTitle: claim.pool.title,
          giftGroupName: claim.pool.giftGroup?.name ?? null,
        }
      : {
          kind: 'user',
          userId: claim.claimedByUserId ?? '',
          displayName: claim.claimedByUser?.name ?? claim.claimedByUser?.username ?? null,
        };

    const contributesToHolderPool = Boolean(
      claim.pool && Array.isArray(claim.pool.contributors) && claim.pool.contributors.length > 0,
    );

    states.set(
      claim.wishlistItemId,
      resolveClaimDisclosure(
        holder,
        {
          isOwner: viewer.isOwner,
          // `loadClaimStates`'s caller is the only source of `viewer` here,
          // and a null userId always means an unattributed surface for this
          // caller — but that equivalence is local to this function, not a
          // general rule. `isAnonymous` is a surface-policy flag on
          // ViewerRelationship, not a viewer-identity one; do not copy this
          // line to a caller (e.g. the public share page) where a signed-in
          // viewer can still be on an unattributed surface.
          isAnonymous: viewer.userId === null,
          contributesToHolderPool,
          memberOfHolderGroup:
            !contributesToHolderPool &&
            Boolean(claim.pool?.giftGroupId && memberGroupIds.has(claim.pool.giftGroupId)),
          sharesPoolWithHolderUser: false,
        },
        surface,
      ),
    );
  }

  return states;
}

/**
 * The read model for a pool's gift-idea list: for each idea whose linked
 * wishlist item is claimed by someone *other than this pool*, resolves what
 * this pool's viewer may be told about the conflict. A pool holding its own
 * claim on the item is the expected steady state, not a conflict — those
 * ideas are absent from the returned map.
 *
 * Sibling of `loadClaimStates` (same gather-facts-then-defer-to-the-ladder
 * shape) but for the `'badge'` surface: keyed by gift idea id rather than
 * wishlist item id, and the pool-vs-pool tiers collapse to "another group is
 * getting this" — the viewer here is always an authenticated contributor to
 * *this* pool, so `isAnonymous` is always false, and a rival pool's identity
 * is never disclosed regardless of any relationship the viewer might have to
 * it (hence `contributesToHolderPool`/`memberOfHolderGroup` are hardcoded
 * false rather than derived — this surface's whole point is "don't name the
 * other group").
 */
export async function loadIdeaClaimConflicts(
  poolId: string,
  viewerUserId: string,
): Promise<Map<string, ClaimDisclosure>> {
  const conflicts = new Map<string, ClaimDisclosure>();

  const ideas = await prisma.giftIdea.findMany({
    where: { poolId, wishlistItemId: { not: null } },
    select: { id: true, wishlistItemId: true },
  });
  if (ideas.length === 0) return conflicts;

  const itemIds = ideas
    .map((idea) => idea.wishlistItemId)
    .filter((id): id is string => id !== null);

  const [pool, claims] = await Promise.all([
    prisma.pool.findUnique({
      where: { id: poolId },
      select: {
        recipientUserId: true,
        contributors: { select: { userId: true } },
      },
    }),
    prisma.wishlistClaim.findMany({
      where: { wishlistItemId: { in: itemIds } },
      select: {
        wishlistItemId: true,
        poolId: true,
        claimedByUserId: true,
        claimedByUser: { select: { name: true, username: true } },
        pool: { select: { id: true, title: true } },
      },
    }),
  ]);

  const contributorIds = new Set(pool?.contributors.map((c) => c.userId) ?? []);
  const claimsByItem = new Map(claims.map((claim) => [claim.wishlistItemId, claim]));

  for (const idea of ideas) {
    if (!idea.wishlistItemId) continue;
    const claim = claimsByItem.get(idea.wishlistItemId);
    // Unclaimed, or this pool holding its own claim — not a conflict.
    if (!claim || claim.poolId === poolId) continue;

    const holder: ClaimHolder = claim.pool
      ? {
          kind: 'pool',
          poolId: claim.pool.id,
          poolTitle: claim.pool.title,
          giftGroupName: null,
        }
      : {
          kind: 'user',
          userId: claim.claimedByUserId ?? '',
          displayName: claim.claimedByUser?.name ?? claim.claimedByUser?.username ?? null,
        };

    conflicts.set(
      idea.id,
      resolveClaimDisclosure(
        holder,
        {
          // Defensive, not load-bearing: the pool page loader already blocks
          // the recipient from reaching this code (see __route.server.ts), so
          // this is always false in practice. Derived rather than hardcoded
          // so the module doesn't silently rely on that upstream gate.
          isOwner: pool !== null && viewerUserId === pool.recipientUserId,
          isAnonymous: false,
          contributesToHolderPool: false,
          memberOfHolderGroup: false,
          sharesPoolWithHolderUser:
            claim.claimedByUserId !== null && contributorIds.has(claim.claimedByUserId),
        },
        'badge',
      ),
    );
  }

  return conflicts;
}
