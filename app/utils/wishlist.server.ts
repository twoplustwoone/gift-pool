import { prisma } from './db.server.ts';
import { usersShareAGroupOrAreFriendsByIds } from './groups.server.ts';

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
