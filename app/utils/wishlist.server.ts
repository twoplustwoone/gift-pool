import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './db.server.ts';
import { usersShareAGroupOrAreFriendsByIds } from './groups.server.ts';

const PUBLIC_SHARE_TOKEN_BYTES = 24;

export async function cleanupWishlistPurchasesForOwner(ownerId: string) {
  await prisma.wishlistPurchase.deleteMany({
    where: {
      wishlistItem: { ownerId },
      NOT: {
        OR: [
          { purchasedBy: { friendshipsA: { some: { userBId: ownerId } } } },
          { purchasedBy: { friendshipsB: { some: { userAId: ownerId } } } },
          {
            purchasedBy: {
              giftGroups: {
                some: {
                  giftGroup: { groupMembers: { some: { userId: ownerId } } },
                },
              },
            },
          },
        ],
      },
    },
  });
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
