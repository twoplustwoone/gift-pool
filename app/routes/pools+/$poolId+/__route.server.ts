import { parseWithZod } from '@conform-to/zod'
import { data, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'
import { z } from 'zod'
import { queueLogEvent } from '#app/utils/analytics.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { canViewWishlistOf } from '#app/utils/friends.server.ts'
import { dollarsToCents } from '#app/utils/price.ts'
import { POOL_STATUS } from '#app/utils/pool-constants.ts'
import {
	canManagePool,
	isPoolOrganizer,
	requirePoolContributor,
	type PoolForPermissions,
} from '#app/utils/pool-permissions.server.ts'
import {
	addContributor,
	assignDeliverer,
	assignPurchaser,
	callVote,
	cancelPool,
	castVote,
	chooseIdea,
	closeVote,
	deleteIdea,
	deletePool,
	generatePoolInviteCode,
	getContributionBreakdown,
	markContributorPaid,
	markDelivered,
	markPurchased,
	poolSelect,
	proposeIdea,
	removeContributor,
	updateContribution,
	updateFinalPrice,
} from '#app/utils/pool.server.ts'
import { getRequestContext } from '#app/utils/request-context.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const poolId = params.poolId!

	const pool = await prisma.pool.findUnique({
		where: { id: poolId },
		select: poolSelect,
	})

	// Privacy: the recipient of a pool must never be able to confirm it exists.
	// Return 404 (indistinguishable from a nonexistent pool) rather than 403.
	// Non-contributors also get 404 so the recipient case is not distinguishable
	// from any other unauthorized viewer.
	if (!pool || pool.recipientUserId === userId) {
		throw new Response('Not Found', { status: 404 })
	}

	const isContributor = pool.contributors.some((c) => c.userId === userId)
	if (!isContributor) {
		throw new Response('Not Found', { status: 404 })
	}

	const poolForPerms: PoolForPermissions = {
		id: pool.id,
		organizerId: pool.organizerId,
		giftGroupId: pool.giftGroupId,
		status: pool.status,
	}

	const isOrganizer = isPoolOrganizer(userId, poolForPerms)
	const canManage = await canManagePool(userId, poolForPerms)

	// Viewer's own contributor record
	const viewer = pool.contributors.find(c => c.userId === userId) ?? null

	// My vote (if any)
	const myVote = await prisma.ideaVote.findUnique({
		where: { poolId_voterId: { poolId, voterId: userId } },
		select: { ideaId: true },
	})

	// Contribution breakdown (only meaningful when DECIDED+)
	const contributionBreakdown =
		pool.status === POOL_STATUS.DECIDED ||
		pool.status === POOL_STATUS.PURCHASED ||
		pool.status === POOL_STATUS.DELIVERED
			? await getContributionBreakdown(poolId)
			: null

	// Build invite URL if code exists
	const inviteUrl = pool.inviteCode
		? `${new URL(request.url).origin}/pools/join/${pool.inviteCode}`
		: null

	// Recipient's active wishlist items power the "from their wishlist" picker
	// in the propose form. Only fetched while ideas can still be proposed, and
	// gated per viewer on the recipient's wishlistVisibility — joining a pool
	// (e.g. via invite code) must not bypass the recipient's privacy setting.
	const ideasOpen =
		pool.status === POOL_STATUS.OPEN || pool.status === POOL_STATUS.VOTING
	const recipientWishlistItems =
		pool.recipientUserId &&
		ideasOpen &&
		(await canViewWishlistOf(userId, pool.recipientUserId))
			? await prisma.wishlistItem.findMany({
					where: {
						ownerId: pool.recipientUserId,
						status: 'ACTIVE',
						// External list links aren't individual products to propose.
						type: { not: 'wishlist' },
					},
					select: {
						id: true,
						title: true,
						url: true,
						priceCents: true,
						currency: true,
					},
					orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
				})
			: []

	return {
		pool,
		viewer,
		isOrganizer,
		canManage,
		myVoteIdeaId: myVote?.ideaId ?? null,
		contributionBreakdown,
		inviteUrl,
		recipientWishlistItems,
	}
}

