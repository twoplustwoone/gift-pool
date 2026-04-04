import { invariantResponse } from '@epic-web/invariant';
// Using string literals for roles/status to support SQLite
import { nanoid } from 'nanoid';
import { prisma } from './db.server';
import { logGroupActivity } from './group-activity.server';
import { requireUserWithGroupPermission } from './group-permissions.server';
import { getDomainUrl } from './misc.tsx';
import { createToastHeaders } from './toast.server';

/**
 * Returns an absolute invite URL for the given code.
 * Prefers the current request origin; falls back to BASE_URL if provided.
 */
export const getInviteLink = (code: string, request?: Request) => {
  try {
    const origin = request ? getDomainUrl(request) : process.env.BASE_URL;
    if (!origin) {
      // Last-resort relative URL (never includes undefined in string)
      return `/groups/join/${code}`;
    }
    return `${origin}/groups/join/${code}`;
  } catch {
    return `/groups/join/${code}`;
  }
};
export const createInviteLink = async (
  request: Request,
  {
    giftGroupId,
    expiresInDays,
    label,
    roleGranted,
    maxUses,
    requireApproval,
  }: {
    giftGroupId: string;
    expiresInDays: string;
    label?: string;
    roleGranted?: string;
    maxUses?: string;
    requireApproval?: string;
  },
) => {
  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() + Number.parseInt(expiresInDays, 10),
  );
  const userId = await requireUserWithGroupPermission(
    request,
    giftGroupId,
    'manageInvites',
  );
  await prisma.groupInvitation.create({
    data: {
      giftGroupId,
      code: nanoid(),
      expiresAt,
      createdById: userId,
      label: label ?? '',
      roleGranted:
        (roleGranted as 'OWNER' | 'ADMIN' | 'MEMBER' | undefined) ?? 'MEMBER',
      maxUses: maxUses ? Number.parseInt(maxUses, 10) : null,
      requireApproval: requireApproval === 'on' ? true : false,
    },
  });
  await logGroupActivity(giftGroupId, userId, 'invite.create', {
    label,
    roleGranted,
    maxUses,
    requireApproval,
    expiresInDays,
  });
};
export const requireInvitationNotExpired = async (code: string) => {
  let invitation = await prisma.groupInvitation.findFirst({
    where: {
      code,
      expiresAt: {
        gte: new Date(),
      },
      revokedAt: null,
    },
    include: {
      giftGroup: true,
    },
  });
  if (
    invitation?.maxUses != null &&
    invitation.usedCount >= invitation.maxUses
  ) {
    invitation = null as any;
  }
  invariantResponse(invitation, 'Invalid or expired invite link.', {
    status: 400,
  });
  return invitation;
};
export const addUserToGroup = async (
  userId: string,
  groupId: string,
  role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER',
) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });
  invariantResponse(user, 'User not found.', {
    status: 400,
    headers: await createToastHeaders({
      description: 'User not found.',
      type: 'error',
    }),
  });
  const group = await prisma.giftGroup.findUnique({
    where: {
      id: groupId,
    },
  });
  invariantResponse(group, 'Group not found.', {
    status: 400,
    headers: await createToastHeaders({
      description: 'Group not found.',
      type: 'error',
    }),
  });
  const existingMember = await prisma.usersInGiftGroups.findUnique({
    where: {
      userId_giftGroupId: {
        userId,
        giftGroupId: groupId,
      },
    },
  });
  invariantResponse(!existingMember, 'User is already in group.', {
    status: 400,
    headers: await createToastHeaders({
      description: 'User is already in group.',
      type: 'error',
    }),
  });
  const userInGiftGroup = await prisma.usersInGiftGroups.create({
    data: {
      userId,
      giftGroupId: groupId,
      role,
    },
  });
  return {
    userInGiftGroup,
  };
};
export const destroyInviteLink = async (
  request: Request,
  giftGroupId: string,
  {
    groupInvitationId,
  }: {
    groupInvitationId: string;
  },
) => {
  await requireUserWithGroupPermission(request, giftGroupId, 'manageInvites');
  await prisma.groupInvitation.update({
    where: {
      id: groupInvitationId,
    },
    data: {
      revokedAt: new Date(),
    },
  });
  const inv = await prisma.groupInvitation.findUnique({
    where: {
      id: groupInvitationId,
    },
  });
  if (inv)
    await logGroupActivity(
      giftGroupId,
      await requireUserWithGroupPermission(
        request,
        giftGroupId,
        'manageInvites',
      ),
      'invite.revoke',
      {
        groupInvitationId,
      },
    );
};
export async function submitJoinRequest({
  invitationId,
  userId,
  groupId,
}: {
  invitationId: string;
  userId: string;
  groupId: string;
}) {
  return prisma.joinRequest.create({
    data: {
      invitationId,
      userId,
      giftGroupId: groupId,
      status: 'PENDING',
    },
  });
}
