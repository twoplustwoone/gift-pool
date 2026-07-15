import { type Prisma } from '@prisma/client';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { NOTIFICATION_TYPES } from '#app/utils/notification-catalog.ts';
import { queueNotification } from '#app/utils/notification-dispatcher.server.ts';
import {
  ACTIVE_POOL_STATUSES,
  type PoolStatus,
} from '#app/utils/pool-constants.ts';
import { recordContributorJoined } from '#app/utils/pool.server.ts';

export type PoolInvitationStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'CANCELLED';

const userSummarySelect = {
  id: true,
  username: true,
  name: true,
  image: { select: { id: true, altText: true } },
} as const;

type TransactionClient = Prisma.TransactionClient;

export class PoolInvitationError extends Error {
  constructor(
    public readonly code:
      | 'POOL_NOT_FOUND'
      | 'NOT_MANAGER'
      | 'POOL_CLOSED'
      | 'INVITATION_NOT_FOUND'
      | 'INVITATION_NOT_PENDING'
      | 'INVITEE_NOT_ELIGIBLE'
      | 'ALREADY_INVITED',
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'PoolInvitationError';
  }
}

function isActivePoolStatus(status: string): status is PoolStatus {
  return ACTIVE_POOL_STATUSES.includes(status as PoolStatus);
}

function recipientLabel(pool: {
  recipientName: string | null;
  recipientUser: { name: string | null; username: string } | null;
}) {
  return (
    pool.recipientUser?.name ??
    pool.recipientUser?.username ??
    pool.recipientName ??
    'the recipient'
  );
}

async function requireManager(
  tx: TransactionClient,
  pool: {
    organizerId: string;
    giftGroupId: string | null;
  },
  userId: string,
) {
  if (pool.organizerId === userId) return;
  if (!pool.giftGroupId) {
    throw new PoolInvitationError(
      'NOT_MANAGER',
      'Only a pool manager can manage invitations.',
      403,
    );
  }

  const membership = await tx.usersInGiftGroups.findUnique({
    where: {
      userId_giftGroupId: {
        userId,
        giftGroupId: pool.giftGroupId,
      },
    },
    select: { role: true, removedAt: true, bannedUntil: true },
  });
  const active =
    membership?.removedAt === null &&
    (membership.bannedUntil === null || membership.bannedUntil <= new Date());
  if (!active || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
    throw new PoolInvitationError(
      'NOT_MANAGER',
      'Only a pool manager can manage invitations.',
      403,
    );
  }
}

async function getPoolForManager(tx: TransactionClient, poolId: string) {
  const pool = await tx.pool.findUnique({
    where: { id: poolId },
    select: {
      id: true,
      title: true,
      status: true,
      organizerId: true,
      giftGroupId: true,
      recipientUserId: true,
      recipientName: true,
      recipientUser: { select: { name: true, username: true } },
    },
  });
  if (!pool) {
    throw new PoolInvitationError('POOL_NOT_FOUND', 'Pool not found.', 404);
  }
  return pool;
}

async function listEligibleCandidates(
  tx: TransactionClient,
  pool: Awaited<ReturnType<typeof getPoolForManager>>,
  managerId: string,
) {
  const excludedIds = new Set<string>([pool.recipientUserId ?? '', managerId]);
  const [contributors, invitations] = await Promise.all([
    tx.poolContributor.findMany({
      where: { poolId: pool.id },
      select: { userId: true },
    }),
    tx.poolInvitation.findMany({
      where: { poolId: pool.id, status: { not: 'CANCELLED' } },
      select: { inviteeId: true },
    }),
  ]);
  contributors.forEach(({ userId }) => excludedIds.add(userId));
  invitations.forEach(({ inviteeId }) => excludedIds.add(inviteeId));

  if (pool.giftGroupId) {
    const memberships = await tx.usersInGiftGroups.findMany({
      where: {
        giftGroupId: pool.giftGroupId,
        removedAt: null,
        OR: [{ bannedUntil: null }, { bannedUntil: { lte: new Date() } }],
        userId: { notIn: [...excludedIds] },
      },
      select: {
        contributionCents: true,
        user: { select: userSummarySelect },
      },
    });
    return memberships.map(({ user, contributionCents }) => ({
      ...user,
      contributionCents: contributionCents > 0 ? contributionCents : null,
    }));
  }

  const friendships = await tx.friendship.findMany({
    where: {
      OR: [{ userAId: managerId }, { userBId: managerId }],
    },
    select: {
      userAId: true,
      userBId: true,
      userA: { select: userSummarySelect },
      userB: { select: userSummarySelect },
    },
  });
  return friendships
    .map((friendship) =>
      friendship.userAId === managerId ? friendship.userB : friendship.userA,
    )
    .filter((user) => !excludedIds.has(user.id))
    .map((user) => ({ ...user, contributionCents: null }));
}