// ─── Intents ──────────────────────────────────────────────────────────────────

enum Intent {
	ProposeIdea = 'propose-idea',
	DeleteIdea = 'delete-idea',
	CastVote = 'cast-vote',
	CallVote = 'call-vote',
	CloseVote = 'close-vote',
	ChooseIdea = 'choose-idea',
	UpdateContribution = 'update-contribution',
	AssignPurchaser = 'assign-purchaser',
	AssignDeliverer = 'assign-deliverer',
	MarkPurchased = 'mark-purchased',
	MarkDelivered = 'mark-delivered',
	MarkPaid = 'mark-paid',
	UpdateFinalPrice = 'update-final-price',
	GenerateInvite = 'generate-invite',
	RemoveContributor = 'remove-contributor',
	LeavePool = 'leave-pool',
	CancelPool = 'cancel-pool',
	DeletePool = 'delete-pool',
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const PoolIdSchema = z.object({ poolId: z.string() })
const OptionalDollarAmountSchema = z.preprocess(
	value => (value === '' ? undefined : value),
	z.coerce.number().min(0).transform(dollarsToCents).optional(),
)

const ProposeIdeaSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.ProposeIdea),
	name: z.string().min(1, 'Give the idea a name').max(200),
	description: z.string().max(500).optional(),
	url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
	// User enters dollars (e.g. "9.99"); we convert to cents before saving.
	estimatedPriceCents: OptionalDollarAmountSchema,
	wishlistItemId: z.string().optional(),
})

const DeleteIdeaSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.DeleteIdea),
	ideaId: z.string(),
})

const CastVoteSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.CastVote),
	ideaId: z.string(),
})

const CallVoteSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.CallVote),
})

const CloseVoteSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.CloseVote),
})

const ChooseIdeaSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.ChooseIdea),
	ideaId: z.string(),
	finalPriceCents: z.coerce.number().int().min(0).optional(),
})

const UpdateContributionSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.UpdateContribution),
	// User enters dollars (e.g. "30.00"); we convert to cents before saving.
	contributionCents: z.coerce
		.number()
		.min(0)
		.transform(dollarsToCents),
})

const AssignPurchaserSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.AssignPurchaser),
	userId: z.string(),
})

const AssignDelivererSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.AssignDeliverer),
	userId: z.string(),
})

const MarkPurchasedSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.MarkPurchased),
})

const MarkDeliveredSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.MarkDelivered),
})

const MarkPaidSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.MarkPaid),
	targetUserId: z.string(),
	hasPaid: z.enum(['true', 'false']).transform(v => v === 'true'),
})

const UpdateFinalPriceSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.UpdateFinalPrice),
	// User enters dollars (e.g. "25.00"); we convert to cents before saving.
	finalPriceCents: z.coerce
		.number()
		.min(0)
		.transform(dollarsToCents),
})

const GenerateInviteSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.GenerateInvite),
})

const RemoveContributorSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.RemoveContributor),
	userId: z.string(),
})

const LeavePoolSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.LeavePool),
})

const CancelPoolSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.CancelPool),
})

const DeletePoolSchema = PoolIdSchema.extend({
	intent: z.literal(Intent.DeletePool),
})

