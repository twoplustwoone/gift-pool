import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import {
  acceptFriendRequest,
  canViewWishlistOf,
  getRelationshipDetails,
  getRelationshipState,
  isFriendOfFriend,
  sendFriendRequest,
} from '#app/utils/friends.server.ts';

// Domain tests stop at the dispatcher seam; delivery behavior is covered by
// notification-dispatcher.server.test.tsx.
const queueNotification = vi.fn();
vi.mock('#app/utils/notification-dispatcher.server.ts', () => ({
  queueNotification: (...args: Array<unknown>) => queueNotification(...args),
}));

async function createUser() {
  return prisma.user.create({
    select: { id: true, username: true, name: true },
    data: {
      email: `user-${randomUUID()}@example.com`,
      username: `user_${randomUUID().slice(0, 8)}`,
      name: 'Friend Test User',
      roles: {
        connectOrCreate: { where: { name: 'user' }, create: { name: 'user' } },
      },
    },
  });
}

describe('friends.server', () => {
  beforeEach(async () => {
    queueNotification.mockReset();
    await prisma.friendRequest.deleteMany();
    await prisma.friendship.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { contains: '@example.com' } },
    });
  });

  it('canViewWishlistOf applies the owner wishlistVisibility rules', async () => {
    const makeFriends = async (aId: string, bId: string) => {
      const [userAId, userBId] = aId < bId ? [aId, bId] : [bId, aId];
      await prisma.friendship.create({ data: { userAId, userBId } });
    };

    const [owner, friend, friendOfFriend, stranger] = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
      createUser(),
    ]);
    await makeFriends(owner.id, friend.id);
    await makeFriends(friend.id, friendOfFriend.id);

    // Owner always sees their own wishlist.
    await expect(canViewWishlistOf(owner.id, owner.id)).resolves.toBe(true);

    // Default FRIENDS: only direct friends.
    await expect(canViewWishlistOf(friend.id, owner.id)).resolves.toBe(true);
    await expect(canViewWishlistOf(friendOfFriend.id, owner.id)).resolves.toBe(
      false,
    );
    await expect(canViewWishlistOf(stranger.id, owner.id)).resolves.toBe(false);

    // FRIENDS_OF_FRIENDS widens by one hop.
    await prisma.user.update({
      where: { id: owner.id },
      data: { wishlistVisibility: 'FRIENDS_OF_FRIENDS' },
    });
    await expect(canViewWishlistOf(friendOfFriend.id, owner.id)).resolves.toBe(
      true,
    );
    await expect(canViewWishlistOf(stranger.id, owner.id)).resolves.toBe(false);

    // EVERYONE: anyone, including strangers.
    await prisma.user.update({
      where: { id: owner.id },
      data: { wishlistVisibility: 'EVERYONE' },
    });
    await expect(canViewWishlistOf(stranger.id, owner.id)).resolves.toBe(true);

    // Unknown owner: never visible.
    await expect(canViewWishlistOf(stranger.id, 'no-such-user')).resolves.toBe(
      false,
    );
  });

  it('sendFriendRequest upserts a PENDING row and fires the fanout without awaiting it', async () => {
    const [sender, recipient] = await Promise.all([createUser(), createUser()]);

    const request = await sendFriendRequest(sender.id, recipient.id);

    expect(request.status).toBe('PENDING');
    expect(request.fromUserId).toBe(sender.id);
    expect(request.toUserId).toBe(recipient.id);
    // Fanout was scheduled with a notify payload addressed to the recipient.
    expect(queueNotification).toHaveBeenCalledTimes(1);
    expect(queueNotification.mock.calls[0]![0]).toMatchObject({
      userId: recipient.id,
      type: 'FRIEND_REQUEST_RECEIVED',
      sourceIdentifier: `friend-request:${request.id}:received`,
    });
  });

  it('getRelationshipState and getRelationshipDetails reflect the PENDING outgoing state', async () => {
    const [sender, recipient] = await Promise.all([createUser(), createUser()]);
    await sendFriendRequest(sender.id, recipient.id);

    await expect(getRelationshipState(sender.id, recipient.id)).resolves.toBe(
      'PENDING_OUTGOING',
    );
    await expect(getRelationshipState(recipient.id, sender.id)).resolves.toBe(
      'PENDING_INCOMING',
    );
    const details = await getRelationshipDetails(sender.id, recipient.id);
    expect(details.state).toBe('PENDING_OUTGOING');
  });

  it('isFriendOfFriend returns true when viewer and owner share a mutual friend', async () => {
    const [viewer, owner, mutual] = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
    ]);
    // Establish viewer ↔ mutual and owner ↔ mutual friendships
    await Promise.all([
      prisma.friendship.create({
        data: { userAId: viewer.id, userBId: mutual.id },
      }),
      prisma.friendship.create({
        data: { userAId: owner.id, userBId: mutual.id },
      }),
    ]);

    await expect(isFriendOfFriend(viewer.id, owner.id)).resolves.toBe(true);
  });

  it('isFriendOfFriend returns false when no mutual friend exists', async () => {
    const [viewer, owner, other] = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
    ]);
    // viewer knows other, owner knows nobody — no intersection
    await prisma.friendship.create({
      data: { userAId: viewer.id, userBId: other.id },
    });

    await expect(isFriendOfFriend(viewer.id, owner.id)).resolves.toBe(false);
  });

  it('isFriendOfFriend returns false when viewer and owner are direct friends (not FOF)', async () => {
    const [viewer, owner] = await Promise.all([createUser(), createUser()]);
    // Direct friendship — isFriendOfFriend should not count the principals
    await prisma.friendship.create({
      data: { userAId: viewer.id, userBId: owner.id },
    });

    // The viewer IS in the owner's friend list, but they are the principal —
    // the function must exclude them from the intersection.
    await expect(isFriendOfFriend(viewer.id, owner.id)).resolves.toBe(false);
  });

  it('acceptFriendRequest upserts the friendship and fires a fanout to the original sender', async () => {
    const [sender, recipient] = await Promise.all([createUser(), createUser()]);
    const request = await sendFriendRequest(sender.id, recipient.id);
    queueNotification.mockClear();

    await acceptFriendRequest(request.id, recipient.id);

    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userAId: sender.id, userBId: recipient.id },
          { userAId: recipient.id, userBId: sender.id },
        ],
      },
    });
    expect(friendship).not.toBeNull();

    const accepted = await prisma.friendRequest.findUnique({
      where: { id: request.id },
    });
    expect(accepted?.status).toBe('ACCEPTED');

    // Accept fanout is addressed to the original sender.
    expect(queueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: sender.id,
        type: 'FRIEND_REQUEST_ACCEPTED',
        sourceIdentifier: `friend-request:${request.id}:accepted`,
      }),
    );
  });
});