export async function getPoolInvitationManagerState(
  poolId: string,
  managerId: string,
) {
  return prisma.$transaction(async (tx) => {
    const pool = await getPoolForManager(tx, poolId);
    await requireManager(tx, pool, managerId);
    const [candidates, pendingInvitations] = await Promise.all([
      isActivePoolStatus(pool.status)
        ? listEligibleCandidates(tx, pool, managerId)
        : Promise.resolve([]),
      tx.poolInvitation.findMany({
        where: { poolId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          invitee: { select: userSummarySelect },
        },
      }),
    ]);
    return {
      poolId: pool.id,
      poolTitle: pool.title,
      recipientLabel: recipientLabel(pool),
      isActive: isActivePoolStatus(pool.status),
      candidates,
      pendingInvitations,
    };
  });
}

export async function sendPoolInvitations({
  poolId,
  managerId,
  inviteeIds,
}: {
  poolId: string;
  managerId: string;
  inviteeIds: string[];
}) {
  const uniqueInviteeIds = [...new Set(inviteeIds)].filter(Boolean);
  if (uniqueInviteeIds.length === 0 || uniqueInviteeIds.length > 50) {
    throw new PoolInvitationError(
      'INVITEE_NOT_ELIGIBLE',
      'Choose between 1 and 50 eligible people.',
      400,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const pool = await getPoolForManager(tx, poolId);
    await requireManager(tx, pool, managerId);
    if (!isActivePoolStatus(pool.status)) {
      throw new PoolInvitationError(
        'POOL_CLOSED',
        'This pool is no longer accepting invitations.',
        410,
      );
    }

    const candidates = await listEligibleCandidates(tx, pool, managerId);
    const eligibleIds = new Set(candidates.map(({ id }) => id));
    if (uniqueInviteeIds.some((id) => !eligibleIds.has(id))) {
      const existing = await tx.poolInvitation.findFirst({
        where: { poolId, inviteeId: { in: uniqueInviteeIds } },
        select: { id: true },
      });
      throw new PoolInvitationError(
        existing ? 'ALREADY_INVITED' : 'INVITEE_NOT_ELIGIBLE',
        existing
          ? 'One or more people have already been invited to this pool.'
          : 'One or more people are no longer eligible for this pool.',
        409,
      );
    }

    const inviter = await tx.user.findUniqueOrThrow({
      where: { id: managerId },
      select: userSummarySelect,
    });
    const invitations = [];
    for (const inviteeId of uniqueInviteeIds) {
      invitations.push(
        await tx.poolInvitation.upsert({
          where: { poolId_inviteeId: { poolId, inviteeId } },
          create: { poolId, invitedById: managerId, inviteeId },
          update: {
            invitedById: managerId,
            status: 'PENDING',
            respondedAt: null,
            cancelledAt: null,
          },
          select: { id: true, inviteeId: true },
        }),
      );
    }
    return {
      invitations,
      inviter,
      poolTitle: pool.title,
      recipientLabel: recipientLabel(pool),
    };
  });

  for (const invitation of result.invitations) {
    queueNotification({
      userId: invitation.inviteeId,
      type: NOTIFICATION_TYPES.POOL_INVITATION_RECEIVED,
      payload: {
        invitationId: invitation.id,
        poolId,
        poolTitle: result.poolTitle,
        recipientLabel: result.recipientLabel,
        inviterUserId: result.inviter.id,
        inviterDisplayName: result.inviter.name ?? result.inviter.username,
        inviterAvatarId: result.inviter.image?.id ?? null,
      },
      sourceIdentifier: `pool-invitation:${invitation.id}:received`,
    });
    queueLogEvent({
      name: 'pool_invitation_sent',
      userId: managerId,
      source: 'server',
      properties: {
        poolId,
        invitationId: invitation.id,
        inviteeId: invitation.inviteeId,
      },
    });
  }

  return result.invitations;
}

