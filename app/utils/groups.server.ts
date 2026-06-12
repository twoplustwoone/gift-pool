import { data, redirect } from 'react-router';
import { queueLogEvent } from './analytics.server';
import { requireUserId } from './auth.server';
import { prisma } from './db.server';
import { logGroupActivity } from './group-activity.server';
import {
  requireUserWithGroupPermission,
  requireUserWithGroupRole,
} from './group-permissions.server';
export const isUserInGroup = async (userId: string, groupId: string) => {
  const existingMember = await prisma.usersInGiftGroups.findUnique({
    where: {
      userId_giftGroupId: {
        userId,
        giftGroupId: groupId,
      },
    },
  });
  return !!existingMember;
};
export async function requireUserIdInGroup(request: Request, groupId: string) {
  const userId = await requireUserId(request);
  const userInGroup = await isUserInGroup(userId, groupId);
  if (!userInGroup) {
    throw redirect('/groups');
  }
  return userId;
}
export async function requireUserIdNotInGroup(
  request: Request,
  groupId: string,
) {
  const userId = await requireUserId(request);
  const userInGroup = await isUserInGroup(userId, groupId);
  if (userInGroup) {
    throw redirect(`/groups/${groupId}`);
  }
  return userId;
}
export const deleteGiftGroup = async (
  request: Request,
  {
    giftGroupId,
  }: {
    giftGroupId: string;
  },
) => {
  await requireUserWithGroupPermission(request, giftGroupId, 'deleteGroup');
  const userId = await requireUserId(request);
  await prisma.giftGroup.delete({
    where: {
      id: giftGroupId,
    },
  });
  await logGroupActivity(giftGroupId, userId, 'group.delete', {});
};
export async function leaveGroup(request: Request, giftGroupId: string) {
  const userId = await requireUserWithGroupPermission(
    request,
    giftGroupId,
    'leaveGroup',
  );
  const me = await prisma.usersInGiftGroups.findUnique({
    where: {
      userId_giftGroupId: {
        userId,
        giftGroupId,
      },
    },
    select: {
      role: true,
    },
  });
  if (me?.role === 'OWNER') {
    const others = await prisma.usersInGiftGroups.count({
      where: {
        giftGroupId,
        userId: {
          not: userId,
        },
        role: {
          in: ['OWNER', 'ADMIN'],
        },
      },
    });
    if (others === 0) {
      throw data(
        {
          error: 'Cannot leave as sole owner/admin',
        },
        {
          status: 400,
        },
      );
    }
  }
  await removeUserFromGroup(userId, giftGroupId);
}
export async function removeUserFromGroup(userId: string, groupId: string) {
  await prisma.usersInGiftGroups.delete({
    where: {
      userId_giftGroupId: {
        userId,
        giftGroupId: groupId,
      },
    },
  });
}
export async function requireUsersShareAGroupOrAreFriends({
  userId,
  username,
}: {
  userId: string;
  username?: string;
}) {
  if (!username) return;
  const other = await prisma.user.findUnique({
    where: {
      username,
    },
    select: {
      id: true,
    },
  });
  if (!other) return;
  const canView = await usersShareAGroupOrAreFriendsByIds({
    userId,
    otherUserId: other.id,
  });
  if (!canView) {
    throw redirect('/groups');
  }
}
export async function usersShareAGroupOrAreFriendsByIds({
  userId,
  otherUserId,
}: {
  userId: string;
  otherUserId: string;
}) {
  if (userId === otherUserId) return true;
  const [a, b] =
    userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];
  const friendship = await prisma.friendship.findUnique({
    where: {
      userAId_userBId: {
        userAId: a,
        userBId: b,
      },
    },
    select: {
      id: true,
    },
  });
  if (friendship) return true;
  const giftGroup = await prisma.giftGroup.findFirst({
    where: {
      groupMembers: {
        some: {
          userId,
        },
      },
      AND: {
        groupMembers: {
          some: {
            userId: otherUserId,
          },
        },
      },
    },
    select: {
      id: true,
    },
  });
  return !!giftGroup;
}
export async function removeMember(
  request: Request,
  giftGroupId: string,
  memberUserId: string,
  reason?: string,
) {
  const actorId = await requireUserWithGroupPermission(
    request,
    giftGroupId,
    'removeMember',
  );
  const [actor, target] = await Promise.all([
    prisma.usersInGiftGroups.findUnique({
      where: {
        userId_giftGroupId: {
          userId: actorId,
          giftGroupId,
        },
      },
      select: {
        role: true,
      },
    }),
    prisma.usersInGiftGroups.findUnique({
      where: {
        userId_giftGroupId: {
          userId: memberUserId,
          giftGroupId,
        },
      },
      select: {
        role: true,
      },
    }),
  ]);
  if (!target)
    throw data(
      {
        error: 'Member not found',
      },
      {
        status: 404,
      },
    );
  if (target.role === 'OWNER') {
    throw data(
      {
        error: 'Cannot remove owner',
      },
      {
        status: 400,
      },
    );
  }
  if (actor?.role === 'ADMIN' && target.role !== 'MEMBER') {
    throw data(
      {
        error: 'Admins can only remove members',
      },
      {
        status: 403,
      },
    );
  }
  await prisma.usersInGiftGroups.updateMany({
    where: {
      userId: memberUserId,
      giftGroupId,
    },
    data: {
      removedAt: new Date(),
      removedById: actorId,
      removedReason: reason,
    },
  });
  await prisma.usersInGiftGroups.delete({
    where: {
      userId_giftGroupId: {
        userId: memberUserId,
        giftGroupId,
      },
    },
  });
  await logGroupActivity(giftGroupId, actorId, 'member.remove', {
    memberUserId,
    reason,
  });
}
export async function banMember(
  request: Request,
  giftGroupId: string,
  memberUserId: string,
  until: Date | null,
) {
  const actorId = await requireUserWithGroupPermission(
    request,
    giftGroupId,
    'banMember',
  );
  await prisma.usersInGiftGroups.update({
    where: {
      userId_giftGroupId: {
        userId: memberUserId,
        giftGroupId,
      },
    },
    data: {
      bannedUntil: until,
    },
  });
  await logGroupActivity(giftGroupId, actorId, 'member.ban', {
    memberUserId,
    until,
  });
}
export async function transferOwnership(
  request: Request,
  giftGroupId: string,
  newOwnerUserId: string,
) {
  const actorId = await requireUserWithGroupRole(request, giftGroupId, [
    'OWNER',
  ]);
  // Ensure new owner is currently ADMIN or MEMBER elevated to ADMIN then OWNER
  const target = await prisma.usersInGiftGroups.findUnique({
    where: {
      userId_giftGroupId: {
        userId: newOwnerUserId,
        giftGroupId,
      },
    },
    select: {
      role: true,
    },
  });
  if (!target)
    throw data(
      {
        error: 'User not in group',
      },
      {
        status: 400,
      },
    );

  // Demote current owner to ADMIN and promote target to OWNER
  await prisma.$transaction([
    prisma.usersInGiftGroups.update({
      where: {
        userId_giftGroupId: {
          userId: actorId,
          giftGroupId,
        },
      },
      data: {
        role: 'ADMIN',
      },
    }),
    prisma.usersInGiftGroups.update({
      where: {
        userId_giftGroupId: {
          userId: newOwnerUserId,
          giftGroupId,
        },
      },
      data: {
        role: 'OWNER',
      },
    }),
  ]);
  await logGroupActivity(giftGroupId, actorId, 'ownership.transfer', {
    newOwnerUserId,
  });
}
export async function updateGroupSettings(
  request: Request,
  giftGroupId: string,
  data: {
    name?: string;
    description?: string;
    budgetVisibility?: any;
  },
) {
  const actorId = await requireUserWithGroupPermission(
    request,
    giftGroupId,
    'manageSettings',
  );
  await prisma.giftGroup.update({
    where: {
      id: giftGroupId,
    },
    data,
  });
  await logGroupActivity(giftGroupId, actorId, 'settings.update', data);
}
export async function addReminder(
  request: Request,
  giftGroupId: string,
  offsetDays: number,
) {
  const actorId = await requireUserWithGroupPermission(
    request,
    giftGroupId,
    'manageReminders',
  );
  await prisma.groupReminder.create({
    data: {
      giftGroupId,
      offsetDays,
      createdById: actorId,
    },
  });
  await logGroupActivity(giftGroupId, actorId, 'reminder.add', {
    offsetDays,
  });
}
export async function removeReminder(
  request: Request,
  giftGroupId: string,
  reminderId: string,
) {
  const actorId = await requireUserWithGroupPermission(
    request,
    giftGroupId,
    'manageReminders',
  );
  await prisma.groupReminder.delete({
    where: {
      id: reminderId,
    },
  });
  await logGroupActivity(giftGroupId, actorId, 'reminder.remove', {
    reminderId,
  });
}
// createGiftPlan / lockGiftPlan / unlockGiftPlan removed — superseded by Pool model.
export async function promoteToAdmin(
  request: Request,
  giftGroupId: string,
  memberUserId: string,
) {
  const actorId = await requireUserWithGroupRole(request, giftGroupId, [
    'OWNER',
  ]);
  const target = await prisma.usersInGiftGroups.findUnique({
    where: {
      userId_giftGroupId: {
        userId: memberUserId,
        giftGroupId,
      },
    },
    select: {
      role: true,
    },
  });
  if (!target)
    throw data(
      {
        error: 'Member not found',
      },
      {
        status: 404,
      },
    );
  if (target.role === 'OWNER' || target.role === 'ADMIN') return;
  await prisma.usersInGiftGroups.update({
    where: {
      userId_giftGroupId: {
        userId: memberUserId,
        giftGroupId,
      },
    },
    data: {
      role: 'ADMIN',
    },
  });
  await logGroupActivity(giftGroupId, actorId, 'member.promote', {
    memberUserId,
  });
}
export async function demoteAdminToMember(
  request: Request,
  giftGroupId: string,
  memberUserId: string,
) {
  const actorId = await requireUserWithGroupRole(request, giftGroupId, [
    'OWNER',
  ]);
  if (actorId === memberUserId) {
    // owner cannot demote self below admin
    throw data(
      {
        error: 'Cannot demote yourself',
      },
      {
        status: 400,
      },
    );
  }
  const target = await prisma.usersInGiftGroups.findUnique({
    where: {
      userId_giftGroupId: {
        userId: memberUserId,
        giftGroupId,
      },
    },
    select: {
      role: true,
    },
  });
  if (!target)
    throw data(
      {
        error: 'Member not found',
      },
      {
        status: 404,
      },
    );
  if (target.role !== 'ADMIN') return;
  await prisma.usersInGiftGroups.update({
    where: {
      userId_giftGroupId: {
        userId: memberUserId,
        giftGroupId,
      },
    },
    data: {
      role: 'MEMBER',
    },
  });
  await logGroupActivity(giftGroupId, actorId, 'member.demote', {
    memberUserId,
  });
}
export async function updateOwnPreferences(
  request: Request,
  giftGroupId: string,
  prefs: {
    contributionCents?: number;
    budgetVisibilityOverride?:
      | 'EVERYONE'
      | 'ADMINS'
      | 'ONLY_SELF'
      | 'INHERIT'
      | ''
      | null;
    shareWishlist?: boolean;
    shareBirthday?: boolean;
  },
) {
  const userId = await requireUserWithGroupPermission(
    request,
    giftGroupId,
    'editOwnBudget',
  );
  await prisma.usersInGiftGroups.update({
    where: {
      userId_giftGroupId: {
        userId,
        giftGroupId,
      },
    },
    data: {
      contributionCents: prefs.contributionCents ?? undefined,
      budgetVisibilityOverride:
        prefs.budgetVisibilityOverride === '' ||
        prefs.budgetVisibilityOverride === 'INHERIT'
          ? null
          : (prefs.budgetVisibilityOverride ?? undefined),
      shareWishlist: prefs.shareWishlist ?? undefined,
      shareBirthday: prefs.shareBirthday ?? undefined,
    },
  });
  await logGroupActivity(giftGroupId, userId, 'member.update-self', prefs);
}
export async function approveJoinRequest(
  request: Request,
  giftGroupId: string,
  joinRequestId: string,
) {
  const actorId = await requireUserWithGroupPermission(
    request,
    giftGroupId,
    'manageInvites',
  );
  const jr = await prisma.joinRequest.findUnique({
    where: {
      id: joinRequestId,
    },
    include: {
      invitation: true,
    },
  });
  if (!jr || jr.giftGroupId !== giftGroupId) {
    throw data(
      {
        error: 'Join request not found',
      },
      {
        status: 404,
      },
    );
  }
  const role: 'OWNER' | 'ADMIN' | 'MEMBER' =
    (jr.invitation?.roleGranted as 'OWNER' | 'ADMIN' | 'MEMBER' | undefined) ??
    'MEMBER';
  await prisma.$transaction([
    prisma.joinRequest.update({
      where: {
        id: joinRequestId,
      },
      data: {
        status: 'APPROVED',
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
    }),
    prisma.usersInGiftGroups.create({
      data: {
        userId: jr.userId,
        giftGroupId,
        role,
      },
    }),
    ...(jr.invitation
      ? [
          prisma.groupInvitation.update({
            where: {
              id: jr.invitationId!,
            },
            data: {
              usedCount: {
                increment: 1,
              },
            },
          }),
        ]
      : []),
  ]);
  await logGroupActivity(giftGroupId, actorId, 'join.approve', {
    joinRequestId,
    userId: jr.userId,
  });
  // Fired after the transaction closes.
  queueLogEvent({
    name: 'group_joined',
    userId: jr.userId,
    source: 'server',
    properties: { giftGroupId, via: 'approval' },
  });
}
export async function rejectJoinRequest(
  request: Request,
  giftGroupId: string,
  joinRequestId: string,
  reason?: string,
) {
  const actorId = await requireUserWithGroupPermission(
    request,
    giftGroupId,
    'manageInvites',
  );
  const jr = await prisma.joinRequest.findUnique({
    where: {
      id: joinRequestId,
    },
  });
  if (!jr || jr.giftGroupId !== giftGroupId) {
    throw data(
      {
        error: 'Join request not found',
      },
      {
        status: 404,
      },
    );
  }
  await prisma.joinRequest.update({
    where: {
      id: joinRequestId,
    },
    data: {
      status: 'REJECTED',
      reason: reason ?? null,
      reviewedById: actorId,
      reviewedAt: new Date(),
    },
  });
  await logGroupActivity(giftGroupId, actorId, 'join.reject', {
    joinRequestId,
    userId: jr.userId,
    reason,
  });
}
