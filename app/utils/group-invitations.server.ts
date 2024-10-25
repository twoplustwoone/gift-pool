import { invariantResponse } from '@epic-web/invariant'
import { json } from '@remix-run/node'
import { nanoid } from 'nanoid'
import { prisma } from './db.server'
import { requireUserWithGroupPermission } from './group-permissions.server'
import { createToastHeaders } from './toast.server'

export const getInviteLink = (code: string) => {
	return `${process.env.BASE_URL}/groups/join/${code}`
}

export const createInviteLink = async (
	request: Request,
	{
		giftGroupId,
		expiresInDays,
	}: { giftGroupId: string; expiresInDays: string },
) => {
	const expiresAt = new Date()
	expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays, 10))

	const userId = await requireUserWithGroupPermission(
		request,
		giftGroupId,
		'addMember',
	)

	await prisma.groupInvitation.create({
		data: {
			giftGroupId,
			code: nanoid(),
			expiresAt,
			createdById: userId,
		},
	})
}

export const requireInvitationNotExpired = async (code: string) => {
	const invitation = await prisma.groupInvitation.findFirst({
		where: { code, expiresAt: { gte: new Date() } },
		include: { giftGroup: true },
	})

	invariantResponse(invitation, 'Invalid or expired invite link.', {
		status: 400,
	})

	return invitation
}

export const addUserToGroup = async (userId: string, groupId: string) => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
	})

	invariantResponse(user, 'User not found.', {
		status: 400,
		headers: await createToastHeaders({
			description: 'User not found.',
			type: 'error',
		}),
	})

	const group = await prisma.giftGroup.findUnique({
		where: { id: groupId },
	})

	invariantResponse(group, 'Group not found.', {
		status: 400,
		headers: await createToastHeaders({
			description: 'Group not found.',
			type: 'error',
		}),
	})

	const existingMember = await prisma.usersInGiftGroups.findUnique({
		where: {
			userId_giftGroupId: {
				userId,
				giftGroupId: groupId,
			},
		},
	})

	invariantResponse(!existingMember, 'User is already in group.', {
		status: 400,
		headers: await createToastHeaders({
			description: 'User is already in group.',
			type: 'error',
		}),
	})

	const userInGiftGroup = await prisma.usersInGiftGroups.create({
		data: {
			userId,
			giftGroupId: groupId,
			role: 'member',
		},
	})
	return json({ userInGiftGroup })
}

export const destroyInviteLink = async (
	request: Request,
	giftGroupId: string,
	{ groupInvitationId }: { groupInvitationId: string },
) => {
	await requireUserWithGroupPermission(request, giftGroupId, 'addMember')
	await prisma.groupInvitation.delete({ where: { id: groupInvitationId } })
}
