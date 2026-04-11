import { prisma } from './db.server.ts';
import {
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  listFriends,
} from './friends.server.ts';

// For each friend, the list of gift groups they share with the viewer.
// Two queries: one fetch of every group the viewer is a member of (with the
// list of members on each group), then we walk the result client-side to
// build a `Map<friendId, mutualGroups[]>`. This is O(viewer_groups *
// avg_members_per_group) which is plenty fast for any realistic dataset
// and avoids running one query per friend.
async function buildMutualGroupsByFriend(viewerId: string) {
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

  const byFriend = new Map<string, Array<{ id: string; name: string }>>();
  for (const membership of viewerGroups) {
    const group = membership.giftGroup;
    for (const member of group.groupMembers) {
      if (member.userId === viewerId) continue;
      const existing = byFriend.get(member.userId);
      const entry = { id: group.id, name: group.name };
      if (existing) {
        existing.push(entry);
      } else {
        byFriend.set(member.userId, [entry]);
      }
    }
  }
  return byFriend;
}

export async function loadFriendsPageData(userId: string) {
  const [friends, incoming, outgoing, mutualGroupsByFriend] = await Promise.all(
    [
      listFriends(userId),
      getIncomingFriendRequests(userId),
      getOutgoingFriendRequests(userId),
      buildMutualGroupsByFriend(userId),
    ],
  );

  const friendsWithMutuals = friends.map((entry) => ({
    ...entry,
    mutualGroups: mutualGroupsByFriend.get(entry.user.id) ?? [],
  }));

  return {
    friends: friendsWithMutuals,
    incoming,
    outgoing,
  };
}
