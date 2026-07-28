import { captureMessage } from '@sentry/react-router'
import { data } from 'react-router'
import { nanoid } from 'nanoid'
import { queueLogEvent } from '#app/utils/analytics.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { NOTIFICATION_TYPES } from '#app/utils/notification-catalog.ts'
import { logPoolActivity } from '#app/utils/pool-activity.server.ts'
import {
	POOL_ACTIVITY_TYPE,
	POOL_STATUS,
	DECISION_MODE,
} from '#app/utils/pool-constants.ts'
import { calculateContributions } from '#app/utils/pool-contributions.ts'
import { queuePoolActivityNotifications } from '#app/utils/pool-notifications.server.ts'
import { assertPoolStatus } from '#app/utils/pool-permissions.server.ts'
import { syncPoolClaimInTx } from '#app/utils/wishlist-claims.server.ts'
import type { DecisionMode, OccasionType } from '#app/utils/pool-constants.ts'

// ─── Selects ──────────────────────────────────────────────────────────────────

// Standard pool select used in most loaders. Keeps responses lean.
export const poolSelect = {
	id: true,
	createdAt: true,
	updatedAt: true,
	title: true,
	occasionType: true,
	eventDate: true,
	status: true,
	decisionMode: true,
	recipientUserId: true,
	recipientName: true,
	giftGroupId: true,
	organizerId: true,
	purchaserId: true,
	delivererId: true,
	chosenIdeaId: true,
	finalPriceCents: true,
	inviteCode: true,
	giftGroup: { select: { id: true, name: true } },
	organizer: { select: { id: true, username: true, name: true, image: { select: { id: true } } } },
	purchaser: { select: { id: true, username: true, name: true, image: { select: { id: true } } } },
	deliverer: { select: { id: true, username: true, name: true, image: { select: { id: true } } } },
	recipientUser: { select: { id: true, username: true, name: true, image: { select: { id: true } } } },
	contributors: {
		select: {
			userId: true,
			contributionCents: true,
			hasPaid: true,
			joinedAt: true,
			user: {
				select: {
					id: true,
					username: true,
					name: true,
					image: { select: { id: true, altText: true } },
				},
			},
		},
	},
	ideas: {
		orderBy: { createdAt: 'asc' as const },
		select: {
			id: true,
			name: true,
			description: true,
			url: true,
			estimatedPriceCents: true,
			wishlistItemId: true,
			proposedById: true,
			createdAt: true,
			proposedBy: { select: { id: true, username: true, name: true } },
			wishlistItem: {
				select: { id: true, title: true, url: true, hasImage: true, updatedAt: true },
			},
			_count: { select: { votes: true } },
		},
	},
	_count: { select: { contributors: true, ideas: true } },
} as const

// ─── Membership ───────────────────────────────────────────────────────────────

export async function isUserInPool(
	userId: string,
	poolId: string,
): Promise<boolean> {
	const record = await prisma.poolContributor.findUnique({
		where: { poolId_userId: { poolId, userId } },
		select: { id: true },
	})
	return record !== null
}

export async function requireUserInPool(
	userId: string,
	poolId: string,
): Promise<void> {
	const ok = await isUserInPool(userId, poolId)
	if (!ok) {
		throw data({ error: 'Pool not found.' }, { status: 404 })
	}
}

// ─── Create ───────────────────────────────────────────────────────────────────

export type CreatePoolInput = {
	title: string
	occasionType?: OccasionType
	eventDate?: Date | null
	decisionMode?: DecisionMode
	recipientUserId?: string | null
	recipientName?: string | null
	giftGroupId?: string | null
	organizerId: string
	// If the pool is in a group, pass in the group members to auto-add them
	// with their group-level contribution defaults.
	groupMemberDefaults?: Array<{ userId: string; contributionCents: number }>
}

