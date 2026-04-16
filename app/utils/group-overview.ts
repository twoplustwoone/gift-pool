// Client-safe types and constants for the group overview.
// Server-only helpers live in `group-overview.server.ts` and import from here.
//
// React Router's Vite plugin refuses to bundle `.server.ts` modules into the
// client, so any value (like ACTION_TYPE) that the Overview component needs
// at runtime has to live in a non-server file.

export const ACTION_TYPE = {
	PROPOSE_IDEA: 'PROPOSE_IDEA',
	CALL_VOTE: 'CALL_VOTE',
	CHOOSE_GIFT: 'CHOOSE_GIFT',
	CAST_VOTE: 'CAST_VOTE',
	CLOSE_VOTE: 'CLOSE_VOTE',
	SET_CONTRIBUTION: 'SET_CONTRIBUTION',
	MARK_PAID: 'MARK_PAID',
	MARK_PURCHASED: 'MARK_PURCHASED',
	MARK_DELIVERED: 'MARK_DELIVERED',
	IDEA_CHOSEN: 'IDEA_CHOSEN',
	UPCOMING_OCCASION: 'UPCOMING_OCCASION',
	POOL_STUCK: 'POOL_STUCK',
} as const

export type ActionType = (typeof ACTION_TYPE)[keyof typeof ACTION_TYPE]

export type ActionItem = {
	type: ActionType
	priority: number
	poolId: string | null
	poolTitle: string | null
	recipientName: string
	eventDate: Date | null
	daysUntilEvent: number | null
	ctaLabel: string
	ctaUrl: string
	// Optional server-generated description. Used by POOL_STUCK where the copy
	// depends on runtime state (idea count, vote counts, etc.); other action
	// types build their description from the item shape on the client.
	description?: string
	amountCents?: number
	memberId?: string
	memberUsername?: string
	memberImageId?: string | null
}

export type PoolSummary = {
	id: string
	title: string
	occasionType: string
	eventDate: Date | null
	status: string
	recipientName: string
	recipientUsername: string | null
	ideaCount: number
	contributorCount: number
	paidCount: number
	viewerRole: 'organizing' | 'contributing' | 'none'
	viewerContributionCents: number | null
}

export type UpcomingOccasion = {
	userId: string
	name: string
	username: string
	daysUntil: number
	imageId: string | null
	groupId: string
}

export type PastGift = {
	id: string
	title: string
	status: string
	occasionType: string
	updatedAt: Date
	recipientName: string
	recipientUsername: string | null
	chosenIdeaName: string | null
	totalCents: number
}

export type GroupOverviewData = {
	actionQueue: ActionItem[]
	activePools: PoolSummary[]
	upcomingOccasions: UpcomingOccasion[]
	pastGifts: PastGift[]
}
