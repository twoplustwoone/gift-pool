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

/**
 * The settlement hook. Runs whenever a claim disappears — and MUST run inside
 * the same transaction as the release. Split them and there is a window where
 * the item reads as unclaimed, letting a third party take an item a pool is
 * actively buying: exactly the bug this feature exists to close.
 */
async function settleItem(tx: Tx, wishlistItemId: string): Promise<string | null> {
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

  await tx.wishlistClaim.create({ data: { wishlistItemId, poolId: heir.id } });
  return heir.id;
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

export async function releaseUserClaim(
  wishlistItemId: string,
  userId: string,
): Promise<{ ok: boolean; transferredToPoolId: string | null }> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.wishlistClaim.findUnique({
      where: { wishlistItemId },
      select: { id: true, claimedByUserId: true },
    });
    // Only a claimer releases their own claim. No override exists, by design:
    // an override could erase evidence of a purchase that physically happened.
    if (!claim || claim.claimedByUserId !== userId) {
      return { ok: false, transferredToPoolId: null };
    }

    await tx.wishlistClaim.delete({ where: { id: claim.id } });
    // Do not pull this call out of the transaction, and do not await/queue it
    // after `$transaction` resolves. Delete-then-settle must commit as one
    // unit: if the delete were visible to other connections before settlement
    // runs, a concurrent `claimForUser` could win the free item in that gap,
    // and a pool actively buying it would silently lose out with no error —
    // the exact bug this module exists to close. See `settleItem`'s docstring.
    const transferredToPoolId = await settleItem(tx, wishlistItemId);
    return { ok: true, transferredToPoolId };
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
): Promise<{ ok: boolean; transferredToPoolId: string | null }> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.wishlistClaim.findUnique({
      where: { wishlistItemId },
      select: { id: true, claimedByUserId: true },
    });
    if (!claim || claim.claimedByUserId === null) {
      return { ok: false, transferredToPoolId: null };
    }

    await tx.wishlistClaim.delete({ where: { id: claim.id } });
    const transferredToPoolId = await settleItem(tx, wishlistItemId);
    return { ok: true, transferredToPoolId };
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
  released: Array<{ wishlistItemId: string; transferredToPoolId: string | null }>;
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
  const released: Array<{ wishlistItemId: string; transferredToPoolId: string | null }> = [];
  for (const itemId of releasedItemIds) {
    const transferredToPoolId = await settleItem(tx, itemId);
    released.push({ wishlistItemId: itemId, transferredToPoolId });
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
 * small ones. The inner re-check guards against a claim that was released by
 * someone else (e.g. the claimer themselves) between the initial `findMany`
 * and this item's turn.
 */
export async function releaseSoloClaimsMatching(
  where: Prisma.WishlistClaimWhereInput,
): Promise<Array<{ wishlistItemId: string; transferredToPoolId: string | null }>> {
  const claims = await prisma.wishlistClaim.findMany({
    where,
    select: { id: true, wishlistItemId: true },
  });

  const released: Array<{ wishlistItemId: string; transferredToPoolId: string | null }> = [];
  for (const claim of claims) {
    const outcome = await prisma.$transaction(async (tx) => {
      const current = await tx.wishlistClaim.findUnique({
        where: { id: claim.id },
        select: { id: true },
      });
      if (!current) return { released: false as const };

      await tx.wishlistClaim.delete({ where: { id: claim.id } });
      const transferredToPoolId = await settleItem(tx, claim.wishlistItemId);
      return { released: true as const, transferredToPoolId };
    });

    if (outcome.released) {
      released.push({ wishlistItemId: claim.wishlistItemId, transferredToPoolId: outcome.transferredToPoolId });
    }
  }
  return released;
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
        'label',
      ),
    );
  }

  return states;
}