export async function createPool(input: CreatePoolInput) {
	const {
		title,
		occasionType = 'BIRTHDAY',
		eventDate = null,
		decisionMode = DECISION_MODE.ORGANIZER_PICKS,
		recipientUserId = null,
		recipientName = null,
		giftGroupId = null,
		organizerId,
		groupMemberDefaults = [],
	} = input

	// Secrecy invariant: the recipient must never be a contributor on their own
	// pool. Enforce it here at write time so no caller can seed a leak.
	if (recipientUserId != null && recipientUserId === organizerId) {
		// String body (not an { error } object) so the thrown response renders
		// cleanly through the root GeneralErrorBoundary as a 400 rather than
		// crashing it into a 500.
		throw data('A pool recipient cannot also be its organizer.', {
			status: 400,
		})
	}

	// Filter the recipient out of the seeded contributors. A caller passing the
	// recipient in defaults is an upstream bug — report it, but still proceed
	// with the filtered list.
	const filteredDefaults =
		recipientUserId != null
			? groupMemberDefaults.filter(m => m.userId !== recipientUserId)
			: groupMemberDefaults

	if (filteredDefaults.length !== groupMemberDefaults.length) {
		captureMessage('createPool: recipient present in groupMemberDefaults', {
			level: 'warning',
			extra: { recipientUserId, organizerId, giftGroupId },
		})
	}

	const organizerContributionCents = filteredDefaults.find(
		member => member.userId === organizerId,
	)?.contributionCents

	// Build the contributor list. The organizer is always first.
	const contributorData = [
		{
			userId: organizerId,
			contributionCents:
				organizerContributionCents != null && organizerContributionCents > 0
					? organizerContributionCents
					: null,
		},
		...filteredDefaults
			.filter(m => m.userId !== organizerId)
			.map(m => ({
				userId: m.userId,
				contributionCents: m.contributionCents > 0 ? m.contributionCents : null,
			})),
	]

	const pool = await prisma.pool.create({
		data: {
			title,
			occasionType,
			eventDate,
			decisionMode,
			recipientUserId,
			recipientName,
			giftGroupId,
			organizerId,
			contributors: { create: contributorData },
		},
		select: { id: true, title: true, organizerId: true },
	})

	await logPoolActivity(pool.id, POOL_ACTIVITY_TYPE.POOL_CREATED, {
		actorId: organizerId,
		payload: { title },
	})

	queueLogEvent({
		name: 'pool_created',
		userId: organizerId,
		source: 'server',
		properties: {
			poolId: pool.id,
			occasionType,
			decisionMode,
			contributorCount: contributorData.length,
			hasGroup: giftGroupId != null,
		},
	})

	return pool
}

// ─── Update ───────────────────────────────────────────────────────────────────

export type UpdatePoolInput = {
	title?: string
	occasionType?: OccasionType
	eventDate?: Date | null
	decisionMode?: DecisionMode
	recipientName?: string | null
}

export async function updatePool(
	poolId: string,
	actorId: string,
	data: UpdatePoolInput,
) {
	const pool = await prisma.pool.update({
		where: { id: poolId },
		data,
		select: { id: true },
	})

	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.POOL_UPDATED, {
		actorId,
		payload: data as Record<string, unknown>,
	})

	return pool
}

// ─── Contributors ─────────────────────────────────────────────────────────────

export async function addContributor(
	poolId: string,
	userId: string,
	contributionCents?: number | null,
) {
	// The recipient must never become a contributor — that would surface the
	// surprise pool to them in their pool/home lists. This is the shared seam
	// every add path flows through (including the assign-purchaser/deliverer
	// intents that pass an arbitrary userId), so guarding here closes them all.
	const pool = await prisma.pool.findUnique({
		where: { id: poolId },
		select: { recipientUserId: true },
	})
	if (pool?.recipientUserId === userId) {
		throw data(
			{ error: 'The pool recipient cannot be added as a contributor.' },
			{ status: 400 },
		)
	}

	const contributor = await prisma.poolContributor.create({
		data: { poolId, userId, contributionCents: contributionCents ?? null },
	})

	await recordContributorJoined(poolId, userId)

	return contributor
}

export async function recordContributorJoined(
	poolId: string,
	userId: string,
	properties: Record<string, unknown> = {},
) {
	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.CONTRIBUTOR_JOINED, {
		actorId: userId,
		payload: { userId },
	})

	queueLogEvent({
		name: 'pool_contributor_joined',
		userId,
		source: 'server',
		properties: { poolId, ...properties },
	})
}

