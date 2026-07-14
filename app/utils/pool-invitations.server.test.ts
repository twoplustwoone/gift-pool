/**
 * @vitest-environment node
 */
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';

const queueNotification = vi.fn();
const queueLogEvent = vi.fn().mockReturnValue({ eventId: 'test-event' });
const recordContributorJoined = vi.fn();

vi.mock('#app/utils/notification-dispatcher.server.ts', () => ({
  queueNotification: (...args: Array<unknown>) => queueNotification(...args),
}));
vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: (...args: Array<unknown>) => queueLogEvent(...args),
}));
vi.mock('#app/utils/pool.server.ts', () => ({
  recordContributorJoined: (...args: Array<unknown>) =>
    recordContributorJoined(...args),
}));

import {
  acceptPoolInvitation,
  cancelPoolInvitation,
  declinePoolInvitation,
  getPoolInvitationForInvitee,
  getPoolInvitationManagerState,
  sendPoolInvitations,
} from './pool-invitations.server.ts';

beforeEach(() => {
  queueNotification.mockReset();
  queueLogEvent.mockReset().mockReturnValue({ eventId: 'test-event' });
  recordContributorJoined.mockReset();
});

describe('pool invitation module', () => {
  it("lists only the standalone manager's direct friends", async () => {
    const manager = await createUser('manager');
    const managerFriend = await createUser('manager-friend');
    const recipient = await createUser('recipient');
    const recipientOnlyFriend = await createUser('recipient-friend');
    await createFriendship(manager.id, managerFriend.id);
    await createFriendship(recipient.id, recipientOnlyFriend.id);
    const pool = await createPool(manager.id, recipient.id);

    const state = await getPoolInvitationManagerState(pool.id, manager.id);

    expect(state.candidates.map(({ id }) => id)).toEqual([managerFriend.id]);
    expect(state.candidates.map(({ id }) => id)).not.toContain(
      recipientOnlyFriend.id,
    );
  });

  it('lists only active eligible group members and permits a group admin', async () => {
    const organizer = await createUser('organizer');
    const admin = await createUser('admin');
    const eligible = await createUser('eligible');
    const removed = await createUser('removed');
    const recipient = await createUser('recipient');
    const group = await prisma.giftGroup.create({
      data: { name: 'Gift group', createdById: organizer.id },
    });
    await prisma.usersInGiftGroups.createMany({
      data: [
        membership(group.id, organizer.id, 'MEMBER'),
        membership(group.id, admin.id, 'ADMIN'),
        membership(group.id, eligible.id, 'MEMBER', {
          contributionCents: 2500,
        }),
        membership(group.id, removed.id, 'MEMBER', { removedAt: new Date() }),
        membership(group.id, recipient.id, 'MEMBER'),
      ],
    });
    const pool = await createPool(organizer.id, recipient.id, group.id);

    const state = await getPoolInvitationManagerState(pool.id, admin.id);

    expect(state.candidates).toEqual([
      expect.objectContaining({ id: eligible.id, contributionCents: 2500 }),
    ]);
  });

  it('makes a decline final for direct invitations to that pool', async () => {
    const manager = await createUser('manager');
    const friend = await createUser('friend');
    await createFriendship(manager.id, friend.id);
    const pool = await createPool(manager.id);
    const [invitation] = await sendPoolInvitations({
      poolId: pool.id,
      managerId: manager.id,
      inviteeIds: [friend.id],
    });

    await declinePoolInvitation(invitation!.id, friend.id);

    await expect(
      sendPoolInvitations({
        poolId: pool.id,
        managerId: manager.id,
        inviteeIds: [friend.id],
      }),
    ).rejects.toMatchObject({
      code: 'ALREADY_INVITED',
      status: 409,
    });
    await expect(
      prisma.poolInvitation.findUnique({ where: { id: invitation!.id } }),
    ).resolves.toMatchObject({ status: 'DECLINED' });
    expect(queueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: friend.id,
        type: 'POOL_INVITATION_RECEIVED',
        payload: expect.objectContaining({ invitationId: invitation!.id }),
      }),
    );
  });

  it('reopens the same durable row after a manager cancellation', async () => {
    const manager = await createUser('manager');
    const friend = await createUser('friend');
    await createFriendship(manager.id, friend.id);
    const pool = await createPool(manager.id);
    const [first] = await sendPoolInvitations({
      poolId: pool.id,
      managerId: manager.id,
      inviteeIds: [friend.id],
    });

    await cancelPoolInvitation({
      invitationId: first!.id,
      managerId: manager.id,
    });
    const [second] = await sendPoolInvitations({
      poolId: pool.id,
      managerId: manager.id,
      inviteeIds: [friend.id],
    });

    expect(second!.id).toBe(first!.id);
    await expect(
      prisma.poolInvitation.findUnique({ where: { id: first!.id } }),
    ).resolves.toMatchObject({
      status: 'PENDING',
      cancelledAt: null,
    });
  });

  it('accepts with the current group default and clears the notification', async () => {
    const organizer = await createUser('organizer');
    const invitee = await createUser('invitee');
    const group = await prisma.giftGroup.create({
      data: { name: 'Gift group', createdById: organizer.id },
    });
    await prisma.usersInGiftGroups.createMany({
      data: [
        membership(group.id, organizer.id, 'OWNER'),
        membership(group.id, invitee.id, 'MEMBER', {
          contributionCents: 1800,
        }),
      ],
    });
    const pool = await createPool(organizer.id, null, group.id);
    const [invitation] = await sendPoolInvitations({
      poolId: pool.id,
      managerId: organizer.id,
      inviteeIds: [invitee.id],
    });
    await prisma.notification.create({
      data: {
        userId: invitee.id,
        type: 'POOL_INVITATION_RECEIVED',
        status: 'UNREAD',
        messageKey: 'notifications.poolInvitation.message',
        actions: JSON.stringify([{ kind: 'POOL_INVITATION_ACCEPT' }]),
        poolInvitationId: invitation!.id,
      },
    });

    await acceptPoolInvitation(invitation!.id, invitee.id);

    await expect(
      prisma.poolContributor.findUnique({
        where: { poolId_userId: { poolId: pool.id, userId: invitee.id } },
      }),
    ).resolves.toMatchObject({ contributionCents: 1800 });
    await expect(
      prisma.notification.findUnique({
        where: { poolInvitationId: invitation!.id },
      }),
    ).resolves.toMatchObject({ status: 'READ', actions: '[]' });
    expect(recordContributorJoined).toHaveBeenCalledWith(
      pool.id,
      invitee.id,
      expect.objectContaining({ via: 'direct_invitation' }),
    );
  });

  it('returns a generic not-found result to the wrong signed-in user', async () => {
    const manager = await createUser('manager');
    const friend = await createUser('friend');
    const stranger = await createUser('stranger');
    await createFriendship(manager.id, friend.id);
    const pool = await createPool(manager.id);
    const [invitation] = await sendPoolInvitations({
      poolId: pool.id,
      managerId: manager.id,
      inviteeIds: [friend.id],
    });

    await expect(
      getPoolInvitationForInvitee(invitation!.id, stranger.id),
    ).rejects.toMatchObject({
      code: 'INVITATION_NOT_FOUND',
      status: 404,
    });
  });
});

async function createUser(label: string) {
  const suffix = randomUUID().slice(0, 8);
  return prisma.user.create({
    data: {
      email: `${label}-${suffix}@example.com`,
      username: `${label.replaceAll('-', '_')}_${suffix}`,
      name: label,
    },
    select: { id: true, name: true, username: true },
  });
}

async function createFriendship(firstId: string, secondId: string) {
  const [userAId, userBId] = [firstId, secondId].sort();
  return prisma.friendship.create({
    data: { userAId: userAId!, userBId: userBId! },
  });
}

async function createPool(
  organizerId: string,
  recipientUserId: string | null = null,
  giftGroupId: string | null = null,
) {
  return prisma.pool.create({
    data: {
      title: 'Birthday surprise',
      organizerId,
      recipientUserId,
      giftGroupId,
      contributors: { create: { userId: organizerId } },
    },
  });
}

function membership(
  giftGroupId: string,
  userId: string,
  role: string,
  overrides: { contributionCents?: number; removedAt?: Date } = {},
) {
  return { giftGroupId, userId, role, ...overrides };
}
