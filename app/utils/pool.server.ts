import { captureException, captureMessage } from '@sentry/react-router'
import { data } from 'react-router'
import { nanoid } from 'nanoid'
import { queueLogEvent } from '#app/utils/analytics.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { NOTIFICATION_TYPES } from '#app/utils/notification-catalog.ts'
import { queueNotification } from '#app/utils/notification-dispatcher.server.ts'
import { logPoolActivity } from '#app/utils/pool-activity.server.ts'
import {
	POOL_ACTIVITY_TYPE,
	POOL_STATUS,
	DECISION_MODE,
} from '#app/utils/pool-constants.ts'
import { calculateContributions } from '#app/utils/pool-contributions.ts'
import { queuePoolActivityNotifications } from '#app/utils/pool-notifications.server.ts'
import { assertPoolStatus } from '#app/utils/pool-permissions.server.ts'
import {
	POOL_INTENT_STATUSES,
	syncPoolClaimInTx,
} from '#app/utils/wishlist-claims.server.ts'
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
): Promise<{ claimedItemId: string | null; conflictedItemId: string | null }> {
	const idea = await prisma.giftIdea.findFirst({
		where: { id: ideaId, poolId },
		select: {
			estimatedPriceCents: true,
			name: true,
			// Only used to compose the conflict notification below — never to
			// disclose the pool to the claim holder (see
			// queueWishlistClaimConflictNotification's own comment).
			pool: { select: { title: true } },
		},
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
	if (claimSync === null) return { claimedItemId: null, conflictedItemId: null }

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
		queueWishlistClaimConflictNotification(
			poolId,
			idea.pool.title,
			claimSync.conflictedItemId,
		)
	}
	for (const release of claimSync.released) {
		if (!release.transferredToPoolId || !release.transferredClaimId) continue
		queueLogEvent({
			name: 'wishlist_claim_transferred',
			userId: actorId,
			source: 'server',
			properties: {
				wishlistItemId: release.wishlistItemId,
				toPoolId: release.transferredToPoolId,
			},
		})
		queueWishlistClaimTransferredNotification(
			release.transferredToPoolId,
			release.wishlistItemId,
			release.transferredClaimId,
		)
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

	// Threaded back through the action response so the client can surface a
	// toast either when this decision silently claimed a previously-free
	// wishlist item, or when the item turned out to be claimed by someone
	// else at commit time (e.g. a race lost between the loader render and
	// this POST) — otherwise both outcomes are invisible to the person who
	// caused them.
	return {
		claimedItemId: claimSync.claimedItemId,
		conflictedItemId: claimSync.conflictedItemId,
	}
}

// Asks the person holding a conflicting claim whether they're still getting
// the item — the Keep/Release loop. Fire-and-forget with its own try/catch,
// matching the "side effects off the action response" pattern: a failure
// here must never turn the already-committed decision into a 500 for the
// organizer who chose the idea.
//
// Reads the claim fresh (not the pre-transaction snapshot) because the truth
// can have moved between `syncPoolClaimInTx` committing and this running —
// e.g. the holder released in the interim and the item already settled to
// this very pool. Re-reading means we only ever ask about a conflict that
// still exists.
//
// `poolTitle` is carried into the payload for bookkeeping only. The claim
// holder may have no relationship to this pool's group — the notification's
// own renderer (notification-events.server.tsx) must never put it in the
// rendered message; see the payload comment in notification-catalog.ts and
// the privacy ladder in wishlist-claim-disclosure.ts.
function queueWishlistClaimConflictNotification(
	poolId: string,
	poolTitle: string,
	wishlistItemId: string,
): void {
	void (async () => {
		const [claim, pool] = await Promise.all([
			prisma.wishlistClaim.findUnique({
				where: { wishlistItemId },
				select: {
					id: true,
					claimedByUserId: true,
					wishlistItem: {
						select: {
							title: true,
							owner: { select: { name: true, username: true } },
						},
					},
				},
			}),
			// Re-read the pool's *current* intent, not just the claim's current
			// holder. The claim re-read above only proves someone still holds
			// the item — it says nothing about whether this pool still wants
			// it. Between the transaction that queued this fanout committing
			// and this read running, the pool can have been re-decided onto a
			// different idea (or cancelled): the solo claim on the original
			// item is still perfectly live, but there is no longer a conflict
			// to report. Sending anyway would tell the holder about a fight
			// that's over, and — because the send claims the ledger key below
			// — would silently swallow a genuine future conflict if the pool
			// is later re-decided back onto this exact item.
			prisma.pool.findUnique({
				where: { id: poolId },
				select: { status: true, chosenIdea: { select: { wishlistItemId: true } } },
			}),
		])
		// The other side of a conflict can be another pool, not a person — the
		// claim holder is only present here when `claimedByUserId` is set.
		// There is nobody to ask when a pool holds it.
		if (!claim?.claimedByUserId || !claim.wishlistItem) return

		const poolStillIntendsThisItem =
			pool !== null &&
			(POOL_INTENT_STATUSES as readonly string[]).includes(pool.status) &&
			pool.chosenIdea?.wishlistItemId === wishlistItemId
		if (!poolStillIntendsThisItem) return

		queueNotification({
			userId: claim.claimedByUserId,
			type: NOTIFICATION_TYPES.WISHLIST_CLAIM_CONFLICT,
			payload: {
				wishlistItemId,
				itemTitle: claim.wishlistItem.title,
				recipientName:
					claim.wishlistItem.owner.name ?? claim.wishlistItem.owner.username,
				recipientUsername: claim.wishlistItem.owner.username,
				poolId,
				poolTitle,
				// The specific claim occurrence this notification is about. The
				// Release action carries this back so a stale notification (the
				// claimant released elsewhere, re-claimed, then clicked an old
				// notification's Release) can't destroy a claim it never asked
				// about — see releaseUserClaim's expectedClaimId in
				// wishlist-claims.server.ts.
				claimId: claim.id,
			},
			// One notification per conflicted *claim*, not per conflicted
			// pool/item pair: the key includes the claim row's own id, which is
			// freshly minted every time `wishlist-claims.server.ts` creates a
			// claim. `poolId`/`wishlistItemId` alone would dedupe permanently —
			// after the first Keep/Release resolves this claim, the holder (or
			// someone else) can re-claim the same item and this pool can decide
			// on it again, which is a genuinely new conflict that must ask
			// again. The claim id is the right variable: it stays fixed for
			// every re-entry into this path *for the same still-live claim*
			// (a retry, or re-deciding back onto an item that's still
			// conflicted), so those correctly stay deduped — unlike, say,
			// `Pool.decidedAt`, which changes on every re-decision and would
			// re-notify on each one. See notification-dispatcher.server.ts /
			// claimNotificationDelivery.
			sourceIdentifier: `claim-conflict:${poolId}:${wishlistItemId}:${claim.id}`,
		})
	})().catch((error: unknown) => {
		captureException(error)
	})
}

// The other half of the conflict story `queueWishlistClaimConflictNotification`
// starts: once a claim settles onto a pool — a person releasing (directly, or
// indirectly via an archive/status change, an access-loss cleanup, or account
// deletion), or this pool inheriting from a pool that just cancelled or
// re-decided away from the item — the organizer was told there was a real
// risk of a duplicate purchase, and without this call they never learn it's
// over. Exported so every settlement call site that can produce a
// `transferredToPoolId` (chooseIdea/cancelPool below, plus the release paths
// in wishlist+/purchase.ts, wishlist+/status.ts, wishlist.server.ts, and
// settings+/profile.index.tsx) can reuse the same fanout instead of
// hand-rolling it. Fire-and-forget with its own try/catch, matching the
// "side effects off the action response" pattern — several of those call
// sites run from a GET loader's cleanup pass, where a read failure here must
// never turn a page view into a 500.
//
// Notifies every contributor, not just the organizer — see the schema
// comment on `Pool.organizerId` ("all role-holders are also
// PoolContributors"), and any contributor could be the one about to buy the
// item duplicate. Unlike the conflict notification, `poolId`/`poolTitle` ARE
// safe to use in this one's rendered copy: the audience is this pool's own
// contributors, who already know their own pool. For the same reason this
// notification is context: 'POOL' (unlike CONFLICT's 'NONE' — see the
// catalog entries in notification-catalog.ts): the audience is exactly this
// pool's contributors, so a contributor who has muted the pool must not be
// pinged, and that requires passing `{ kind: 'POOL', poolId }` on the intent
// below so `resolveNotificationPolicy` actually consults pool-context
// preferences instead of skipping them.
export function queueWishlistClaimTransferredNotification(
	poolId: string,
	wishlistItemId: string,
	// The id of the WishlistClaim row this settlement just created (see
	// `settleItem` in wishlist-claims.server.ts). Required, not derived from
	// re-reading the claim below: it identifies *this* settlement for the
	// ledger key, so a later, genuinely new settlement onto the same pool+item
	// (this pool inherits, later decides away, then inherits again after a
	// fresh solo claim is created and released) gets a distinct key instead of
	// matching — and being silently suppressed by — the first transfer's
	// ledger rows. This is the same fix already applied to the sibling
	// conflict-notification key; see queueWishlistClaimConflictNotification.
	claimId: string,
): void {
	void (async () => {
		const [pool, claim] = await Promise.all([
			prisma.pool.findUnique({
				where: { id: poolId },
				select: { title: true, contributors: { select: { userId: true } } },
			}),
			prisma.wishlistClaim.findUnique({
				where: { wishlistItemId },
				select: {
					id: true,
					poolId: true,
					wishlistItem: {
						select: {
							title: true,
							owner: { select: { name: true, username: true } },
						},
					},
				},
			}),
		])
		if (!pool) return
		// Read fresh rather than trust the caller's snapshot: the claim can have
		// moved again by the time this runs (e.g. this pool immediately
		// re-decided away from the item). Checking `poolId` alone is not
		// enough, though: it only proves *some* claim this pool holds is on
		// this item right now, not that it's *this settlement's* claim. A
		// delayed fanout for an older settlement (A) can lose a race to a
		// newer one (B) — the pool decides away, a fresh solo claim on the
		// same item is made and released, and the pool inherits the item
		// again as settlement B — by the time A's fanout runs it would see
		// B's live row, pass a `poolId`-only check, and report B's details
		// under A's ledger key (B's own fanout then sends again under its own
		// key: a duplicate). Requiring the live row's id to match the id this
		// settlement created makes a stale settlement's fanout a no-op
		// instead.
		if (!claim || claim.poolId !== poolId || claim.id !== claimId || !claim.wishlistItem) {
			return
		}

		for (const contributor of pool.contributors) {
			queueNotification({
				userId: contributor.userId,
				type: NOTIFICATION_TYPES.WISHLIST_CLAIM_TRANSFERRED,
				context: { kind: 'POOL', poolId },
				payload: {
					wishlistItemId,
					itemTitle: claim.wishlistItem.title,
					recipientName:
						claim.wishlistItem.owner.name ?? claim.wishlistItem.owner.username,
					recipientUsername: claim.wishlistItem.owner.username,
					poolId,
					poolTitle: pool.title,
				},
				// One notification per contributor per settlement: the same key
				// across every contributor is fine because the NotificationDelivery
				// ledger dedupes on (userId, sourceIdentifier) — see
				// claimNotificationDelivery in notification-dispatcher.server.ts.
				// Re-entering this path for the same settlement (a retry, or the
				// cleanup loader re-running on the next page view) never notifies
				// twice. The claim id keeps a *different* settlement distinct — see
				// the parameter doc above.
				sourceIdentifier: `claim-transferred:${poolId}:${wishlistItemId}:${claimId}`,
			})
		}
	})().catch((error: unknown) => {
		captureException(error)
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
		if (!release.transferredToPoolId || !release.transferredClaimId) continue
		queueLogEvent({
			name: 'wishlist_claim_transferred',
			userId: actorId,
			source: 'server',
			properties: {
				wishlistItemId: release.wishlistItemId,
				toPoolId: release.transferredToPoolId,
			},
		})
		queueWishlistClaimTransferredNotification(
			release.transferredToPoolId,
			release.wishlistItemId,
			release.transferredClaimId,
		)
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
