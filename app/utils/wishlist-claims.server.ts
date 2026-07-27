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
import { type Prisma } from '@prisma/client';
import { prisma } from './db.server.ts';
import { POOL_STATUS } from './pool-constants.ts';

export const POOL_INTENT_STATUSES = [
  POOL_STATUS.DECIDED,
  POOL_STATUS.PURCHASED,
  POOL_STATUS.DELIVERED,
] as const;

type Tx = Prisma.TransactionClient;

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

  const heir = await tx.pool.findFirst({
    where: {
      status: { in: [...POOL_INTENT_STATUSES] },
      chosenIdea: { wishlistItemId },
    },
    orderBy: [{ decidedAt: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  if (!heir) return null;

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

  await prisma.wishlistClaim.create({ data: { wishlistItemId, claimedByUserId: userId } });
  return { ok: true };
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
    const transferredToPoolId = await settleItem(tx, wishlistItemId);
    return { ok: true, transferredToPoolId };
  });
}

export { settleItem as settleItemForTesting };