export async function removeContributor(
	poolId: string,
	userId: string,
	actorId: string,
) {
	await prisma.poolContributor.delete({
		where: { poolId_userId: { poolId, userId } },
	})

	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.CONTRIBUTOR_REMOVED, {
		actorId,
		payload: { userId },
	})
}

export async function updateContribution(
	poolId: string,
	userId: string,
	contributionCents: number | null,
) {
	// Contributions are locked once the gift is decided: the owed-money
	// breakdown is derived live from these values, so allowing edits after
	// DECIDED lets a contributor retroactively repudiate their share.
	const pool = await prisma.pool.findUnique({
		where: { id: poolId },
		select: { status: true },
	})
	if (!pool) {
		throw data({ error: 'Pool not found.' }, { status: 404 })
	}
	assertPoolStatus(pool, [POOL_STATUS.OPEN, POOL_STATUS.VOTING])

	const contributor = await prisma.poolContributor.update({
		where: { poolId_userId: { poolId, userId } },
		data: { contributionCents },
	})

	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.CONTRIBUTOR_UPDATED, {
		actorId: userId,
		payload: { contributionCents },
	})

	return contributor
}

export async function markContributorPaid(
	poolId: string,
	userId: string,
	hasPaid: boolean,
) {
	return prisma.poolContributor.update({
		where: { poolId_userId: { poolId, userId } },
		data: { hasPaid },
	})
}

// ─── Invite code ──────────────────────────────────────────────────────────────

export async function generatePoolInviteCode(poolId: string): Promise<string> {
	const code = nanoid(10)
	await prisma.pool.update({
		where: { id: poolId },
		data: { inviteCode: code },
	})
	return code
}

export async function joinPoolViaInvite(
	code: string,
	userId: string,
): Promise<{ poolId: string }> {
	const pool = await prisma.pool.findUnique({
		where: { inviteCode: code },
		select: { id: true, status: true, recipientUserId: true },
	})

	if (!pool) {
		throw data({ error: 'Invite link not found or expired.' }, { status: 404 })
	}

	if (pool.status === POOL_STATUS.CANCELLED || pool.status === POOL_STATUS.DELIVERED) {
		throw data({ error: 'This pool is no longer active.' }, { status: 410 })
	}

	// Never let the recipient join their own pool
	if (pool.recipientUserId === userId) {
		throw data({ error: 'You cannot join a pool that is for you.' }, { status: 403 })
	}

	const alreadyIn = await isUserInPool(userId, pool.id)
	if (alreadyIn) {
		return { poolId: pool.id }
	}

	await addContributor(pool.id, userId)
	return { poolId: pool.id }
}

// ─── Ideas ────────────────────────────────────────────────────────────────────

export type ProposeIdeaInput = {
	poolId: string
	proposedById: string
	name: string
	description?: string | null
	url?: string | null
	estimatedPriceCents?: number | null
	wishlistItemId?: string | null
	// Promotion link — set when this idea was promoted from a private
	// GiftListItem (person surface). Links, never copy-orphans.
	giftListItemId?: string | null
}

export async function proposeIdea(input: ProposeIdeaInput) {
	const idea = await prisma.giftIdea.create({
		data: {
			poolId: input.poolId,
			proposedById: input.proposedById,
			name: input.name,
			description: input.description ?? null,
			url: input.url ?? null,
			estimatedPriceCents: input.estimatedPriceCents ?? null,
			wishlistItemId: input.wishlistItemId ?? null,
			giftListItemId: input.giftListItemId ?? null,
		},
		select: { id: true, name: true },
	})

	await logPoolActivity(input.poolId, POOL_ACTIVITY_TYPE.IDEA_PROPOSED, {
		actorId: input.proposedById,
		payload: { ideaId: idea.id, name: idea.name },
	})

	return idea
}

