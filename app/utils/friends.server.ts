import { prisma } from '#app/utils/db.server.ts';
import type { RelationshipState } from './friends.ts';

export type FriendRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

const FRIEND_REQUEST_RATE_LIMIT_WINDOW_MINUTES = 10;
const FRIEND_REQUEST_RATE_LIMIT_MAX = 5;

const friendUserSelect = {
  id: true,
  username: true,
  name: true,
  image: { select: { id: true, altText: true } },
} as const;

function normalizePair(userAId: string, userBId: string) {
  return userAId < userBId
    ? { userAId, userBId }
    : { userAId: userBId, userBId: userAId };
}

export async function getRelationshipState(
  currentUserId: string,
  otherUserId: string,
): Promise<RelationshipState> {
  const pair = normalizePair(currentUserId, otherUserId);
  const friendship = await prisma.friendship.findFirst({
    where: { userAId: pair.userAId, userBId: pair.userBId },
    select: { id: true },
  });
  if (friendship) return 'FRIENDS';

  const incoming = await prisma.friendRequest.findFirst({
    where: {
      fromUserId: otherUserId,
      toUserId: currentUserId,
      status: 'PENDING',
    },
    select: { id: true },
  });
  if (incoming) return 'PENDING_INCOMING';

  const outgoing = await prisma.friendRequest.findFirst({
    where: {
      fromUserId: currentUserId,
      toUserId: otherUserId,
      status: 'PENDING',
    },
    select: { id: true },
  });
  if (outgoing) return 'PENDING_OUTGOING';

  return 'NONE';
}

export async function getRelationshipDetails(
  currentUserId: string,
  otherUserId: string,
) {
  const pair = normalizePair(currentUserId, otherUserId);
  const friendship = await prisma.friendship.findFirst({
    where: { userAId: pair.userAId, userBId: pair.userBId },
  });
  if (friendship) {
    return { state: 'FRIENDS' as RelationshipState, friendship };
  }

  const incoming = await prisma.friendRequest.findFirst({
    where: {
      fromUserId: otherUserId,
      toUserId: currentUserId,
      status: 'PENDING',
    },
  });
  if (incoming) {
    return { state: 'PENDING_INCOMING' as RelationshipState, incoming };
  }

  const outgoing = await prisma.friendRequest.findFirst({
    where: {
      fromUserId: currentUserId,
      toUserId: otherUserId,
      status: 'PENDING',
    },
  });

  if (outgoing) {
    return { state: 'PENDING_OUTGOING' as RelationshipState, outgoing };
  }

  return { state: 'NONE' as RelationshipState };
}

export async function listFriends(userId: string) {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    include: {
      userA: { select: friendUserSelect },
      userB: { select: friendUserSelect },
    },
    orderBy: { createdAt: 'desc' },
  });

  return friendships.map((friendship) => {
    const otherUser =
      friendship.userAId === userId ? friendship.userB : friendship.userA;
    return {
      friendshipId: friendship.id,
      createdAt: friendship.createdAt,
      user: otherUser,
    };
  });
}

async function assertCanSendRequest(fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) {
    throw new Response('Cannot send a friend request to yourself', {
      status: 400,
    });
  }

  const pair = normalizePair(fromUserId, toUserId);
  const existingFriendship = await prisma.friendship.findFirst({
    where: { userAId: pair.userAId, userBId: pair.userBId },
    select: { id: true },
  });
  if (existingFriendship) {
    throw new Response('Users are already friends', { status: 400 });
  }

  const existingPending = await prisma.friendRequest.findFirst({
    where: {
      status: 'PENDING',
      OR: [
        { fromUserId, toUserId },
        { fromUserId: toUserId, toUserId: fromUserId },
      ],
    },
    select: { id: true },
  });
  if (existingPending) {
    throw new Response('There is already a pending friend request', {
      status: 400,
    });
  }

  const recentCount = await prisma.friendRequest.count({
    where: {
      fromUserId,
      createdAt: {
        gte: new Date(
          Date.now() - FRIEND_REQUEST_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
        ),
      },
    },
  });
  if (recentCount >= FRIEND_REQUEST_RATE_LIMIT_MAX) {
    throw new Response('Slow down. Please try again later.', { status: 429 });
  }
}

