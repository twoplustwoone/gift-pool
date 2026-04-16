import { prisma } from '#app/utils/db.server.ts'
import {
	ACTION_TYPE,
	type ActionItem,
	type GroupOverviewData,
	type PastGift,
	type PoolSummary,
	type UpcomingOccasion,
} from '#app/utils/group-overview.ts'
import { DECISION_MODE, POOL_STATUS } from '#app/utils/pool-constants.ts'

// Re-export so existing test imports from the .server module still work.
export { ACTION_TYPE }
export type {
	ActionItem,
	GroupOverviewData,
	PastGift,
	PoolSummary,
	UpcomingOccasion,
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = [POOL_STATUS.DELIVERED, POOL_STATUS.CANCELLED]
const ACTION_QUEUE_LIMIT = 5
const UPCOMING_OCCASION_DAYS = 60
const URGENCY_THRESHOLD_DAYS = 7

// A pool is "stuck" if both conditions hold: the row hasn't been touched for
// more than STUCK_IDLE_DAYS, AND the event is within STUCK_EVENT_WINDOW_DAYS
// (or has no event date — treated as urgent).
const STUCK_IDLE_DAYS = 3
const STUCK_EVENT_WINDOW_DAYS = 30

// ─── Main entry point ────────────────────────────────────────────────────────
// Two parallel queries + one sequential (past gifts is independent).
// Action queue is computed in application code over the results — no extra DB hit.

export async function getGroupOverviewData(
	groupId: string,
	viewerId: string,
): Promise<GroupOverviewData> {
	const [activePoolRows, memberRows, pastGiftRows] = await Promise.all([
		queryActivePools(groupId, viewerId),
		queryGroupMembers(groupId, viewerId),
		queryPastGifts(groupId, viewerId),
	])

	const activePools = shapePoolSummaries(activePoolRows, viewerId)
	const upcomingOccasions = computeUpcomingOccasions(
		memberRows,
		activePoolRows,
		groupId,
	)
	const actionQueue = computeActionQueue(
		activePoolRows,
		upcomingOccasions,
		viewerId,
		groupId,
	)
	const pastGifts = shapePastGifts(pastGiftRows)

	return { actionQueue, activePools, upcomingOccasions, pastGifts }
}

// ─── Queries ─────────────────────────────────────────────────────────────────
// Privacy invariant: every pool query includes a WHERE clause that excludes
// rows where recipientUserId = viewerId. This is the security boundary — data
// filtered here never reaches the client.

async function queryActivePools(groupId: string, viewerId: string) {
	const pools = await prisma.pool.findMany({
		where: {
			giftGroupId: groupId,
			status: { notIn: TERMINAL_STATUSES },
			OR: [
				{ recipientUserId: null },
				{ recipientUserId: { not: viewerId } },
			],
		},
		select: {
			id: true,
			title: true,
			occasionType: true,
			eventDate: true,
			status: true,
			decisionMode: true,
			updatedAt: true,
			organizerId: true,
			purchaserId: true,
			delivererId: true,
			chosenIdeaId: true,
			recipientUserId: true,
			recipientName: true,
			recipientUser: {
				select: { name: true, username: true },
			},
			contributors: {
				select: {
					userId: true,
					contributionCents: true,
					hasPaid: true,
				},
			},
			chosenIdea: {
				select: { proposedById: true },
			},
			votes: {
				where: { voterId: viewerId },
				select: { id: true },
			},
			_count: { select: { ideas: true, contributors: true, votes: true } },
		},
	})

	return pools.sort((a, b) => {
		const aDate = a.eventDate?.getTime() ?? Infinity
		const bDate = b.eventDate?.getTime() ?? Infinity
		return aDate - bDate
	})
}

type ActivePoolRow = Awaited<ReturnType<typeof queryActivePools>>[number]

async function queryGroupMembers(groupId: string, viewerId: string) {
	return prisma.usersInGiftGroups.findMany({
		where: {
			giftGroupId: groupId,
			userId: { not: viewerId },
			removedAt: null,
			shareBirthday: true,
			user: { birthday: { not: null } },
		},
		select: {
			userId: true,
			user: {
				select: {
					name: true,
					username: true,
					birthday: true,
					image: { select: { id: true } },
				},
			},
		},
	})
}

type MemberRow = Awaited<ReturnType<typeof queryGroupMembers>>[number]

async function queryPastGifts(groupId: string, viewerId: string) {
	return prisma.pool.findMany({
		where: {
			giftGroupId: groupId,
			status: { in: TERMINAL_STATUSES },
			OR: [
				{ recipientUserId: null },
				{ recipientUserId: { not: viewerId } },
			],
		},
		select: {
			id: true,
			title: true,
			status: true,
			occasionType: true,
			updatedAt: true,
			recipientName: true,
			recipientUser: { select: { name: true, username: true } },
			chosenIdea: { select: { name: true } },
			finalPriceCents: true,
			contributors: {
				select: { contributionCents: true },
			},
		},
		orderBy: { updatedAt: 'desc' },
		take: 3,
	})
}

type PastGiftRow = Awaited<ReturnType<typeof queryPastGifts>>[number]

// ─── Action queue classifier ─────────────────────────────────────────────────
// Iterates active pools + upcoming occasions, classifies each into zero or
// more action items, assigns priority, sorts, and caps at ACTION_QUEUE_LIMIT.
//
// Priority bands:
//   P0 — time-urgent (event within 7 days, promoted from lower bands)
//   P1 — blocking others (vote, close vote, choose gift, call vote)
//   P2 — your turn (pay, purchase, deliver, set contribution)
//   P3 — informational (your idea was chosen)
//   P4 — future / low urgency (upcoming occasion, propose idea)

function computeActionQueue(
	pools: ActivePoolRow[],
	occasions: UpcomingOccasion[],
	viewerId: string,
	groupId: string,
): ActionItem[] {
	const items: ActionItem[] = []

	for (const pool of pools) {
		const viewer = pool.contributors.find((c) => c.userId === viewerId)
		const isOrganizer = pool.organizerId === viewerId
		const isPurchaser = pool.purchaserId === viewerId
		const isDeliverer = pool.delivererId === viewerId
		const name =
			pool.recipientUser?.name ?? pool.recipientName ?? 'someone'
		const eventDays = pool.eventDate ? daysUntilDate(pool.eventDate) : null

		const base = {
			poolId: pool.id,
			poolTitle: pool.title,
			recipientName: name,
			eventDate: pool.eventDate,
			daysUntilEvent: eventDays,
		}

		if (pool.status === POOL_STATUS.OPEN) {
			if (viewer && pool._count.ideas === 0) {
				items.push({
					...base,
					type: ACTION_TYPE.PROPOSE_IDEA,
					priority: 4,
					ctaLabel: 'Propose an idea',
					ctaUrl: `/pools/${pool.id}`,
				})
			}
			if (
				isOrganizer &&
				pool.decisionMode === DECISION_MODE.VOTE &&
				pool._count.ideas >= 2
			) {
				items.push({
					...base,
					type: ACTION_TYPE.CALL_VOTE,
					priority: 1,
					ctaLabel: 'Call a vote',
					ctaUrl: `/pools/${pool.id}`,
				})
			}
			if (
				isOrganizer &&
				pool.decisionMode === DECISION_MODE.ORGANIZER_PICKS &&
				pool._count.ideas >= 1
			) {
				items.push({
					...base,
					type: ACTION_TYPE.CHOOSE_GIFT,
					priority: 1,
					ctaLabel: 'Choose a gift',
					ctaUrl: `/pools/${pool.id}`,
				})
			}
			if (viewer && !viewer.contributionCents) {
				items.push({
					...base,
					type: ACTION_TYPE.SET_CONTRIBUTION,
					priority: 2,
					ctaLabel: 'Set contribution',
					ctaUrl: `/pools/${pool.id}`,
				})
			}
		}

		if (pool.status === POOL_STATUS.VOTING) {
			if (viewer && pool.votes.length === 0) {
				items.push({
					...base,
					type: ACTION_TYPE.CAST_VOTE,
					priority: 1,
					ctaLabel: 'Cast your vote',
					ctaUrl: `/pools/${pool.id}`,
				})
			}
			if (isOrganizer) {
				items.push({
					...base,
					type: ACTION_TYPE.CLOSE_VOTE,
					priority: 1,
					ctaLabel: 'Close voting',
					ctaUrl: `/pools/${pool.id}`,
				})
			}
			if (viewer && !viewer.contributionCents) {
				items.push({
					...base,
					type: ACTION_TYPE.SET_CONTRIBUTION,
					priority: 2,
					ctaLabel: 'Set contribution',
					ctaUrl: `/pools/${pool.id}`,
				})
			}
		}

		if (pool.status === POOL_STATUS.DECIDED) {
			if (
				viewer &&
				!viewer.hasPaid &&
				viewer.contributionCents &&
				viewer.contributionCents > 0
			) {
				items.push({
					...base,
					type: ACTION_TYPE.MARK_PAID,
					priority: 2,
					ctaLabel: 'Mark as paid',
					ctaUrl: `/pools/${pool.id}`,
					amountCents: viewer.contributionCents,
				})
			}
			if (isOrganizer || isPurchaser) {
				items.push({
					...base,
					type: ACTION_TYPE.MARK_PURCHASED,
					priority: 2,
					ctaLabel: 'Mark as purchased',
					ctaUrl: `/pools/${pool.id}`,
				})
			}
			if (pool.chosenIdea?.proposedById === viewerId) {
				items.push({
					...base,
					type: ACTION_TYPE.IDEA_CHOSEN,
					priority: 3,
					ctaLabel: 'View pool',
					ctaUrl: `/pools/${pool.id}`,
				})
			}
			if (viewer && !viewer.contributionCents) {
				items.push({
					...base,
					type: ACTION_TYPE.SET_CONTRIBUTION,
					priority: 2,
					ctaLabel: 'Set contribution',
					ctaUrl: `/pools/${pool.id}`,
				})
			}
		}

		if (pool.status === POOL_STATUS.PURCHASED) {
			if (isOrganizer || isDeliverer) {
				items.push({
					...base,
					type: ACTION_TYPE.MARK_DELIVERED,
					priority: 2,
					ctaLabel: 'Mark as delivered',
					ctaUrl: `/pools/${pool.id}`,
				})
			}
			if (pool.chosenIdea?.proposedById === viewerId) {
				items.push({
					...base,
					type: ACTION_TYPE.IDEA_CHOSEN,
					priority: 3,
					ctaLabel: 'View pool',
					ctaUrl: `/pools/${pool.id}`,
				})
			}
		}
	}

	// POOL_STUCK pass. A stuck pool is one that's been idle for > 3 days
	// AND the event is within 30 days (or has no event date). We suppress
	// STUCK when the viewer already has a direct action on the same pool —
	// the direct action is more specific, so we don't want duplicates.
	const poolIdsWithDirectAction = new Set(
		items.map((i) => i.poolId).filter((id): id is string => id !== null),
	)

	for (const pool of pools) {
		if (poolIdsWithDirectAction.has(pool.id)) continue

		const viewer = pool.contributors.find((c) => c.userId === viewerId)
		if (!viewer) continue

		if (!isPoolStuck(pool)) continue

		const stuck = buildStuckItem(pool)
		if (!stuck) continue

		items.push(stuck)
	}

	for (const occasion of occasions) {
		items.push({
			type: ACTION_TYPE.UPCOMING_OCCASION,
			priority: 4,
			poolId: null,
			poolTitle: null,
			recipientName: occasion.name,
			eventDate: null,
			daysUntilEvent: occasion.daysUntil,
			ctaLabel: 'Start a pool',
			ctaUrl: `/pools/new?groupId=${groupId}&recipientId=${occasion.userId}`,
			memberId: occasion.userId,
			memberUsername: occasion.username,
			memberImageId: occasion.imageId,
		})
	}

	// P0 promotion: any action tied to an event within the urgency threshold
	for (const item of items) {
		if (
			item.daysUntilEvent !== null &&
			item.daysUntilEvent >= 0 &&
			item.daysUntilEvent <= URGENCY_THRESHOLD_DAYS &&
			item.priority > 0
		) {
			item.priority = 0
		}
	}

	items.sort((a, b) => {
		if (a.priority !== b.priority) return a.priority - b.priority
		const aDays = a.daysUntilEvent ?? Infinity
		const bDays = b.daysUntilEvent ?? Infinity
		return aDays - bDays
	})

	return items.slice(0, ACTION_QUEUE_LIMIT)
}

// ─── Stuck pool detection ────────────────────────────────────────────────────

function isPoolStuck(pool: ActivePoolRow): boolean {
	const daysIdle =
		(Date.now() - new Date(pool.updatedAt).getTime()) /
		(1000 * 60 * 60 * 24)
	if (daysIdle <= STUCK_IDLE_DAYS) return false

	if (!pool.eventDate) return true
	const daysToEvent = daysUntilDate(pool.eventDate)
	return daysToEvent <= STUCK_EVENT_WINDOW_DAYS
}

function buildStuckItem(pool: ActivePoolRow): ActionItem | null {
	const recipientName =
		pool.recipientUser?.name ?? pool.recipientName ?? 'someone'
	const eventDays = pool.eventDate ? daysUntilDate(pool.eventDate) : null
	const base = {
		type: ACTION_TYPE.POOL_STUCK,
		priority: 1,
		poolId: pool.id,
		poolTitle: pool.title,
		recipientName,
		eventDate: pool.eventDate,
		daysUntilEvent: eventDays,
		ctaUrl: `/pools/${pool.id}`,
	}

	switch (pool.status) {
		case POOL_STATUS.OPEN:
			if (pool._count.ideas === 0) {
				return {
					...base,
					ctaLabel: 'Add an idea',
					description: `No ideas yet for ${recipientName}'s gift — add one?`,
				}
			}
			return {
				...base,
				ctaLabel: 'Call a vote',
				description: `Ideas are in for ${recipientName} — call a vote?`,
			}
		case POOL_STATUS.VOTING: {
			const outstanding =
				pool._count.contributors - pool._count.votes
			const total = pool._count.contributors
			return {
				...base,
				ctaLabel: 'Close voting',
				description:
					outstanding > 0
						? `${outstanding} of ${total} haven't voted yet — nudge them or close voting?`
						: `Voting is stalled on ${recipientName}'s gift — close voting?`,
			}
		}
		case POOL_STATUS.DECIDED:
			return {
				...base,
				ctaLabel: 'Mark as purchased',
				description: `${recipientName}'s gift decided but not bought yet — mark as purchased?`,
			}
		default:
			return null
	}
}

// Exported for testing. Classifies pools + occasions into prioritized queue.
export function _computeActionQueueForTesting(
	pools: ActivePoolRow[],
	occasions: UpcomingOccasion[],
	viewerId: string,
	groupId: string,
): ActionItem[] {
	return computeActionQueue(pools, occasions, viewerId, groupId)
}

// Exported for testing. Returns whether a pool meets the stuck criteria.
export function _isPoolStuckForTesting(pool: ActivePoolRow): boolean {
	return isPoolStuck(pool)
}

// ─── Upcoming occasions ──────────────────────────────────────────────────────

function computeUpcomingOccasions(
	members: MemberRow[],
	activePools: ActivePoolRow[],
	groupId: string,
): UpcomingOccasion[] {
	const recipientIdsWithActivePool = new Set(
		activePools
			.map((p) => p.recipientUserId)
			.filter((id): id is string => id !== null),
	)

	const occasions: UpcomingOccasion[] = []

	for (const member of members) {
		if (!member.user.birthday) continue
		if (recipientIdsWithActivePool.has(member.userId)) continue

		const days = daysUntilBirthday(member.user.birthday)
		if (days > UPCOMING_OCCASION_DAYS) continue

		occasions.push({
			userId: member.userId,
			name: member.user.name ?? member.user.username,
			username: member.user.username,
			daysUntil: days,
			imageId: member.user.image?.id ?? null,
			groupId,
		})
	}

	return occasions.sort((a, b) => a.daysUntil - b.daysUntil)
}

// ─── Shaping helpers ─────────────────────────────────────────────────────────

function shapePoolSummaries(
	pools: ActivePoolRow[],
	viewerId: string,
): PoolSummary[] {
	return pools.map((pool) => {
		const viewerContributor = pool.contributors.find(
			(c) => c.userId === viewerId,
		)

		return {
			id: pool.id,
			title: pool.title,
			occasionType: pool.occasionType,
			eventDate: pool.eventDate,
			status: pool.status,
			recipientName:
				pool.recipientUser?.name ?? pool.recipientName ?? 'Someone',
			recipientUsername: pool.recipientUser?.username ?? null,
			ideaCount: pool._count.ideas,
			contributorCount: pool.contributors.length,
			paidCount: pool.contributors.filter((c) => c.hasPaid).length,
			viewerRole: pool.organizerId === viewerId
				? ('organizing' as const)
				: viewerContributor
					? ('contributing' as const)
					: ('none' as const),
			viewerContributionCents: viewerContributor?.contributionCents ?? null,
		}
	})
}

function shapePastGifts(rows: PastGiftRow[]): PastGift[] {
	return rows.map((pool) => ({
		id: pool.id,
		title: pool.title,
		status: pool.status,
		occasionType: pool.occasionType,
		updatedAt: pool.updatedAt,
		recipientName:
			pool.recipientUser?.name ?? pool.recipientName ?? 'Someone',
		recipientUsername: pool.recipientUser?.username ?? null,
		chosenIdeaName: pool.chosenIdea?.name ?? null,
		totalCents:
			pool.finalPriceCents ??
			pool.contributors.reduce(
				(sum, c) => sum + (c.contributionCents ?? 0),
				0,
			),
	}))
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
	const copy = new Date(d)
	copy.setHours(0, 0, 0, 0)
	return copy
}

function daysUntilDate(target: Date): number {
	const today = startOfDay(new Date())
	const t = startOfDay(new Date(target))
	return Math.ceil((t.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function daysUntilBirthday(birthday: Date): number {
	const today = startOfDay(new Date())
	const year = today.getFullYear()
	let next = new Date(year, birthday.getMonth(), birthday.getDate())
	next.setHours(0, 0, 0, 0)
	if (next < today) {
		next = new Date(year + 1, birthday.getMonth(), birthday.getDate())
		next.setHours(0, 0, 0, 0)
	}
	return Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}
