import { parseWithZod } from '@conform-to/zod';
import {
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { z } from 'zod';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { canViewWishlistOf } from '#app/utils/friends.server.ts';
import {
  getNotificationTopicDefinition,
  getNotificationTopicsForContext,
} from '#app/utils/notification-catalog.ts';
import { getContextNotificationAwareness } from '#app/utils/notification-preferences.server.ts';
import {
  getOrganizerNudgeAvailability,
  ORGANIZER_NUDGE_KINDS,
  OrganizerNudgeError,
  type OrganizerNudgeAvailability,
  type OrganizerNudgeKind,
} from '#app/utils/organizer-nudges.server.ts';
import {
  OCCASION_TYPE,
  POOL_STATUS,
  type OccasionType,
} from '#app/utils/pool-constants.ts';
import {
  canManagePool,
  isPoolOrganizer,
  requirePoolContributor,
  type PoolForPermissions,
} from '#app/utils/pool-permissions.server.ts';
import {
  projectContributionBreakdown,
  projectPoolContributors,
} from '#app/utils/pool-projections.server.ts';
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
  updatePool,
  type UpdatePoolInput,
} from '#app/utils/pool.server.ts';
import { dollarsToCents } from '#app/utils/price.ts';
import { getRequestContext } from '#app/utils/request-context.server.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';
import { type ClaimDisclosure } from '#app/utils/wishlist-claim-disclosure.ts';
import {
  loadClaimStates,
  loadIdeaClaimConflicts,
} from '#app/utils/wishlist-claims.server.ts';

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const poolId = params.poolId!;

  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    select: poolSelect,
  });

  // Privacy: the recipient of a pool must never be able to confirm it exists.
  // Return 404 (indistinguishable from a nonexistent pool) rather than 403.
  // Non-contributors also get 404 so the recipient case is not distinguishable
  // from any other unauthorized viewer.
  if (!pool || pool.recipientUserId === userId) {
    throw new Response('Not Found', { status: 404 });
  }

  const isContributor = pool.contributors.some((c) => c.userId === userId);
  if (!isContributor) {
    throw new Response('Not Found', { status: 404 });
  }

  const poolForPerms: PoolForPermissions = {
    id: pool.id,
    organizerId: pool.organizerId,
    giftGroupId: pool.giftGroupId,
    status: pool.status,
  };

  const isOrganizer = isPoolOrganizer(userId, poolForPerms);
  const canManage = await canManagePool(userId, poolForPerms);

  // Viewer's own contributor record
  const viewer = pool.contributors.find((c) => c.userId === userId) ?? null;

  // ADR 0001 projection: individual Contribution Limits never leave the
  // server. The client gets identity rows (+ limit-missing flags for
  // managers) and the aggregate Available Budget only. The viewer's own
  // record still ships in full via `viewer` above.
  const projected = projectPoolContributors({
    contributors: pool.contributors,
    canManage,
  });

  // My vote (if any). Runs alongside the idea claim-conflict lookup below —
  // neither depends on the other's result.
  const [myVote, ideaClaimConflicts] = await Promise.all([
    prisma.ideaVote.findUnique({
      where: { poolId_voterId: { poolId, voterId: userId } },
      select: { ideaId: true },
    }),
    // Per-idea claim conflicts (badge surface): flags any proposed idea whose
    // linked wishlist item is already claimed by someone other than this
    // pool. Shipped as an array of [ideaId, disclosure] pairs — loader data
    // round-trips through the client as JSON, and a Map doesn't survive that.
    loadIdeaClaimConflicts(poolId, userId),
  ]);
  const ideaClaimConflictEntries = Array.from(ideaClaimConflicts.entries());

  // Contribution breakdown (only meaningful when DECIDED+). Projected per
  // viewer: full rows for the purchaser, own-share-only for everyone else.
  const contributionBreakdown = projectContributionBreakdown(
    pool.status === POOL_STATUS.DECIDED ||
      pool.status === POOL_STATUS.PURCHASED ||
      pool.status === POOL_STATUS.DELIVERED
      ? await getContributionBreakdown(poolId)
      : null,
    userId,
    pool.purchaserId,
  );

  // Build invite URL if code exists
  const inviteUrl = pool.inviteCode
    ? `${new URL(request.url).origin}/pools/join/${pool.inviteCode}`
    : null;

  // Recipient's active wishlist items power the "from their wishlist" picker
  // in the propose form. Only fetched while ideas can still be proposed, and
  // gated per viewer on the recipient's wishlistVisibility — joining a pool
  // (e.g. via invite code) must not bypass the recipient's privacy setting.
  const ideasOpen =
    pool.status === POOL_STATUS.OPEN || pool.status === POOL_STATUS.VOTING;
  const recipientWishlistItemsBase =
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
      : [];

  // Picker chip (Task 13 part 2): resolved at the 'row' surface, which
  // resolveClaimDisclosure forces to a fully anonymous "Already claimed"
  // regardless of viewer relationship — the picker is a compose-time list
  // and must never name a person, pool, or group. `isOwner: false` is safe
  // unconditionally here: the recipient is already 404'd out of this loader
  // above, so every viewer reaching this line is a contributor, never the
  // owner.
  const pickerClaimStates: Map<string, ClaimDisclosure> =
    recipientWishlistItemsBase.length > 0
      ? await loadClaimStates(
          recipientWishlistItemsBase.map((item) => item.id),
          { userId, isOwner: false },
          'row',
        )
      : new Map();

  const recipientWishlistItems = recipientWishlistItemsBase.map((item) => ({
    ...item,
    claimDisclosure: pickerClaimStates.get(item.id) ?? null,
  }));

  const organizerReminderKinds: OrganizerNudgeKind[] = [];
  if (canManage && ideasOpen) {
    organizerReminderKinds.push(ORGANIZER_NUDGE_KINDS.CONTRIBUTION);
  }
  if (canManage && pool.status === POOL_STATUS.VOTING) {
    organizerReminderKinds.push(ORGANIZER_NUDGE_KINDS.VOTE);
  }
  if (
    canManage &&
    pool.status === POOL_STATUS.DECIDED &&
    pool.purchaserId &&
    pool.purchaserId !== userId
  ) {
    organizerReminderKinds.push(ORGANIZER_NUDGE_KINDS.PURCHASE);
  }
  if (
    canManage &&
    pool.status === POOL_STATUS.PURCHASED &&
    pool.delivererId &&
    pool.delivererId !== userId
  ) {
    organizerReminderKinds.push(ORGANIZER_NUDGE_KINDS.DELIVERY);
  }
  const organizerReminderEntries = (
    await Promise.all(
      organizerReminderKinds.map((kind) =>
        getOrganizerReminderEntry({ poolId, senderId: userId, kind }),
      ),
    )
  ).filter((entry) => entry !== null);
  const organizerReminderStates = Object.fromEntries(
    organizerReminderEntries,
  ) as Partial<Record<OrganizerNudgeKind, OrganizerNudgeAvailability>>;

  return {
    pool: { ...pool, contributors: projected.contributors },
    viewer,
    isOrganizer,
    canManage,
    availableBudgetCents: projected.availableBudgetCents,
    limitsSetCount: projected.limitsSetCount,
    myVoteIdeaId: myVote?.ideaId ?? null,
    contributionBreakdown,
    inviteUrl,
    recipientWishlistItems,
    ideaClaimConflicts: ideaClaimConflictEntries,
    organizerReminderStates,
    notificationAwareness: await getContextNotificationAwareness({
      userId,
      context: { kind: 'POOL', poolId },
      requireAccess: false,
    }),
    notificationTopics: getNotificationTopicsForContext('POOL').map(
      (topic) => ({
        topic,
        ...getNotificationTopicDefinition(topic),
      }),
    ),
  };
}