export async function deleteIdea(
	poolId: string,
	ideaId: string,
	actorId: string,
) {
	const [idea, pool] = await Promise.all([
		prisma.giftIdea.findFirst({
			where: { id: ideaId, poolId },
			select: { poolId: true, name: true },
		}),
		prisma.pool.findUnique({
			where: { id: poolId },
			select: { status: true, chosenIdeaId: true },
		}),
	])
	if (!idea) {
		throw data({ error: 'Idea not found.' }, { status: 404 })
	}
	if (!pool) {
		throw data({ error: 'Pool not found.' }, { status: 404 })
	}

	// Only removable before a decision: deleting after DECIDED would either null
	// the chosen gift (onDelete: SetNull) or leave the pool inconsistent.
	assertPoolStatus(pool, [POOL_STATUS.OPEN, POOL_STATUS.VOTING])
	if (pool.chosenIdeaId === ideaId) {
		throw data({ error: 'The chosen idea cannot be deleted.' }, { status: 409 })
	}
	// During voting, deleting an idea would cascade-wipe its votes and silently
	// change the tally — refuse if any votes have been cast for it.
	if (pool.status === POOL_STATUS.VOTING) {
		const voteCount = await prisma.ideaVote.count({ where: { ideaId } })
		if (voteCount > 0) {
			throw data(
				{ error: 'An idea with votes cannot be deleted during voting.' },
				{ status: 409 },
			)
		}
	}

	await prisma.giftIdea.delete({ where: { id: ideaId } })

	await logPoolActivity(idea.poolId, POOL_ACTIVITY_TYPE.IDEA_DELETED, {
		actorId,
		payload: { ideaId, name: idea.name },
	})
}

// ─── Voting ───────────────────────────────────────────────────────────────────

// Transition pool to VOTING status. Only valid from OPEN.
export async function callVote(poolId: string, actorId: string) {
	const transition = await prisma.pool.updateMany({
		where: { id: poolId, status: POOL_STATUS.OPEN },
		data: { status: POOL_STATUS.VOTING },
	})

	if (transition.count !== 1) {
		throw data(
			{ error: 'A vote can only be called when the pool is open.' },
			{ status: 400 },
		)
	}

	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.VOTE_CALLED, { actorId })

	const { eventId } = queueLogEvent({
		name: 'pool_vote_called',
		userId: actorId,
		source: 'server',
		properties: { poolId },
	})
	queuePoolActivityNotifications({
		type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
		poolId,
		actorUserId: actorId,
		occurrenceId: eventId,
	})
}

// Cast or change a vote. One vote per contributor per pool.
export async function castVote(
	poolId: string,
	ideaId: string,
	voterId: string,
) {
	const idea = await prisma.giftIdea.findFirst({
		where: { id: ideaId, poolId },
		select: { id: true },
	})

	if (!idea) {
		throw data({ error: 'Idea not found.' }, { status: 404 })
	}

	// Upsert: replacing an existing vote is fine
	await prisma.ideaVote.upsert({
		where: { poolId_voterId: { poolId, voterId } },
		create: { poolId, ideaId, voterId },
		update: { ideaId },
	})

	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.VOTE_CAST, {
		actorId: voterId,
		payload: { ideaId },
	})

	queueLogEvent({
		name: 'pool_vote_cast',
		userId: voterId,
		source: 'server',
		properties: { poolId, ideaId },
	})
}

// Close the vote — returns to OPEN without choosing. The organizer then picks.
export async function closeVote(poolId: string, actorId: string) {
	const pool = await prisma.pool.findUnique({
		where: { id: poolId },
		select: { status: true },
	})

	if (pool?.status !== POOL_STATUS.VOTING) {
		throw data(
			{ error: 'A vote can only be closed while voting is active.' },
			{ status: 400 },
		)
	}

	await prisma.pool.update({
		where: { id: poolId },
		data: { status: POOL_STATUS.OPEN },
	})

	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.VOTE_CLOSED, { actorId })
}

// ─── Decision ─────────────────────────────────────────────────────────────────

