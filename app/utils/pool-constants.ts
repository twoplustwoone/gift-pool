// Pool status — represents the lifecycle stage of a pool.
// Flow: OPEN → (VOTING) → DECIDED → PURCHASED → DELIVERED
//                                              ↘ CANCELLED (from any stage)
export const POOL_STATUS = {
	OPEN: 'OPEN',
	VOTING: 'VOTING',
	DECIDED: 'DECIDED',
	PURCHASED: 'PURCHASED',
	DELIVERED: 'DELIVERED',
	CANCELLED: 'CANCELLED',
} as const

export type PoolStatus = (typeof POOL_STATUS)[keyof typeof POOL_STATUS]

export const POOL_STATUS_LABELS: Record<PoolStatus, string> = {
	OPEN: 'Open',
	VOTING: 'Voting',
	DECIDED: 'Decided',
	PURCHASED: 'Purchased',
	DELIVERED: 'Delivered',
	CANCELLED: 'Cancelled',
}

// Which statuses allow contributors to still interact (propose ideas, vote, etc.)
export const ACTIVE_POOL_STATUSES: PoolStatus[] = [
	POOL_STATUS.OPEN,
	POOL_STATUS.VOTING,
	POOL_STATUS.DECIDED,
	POOL_STATUS.PURCHASED,
]

// Decision mode — how the pool arrives at a chosen gift.
export const DECISION_MODE = {
	ORGANIZER_PICKS: 'ORGANIZER_PICKS',
	VOTE: 'VOTE',
} as const

export type DecisionMode = (typeof DECISION_MODE)[keyof typeof DECISION_MODE]

export const DECISION_MODE_LABELS: Record<DecisionMode, string> = {
	ORGANIZER_PICKS: 'Organizer chooses',
	VOTE: 'Group vote',
}

// Occasion type — what the pool is celebrating.
export const OCCASION_TYPE = {
	BIRTHDAY: 'BIRTHDAY',
	ANNIVERSARY: 'ANNIVERSARY',
	WEDDING: 'WEDDING',
	FAREWELL: 'FAREWELL',
	GRADUATION: 'GRADUATION',
	HOLIDAY: 'HOLIDAY',
	OTHER: 'OTHER',
} as const

export type OccasionType = (typeof OCCASION_TYPE)[keyof typeof OCCASION_TYPE]

export const OCCASION_TYPE_LABELS: Record<OccasionType, string> = {
	BIRTHDAY: 'Birthday',
	ANNIVERSARY: 'Anniversary',
	WEDDING: 'Wedding',
	FAREWELL: 'Farewell',
	GRADUATION: 'Graduation',
	HOLIDAY: 'Holiday',
	OTHER: 'Other',
}

// Activity event types — used in the PoolActivity audit log.
export const POOL_ACTIVITY_TYPE = {
	POOL_CREATED: 'pool.created',
	POOL_UPDATED: 'pool.updated',
	POOL_CANCELLED: 'pool.cancelled',
	POOL_DELETED: 'pool.deleted',
	CONTRIBUTOR_JOINED: 'contributor.joined',
	CONTRIBUTOR_LEFT: 'contributor.left',
	CONTRIBUTOR_REMOVED: 'contributor.removed',
	CONTRIBUTOR_UPDATED: 'contributor.updated',
	IDEA_PROPOSED: 'idea.proposed',
	IDEA_DELETED: 'idea.deleted',
	VOTE_CALLED: 'vote.called',
	VOTE_CAST: 'vote.cast',
	VOTE_CLOSED: 'vote.closed',
	IDEA_CHOSEN: 'idea.chosen',
	PURCHASER_ASSIGNED: 'purchaser.assigned',
	DELIVERER_ASSIGNED: 'deliverer.assigned',
	MARKED_PURCHASED: 'pool.purchased',
	MARKED_DELIVERED: 'pool.delivered',
} as const

export type PoolActivityType =
	(typeof POOL_ACTIVITY_TYPE)[keyof typeof POOL_ACTIVITY_TYPE]