export async function sendFriendRequest(
  fromUserId: string,
  toUserId: string,
) {
  await assertCanSendRequest(fromUserId, toUserId);

  return prisma.$transaction(async (tx) => {
    const [fromUser, request] = await Promise.all([
      tx.user.findUniqueOrThrow({
        where: { id: fromUserId },
        select: { id: true, name: true, username: true, image: { select: { id: true } } },
      }),
      tx.friendRequest.create({
        data: {
          fromUserId,
          toUserId,
        },
      }),
    ]);

    await tx.notification.create({
      data: {
        userId: toUserId,
        type: 'FRIEND_REQUEST',
        status: 'UNREAD',
        messageKey: 'notifications.friendRequest.message',
        messageParams: JSON.stringify({
          name: fromUser.name ?? fromUser.username,
        }),
        targetUrl: `/users/${fromUser.username}`,
        metadata: JSON.stringify({
          senderUserId: fromUser.id,
          senderDisplayName: fromUser.name ?? fromUser.username,
          senderAvatarId: fromUser.image?.id ?? null,
        }),
        actions: JSON.stringify([
          { kind: 'FRIEND_ACCEPT', labelKey: 'notifications.friendRequest.accept' },
          { kind: 'FRIEND_REJECT', labelKey: 'notifications.friendRequest.reject' },
        ] satisfies Array<{ kind: string; labelKey: string }>),
        friendRequestId: request.id,
        sourceIdentifier: request.id,
      },
    });

    return request;
  });
}

export async function acceptFriendRequest(
  requestId: string,
  actingUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.friendRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { notification: true },
    });
    if (request.toUserId !== actingUserId) {
      throw new Response('Not authorized to accept this request', {
        status: 403,
      });
    }
    if (request.status !== 'PENDING') {
      throw new Response('Friend request is no longer pending', { status: 400 });
    }

    const pair = normalizePair(request.fromUserId, request.toUserId);
    await tx.friendRequest.update({
      where: { id: request.id },
      data: {
        status: 'ACCEPTED',
      },
    });

    await tx.friendship.upsert({
      where: {
        userAId_userBId: {
          userAId: pair.userAId,
          userBId: pair.userBId,
        },
      },
      create: {
        userAId: pair.userAId,
        userBId: pair.userBId,
      },
      update: {},
    });

    if (request.notification) {
      await tx.notification.update({
        where: { id: request.notification.id },
        data: {
          status: 'READ',
          readAt: new Date(),
          actions: JSON.stringify([]),
        },
      });
    }

    return request;
  });
}

export async function rejectFriendRequest(
  requestId: string,
  actingUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.friendRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { notification: true },
    });
    if (request.toUserId !== actingUserId) {
      throw new Response('Not authorized to reject this request', {
        status: 403,
      });
    }
    if (request.status !== 'PENDING') {
      throw new Response('Friend request is no longer pending', { status: 400 });
    }

    await tx.friendRequest.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
      },
    });

    if (request.notification) {
      await tx.notification.update({
        where: { id: request.notification.id },
        data: {
          status: 'READ',
          readAt: new Date(),
          actions: JSON.stringify([]),
        },
      });
    }

    return request;
  });
}

export async function removeFriend(
  currentUserId: string,
  friendUserId: string,
) {
  const pair = normalizePair(currentUserId, friendUserId);
  const existing = await prisma.friendship.findFirst({
    where: { userAId: pair.userAId, userBId: pair.userBId },
  });
  if (!existing) {
    throw new Response('Friendship not found', { status: 404 });
  }
  if (currentUserId !== existing.userAId && currentUserId !== existing.userBId) {
    throw new Response('Not authorized to remove this friend', { status: 403 });
  }

  await prisma.friendship.delete({
    where: { id: existing.id },
  });

  return existing;
}

export async function cancelOutgoingRequest(
  currentUserId: string,
  requestId: string,
) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.friendRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { notification: true },
    });
    if (request.fromUserId !== currentUserId) {
      throw new Response('Not authorized to cancel this request', {
        status: 403,
      });
    }
    if (request.status !== 'PENDING') {
      throw new Response('Friend request is no longer pending', { status: 400 });
    }

    await tx.friendRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED' },
    });

    if (request.notification) {
      await tx.notification.update({
        where: { id: request.notification.id },
        data: {
          status: 'READ',
          readAt: new Date(),
          actions: JSON.stringify([]),
        },
      });
    }

    return request;
  });
}

export async function getIncomingFriendRequests(userId: string) {
  const requests = await prisma.friendRequest.findMany({
    where: { toUserId: userId, status: 'PENDING' },
    include: {
      fromUser: { select: friendUserSelect },
      notification: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return requests;
}

export async function getOutgoingFriendRequests(userId: string) {
  const requests = await prisma.friendRequest.findMany({
    where: { fromUserId: userId, status: 'PENDING' },
    include: {
      toUser: { select: friendUserSelect },
      notification: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return requests;
}
