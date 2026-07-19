import { prisma } from '#app/utils/db.server.ts';
import { ACTIVE_POOL_STATUSES } from '#app/utils/pool-constants.ts';

// Home "For you" temporal action model (handoff §6.2 / §10.3): at most three
// highest-value next actions, ranked by responsibility then time, built from
// current domain queries only. No synthetic activity, no invented urgency.

export type ForYouAction = {
  id: string;
  kind: 'buy' | 'deliver' | 'vote' | 'settle' | 'plan';
  title: string;
  detail: string | null;
  href: string;
};

export type UpcomingOccasion = {
  id: string;
  name: string;
  username: string | null;
  dateLabel: string;
};

// Responsibility outranks ambient opportunity: a task someone is waiting on
// (buy, deliver) beats a vote, which beats settling up, which beats planning.
const KIND_RANK: Record<ForYouAction['kind'], number> = {
  buy: 0,
  deliver: 1,
  vote: 2,
  settle: 3,
  plan: 4,
};

export const FOR_YOU_LIMIT = 3;

export async function getForYouActions(
  userId: string,
  occasions: UpcomingOccasion[],
): Promise<ForYouAction[]> {
  const pools = await prisma.pool.findMany({
    where: {
      contributors: { some: { userId } },
      status: { in: ['VOTING', 'DECIDED', 'PURCHASED'] },
      // Same recipient-exclusion defense as the home loader.
      OR: [{ recipientUserId: null }, { recipientUserId: { not: userId } }],
    },
    select: {
      id: true,
      title: true,
      status: true,
      decisionMode: true,
      purchaserId: true,
      delivererId: true,
      contributors: { where: { userId }, select: { hasPaid: true } },
    },
  });

  const votePoolIds = pools
    .filter((p) => p.status === 'VOTING' && p.decisionMode === 'VOTE')
    .map((p) => p.id);
  const myVotes = votePoolIds.length
    ? await prisma.ideaVote.findMany({
        where: { voterId: userId, poolId: { in: votePoolIds } },
        select: { poolId: true },
      })
    : [];
  const votedPoolIds = new Set(myVotes.map((v) => v.poolId));

  const actions: ForYouAction[] = [];
  for (const pool of pools) {
    const href = `/pools/${pool.id}`;
    if (pool.status === 'DECIDED' && pool.purchaserId === userId) {
      actions.push({
        id: `buy:${pool.id}`,
        kind: 'buy',
        title: 'Buy the gift',
        detail: pool.title,
        href,
      });
    } else if (pool.status === 'PURCHASED' && pool.delivererId === userId) {
      actions.push({
        id: `deliver:${pool.id}`,
        kind: 'deliver',
        title: 'Deliver the gift',
        detail: pool.title,
        href,
      });
    } else if (
      pool.status === 'VOTING' &&
      pool.decisionMode === 'VOTE' &&
      !votedPoolIds.has(pool.id)
    ) {
      actions.push({
        id: `vote:${pool.id}`,
        kind: 'vote',
        title: 'Vote on the gift',
        detail: pool.title,
        href,
      });
    } else if (
      pool.status === 'PURCHASED' &&
      pool.purchaserId !== userId &&
      pool.contributors[0]?.hasPaid === false
    ) {
      // The viewer's own share status only — payment happens directly
      // outside Gift Pool, so the action just points at the workspace.
      actions.push({
        id: `settle:${pool.id}`,
        kind: 'settle',
        title: 'Settle your share',
        detail: pool.title,
        href,
      });
    }
  }

  // Upcoming occasions with no pool the viewer is already part of → plan.
  const occasionIds = occasions.map((o) => o.id);
  const plannedRecipients = occasionIds.length
    ? await prisma.pool.findMany({
        where: {
          contributors: { some: { userId } },
          status: { in: ACTIVE_POOL_STATUSES },
          recipientUserId: { in: occasionIds },
        },
        select: { recipientUserId: true },
      })
    : [];
  const plannedIds = new Set(plannedRecipients.map((p) => p.recipientUserId));
  for (const o of occasions) {
    if (plannedIds.has(o.id) || !o.username) continue;
    actions.push({
      id: `plan:${o.id}`,
      kind: 'plan',
      title: `Plan a gift for ${o.name}`,
      detail: `Birthday · ${o.dateLabel}`,
      href: `/users/${o.username}`,
    });
  }

  return actions
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])
    .slice(0, FOR_YOU_LIMIT);
}

export type GiftMemoryEntry = {
  id: string;
  recipientLabel: string;
  giftLabel: string;
  contributorCount: number;
  whenISO: string;
};

// Earned Gift Memory (§6.2 #5): factual completed-gift history the viewer
// participated in. Never synthetic, never recipient sentiment; hidden by the
// UI until it has content.
export async function getRecentGiftMemory(
  userId: string,
): Promise<GiftMemoryEntry[]> {
  const pools = await prisma.pool.findMany({
    where: {
      contributors: { some: { userId } },
      status: 'DELIVERED',
      OR: [{ recipientUserId: null }, { recipientUserId: { not: userId } }],
    },
    orderBy: { updatedAt: 'desc' },
    take: 3,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      recipientName: true,
      recipientUser: { select: { name: true, username: true } },
      chosenIdea: { select: { name: true } },
      _count: { select: { contributors: true } },
    },
  });
  return pools.map((p) => ({
    id: p.id,
    recipientLabel:
      p.recipientName ??
      p.recipientUser?.name ??
      p.recipientUser?.username ??
      'a friend',
    giftLabel: p.chosenIdea?.name ?? p.title,
    contributorCount: p._count.contributors,
    whenISO: p.updatedAt.toISOString(),
  }));
}
