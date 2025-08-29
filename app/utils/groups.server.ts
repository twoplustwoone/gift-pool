import { redirect } from '@remix-run/node';
import { requireUserId } from './auth.server';
import { prisma } from './db.server';
import { requireUserWithGroupPermission } from './group-permissions.server';

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
  { giftGroupId }: { giftGroupId: string },
) => {
  await requireUserWithGroupPermission(request, giftGroupId, 'deleteGroup');

  await prisma.giftGroup.delete({ where: { id: giftGroupId } });
};

export async function leaveGroup(request: Request, giftGroupId: string) {
  const userId = await requireUserWithGroupPermission(
    request,
    giftGroupId,
    'leaveGroup',
  );
  await removeUserFromGroup({
    targetUserId: userId,
    groupId: giftGroupId,
    actorId: userId,
  });
}

export async function removeUserFromGroup({
  targetUserId,
  groupId,
  actorId,
  reason,
}: {
  targetUserId: string;
  groupId: string;
  actorId: string;
  reason?: string;
}) {
  await prisma.usersInGiftGroups.update({
    where: {
      userId_giftGroupId: {
        userId: targetUserId,
        giftGroupId: groupId,
      },
    },
    data: {
      removedAt: new Date(),
      removedById: actorId,
      removedReason: reason,
    },
  });
}

export async function requireUsersShareAGroup({
  userId,
  username,
}: {
  userId: string;
  username?: string;
}) {
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
            user: {
              username,
            },
          },
        },
      },
    },
  });

  if (!giftGroup) {
    throw redirect('/groups');
  }
}