// Choose an idea as the winner and move the pool to DECIDED.
// finalPriceCents defaults to the idea's estimatedPriceCents if not provided.
export async function chooseIdea(
	poolId: string,
	ideaId: string,
	actorId: string,
	finalPriceCents?: number | null,
) {
	const idea = await prisma.giftIdea.findFirst({
		where: { id: ideaId, poolId },
		select: { estimatedPriceCents: true, name: true },
	})

	if (!idea) {
		throw data({ error: 'Idea not found.' }, { status: 404 })
	}

	const resolvedPrice = finalPriceCents ?? idea.estimatedPriceCents ?? null

	// The status transition and the claim it triggers must commit as one
	// unit. If they were separate writes, a concurrent `POST
	// /wishlist/purchase` could land a solo claim on the item in the window
	// between them — the pool decided first, but the solo claimer would win
	// the item, exactly the bug this feature exists to prevent. Wrapping both
	// in one transaction also means a sync failure (SQLITE_BUSY, a P2002 race)
	// rolls back the decision instead of leaving it DECIDED with no claim and
	// no retry path.
	const claimSync = await prisma.$transaction(async (tx) => {
		const decision = await tx.pool.updateMany({
			where: {
				id: poolId,
				// Forward-only: a gift can be (re)chosen while OPEN/VOTING/DECIDED,
				// but never from a terminal/purchased state — that would resurrect
				// a CANCELLED pool or roll a DELIVERED one back to DECIDED.
				status: {
					in: [POOL_STATUS.OPEN, POOL_STATUS.VOTING, POOL_STATUS.DECIDED],
				},
				OR: [
					{ status: { not: POOL_STATUS.DECIDED } },
					{ chosenIdeaId: null },
					{ chosenIdeaId: { not: ideaId } },
				],
			},
			data: {
				status: POOL_STATUS.DECIDED,
				chosenIdeaId: ideaId,
				finalPriceCents: resolvedPrice,
				decidedAt: new Date(),
			},
		})
		if (decision.count === 0) return null

		return syncPoolClaimInTx(tx, poolId)
	})
	if (claimSync === null) return

	// logPoolActivity, queueLogEvent, and queuePoolActivityNotifications all
	// run after the transaction closes: queueLogEvent inside a transaction
	// produces spurious SQLITE_BUSY under LiteFS, and a fanout failure here
	// must never turn the now-committed decision into a 500.
	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.IDEA_CHOSEN, {
		actorId,
		payload: { ideaId, name: idea.name, finalPriceCents: resolvedPrice },
	})

	if (claimSync.claimedItemId) {
		queueLogEvent({
			name: 'wishlist_claim_granted',
			userId: actorId,
			source: 'server',
			properties: { poolId, claimantType: 'pool', wishlistItemId: claimSync.claimedItemId },
		})
	}
	if (claimSync.conflictedItemId) {
		queueLogEvent({
			name: 'wishlist_claim_conflict_shown',
			userId: actorId,
			source: 'server',
			properties: { poolId, wishlistItemId: claimSync.conflictedItemId },
		})
	}
	for (const release of claimSync.released) {
		if (!release.transferredToPoolId) continue
		queueLogEvent({
			name: 'wishlist_claim_transferred',
			userId: actorId,
			source: 'server',
			properties: {
				wishlistItemId: release.wishlistItemId,
				toPoolId: release.transferredToPoolId,
			},
		})
	}

	const { eventId } = queueLogEvent({
		name: 'pool_decided',
		userId: actorId,
		source: 'server',
		properties: { poolId, ideaId, finalPriceCents: resolvedPrice },
	})
	queuePoolActivityNotifications({
		type: NOTIFICATION_TYPES.POOL_GIFT_CHOSEN,
		poolId,
		actorUserId: actorId,
		occurrenceId: eventId,
	})
}

// Update the confirmed final price after the gift has been decided.
export async function updateFinalPrice(
	poolId: string,
	finalPriceCents: number,
	actorId: string,
) {
	await prisma.pool.update({
		where: { id: poolId },
		data: { finalPriceCents },
	})

	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.POOL_UPDATED, {
		actorId,
		payload: { finalPriceCents },
	})
}

// ─── Role assignment ──────────────────────────────────────────────────────────