const ActionSchema = ProposeIdeaSchema.or(DeleteIdeaSchema)
	.or(CastVoteSchema)
	.or(CallVoteSchema)
	.or(CloseVoteSchema)
	.or(ChooseIdeaSchema)
	.or(UpdateContributionSchema)
	.or(AssignPurchaserSchema)
	.or(AssignDelivererSchema)
	.or(MarkPurchasedSchema)
	.or(MarkDeliveredSchema)
	.or(MarkPaidSchema)
	.or(UpdateFinalPriceSchema)
	.or(GenerateInviteSchema)
	.or(RemoveContributorSchema)
	.or(LeavePoolSchema)
	.or(CancelPoolSchema)
	.or(DeletePoolSchema)

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request, params }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const poolId = params.poolId!

	const pool = await prisma.pool.findUnique({
		where: { id: poolId },
		select: {
			id: true,
			organizerId: true,
			giftGroupId: true,
			status: true,
			purchaserId: true,
			delivererId: true,
			recipientUserId: true,
		},
	})

	// Privacy: same invariant as the loader — recipient never sees/mutates.
	if (!pool || pool.recipientUserId === userId) {
		throw data({ error: 'Pool not found.' }, { status: 404 })
	}

	await requirePoolContributor(userId, poolId)

	const poolForPerms: PoolForPermissions = {
		id: pool.id,
		organizerId: pool.organizerId,
		giftGroupId: pool.giftGroupId,
		status: pool.status,
	}

	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: ActionSchema })

	if (submission.status !== 'success') {
		return data(submission.reply(), { status: 400 })
	}

	const v = submission.value

	switch (v.intent) {
		case Intent.ProposeIdea: {
			// A smart link must point at an item the recipient actually owns —
			// otherwise a contributor could attach arbitrary users' items. The
			// proposer must also be allowed to see the recipient's wishlist
			// (same gate as the picker), so the hidden UI can't be bypassed
			// by POSTing ids directly.
			if (v.wishlistItemId) {
				const allowed = pool.recipientUserId
					? await canViewWishlistOf(userId, pool.recipientUserId)
					: false
				const item = allowed
					? await prisma.wishlistItem.findFirst({
							where: {
								id: v.wishlistItemId,
								ownerId: pool.recipientUserId ?? '',
							},
							select: { id: true },
						})
					: null
				if (!item) {
					throw data({ error: 'Wishlist item not found.' }, { status: 400 })
				}
			}
			await proposeIdea({
				poolId,
				proposedById: userId,
				name: v.name,
				description: v.description || null,
				url: v.url || null,
				estimatedPriceCents: v.estimatedPriceCents ?? null,
				wishlistItemId: v.wishlistItemId || null,
			})
			const { requestId } = await getRequestContext(request)
			queueLogEvent({
				name: 'pool_idea_proposed',
				userId,
				source: 'server',
				requestId,
				properties: {
					poolId,
					fromWishlist: Boolean(v.wishlistItemId),
					hasPrice: v.estimatedPriceCents != null,
				},
			})
			return data(submission.reply({ resetForm: true }))
		}

		case Intent.DeleteIdea: {
			// Only the proposer or someone who can manage the pool can delete an idea
			const idea = await prisma.giftIdea.findFirst({
				where: { id: v.ideaId, poolId },
				select: { proposedById: true },
			})
			if (!idea) {
				throw data({ error: 'Idea not found.' }, { status: 404 })
			}
			if (idea?.proposedById !== userId) {
				const ok = await canManagePool(userId, poolForPerms)
				if (!ok) {
					throw data({ error: 'Not allowed.' }, { status: 403 })
				}
			}
			await deleteIdea(poolId, v.ideaId, userId)
			return data(submission.reply())
		}

		case Intent.CastVote: {
			if (pool.status !== POOL_STATUS.VOTING) {
				throw data({ error: 'Voting is not active.' }, { status: 400 })
			}
			await castVote(poolId, v.ideaId, userId)
			return data(submission.reply())
		}

		case Intent.CallVote: {
			if (!(await canManagePool(userId, poolForPerms))) {
				throw data({ error: 'Not allowed.' }, { status: 403 })
			}
			await callVote(poolId, userId)
			return data(submission.reply())
		}

		case Intent.CloseVote: {
			if (!(await canManagePool(userId, poolForPerms))) {
				throw data({ error: 'Not allowed.' }, { status: 403 })
			}
			if (pool.status !== POOL_STATUS.VOTING) {
				throw data({ error: 'Voting is not active.' }, { status: 400 })
			}
			await closeVote(poolId, userId)
			return data(submission.reply())
		}

		case Intent.ChooseIdea: {
			if (!(await canManagePool(userId, poolForPerms))) {
				throw data({ error: 'Not allowed.' }, { status: 403 })
			}
			await chooseIdea(poolId, v.ideaId, userId, v.finalPriceCents ?? null)
			return data(submission.reply())
		}

		case Intent.UpdateContribution: {
			await updateContribution(poolId, userId, v.contributionCents)
			return data(submission.reply())
		}

		case Intent.AssignPurchaser: {
			if (!(await canManagePool(userId, poolForPerms))) {
				throw data({ error: 'Not allowed.' }, { status: 403 })
			}
			// Ensure the assignee is a contributor
			await addContributor(poolId, v.userId).catch(() => {
				// Already a contributor — that's fine
			})
			await assignPurchaser(poolId, v.userId, userId)
			return data(submission.reply())
		}

		case Intent.AssignDeliverer: {
			if (!(await canManagePool(userId, poolForPerms))) {
				throw data({ error: 'Not allowed.' }, { status: 403 })
			}
			await addContributor(poolId, v.userId).catch(() => {})
			await assignDeliverer(poolId, v.userId, userId)
			return data(submission.reply())
		}

		case Intent.MarkPurchased: {
			if (pool.purchaserId !== userId) {
				throw data({ error: 'Only the purchaser can mark this.' }, { status: 403 })
			}
			await markPurchased(poolId, userId)
			return data(submission.reply())
		}

		case Intent.MarkDelivered: {
			if (pool.delivererId !== userId) {
				throw data({ error: 'Only the deliverer can mark this.' }, { status: 403 })
			}
			await markDelivered(poolId, userId)
			return data(submission.reply())
		}

		case Intent.MarkPaid: {
			// Only the purchaser marks others as paid
			if (pool.purchaserId !== userId) {
				throw data({ error: 'Only the purchaser can mark payments.' }, { status: 403 })
			}
			await markContributorPaid(poolId, v.targetUserId, v.hasPaid)
			return data(submission.reply())
		}

		case Intent.UpdateFinalPrice: {
			if (!(await canManagePool(userId, poolForPerms))) {
				throw data({ error: 'Not allowed.' }, { status: 403 })
			}
			await updateFinalPrice(poolId, v.finalPriceCents, userId)
			return data(submission.reply())
		}

		case Intent.GenerateInvite: {
			if (!(await canManagePool(userId, poolForPerms))) {
				throw data({ error: 'Not allowed.' }, { status: 403 })
			}
			const code = await generatePoolInviteCode(poolId)
			const origin = new URL(request.url).origin
			return data({ inviteUrl: `${origin}/pools/join/${code}` })
		}

		case Intent.RemoveContributor: {
			if (!(await canManagePool(userId, poolForPerms))) {
				throw data({ error: 'Not allowed.' }, { status: 403 })
			}
			await removeContributor(poolId, v.userId, userId)
			return data(submission.reply())
		}

		case Intent.LeavePool: {
			if (pool.organizerId === userId) {
				throw data(
					{ error: 'The organizer cannot leave the pool. Transfer ownership or delete it.' },
					{ status: 400 },
				)
			}
			await removeContributor(poolId, userId, userId)
			return redirectWithToast('/pools', {
				type: 'success',
				title: 'Left pool',
				description: 'You have left the pool.',
			})
		}

		case Intent.CancelPool: {
			if (!(await canManagePool(userId, poolForPerms))) {
				throw data({ error: 'Not allowed.' }, { status: 403 })
			}
			await cancelPool(poolId, userId)
			return data(submission.reply())
		}

		case Intent.DeletePool: {
			if (!isPoolOrganizer(userId, poolForPerms)) {
				throw data({ error: 'Only the organizer can delete a pool.' }, { status: 403 })
			}
			await deletePool(poolId, userId)
			// If the pool belonged to a group, send the organizer back there
			// rather than to the global pools list. Matches the Cancel button
			// on /pools/new when launched from a group context.
			const redirectTo = pool.giftGroupId
				? `/groups/${pool.giftGroupId}`
				: '/pools'
			return redirectWithToast(redirectTo, {
				type: 'success',
				title: 'Pool deleted',
				description: 'The pool has been deleted.',
			})
		}
	}
}