type OrganizerReminderEntry = readonly [
  OrganizerNudgeKind,
  OrganizerNudgeAvailability,
];

async function getOrganizerReminderEntry({
  poolId,
  senderId,
  kind,
}: {
  poolId: string;
  senderId: string;
  kind: OrganizerNudgeKind;
}): Promise<OrganizerReminderEntry | null> {
  try {
    return [
      kind,
      await getOrganizerNudgeAvailability({ poolId, senderId, kind }),
    ];
  } catch (error) {
    if (isStaleOrganizerReminderError(error)) return null;
    throw error;
  }
}

function isStaleOrganizerReminderError(error: unknown) {
  return (
    error instanceof OrganizerNudgeError &&
    (error.code === 'POOL_NOT_FOUND' ||
      error.code === 'FORBIDDEN' ||
      error.code === 'TASK_UNAVAILABLE')
  );
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
  UpdateDetails = 'update-pool-details',
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const PoolIdSchema = z.object({ poolId: z.string() });
const OptionalDollarAmountSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().min(0).transform(dollarsToCents).optional(),
);

const ProposeIdeaSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.ProposeIdea),
  name: z.string().min(1, 'Give the idea a name').max(200),
  description: z.string().max(500).optional(),
  url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  // User enters dollars (e.g. "9.99"); we convert to cents before saving.
  estimatedPriceCents: OptionalDollarAmountSchema,
  wishlistItemId: z.string().optional(),
});

const DeleteIdeaSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.DeleteIdea),
  ideaId: z.string(),
});

const CastVoteSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.CastVote),
  ideaId: z.string(),
});

const CallVoteSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.CallVote),
});

const CloseVoteSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.CloseVote),
});

const ChooseIdeaSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.ChooseIdea),
  ideaId: z.string(),
  finalPriceCents: z.coerce.number().int().min(0).optional(),
});

const UpdateContributionSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.UpdateContribution),
  // User enters dollars (e.g. "30.00"); we convert to cents before saving.
  contributionCents: z.coerce.number().min(0).transform(dollarsToCents),
});

const AssignPurchaserSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.AssignPurchaser),
  userId: z.string(),
});

const AssignDelivererSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.AssignDeliverer),
  userId: z.string(),
});

const MarkPurchasedSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.MarkPurchased),
});

const MarkDeliveredSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.MarkDelivered),
});

const MarkPaidSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.MarkPaid),
  targetUserId: z.string(),
  hasPaid: z.enum(['true', 'false']).transform((v) => v === 'true'),
});

const UpdateFinalPriceSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.UpdateFinalPrice),
  // User enters dollars (e.g. "25.00"); we convert to cents before saving.
  finalPriceCents: z.coerce.number().min(0).transform(dollarsToCents),
});

const GenerateInviteSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.GenerateInvite),
});

const RemoveContributorSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.RemoveContributor),
  userId: z.string(),
});

const LeavePoolSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.LeavePool),
});

const CancelPoolSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.CancelPool),
});

const DeletePoolSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.DeletePool),
});

