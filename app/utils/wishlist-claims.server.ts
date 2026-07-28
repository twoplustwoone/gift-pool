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
  if (candidates.length === 0) return null;

  const heir = candidates.reduce((longestWaiting, candidate) =>
    waitedLonger(candidate, longestWaiting) ? candidate : longestWaiting,
  );

  await tx.wishlistClaim.create({ data: { wishlistItemId, poolId: heir.id } });
  return heir.id;
}

export async function claimForUser(
  wishlistItemId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: 'held-by-user' | 'held-by-pool' }> {
  const existing = await prisma.wishlistClaim.findUnique({
    where: { wishlistItemId },
    select: { claimedByUserId: true, poolId: true },
  });

  if (existing) {
    if (existing.claimedByUserId === userId) return { ok: true };
    return { ok: false, reason: existing.poolId ? 'held-by-pool' : 'held-by-user' };
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
      return { ok: false, reason: winner?.poolId ? 'held-by-pool' : 'held-by-user' };
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
 * Reconcile a pool's claims with its current decision. Called after the pool
 * decides, re-decides, or is cancelled. Releasing an old item settles it, so a
 * pool switching from A to B frees A for whoever was waiting on it.
 */
export async function syncPoolClaim(poolId: string): Promise<{
  claimedItemId: string | null;
  conflictedItemId: string | null;
  released: Array<{ wishlistItemId: string; transferredToPoolId: string | null }>;
}> {
  return prisma.$transaction(async (tx) => {
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
  });
}
