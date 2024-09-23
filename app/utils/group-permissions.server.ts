// utils/group-permissions.server.ts

import { json } from '@remix-run/node'
import { requireUserId } from './auth.server'
import { prisma } from './db.server'

export type GroupRole = 'owner' | 'admin' | 'member'

export type GroupPermission = 'deleteGroup' | 'addMember' | 'removeMember'

export const groupRolePermissions: Record<
	GroupRole,
	ReadonlyArray<GroupPermission>
> = {
	owner: ['deleteGroup', 'addMember', 'removeMember'],
	admin: ['addMember', 'removeMember'],
	member: [],
}

export async function requireUserInGroup(request: Request, groupId: string) {
	const userId = await requireUserId(request)

	const userInGroup = await prisma.usersInGiftGroups.findUnique({
		where: {
			userId_giftGroupId: { userId, giftGroupId: groupId },
		},
		select: { giftGroupId: true, userId: true },
	})

	if (!userInGroup) {
		throw json(
			{
				error: 'Unauthorized',
				message: `User is not a member of group ${groupId}`,
			},
			{ status: 403 },
		)
	}

	return userId
}

export async function requireUserWithGroupRole(
	request: Request,
	groupId: string,
	requiredRoles: GroupRole[],
) {
	const userId = await requireUserId(request)

	const userInGroup = await prisma.usersInGiftGroups.findUnique({
		where: {
			userId_giftGroupId: { userId, giftGroupId: groupId },
		},
		select: { role: true },
	})

	if (!userInGroup || !requiredRoles.includes(userInGroup.role as GroupRole)) {
		throw json(
			{
				error: 'Unauthorized',
				requiredRole: requiredRoles.join(' or '),
				message: `Unauthorized: required role(s): ${requiredRoles.join(' or ')} in group ${groupId}`,
			},
			{ status: 403 },
		)
	}

	return userId
}

export async function requireUserWithGroupPermission(
	request: Request,
	groupId: string,
	permission: GroupPermission,
) {
	const userId = await requireUserId(request)

	const userInGroup = await prisma.usersInGiftGroups.findUnique({
		where: {
			userId_giftGroupId: { userId, giftGroupId: groupId },
		},
		select: { role: true },
	})

	const userRole = userInGroup?.role as GroupRole | undefined

	if (!userRole || !groupRolePermissions[userRole].includes(permission)) {
		throw json(
			{
				error: 'Unauthorized',
				requiredPermission: permission,
				message: `Unauthorized: required permission '${permission}' in group ${groupId}`,
			},
			{ status: 403 },
		)
	}

	return userId
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
	})

	const userRole = userInGroup?.role as GroupRole | undefined

	return userRole ? groupRolePermissions[userRole].includes(permission) : false
}
