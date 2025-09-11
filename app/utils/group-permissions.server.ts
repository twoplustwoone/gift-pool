// utils/group-permissions.server.ts

import { json } from '@remix-run/node';
import { GroupRoleSchema, type GroupRole } from '#app/utils/group-role.ts';
import { requireUserId } from './auth.server';
import { prisma } from './db.server';

export type GroupPermission =
  | 'deleteGroup'
  | 'transferOwnership'
  | 'promoteAdmin'
  | 'demoteAdmin'
  | 'removeAdmin'
  | 'removeMember'
  | 'banMember'
  | 'unbanMember'
  | 'manageInvites'
  | 'manageReminders'
  | 'manageSettings'
  | 'lockGiftPlan'
  | 'unlockGiftPlan'
  | 'leaveGroup'
  | 'editOwnBudget'
  | 'setOwnPreferences';

export const groupRolePermissions: Record<
  GroupRole,
  ReadonlyArray<GroupPermission>
> = {
  OWNER: [
    'deleteGroup',
    'transferOwnership',
    'promoteAdmin',
    'demoteAdmin',
    'removeAdmin',
    'removeMember',
    'banMember',
    'unbanMember',
    'manageInvites',
    'manageReminders',
    'manageSettings',
    'lockGiftPlan',
    'unlockGiftPlan',
    'leaveGroup',
    'editOwnBudget',
    'setOwnPreferences',
  ],
  ADMIN: [
    'removeMember',
    'banMember',
    'unbanMember',
    'manageInvites',
    'manageReminders',
    'manageSettings',
    'lockGiftPlan',
    'unlockGiftPlan',
    'leaveGroup',
    'editOwnBudget',
    'setOwnPreferences',
  ],
  MEMBER: ['leaveGroup', 'editOwnBudget', 'setOwnPreferences'],
};

export async function requireUserWithGroupRole(
  request: Request,
  groupId: string,
  requiredRoles: GroupRole[],
) {
  const userId = await requireUserId(request);

  const userInGroup = await prisma.usersInGiftGroups.findUnique({
    where: {
      userId_giftGroupId: { userId, giftGroupId: groupId },
    },
    select: { role: true },
  });

  const rawRole = userInGroup?.role;
  const userRole = rawRole
    ? GroupRoleSchema.catch('MEMBER').parse(rawRole)
    : undefined;

  if (!userRole || !requiredRoles.includes(userRole)) {
    throw json(
      {
        error: 'Unauthorized',
        requiredRole: requiredRoles.join(' or '),
        message: `Unauthorized: required role(s): ${requiredRoles.join(' or ')} in group ${groupId}`,
      },
      { status: 403 },
    );
  }

  return userId;
}

export async function requireUserWithGroupPermission(
  request: Request,
  groupId: string,
  permission: GroupPermission,
) {
  const userId = await requireUserId(request);

  const userInGroup = await prisma.usersInGiftGroups.findUnique({
    where: {
      userId_giftGroupId: { userId, giftGroupId: groupId },
    },
    select: { role: true },
  });

  const rawRole = userInGroup?.role;
  const userRole = rawRole
    ? GroupRoleSchema.catch('MEMBER').parse(rawRole)
    : undefined;

  if (
    !userRole ||
    !(groupRolePermissions[userRole]?.includes(permission) ?? false)
  ) {
    throw json(
      {
        error: 'Unauthorized',
        requiredPermission: permission,
        message: `Unauthorized: required permission '${permission}' in group ${groupId}`,
      },
      { status: 403 },
    );
  }

  return userId;
}

export async function userHasGroupPermission(
  userId: string,
  groupId: string,
  permission: GroupPermission,
) {
  const userInGroup = await prisma.usersInGiftGroups.findUnique({
    where: {
      userId_giftGroupId: { userId, giftGroupId: groupId },
    },
    select: { role: true },
  });

  const rawRole = userInGroup?.role;
  const userRole = rawRole
    ? GroupRoleSchema.catch('MEMBER').parse(rawRole)
    : undefined;

  return userRole
    ? groupRolePermissions[userRole]?.includes(permission) ?? false
    : false;
}