export async function assignPurchaser(
	poolId: string,
	userId: string,
	actorId: string,
) {
	const assignment = await prisma.pool.updateMany({
		where: {
			id: poolId,
			OR: [{ purchaserId: null }, { purchaserId: { not: userId } }],
		},
		data: { purchaserId: userId },
	})
	if (assignment.count === 0) return

	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.PURCHASER_ASSIGNED, {
		actorId,
		payload: { userId },
	})

	const { eventId } = queueLogEvent({
		name: 'pool_purchaser_assigned',
		userId: actorId,
		source: 'server',
		properties: { poolId, assigneeUserId: userId },
	})
	queuePoolActivityNotifications({
		type: NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED,
		poolId,
		actorUserId: actorId,
		assigneeUserId: userId,
		occurrenceId: eventId,
	})
}

export async function assignDeliverer(
	poolId: string,
	userId: string,
	actorId: string,
) {
	const assignment = await prisma.pool.updateMany({
		where: {
			id: poolId,
			OR: [{ delivererId: null }, { delivererId: { not: userId } }],
		},
		data: { delivererId: userId },
	})
	if (assignment.count === 0) return

	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.DELIVERER_ASSIGNED, {
		actorId,
		payload: { userId },
	})

	const { eventId } = queueLogEvent({
		name: 'pool_deliverer_assigned',
		userId: actorId,
		source: 'server',
		properties: { poolId, assigneeUserId: userId },
	})
	queuePoolActivityNotifications({
		type: NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED,
		poolId,
		actorUserId: actorId,
		assigneeUserId: userId,
		occurrenceId: eventId,
	})
}

// ─── Status transitions ───────────────────────────────────────────────────────

export async function markPurchased(poolId: string, actorId: string) {
	// Forward-only + idempotent: only a DECIDED (or already-PURCHASED) pool can
	// be marked purchased — never OPEN/VOTING/DELIVERED/CANCELLED.
	const result = await prisma.pool.updateMany({
		where: {
			id: poolId,
			status: { in: [POOL_STATUS.DECIDED, POOL_STATUS.PURCHASED] },
		},
		data: { status: POOL_STATUS.PURCHASED },
	})
	if (result.count === 0) {
		throw data(
			{ error: "This pool can't be marked purchased yet." },
			{ status: 409 },
		)
	}

	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.MARKED_PURCHASED, { actorId })

	queueLogEvent({
		name: 'pool_purchased',
		userId: actorId,
		source: 'server',
		properties: { poolId },
	})
}

export async function markDelivered(poolId: string, actorId: string) {
	// Forward-only + idempotent: only a PURCHASED (or already-DELIVERED) pool can
	// be marked delivered.
	const result = await prisma.pool.updateMany({
		where: {
			id: poolId,
			status: { in: [POOL_STATUS.PURCHASED, POOL_STATUS.DELIVERED] },
		},
		data: { status: POOL_STATUS.DELIVERED },
	})
	if (result.count === 0) {
		throw data(
			{ error: "This pool can't be marked delivered yet." },
			{ status: 409 },
		)
	}

	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.MARKED_DELIVERED, { actorId })

	queueLogEvent({
		name: 'pool_delivered',
		userId: actorId,
		source: 'server',
		properties: { poolId },
	})
}