export async function cancelPoolInvitation({
  invitationId,
  managerId,
}: {
  invitationId: string;
  managerId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const invitation = await tx.poolInvitation.findUnique({
      where: { id: invitationId },
      include: { pool: true, notification: true },
    });
    if (!invitation) {
      throw new PoolInvitationError(
        'INVITATION_NOT_FOUND',
        'Invitation not found.',
        404,
      );
    }
    await requireManager(tx, invitation.pool, managerId);
    if (invitation.status !== 'PENDING') {
      throw new PoolInvitationError(
        'INVITATION_NOT_PENDING',
        'This invitation is no longer pending.',
        409,
      );
    }
    await tx.poolInvitation.update({
      where: { id: invitationId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await deleteNotification(tx, invitation.notification?.id);
    return { poolId: invitation.poolId };
  });
}

export async function getPoolInvitationForInvitee(
  invitationId: string,
  inviteeId: string,
) {
  const invitation = await prisma.poolInvitation.findFirst({
    where: { id: invitationId, inviteeId },
    select: {
      id: true,
      status: true,
      pool: {
        select: {
          id: true,
          title: true,
          status: true,
          recipientName: true,
          recipientUser: { select: { name: true, username: true } },
          _count: { select: { contributors: true } },
        },
      },
      invitedBy: { select: userSummarySelect },
    },
  });
  if (!invitation) {
    throw new PoolInvitationError(
      'INVITATION_NOT_FOUND',
      'Invitation not found.',
      404,
    );
  }
  return {
    id: invitation.id,
    status: invitation.status as PoolInvitationStatus,
    poolId: invitation.pool.id,
    poolTitle: invitation.pool.title,
    poolStatus: invitation.pool.status,
    recipientLabel: recipientLabel(invitation.pool),
    contributorCount: invitation.pool._count.contributors,
    inviter: invitation.invitedBy,
    isActive: isActivePoolStatus(invitation.pool.status),
  };
}

export async function acceptPoolInvitation(
  invitationId: string,
  inviteeId: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    const invitation = await getOwnedInvitation(tx, invitationId, inviteeId);
    if (invitation.status === 'ACCEPTED') {
      return { poolId: invitation.poolId, joined: false, idempotent: true };
    }
    requirePendingAndActive(invitation);

    let contributionCents: number | null = null;
    if (invitation.pool.giftGroupId) {
      const membership = await tx.usersInGiftGroups.findUnique({
        where: {
          userId_giftGroupId: {
            userId: inviteeId,
            giftGroupId: invitation.pool.giftGroupId,
          },
        },
        select: {
          contributionCents: true,
          removedAt: true,
          bannedUntil: true,
        },
      });
      const active =
        membership?.removedAt === null &&
        (membership.bannedUntil === null ||
          membership.bannedUntil <= new Date());
      if (!active) throwInviteeNotEligible();
      contributionCents =
        membership.contributionCents > 0 ? membership.contributionCents : null;
    } else {
      const friendship = await tx.friendship.findFirst({
        where: {
          OR: [
            { userAId: invitation.invitedById, userBId: inviteeId },
            { userAId: inviteeId, userBId: invitation.invitedById },
          ],
        },
        select: { id: true },
      });
      if (!friendship) throwInviteeNotEligible();
    }

    const existingContributor = await tx.poolContributor.findUnique({
      where: {
        poolId_userId: { poolId: invitation.poolId, userId: inviteeId },
      },
      select: { id: true },
    });
    if (!existingContributor) {
      await tx.poolContributor.create({
        data: {
          poolId: invitation.poolId,
          userId: inviteeId,
          contributionCents,
        },
      });
    }
    await tx.poolInvitation.update({
      where: { id: invitationId },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });
    await clearNotification(tx, invitation.notification?.id);
    return {
      poolId: invitation.poolId,
      joined: existingContributor === null,
      idempotent: false,
    };
  });

  if (result.joined) {
    await recordContributorJoined(result.poolId, inviteeId, {
      via: 'direct_invitation',
      poolInvitationId: invitationId,
    });
  }
  if (!result.idempotent) {
    queueLogEvent({
      name: 'pool_invitation_accepted',
      userId: inviteeId,
      source: 'server',
      properties: { poolId: result.poolId, invitationId },
    });
  }
  return { poolId: result.poolId };
}

export async function declinePoolInvitation(
  invitationId: string,
  inviteeId: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    const invitation = await getOwnedInvitation(tx, invitationId, inviteeId);
    requirePendingAndActive(invitation);
    await tx.poolInvitation.update({
      where: { id: invitationId },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    await clearNotification(tx, invitation.notification?.id);
    return { poolId: invitation.poolId };
  });
  queueLogEvent({
    name: 'pool_invitation_declined',
    userId: inviteeId,
    source: 'server',
    properties: { poolId: result.poolId, invitationId },
  });
  return result;
}

async function getOwnedInvitation(
  tx: TransactionClient,
  invitationId: string,
  inviteeId: string,
) {
  const invitation = await tx.poolInvitation.findFirst({
    where: { id: invitationId, inviteeId },
    include: { pool: true, notification: true },
  });
  if (!invitation) {
    throw new PoolInvitationError(
      'INVITATION_NOT_FOUND',
      'Invitation not found.',
      404,
    );
  }
  return invitation;
}

function requirePendingAndActive(
  invitation: Awaited<ReturnType<typeof getOwnedInvitation>>,
) {
  if (invitation.status !== 'PENDING') {
    throw new PoolInvitationError(
      'INVITATION_NOT_PENDING',
      'This invitation is no longer pending.',
      409,
    );
  }
  if (!isActivePoolStatus(invitation.pool.status)) {
    throw new PoolInvitationError(
      'POOL_CLOSED',
      'This pool is no longer accepting invitations.',
      410,
    );
  }
  if (invitation.pool.recipientUserId === invitation.inviteeId) {
    throwInviteeNotEligible();
  }
}

function throwInviteeNotEligible(): never {
  throw new PoolInvitationError(
    'INVITEE_NOT_ELIGIBLE',
    'This invitation is no longer available.',
    410,
  );
}

async function clearNotification(
  tx: TransactionClient,
  notificationId: string | undefined,
) {
  if (!notificationId) return;
  await tx.notification.update({
    where: { id: notificationId },
    data: {
      status: 'READ',
      readAt: new Date(),
      actions: JSON.stringify([]),
    },
  });
}

async function deleteNotification(
  tx: TransactionClient,
  notificationId: string | undefined,
) {
  if (!notificationId) return;
  await tx.notification.delete({ where: { id: notificationId } });
}
