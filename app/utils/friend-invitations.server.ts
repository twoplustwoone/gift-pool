import { nanoid } from 'nanoid'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getRelationshipState } from '#app/utils/friends.server.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'

export const getFriendInviteLink = (code: string, request?: Request) => {
  try {
    const origin = request ? getDomainUrl(request) : process.env.BASE_URL
    if (!origin) return `/friends/accept/${code}`
    return `${origin}/friends/accept/${code}`
  } catch {
    return `/friends/accept/${code}`
  }
}

export async function getActiveFriendInvite(request: Request) {
  const userId = await requireUserId(request)
  const invitation = await prisma.friendInvitation.findFirst({
    where: {
      createdById: userId,
      revokedAt: null,
      usedAt: null,
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })
  return invitation
}

export async function getActiveFriendInviteUrl(request: Request) {
  const userId = await requireUserId(request)
  const invite = await prisma.friendInvitation.findFirst({
    where: {
      createdById: userId,
      revokedAt: null,
      usedAt: null,
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })
  return invite ? getFriendInviteLink(invite.code, request) : null
}

export async function createFriendInvite(request: Request, days = 1) {
  const userId = await requireUserId(request)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + Number(days || 7))

  const invitation = await prisma.friendInvitation.create({
    data: {
      code: nanoid(),
      createdById: userId,
      expiresAt,
    },
  })

  return getFriendInviteLink(invitation.code, request)
}

export async function requireFriendInvitationNotExpired(code: string) {
  const invitation = await prisma.friendInvitation.findFirst({
    where: {
      code,
      revokedAt: null,
      expiresAt: { gte: new Date() },
      usedAt: null,
    },
    include: { createdBy: { select: { id: true, username: true, name: true, image: { select: { id: true, altText: true } } } } },
  })

  if (!invitation) {
    throw new Response('Invalid or expired friend invite.', { status: 400 })
  }
  return invitation
}

export async function rotateFriendInvite(request: Request) {
  const userId = await requireUserId(request)
  // Revoke existing active invites
  await prisma.friendInvitation.updateMany({
    where: {
      createdById: userId,
      revokedAt: null,
      usedAt: null,
      expiresAt: { gte: new Date() },
    },
    data: { revokedAt: new Date() },
  })
  // Create fresh
  return createFriendInvite(request)
}

export async function disableFriendInvite(request: Request) {
  const userId = await requireUserId(request)
  await prisma.friendInvitation.updateMany({
    where: {
      createdById: userId,
      revokedAt: null,
      usedAt: null,
      expiresAt: { gte: new Date() },
    },
    data: { revokedAt: new Date() },
  })
  return null
}

export async function acceptFriendInvite(code: string, actingUserId: string) {
  const invitation = await requireFriendInvitationNotExpired(code)
  if (invitation.createdById === actingUserId) {
    throw new Response('You cannot accept your own invite.', { status: 400 })
  }

  // Ensure not already friends
  const state = await getRelationshipState(actingUserId, invitation.createdById)
  if (state === 'FRIENDS') {
    throw new Response('You are already friends.', { status: 400 })
  }

  // Create friendship and mark invite as used atomically
  await prisma.$transaction(async (tx) => {
    // mark used
    await tx.friendInvitation.update({
      where: { id: invitation.id },
      data: { usedById: actingUserId, usedAt: new Date() },
    })

    const userAId = invitation.createdById < actingUserId ? invitation.createdById : actingUserId
    const userBId = invitation.createdById < actingUserId ? actingUserId : invitation.createdById

    await tx.friendship.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      create: { userAId, userBId },
      update: {},
    })
  })

  return invitation
}