export async function cancelPool(poolId: string, actorId: string) {
	// The status transition and its claim sync must commit as one unit — same
	// reasoning as chooseIdea. Split them and a sync failure (SQLITE_BUSY under
	// LiteFS) leaves the pool CANCELLED with its claim never released — and
	// unrecoverably so, because the early return below makes a retry a no-op
	// once the pool already reads CANCELLED. Wrapping both in one transaction
	// means a sync failure rolls back the cancellation instead, so the caller
	// sees the failure and can retry from a pool that still isn't cancelled.
	const claimSync = await prisma.$transaction(async (tx) => {
		const cancellation = await tx.pool.updateMany({
			where: { id: poolId, status: { not: POOL_STATUS.CANCELLED } },
			data: { status: POOL_STATUS.CANCELLED },
		})
		if (cancellation.count === 0) return null

		return syncPoolClaimInTx(tx, poolId)
	})
	if (claimSync === null) return

	// logPoolActivity, queueLogEvent, and queuePoolActivityNotifications all
	// run after the transaction closes — see chooseIdea's comment on the same
	// pattern: queueLogEvent inside a transaction produces spurious
	// SQLITE_BUSY under LiteFS, and a fanout failure here must never turn the
	// now-committed cancellation into a 500.
	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.POOL_CANCELLED, { actorId })

	for (const release of claimSync.released) {
		if (!release.transferredToPoolId) continue
		queueLogEvent({
			name: 'wishlist_claim_transferred',
			userId: actorId,
			source: 'server',
			properties: {
				wishlistItemId: release.wishlistItemId,
				toPoolId: release.transferredToPoolId,
			},
		})
	}

	const { eventId } = queueLogEvent({
		name: 'pool_cancelled',
		userId: actorId,
		source: 'server',
		properties: { poolId },
	})
	queuePoolActivityNotifications({
		type: NOTIFICATION_TYPES.POOL_CANCELLED,
		poolId,
		actorUserId: actorId,
		occurrenceId: eventId,
	})
}

// Returns whether the pool is an empty "mistake" (safe to hard-delete):
// no gift ideas and no contributors beyond the organizer. The organizer is
// always seeded as a contributor at creation, so we exclude them from the count.
export async function isPoolEmptyForDeletion(poolId: string): Promise<boolean> {
	const pool = await prisma.pool.findUnique({
		where: { id: poolId },
		select: {
			organizerId: true,
			_count: { select: { ideas: true } },
			contributors: { select: { userId: true } },
		},
	})
	if (!pool) return false
	const otherContributors = pool.contributors.filter(
		c => c.userId !== pool.organizerId,
	).length
	return pool._count.ideas === 0 && otherContributors === 0
}

export async function deletePool(poolId: string, actorId: string) {
	// Hard delete is allowed only for a pool that is genuinely a mistake — no
	// gift ideas and no contributors beyond the organizer. Anything with memory
	// must be cancelled instead, so its GiftIdea/contributor rows survive for the
	// recipient's gift history. Enforced here (throw), not just hidden in the UI.
	if (!(await isPoolEmptyForDeletion(poolId))) {
		throw data(
			{
				error:
					'This pool has gift ideas or other contributors. Cancel it instead of deleting.',
			},
			{ status: 409 },
		)
	}
	await logPoolActivity(poolId, POOL_ACTIVITY_TYPE.POOL_DELETED, { actorId })
	await prisma.pool.delete({ where: { id: poolId } })
}

// ─── Contribution breakdown ───────────────────────────────────────────────────

// Fetch contributors and run the calculation algorithm.
// Returns null if the pool has no confirmed final price.
export async function getContributionBreakdown(poolId: string) {
	const pool = await prisma.pool.findUnique({
		where: { id: poolId },
		select: {
			finalPriceCents: true,
			purchaserId: true,
			contributors: {
				select: {
					userId: true,
					contributionCents: true,
					hasPaid: true,
					user: {
						select: {
							id: true,
							username: true,
							name: true,
							image: { select: { id: true, altText: true } },
						},
					},
				},
			},
		},
	})

	if (!pool || pool.finalPriceCents === null) return null

	// Only contributors with a set budget participate in the calculation
	const budgets = pool.contributors
		.filter(c => c.contributionCents !== null && c.userId !== pool.purchaserId)
		.map(c => ({ userId: c.userId, maxCents: c.contributionCents! }))

	const result = calculateContributions(budgets, pool.finalPriceCents)

	// Annotate with contributor details and payment status
	const annotated = result.breakdown.map(b => {
		const contributor = pool.contributors.find(c => c.userId === b.userId)!
		return {
			...b,
			user: contributor.user,
			hasPaid: contributor.hasPaid,
		}
	})

	return {
		...result,
		breakdown: annotated,
		finalPriceCents: pool.finalPriceCents,
		purchaserId: pool.purchaserId,
	}
}