const UpdateDetailsSchema = PoolIdSchema.extend({
  intent: z.literal(Intent.UpdateDetails),
  title: z.string().min(1, 'Give the pool a title').max(200),
  occasionType: z.enum(
    Object.values(OCCASION_TYPE) as [OccasionType, ...OccasionType[]],
  ),
  eventDate: z.string().optional(),
  // Optional: the editor disables (and so omits) this control once the pool is
  // past OPEN, and the handler only applies it while OPEN anyway. Requiring it
  // would block title/occasion/date edits on VOTING/DECIDED/PURCHASED pools.
  decisionMode: z.enum(['ORGANIZER_PICKS', 'VOTE']).optional(),
});

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
  .or(UpdateDetailsSchema);

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const poolId = params.poolId!;

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
  });

  // Privacy: same invariant as the loader — recipient never sees/mutates.
  if (!pool || pool.recipientUserId === userId) {
    throw data({ error: 'Pool not found.' }, { status: 404 });
  }

  await requirePoolContributor(userId, poolId);

  const poolForPerms: PoolForPermissions = {
    id: pool.id,
    organizerId: pool.organizerId,
    giftGroupId: pool.giftGroupId,
    status: pool.status,
  };

  const formData = await request.formData();
  const submission = parseWithZod(formData, { schema: ActionSchema });

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 });
  }

  const v = submission.value;

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
          : false;
        const item = allowed
          ? await prisma.wishlistItem.findFirst({
              where: {
                id: v.wishlistItemId,
                ownerId: pool.recipientUserId ?? '',
              },
              select: { id: true },
            })
          : null;
        if (!item) {
          throw data({ error: 'Wishlist item not found.' }, { status: 400 });
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
      });
      const { requestId } = await getRequestContext(request);
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
      });
      return data(submission.reply({ resetForm: true }));
    }

    case Intent.DeleteIdea: {
      // Only the proposer or someone who can manage the pool can delete an idea
      const idea = await prisma.giftIdea.findFirst({
        where: { id: v.ideaId, poolId },
        select: { proposedById: true },
      });
      if (!idea) {
        throw data({ error: 'Idea not found.' }, { status: 404 });
      }
      if (idea?.proposedById !== userId) {
        const ok = await canManagePool(userId, poolForPerms);
        if (!ok) {
          throw data({ error: 'Not allowed.' }, { status: 403 });
        }
      }
      await deleteIdea(poolId, v.ideaId, userId);
      return data(submission.reply());
    }

    case Intent.CastVote: {
      if (pool.status !== POOL_STATUS.VOTING) {
        throw data({ error: 'Voting is not active.' }, { status: 400 });
      }
      await castVote(poolId, v.ideaId, userId);
      return data(submission.reply());
    }

    case Intent.CallVote: {
      if (!(await canManagePool(userId, poolForPerms))) {
        throw data({ error: 'Not allowed.' }, { status: 403 });
      }
      await callVote(poolId, userId);
      return data(submission.reply());
    }

    case Intent.CloseVote: {
      if (!(await canManagePool(userId, poolForPerms))) {
        throw data({ error: 'Not allowed.' }, { status: 403 });
      }
      if (pool.status !== POOL_STATUS.VOTING) {
        throw data({ error: 'Voting is not active.' }, { status: 400 });
      }
      await closeVote(poolId, userId);
      return data(submission.reply());
    }

    case Intent.ChooseIdea: {
      if (!(await canManagePool(userId, poolForPerms))) {
        throw data({ error: 'Not allowed.' }, { status: 403 });
      }
      const { claimedItemId } = await chooseIdea(
        poolId,
        v.ideaId,
        userId,
        v.finalPriceCents ?? null,
      );
      // Threaded through so the idea card can toast when this decision
      // silently claimed a previously-free wishlist item — otherwise the
      // feature is invisible to the person who caused it.
      return data({ ...submission.reply(), claimedItemId });
    }

    case Intent.UpdateContribution: {
      await updateContribution(poolId, userId, v.contributionCents);
      return data(submission.reply());
    }

    case Intent.AssignPurchaser: {
      if (!(await canManagePool(userId, poolForPerms))) {
        throw data({ error: 'Not allowed.' }, { status: 403 });
      }
      // Ensure the assignee is a contributor
      await addContributor(poolId, v.userId).catch(() => {
        // Already a contributor — that's fine
      });
      await assignPurchaser(poolId, v.userId, userId);
      return data(submission.reply());
    }

    case Intent.AssignDeliverer: {
      if (!(await canManagePool(userId, poolForPerms))) {
        throw data({ error: 'Not allowed.' }, { status: 403 });
      }
      await addContributor(poolId, v.userId).catch(() => {});
      await assignDeliverer(poolId, v.userId, userId);
      return data(submission.reply());
    }

    case Intent.MarkPurchased: {
      if (pool.purchaserId !== userId) {
        throw data(
          { error: 'Only the purchaser can mark this.' },
          { status: 403 },
        );
      }
      await markPurchased(poolId, userId);
      return data(submission.reply());
    }

    case Intent.MarkDelivered: {
      if (pool.delivererId !== userId) {
        throw data(
          { error: 'Only the deliverer can mark this.' },
          { status: 403 },
        );
      }
      await markDelivered(poolId, userId);
      return data(submission.reply());
    }

    case Intent.MarkPaid: {
      // Only the purchaser marks others as paid
      if (pool.purchaserId !== userId) {
        throw data(
          { error: 'Only the purchaser can mark payments.' },
          { status: 403 },
        );
      }
      await markContributorPaid(poolId, v.targetUserId, v.hasPaid);
      return data(submission.reply());
    }

    case Intent.UpdateFinalPrice: {
      if (!(await canManagePool(userId, poolForPerms))) {
        throw data({ error: 'Not allowed.' }, { status: 403 });
      }
      await updateFinalPrice(poolId, v.finalPriceCents, userId);
      return data(submission.reply());
    }

    case Intent.GenerateInvite: {
      if (!(await canManagePool(userId, poolForPerms))) {
        throw data({ error: 'Not allowed.' }, { status: 403 });
      }
      const code = await generatePoolInviteCode(poolId);
      const origin = new URL(request.url).origin;
      return data({ inviteUrl: `${origin}/pools/join/${code}` });
    }

    case Intent.RemoveContributor: {
      if (!(await canManagePool(userId, poolForPerms))) {
        throw data({ error: 'Not allowed.' }, { status: 403 });
      }
      await removeContributor(poolId, v.userId, userId);
      return data(submission.reply());
    }

    case Intent.LeavePool: {
      if (pool.organizerId === userId) {
        throw data(
          {
            error:
              'The organizer cannot leave the pool. Transfer ownership or delete it.',
          },
          { status: 400 },
        );
      }
      await removeContributor(poolId, userId, userId);
      return redirectWithToast('/pools', {
        type: 'success',
        title: 'Left pool',
        description: 'You have left the pool.',
      });
    }

    case Intent.CancelPool: {
      if (!(await canManagePool(userId, poolForPerms))) {
        throw data({ error: 'Not allowed.' }, { status: 403 });
      }
      await cancelPool(poolId, userId);
      return data(submission.reply());
    }

    case Intent.DeletePool: {
      if (!isPoolOrganizer(userId, poolForPerms)) {
        throw data(
          { error: 'Only the organizer can delete a pool.' },
          { status: 403 },
        );
      }
      await deletePool(poolId, userId);
      // If the pool belonged to a group, send the organizer back there
      // rather than to the global pools list. Matches the Cancel button
      // on /pools/new when launched from a group context.
      const redirectTo = pool.giftGroupId
        ? `/groups/${pool.giftGroupId}`
        : '/pools';
      return redirectWithToast(redirectTo, {
        type: 'success',
        title: 'Pool deleted',
        description: 'The pool has been deleted.',
      });
    }

    case Intent.UpdateDetails: {
      if (!(await canManagePool(userId, poolForPerms))) {
        throw data({ error: 'Not allowed.' }, { status: 403 });
      }
      // Pool details are editable until the pool closes out.
      if (
        pool.status === POOL_STATUS.DELIVERED ||
        pool.status === POOL_STATUS.CANCELLED
      ) {
        throw data({ error: 'This pool is closed.' }, { status: 400 });
      }
      const updates: UpdatePoolInput = {
        title: v.title,
        occasionType: v.occasionType,
        eventDate: v.eventDate ? new Date(v.eventDate) : null,
      };
      // The gift-selection method only changes cleanly before a vote is
      // called — once VOTING/DECIDED, switching modes is ambiguous.
      if (pool.status === POOL_STATUS.OPEN && v.decisionMode) {
        updates.decisionMode = v.decisionMode;
      }
      await updatePool(poolId, userId, updates);
      return data(submission.reply());
    }
  }
}
