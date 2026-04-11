import { prisma } from './db.server.ts';

// Shape returned to the profile page loader. Only populated when the viewer
// is allowed to see the target's details (i.e. they're friends).
export type ProfilePageData = {
  mutualGroups: Array<{ id: string; name: string }>;
  mutualFriends: Array<{
    id: string;
    username: string;
    name: string | null;
    image: { id: string } | null;
  }>;
  wishlistPreview: {
    totalCount: number;
    items: Array<{
      id: string;
      title: string;
      hasImage: boolean;
      url: string | null;
      updatedAt: Date;
    }>;
  };
};

// Groups that both the viewer and the target belong to. We fetch the viewer's
// groups with their members once, then walk them in memory to find the ones
// whose member set contains the target. Same tactic as
// `buildMutualGroupsByFriend` in `friends-page.server.ts`, but narrowed to a
// single pair.
async function loadMutualGroups(viewerId: string, targetUserId: string) {
  const viewerGroups = await prisma.usersInGiftGroups.findMany({
    where: { userId: viewerId },
    select: {
      giftGroup: {
        select: {
          id: true,
          name: true,
          groupMembers: {
            select: { userId: true },
          },
        },
      },
    },
  });

  const shared: Array<{ id: string; name: string }> = [];
  for (const membership of viewerGroups) {
    const group = membership.giftGroup;
    const hasTarget = group.groupMembers.some((m) => m.userId === targetUserId);
    if (hasTarget) {
      shared.push({ id: group.id, name: group.name });
    }
  }
  return shared;
}

// Set intersection of the viewer's friends with the target's friends.
// Friendships are stored as unordered pairs (userAId < userBId), so for each
// side we fetch all friendships and project to the "other" user id.
async function loadMutualFriends(viewerId: string, targetUserId: string) {
  const [viewerFriendships, targetFriendships] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        OR: [{ userAId: viewerId }, { userBId: viewerId }],
      },
      select: { userAId: true, userBId: true },
    }),
    prisma.friendship.findMany({
      where: {
        OR: [{ userAId: targetUserId }, { userBId: targetUserId }],
      },
      select: { userAId: true, userBId: true },
    }),
  ]);

  const viewerFriendIds = new Set<string>();
  for (const f of viewerFriendships) {
    viewerFriendIds.add(f.userAId === viewerId ? f.userBId : f.userAId);
  }

  const mutualIds: string[] = [];
  for (const f of targetFriendships) {
    const otherId = f.userAId === targetUserId ? f.userBId : f.userAId;
    if (otherId === viewerId) continue;
    if (viewerFriendIds.has(otherId)) mutualIds.push(otherId);
  }

  if (mutualIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: mutualIds } },
    select: {
      id: true,
      username: true,
      name: true,
      image: { select: { id: true } },
    },
    orderBy: { name: 'asc' },
  });
  return users;
}

// Top-N unpurchased, active wishlist items to preview on the profile.
// Deliberately does NOT select image blob bytes — list views must stay cheap
// (see perf commit `ae7609d`).
async function loadWishlistPreview(targetUserId: string, limit = 3) {
  const [items, totalCount] = await Promise.all([
    prisma.wishlistItem.findMany({
      where: {
        ownerId: targetUserId,
        status: 'ACTIVE',
        purchase: null,
      },
      select: {
        id: true,
        title: true,
        url: true,
        hasImage: true,
        updatedAt: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
      take: limit,
    }),
    prisma.wishlistItem.count({
      where: {
        ownerId: targetUserId,
        status: 'ACTIVE',
      },
    }),
  ]);

  return { items, totalCount };
}

// Called after the route loader has confirmed viewer ↔ target are friends.
// Returns the rich profile content — mutual connections and wishlist preview.
export async function loadProfilePageData(
  viewerId: string,
  targetUserId: string,
): Promise<ProfilePageData> {
  const [mutualGroups, mutualFriends, wishlistPreview] = await Promise.all([
    loadMutualGroups(viewerId, targetUserId),
    loadMutualFriends(viewerId, targetUserId),
    loadWishlistPreview(targetUserId),
  ]);

  return { mutualGroups, mutualFriends, wishlistPreview };
}
