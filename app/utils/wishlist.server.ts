import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './db.server.ts';
import { usersShareAGroupOrAreFriendsByIds } from './groups.server.ts';
import { queueWishlistClaimTransferredNotification } from './pool.server.ts';
import { releaseSoloClaimsMatching } from './wishlist-claims.server.ts';

const PUBLIC_SHARE_TOKEN_BYTES = 24;

export async function cleanupWishlistClaimsForOwner(ownerId: string) {
  // Routed through the module's transactional release-and-settle path
  // (rather than a bare deleteMany) so a decided pool waiting behind a solo
  // claimant who lost access inherits the item in the same commit as the
  // release. This runs from wishlist loaders — i.e. on page views — and can
  // match many claims at once (scoped by owner, not by item), which is why
  // it goes through the batch-capable `releaseSoloClaimsMatching` rather than
  // one-at-a-time `releaseSoloClaimForItem`.
  const released = await releaseSoloClaimsMatching({
    wishlistItem: { ownerId },
    // Solo claims only. A pool-held claim has claimedByUserId: null (see
    // the DB CHECK in the WishlistClaim migration — exactly one of
    // claimedByUserId/poolId is set), so every claimedByUser predicate
    // below fails to match it and NOT(...) would otherwise evaluate true,
    // silently deleting the pool's claim on every wishlist page view.
    // Pool claims are released only by pool lifecycle events (decide,
    // re-decide, cancel) — never by this viewer-access cleanup. Do not
    // remove this predicate.
    claimedByUserId: { not: null },
    NOT: {
      OR: [
        { claimedByUser: { friendshipsA: { some: { userBId: ownerId } } } },
        { claimedByUser: { friendshipsB: { some: { userAId: ownerId } } } },
        {
          claimedByUser: {
            giftGroups: {
              some: {
                giftGroup: { groupMembers: { some: { userId: ownerId } } },
              },
            },
          },
        },
      ],
    },
  });

  for (const release of released) {
    if (!release.transferredToPoolId || !release.transferredClaimId) continue;
    queueWishlistClaimTransferredNotification(
      release.transferredToPoolId,
      release.wishlistItemId,
      release.transferredClaimId,
    );
  }
}

export async function usersShareWishlistAccess({
  viewerId,
  ownerId,
}: {
  viewerId: string;
  ownerId: string;
}) {
  return usersShareAGroupOrAreFriendsByIds({
    userId: viewerId,
    otherUserId: ownerId,
  });
}

export function generatePublicShareToken() {
  const token = randomBytes(PUBLIC_SHARE_TOKEN_BYTES).toString('base64url');
  const tokenHash = hashPublicShareToken(token);
  return { token, tokenHash };
}

export function hashPublicShareToken(token: string) {
  return createHash('sha256').update(token).digest('base64');
}

export async function getActiveWishlistPublicShare(ownerId: string) {
  return prisma.wishlistPublicShare.findUnique({ where: { ownerId } });
}

export async function upsertWishlistPublicShare(ownerId: string) {
  const { token, tokenHash } = generatePublicShareToken();
  const share = await prisma.wishlistPublicShare.upsert({
    where: { ownerId },
    update: { token, tokenHash },
    create: { ownerId, token, tokenHash },
  });

  return { share, token };
}

export async function revokeWishlistPublicShare(ownerId: string) {
  await prisma.wishlistPublicShare
    .delete({ where: { ownerId } })
    .catch((error: unknown) => {
      // best-effort revoke: ignore missing records
      if ((error as { code?: string })?.code !== 'P2025') {
        throw error;
      }
    });
}

export async function findWishlistPublicShareByToken(token: string) {
  const tokenHash = hashPublicShareToken(token);
  return prisma.wishlistPublicShare.findUnique({ where: { tokenHash } });
}
