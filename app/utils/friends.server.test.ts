import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import {
  acceptFriendRequest,
  getRelationshipDetails,
  getRelationshipState,
  isFriendOfFriend,
  sendFriendRequest,
} from '#app/utils/friends.server.ts';

// The fanout is deliberately fire-and-forget in production — we mock
// `notifyUser` so the tests can assert it was scheduled without hitting
// Resend or racing the in-app notification insert.
const notifyUser = vi.fn();
vi.mock('#app/utils/notification-service.server.tsx', () => ({
  notifyUser: (...args: Array<unknown>) => notifyUser(...args),
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

// Flush any fire-and-forget microtasks that `fanoutNotification` kicks off.
async function drainFanout() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('friends.server', () => {
  beforeEach(async () => {
    notifyUser.mockReset().mockResolvedValue(undefined);
    await prisma.friendRequest.deleteMany();
    await prisma.friendship.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { contains: '@example.com' } },
    });
  });

  it('sendFriendRequest upserts a PENDING row and fires the fanout without awaiting it', async () => {
    const [sender, recipient] = await Promise.all([createUser(), createUser()]);

    const request = await sendFriendRequest(sender.id, recipient.id);
    await drainFanout();

    expect(request.status).toBe('PENDING');
    expect(request.fromUserId).toBe(sender.id);
    expect(request.toUserId).toBe(recipient.id);
    // Fanout was scheduled with a notify payload addressed to the recipient.
    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(notifyUser.mock.calls[0]![0]).toMatchObject({
      userId: recipient.id,
      type: 'FRIEND_REQUEST_RECEIVED',
      sourceIdentifier: `friend-request:${request.id}:received`,
    });
  });

  it('sendFriendRequest swallows fanout errors via Sentry rather than failing the action', async () => {
    const [sender, recipient] = await Promise.all([createUser(), createUser()]);
    notifyUser.mockRejectedValueOnce(new Error('fanout boom'));
    // Sentry's captureException writes to stderr in dev — we don't want a
    // false-looking stack in the test log.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = await sendFriendRequest(sender.id, recipient.id);
    await drainFanout();

    expect(request.status).toBe('PENDING');
    // The mutation returned successfully even though notifyUser threw.
    expect(notifyUser).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });

  it('getRelationshipState and getRelationshipDetails reflect the PENDING outgoing state', async () => {
    const [sender, recipient] = await Promise.all([createUser(), createUser()]);
    await sendFriendRequest(sender.id, recipient.id);
    await drainFanout();

    await expect(
      getRelationshipState(sender.id, recipient.id),
    ).resolves.toBe('PENDING_OUTGOING');
    await expect(
      getRelationshipState(recipient.id, sender.id),
    ).resolves.toBe('PENDING_INCOMING');
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
    await drainFanout();
    notifyUser.mockClear();

    await acceptFriendRequest(request.id, recipient.id);
    await drainFanout();

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
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: sender.id,
        type: 'FRIEND_REQUEST_ACCEPTED',
        sourceIdentifier: `friend-request:${request.id}:accepted`,
      }),
    );
  });
});
