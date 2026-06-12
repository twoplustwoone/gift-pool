import { queueLogEvent } from './analytics.server.ts';
import { cache, cachified, lruCache } from './cache.server.ts';
import { prisma } from './db.server.ts';
import { type FeedbackStatus } from './feedback-validation.ts';
import { POOL_STATUS, type PoolStatus } from './pool-constants.ts';

const SIXTY_SECONDS = 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

const STALE_FRIEND_REQUEST_DAYS = 30;
const REJECTED_FRIEND_REQUEST_RETENTION_DAYS = 90;
const STUCK_VOTING_DAYS = 7;
const STUCK_DECIDED_DAYS = 14;
const PENDING_FRIEND_REQUEST_ALERT_DAYS = 7;

// ---------------------------------------------------------------------------
// Overview aggregates — cached 60s in lruCache (instance-local, not SQLite
// cache). Short TTL + instance-local avoids LiteFS replication lag on the
// "purge → preview count" interaction on the Ops page.
// ---------------------------------------------------------------------------

export type OverviewCounts = {
  users: {
    total: number;
    last24h: number;
    last7d: number;
    last30d: number;
  };
  pools: {
    total: number;
    byStatus: Record<PoolStatus, number>;
    stuck: number;
    active: number;
  };
  wishlist: {
    items: number;
    active: number;
    archived: number;
    purchases: number;
  };
  friendships: {
    total: number;
    pendingRequestsOverThreshold: number;
  };
  notifications: {
    unread24h: number;
  };
};

export async function getOverviewCounts(): Promise<OverviewCounts> {
  return cachified({
    key: 'admin:overview:counts:v1',
    cache: lruCache,
    ttl: SIXTY_SECONDS,
    getFreshValue: async () => {
      const now = new Date();
      const oneDay = new Date(now.getTime() - DAY_MS);
      const sevenDays = new Date(now.getTime() - 7 * DAY_MS);
      const thirtyDays = new Date(now.getTime() - 30 * DAY_MS);
      const stuckVotingCutoff = new Date(
        now.getTime() - STUCK_VOTING_DAYS * DAY_MS,
      );
      const stuckDecidedCutoff = new Date(
        now.getTime() - STUCK_DECIDED_DAYS * DAY_MS,
      );
      const pendingFriendRequestCutoff = new Date(
        now.getTime() - PENDING_FRIEND_REQUEST_ALERT_DAYS * DAY_MS,
      );

      const [
        totalUsers,
        usersLast24h,
        usersLast7d,
        usersLast30d,
        totalPools,
        poolStatusGroups,
        stuckOpenPools,
        stuckVotingPools,
        stuckDecidedPools,
        totalWishlistItems,
        activeWishlistItems,
        archivedWishlistItems,
        totalPurchases,
        totalFriendships,
        pendingFriendRequestsAlert,
        unreadNotifications24h,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: oneDay } } }),
        prisma.user.count({ where: { createdAt: { gte: sevenDays } } }),
        prisma.user.count({ where: { createdAt: { gte: thirtyDays } } }),
        prisma.pool.count(),
        prisma.pool.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.pool.count({
          where: { status: POOL_STATUS.OPEN, eventDate: { lt: now } },
        }),
        prisma.pool.count({
          where: {
            status: POOL_STATUS.VOTING,
            updatedAt: { lt: stuckVotingCutoff },
            votes: { none: {} },
          },
        }),
        prisma.pool.count({
          where: {
            status: POOL_STATUS.DECIDED,
            updatedAt: { lt: stuckDecidedCutoff },
          },
        }),
        prisma.wishlistItem.count(),
        prisma.wishlistItem.count({ where: { status: 'ACTIVE' } }),
        prisma.wishlistItem.count({ where: { status: 'ARCHIVED' } }),
        prisma.wishlistPurchase.count(),
        prisma.friendship.count(),
        // `updatedAt`, not `createdAt`: sendFriendRequest upserts an
        // existing row and flips status back to PENDING, so an old row
        // can become newly active today. Staleness tracks inactivity.
        prisma.friendRequest.count({
          where: {
            status: 'PENDING',
            updatedAt: { lt: pendingFriendRequestCutoff },
          },
        }),
        prisma.notification.count({
          where: {
            status: 'UNREAD',
            createdAt: { gte: oneDay },
          },
        }),
      ]);

      const byStatus: Record<PoolStatus, number> = {
        OPEN: 0,
        VOTING: 0,
        DECIDED: 0,
        PURCHASED: 0,
        DELIVERED: 0,
        CANCELLED: 0,
      };
      for (const row of poolStatusGroups) {
        const status = row.status as PoolStatus;
        if (status in byStatus) {
          byStatus[status] = row._count._all;
        }
      }

      const activePools =
        byStatus.OPEN + byStatus.VOTING + byStatus.DECIDED + byStatus.PURCHASED;
      const stuck = stuckOpenPools + stuckVotingPools + stuckDecidedPools;

      return {
        users: {
          total: totalUsers,
          last24h: usersLast24h,
          last7d: usersLast7d,
          last30d: usersLast30d,
        },
        pools: {
          total: totalPools,
          byStatus,
          stuck,
          active: activePools,
        },
        wishlist: {
          items: totalWishlistItems,
          active: activeWishlistItems,
          archived: archivedWishlistItems,
          purchases: totalPurchases,
        },
        friendships: {
          total: totalFriendships,
          pendingRequestsOverThreshold: pendingFriendRequestsAlert,
        },
        notifications: {
          unread24h: unreadNotifications24h,
        },
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Stuck pools — the alert list on the overview + the default tab in Phase 3.
// A pool is "stuck" if it meets one of these conditions:
//   - OPEN with eventDate already past
//   - VOTING for >7 days with zero votes cast
//   - DECIDED for >14 days (never advanced to PURCHASED)
// ---------------------------------------------------------------------------

export type StuckPool = {
  id: string;
  title: string;
  status: PoolStatus;
  occasionType: string;
  eventDate: Date | null;
  updatedAt: Date;
  inviteCode: string | null;
  reason: 'open_overdue' | 'voting_stalled' | 'decided_stalled';
  organizer: {
    id: string;
    username: string;
    name: string | null;
  };
  contributorCount: number;
};

export async function getStuckPools(limit = 10): Promise<StuckPool[]> {
  return cachified({
    key: `admin:overview:stuck-pools:v1:${limit}`,
    cache: lruCache,
    ttl: SIXTY_SECONDS,
    getFreshValue: async () => {
      const now = new Date();
      const stuckVotingCutoff = new Date(
        now.getTime() - STUCK_VOTING_DAYS * DAY_MS,
      );
      const stuckDecidedCutoff = new Date(
        now.getTime() - STUCK_DECIDED_DAYS * DAY_MS,
      );

      const pools = await prisma.pool.findMany({
        where: {
          OR: [
            {
              status: POOL_STATUS.OPEN,
              eventDate: { lt: now },
            },
            {
              status: POOL_STATUS.VOTING,
              updatedAt: { lt: stuckVotingCutoff },
              votes: { none: {} },
            },
            {
              status: POOL_STATUS.DECIDED,
              updatedAt: { lt: stuckDecidedCutoff },
            },
          ],
        },
        orderBy: { updatedAt: 'asc' },
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          occasionType: true,
          eventDate: true,
          updatedAt: true,
          inviteCode: true,
          organizer: {
            select: { id: true, username: true, name: true },
          },
          _count: { select: { contributors: true } },
        },
      });

      return pools.map((pool) => {
        const status = pool.status as PoolStatus;
        let reason: StuckPool['reason'];
        if (status === POOL_STATUS.OPEN) {
          reason = 'open_overdue';
        } else if (status === POOL_STATUS.VOTING) {
          reason = 'voting_stalled';
        } else {
          reason = 'decided_stalled';
        }
        return {
          id: pool.id,
          title: pool.title,
          status,
          occasionType: pool.occasionType,
          eventDate: pool.eventDate,
          updatedAt: pool.updatedAt,
          inviteCode: pool.inviteCode,
          reason,
          organizer: pool.organizer,
          contributorCount: pool._count.contributors,
        };
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Cleanup preview counts — each count is a single cheap COUNT query.
// Cached 60s via lruCache. After a purge, we invalidate the cache key so the
// next request shows zero immediately (see purge helpers below).
// ---------------------------------------------------------------------------

export type CleanupPreviewCounts = {
  expiredVerifications: number;
  expiredSessions: number;
  stalePendingFriendRequests: number;
  staleRejectedFriendRequests: number;
  revokedOrExpiredGroupInvitations: number;
  expiredGroupBans: number;
};

const CLEANUP_PREVIEW_KEY = 'admin:overview:cleanup-preview:v1';

export async function getCleanupPreviewCounts(): Promise<CleanupPreviewCounts> {
  return cachified({
    key: CLEANUP_PREVIEW_KEY,
    cache: lruCache,
    ttl: SIXTY_SECONDS,
    getFreshValue: async () => {
      const now = new Date();
      const staleFriendReqCutoff = daysAgo(STALE_FRIEND_REQUEST_DAYS);
      const rejectedRetentionCutoff = daysAgo(
        REJECTED_FRIEND_REQUEST_RETENTION_DAYS,
      );

      const [
        expiredVerifications,
        expiredSessions,
        stalePendingFriendRequests,
        staleRejectedFriendRequests,
        revokedOrExpiredGroupInvitations,
        expiredGroupBans,
      ] = await Promise.all([
        prisma.verification.count({
          where: { expiresAt: { lt: now } },
        }),
        prisma.session.count({
          where: { expirationDate: { lt: now } },
        }),
        // `updatedAt`, not `createdAt`: sendFriendRequest upserts
        // existing rows and flips status back to PENDING, so a
        // newly-active row could have a stale createdAt. Staleness
        // means "no activity in N days", not "row is N days old".
        prisma.friendRequest.count({
          where: {
            status: 'PENDING',
            updatedAt: { lt: staleFriendReqCutoff },
          },
        }),
        prisma.friendRequest.count({
          where: {
            status: 'REJECTED',
            updatedAt: { lt: rejectedRetentionCutoff },
          },
        }),
        prisma.groupInvitation.count({
          where: {
            usedCount: 0,
            OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: now } }],
          },
        }),
        prisma.usersInGiftGroups.count({
          where: { bannedUntil: { lt: now, not: null } },
        }),
      ]);

      return {
        expiredVerifications,
        expiredSessions,
        stalePendingFriendRequests,
        staleRejectedFriendRequests,
        revokedOrExpiredGroupInvitations,
        expiredGroupBans,
      };
    },
  });
}

function invalidateCleanupPreviewCache() {
  lruCache.delete(CLEANUP_PREVIEW_KEY);
  lruCache.delete('admin:overview:counts:v1');
}

// ---------------------------------------------------------------------------
// Recent activity feed — union of four table createdAts over the last 48h.
// Not cached — hits the same tables the overview counts hit, and it's cheap
// at current scale. Promote to lruCache if this grows.
// ---------------------------------------------------------------------------

export type RecentActivityRow = {
  kind: 'user' | 'pool' | 'wishlist_item' | 'friendship';
  id: string;
  actor: { id: string; username: string; name: string | null } | null;
  subject: string;
  timestamp: Date;
};

export async function getRecentActivity(
  limit = 15,
): Promise<RecentActivityRow[]> {
  const since = hoursAgo(48);

  const [users, pools, wishlistItems, friendships] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, username: true, name: true, createdAt: true },
    }),
    prisma.pool.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        createdAt: true,
        organizer: { select: { id: true, username: true, name: true } },
      },
    }),
    prisma.wishlistItem.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        createdAt: true,
        owner: { select: { id: true, username: true, name: true } },
      },
    }),
    prisma.friendship.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        userA: { select: { id: true, username: true, name: true } },
        userB: { select: { id: true, username: true, name: true } },
      },
    }),
  ]);

  const rows: RecentActivityRow[] = [
    ...users.map<RecentActivityRow>((user) => ({
      kind: 'user',
      id: user.id,
      actor: { id: user.id, username: user.username, name: user.name },
      subject: 'signed up',
      timestamp: user.createdAt,
    })),
    ...pools.map<RecentActivityRow>((pool) => ({
      kind: 'pool',
      id: pool.id,
      actor: pool.organizer,
      subject: `created pool "${pool.title}"`,
      timestamp: pool.createdAt,
    })),
    ...wishlistItems.map<RecentActivityRow>((item) => ({
      kind: 'wishlist_item',
      id: item.id,
      actor: item.owner,
      subject: `added "${item.title}"`,
      timestamp: item.createdAt,
    })),
    ...friendships.map<RecentActivityRow>((f) => ({
      kind: 'friendship',
      id: f.id,
      actor: f.userA,
      subject: `became friends with ${f.userB.username}`,
      timestamp: f.createdAt,
    })),
  ];

  rows.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return rows.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Disk usage — only called from the Ops page. Full-table scan with LENGTH()
// on a BLOB column, so cached 5 minutes and NOT surfaced on the overview.
// ---------------------------------------------------------------------------

export type DiskUsageCounts = {
  wishlistItemTotal: number;
  wishlistItemsWithImage: number;
  wishlistImageBytes: number;
};

export async function getDiskUsageCounts(): Promise<DiskUsageCounts> {
  return cachified({
    key: 'admin:ops:disk-usage:v1',
    cache: lruCache,
    ttl: FIVE_MINUTES,
    getFreshValue: async () => {
      const rows = await prisma.$queryRaw<
        Array<{ total: bigint; withImage: bigint; imageBytes: bigint | null }>
      >`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN image IS NOT NULL THEN 1 ELSE 0 END) AS withImage,
          COALESCE(SUM(LENGTH(image)), 0) AS imageBytes
        FROM WishlistItem
      `;
      const row = rows[0];
      return {
        wishlistItemTotal: Number(row?.total ?? 0),
        wishlistItemsWithImage: Number(row?.withImage ?? 0),
        wishlistImageBytes: Number(row?.imageBytes ?? 0),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Cleanup helpers — each is idempotent. All are single-statement deleteMany
// or updateMany so LiteFS replica forwarding is a straight round-trip.
// Every helper invalidates the cleanup-preview cache key on success so the
// next loader call shows the post-purge state immediately.
// ---------------------------------------------------------------------------

export async function purgeExpiredVerifications(): Promise<{
  deleted: number;
}> {
  const { count } = await prisma.verification.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  invalidateCleanupPreviewCache();
  return { deleted: count };
}

export async function purgeExpiredSessions(): Promise<{ deleted: number }> {
  const { count } = await prisma.session.deleteMany({
    where: { expirationDate: { lt: new Date() } },
  });
  invalidateCleanupPreviewCache();
  return { deleted: count };
}

export async function purgeStaleFriendRequests(): Promise<{ deleted: number }> {
  // Delete PENDING > 30d + REJECTED > 90d in one shot, keyed on
  // `updatedAt` rather than `createdAt`. sendFriendRequest upserts
  // existing rows via Prisma and flips status back to PENDING — that
  // bumps updatedAt but preserves createdAt. A `createdAt < 30d` filter
  // would wrongly purge rows that were reopened today but first
  // created a long time ago. Staleness tracks inactivity.
  const { count } = await prisma.friendRequest.deleteMany({
    where: {
      OR: [
        {
          status: 'PENDING',
          updatedAt: { lt: daysAgo(STALE_FRIEND_REQUEST_DAYS) },
        },
        {
          status: 'REJECTED',
          updatedAt: { lt: daysAgo(REJECTED_FRIEND_REQUEST_RETENTION_DAYS) },
        },
      ],
    },
  });
  invalidateCleanupPreviewCache();
  return { deleted: count };
}

export async function purgeDeadGroupInvitations(): Promise<{
  deleted: number;
}> {
  // Only delete unused invites — leave used-then-revoked rows for history.
  const { count } = await prisma.groupInvitation.deleteMany({
    where: {
      usedCount: 0,
      OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
    },
  });
  invalidateCleanupPreviewCache();
  return { deleted: count };
}

export async function expireGroupBans(): Promise<{ updated: number }> {
  const { count } = await prisma.usersInGiftGroups.updateMany({
    where: { bannedUntil: { lt: new Date(), not: null } },
    data: { bannedUntil: null },
  });
  invalidateCleanupPreviewCache();
  return { updated: count };
}

// ===========================================================================
// Phase 3 — Pools surface
// ===========================================================================

export const adminPoolListSelect = {
  id: true,
  title: true,
  status: true,
  occasionType: true,
  eventDate: true,
  updatedAt: true,
  inviteCode: true,
  organizer: { select: { id: true, username: true, name: true } },
  _count: { select: { contributors: true } },
} as const;

export type AdminPoolListItem = {
  id: string;
  title: string;
  status: PoolStatus;
  occasionType: string;
  eventDate: Date | null;
  updatedAt: Date;
  inviteCode: string | null;
  organizer: { id: string; username: string; name: string | null };
  contributorCount: number;
};

export async function listAdminPools({
  status,
  stuckOnly,
  limit = 25,
  offset = 0,
}: {
  status?: PoolStatus | 'all';
  stuckOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ pools: AdminPoolListItem[]; total: number }> {
  if (stuckOnly) {
    const now = new Date();
    const stuckVotingCutoff = new Date(
      now.getTime() - STUCK_VOTING_DAYS * DAY_MS,
    );
    const stuckDecidedCutoff = new Date(
      now.getTime() - STUCK_DECIDED_DAYS * DAY_MS,
    );
    const stuckWhere = {
      OR: [
        { status: POOL_STATUS.OPEN, eventDate: { lt: now } },
        {
          status: POOL_STATUS.VOTING,
          updatedAt: { lt: stuckVotingCutoff },
          votes: { none: {} },
        },
        { status: POOL_STATUS.DECIDED, updatedAt: { lt: stuckDecidedCutoff } },
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.pool.findMany({
        where: stuckWhere,
        orderBy: { updatedAt: 'asc' },
        take: limit,
        skip: offset,
        select: adminPoolListSelect,
      }),
      prisma.pool.count({ where: stuckWhere }),
    ]);
    return {
      pools: rows.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status as PoolStatus,
        occasionType: p.occasionType,
        eventDate: p.eventDate,
        updatedAt: p.updatedAt,
        inviteCode: p.inviteCode,
        organizer: p.organizer,
        contributorCount: p._count.contributors,
      })),
      total,
    };
  }

  const where = status && status !== 'all' ? { status } : {};

  const [rows, total] = await Promise.all([
    prisma.pool.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      select: adminPoolListSelect,
    }),
    prisma.pool.count({ where }),
  ]);

  return {
    pools: rows.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status as PoolStatus,
      occasionType: p.occasionType,
      eventDate: p.eventDate,
      updatedAt: p.updatedAt,
      inviteCode: p.inviteCode,
      organizer: p.organizer,
      contributorCount: p._count.contributors,
    })),
    total,
  };
}

export type AdminPoolDetail = {
  id: string;
  title: string;
  status: PoolStatus;
  occasionType: string;
  eventDate: Date | null;
  decisionMode: string;
  inviteCode: string | null;
  finalPriceCents: number | null;
  chosenIdeaId: string | null;
  createdAt: Date;
  updatedAt: Date;
  organizer: { id: string; username: string; name: string | null };
  purchaser: { id: string; username: string; name: string | null } | null;
  deliverer: { id: string; username: string; name: string | null } | null;
  recipientUser: { id: string; username: string; name: string | null } | null;
  recipientName: string | null;
  contributors: Array<{
    userId: string;
    username: string;
    name: string | null;
    contributionCents: number | null;
    hasPaid: boolean;
  }>;
  ideas: Array<{
    id: string;
    name: string;
    estimatedPriceCents: number | null;
    proposedBy: { username: string };
    voteCount: number;
  }>;
  activities: Array<{
    id: string;
    type: string;
    actorId: string | null;
    payload: string | null;
    createdAt: Date;
  }>;
};

export async function getAdminPoolDetail(
  poolId: string,
): Promise<AdminPoolDetail | null> {
  const [pool, activities] = await Promise.all([
    prisma.pool.findUnique({
      where: { id: poolId },
      select: {
        id: true,
        title: true,
        status: true,
        occasionType: true,
        eventDate: true,
        decisionMode: true,
        inviteCode: true,
        finalPriceCents: true,
        chosenIdeaId: true,
        createdAt: true,
        updatedAt: true,
        recipientName: true,
        organizer: { select: { id: true, username: true, name: true } },
        purchaser: { select: { id: true, username: true, name: true } },
        deliverer: { select: { id: true, username: true, name: true } },
        recipientUser: { select: { id: true, username: true, name: true } },
        contributors: {
          select: {
            userId: true,
            contributionCents: true,
            hasPaid: true,
            user: { select: { username: true, name: true } },
          },
          orderBy: { joinedAt: 'asc' },
        },
        ideas: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            estimatedPriceCents: true,
            proposedBy: { select: { username: true } },
            _count: { select: { votes: true } },
          },
        },
      },
    }),
    prisma.poolActivity.findMany({
      where: { poolId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        actorId: true,
        payload: true,
        createdAt: true,
      },
    }),
  ]);

  if (!pool) return null;

  return {
    id: pool.id,
    title: pool.title,
    status: pool.status as PoolStatus,
    occasionType: pool.occasionType,
    eventDate: pool.eventDate,
    decisionMode: pool.decisionMode,
    inviteCode: pool.inviteCode,
    finalPriceCents: pool.finalPriceCents,
    chosenIdeaId: pool.chosenIdeaId,
    createdAt: pool.createdAt,
    updatedAt: pool.updatedAt,
    organizer: pool.organizer,
    purchaser: pool.purchaser,
    deliverer: pool.deliverer,
    recipientUser: pool.recipientUser,
    recipientName: pool.recipientName,
    contributors: pool.contributors.map((c) => ({
      userId: c.userId,
      username: c.user.username,
      name: c.user.name,
      contributionCents: c.contributionCents,
      hasPaid: c.hasPaid,
    })),
    ideas: pool.ideas.map((i) => ({
      id: i.id,
      name: i.name,
      estimatedPriceCents: i.estimatedPriceCents,
      proposedBy: i.proposedBy,
      voteCount: i._count.votes,
    })),
    activities,
  };
}

// ===========================================================================
// Phase 2 — Users surface
// ===========================================================================

// ---------------------------------------------------------------------------
// searchAdminUsers — admin version of /api/users/search. Unlike the public
// search, this one includes email, creator timestamps, and role badges.
// Not cached — search is URL-driven and users expect fresh results.
// ---------------------------------------------------------------------------

export type AdminUserSearchResult = {
  id: string;
  email: string;
  username: string;
  name: string | null;
  createdAt: Date;
  image: { id: string } | null;
  roleNames: Array<string>;
  wishlistItemCount: number;
  friendshipCount: number;
};

export async function searchAdminUsers({
  query,
  limit = 25,
}: {
  query: string;
  limit?: number;
}): Promise<AdminUserSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: trimmed } },
        { username: { contains: trimmed } },
        { name: { contains: trimmed } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      createdAt: true,
      image: { select: { id: true } },
      roles: { select: { name: true } },
      _count: {
        select: {
          wishlistItems: true,
          friendshipsA: true,
          friendshipsB: true,
        },
      },
    },
  });

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    createdAt: user.createdAt,
    image: user.image,
    roleNames: user.roles.map((r) => r.name),
    wishlistItemCount: user._count.wishlistItems,
    friendshipCount: user._count.friendshipsA + user._count.friendshipsB,
  }));
}

// ---------------------------------------------------------------------------
// getAdminUserDetail — THREE parallel queries instead of one monster
// findUnique. A single nested query with every relation hydrates hundreds of
// KB of unrelated rows for an active user; the split below is tighter and
// measurably faster at scale.
//   1. Identity: profile, roles, sessions, notif prefs, _count rollups
//   2. Pool contributor paid/unpaid split via groupBy
//   3. Recent 20 analytics events for this user
// Returns null if the user doesn't exist — caller handles 404.
// ---------------------------------------------------------------------------

export type AdminUserDetail = {
  id: string;
  email: string;
  username: string;
  name: string | null;
  bio: string | null;
  birthday: Date | null;
  createdAt: Date;
  image: { id: string } | null;
  roles: Array<{ name: string }>;
  sessions: Array<{ id: string; createdAt: Date; expirationDate: Date }>;
  notificationPreferences: Array<{
    type: string;
    inAppEnabled: boolean;
    emailEnabled: boolean;
  }>;
  counts: {
    wishlistItems: number;
    friendships: number;
    poolsOrganized: number;
    poolsAsPurchaser: number;
    poolsAsDeliverer: number;
    poolsAsRecipient: number;
    poolContributions: number;
    unreadNotifications: number;
  };
  poolContributorStats: {
    paid: number;
    unpaid: number;
  };
  recentEvents: Array<{
    id: string;
    name: string;
    createdAt: Date;
    source: string;
    properties: string | null;
  }>;
};

export async function getAdminUserDetail(
  userId: string,
): Promise<AdminUserDetail | null> {
  const [identity, contributorGroups, recentEvents] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        bio: true,
        birthday: true,
        createdAt: true,
        image: { select: { id: true } },
        roles: { select: { name: true }, orderBy: { name: 'asc' } },
        sessions: {
          select: { id: true, createdAt: true, expirationDate: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        notificationPreferences: {
          select: { type: true, inAppEnabled: true, emailEnabled: true },
          orderBy: { type: 'asc' },
        },
        _count: {
          select: {
            wishlistItems: true,
            friendshipsA: true,
            friendshipsB: true,
            poolsOrganized: true,
            poolsAsPurchaser: true,
            poolsAsDeliverer: true,
            poolsAsRecipient: true,
            poolContributions: true,
            notifications: { where: { status: 'UNREAD' } },
          },
        },
      },
    }),
    prisma.poolContributor.groupBy({
      by: ['hasPaid'],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.analyticsEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        name: true,
        createdAt: true,
        source: true,
        properties: true,
      },
    }),
  ]);

  if (!identity) return null;

  const paid =
    contributorGroups.find((g) => g.hasPaid === true)?._count._all ?? 0;
  const unpaid =
    contributorGroups.find((g) => g.hasPaid === false)?._count._all ?? 0;

  return {
    id: identity.id,
    email: identity.email,
    username: identity.username,
    name: identity.name,
    bio: identity.bio,
    birthday: identity.birthday,
    createdAt: identity.createdAt,
    image: identity.image,
    roles: identity.roles,
    sessions: identity.sessions,
    notificationPreferences: identity.notificationPreferences,
    counts: {
      wishlistItems: identity._count.wishlistItems,
      friendships:
        identity._count.friendshipsA + identity._count.friendshipsB,
      poolsOrganized: identity._count.poolsOrganized,
      poolsAsPurchaser: identity._count.poolsAsPurchaser,
      poolsAsDeliverer: identity._count.poolsAsDeliverer,
      poolsAsRecipient: identity._count.poolsAsRecipient,
      poolContributions: identity._count.poolContributions,
      unreadNotifications: identity._count.notifications,
    },
    poolContributorStats: { paid, unpaid },
    recentEvents,
  };
}

// ---------------------------------------------------------------------------
// toggleAdminRole — grant or revoke the admin role on a target user.
// Guards:
//   1. Self-demotion is forbidden (throws CANNOT_DEMOTE_SELF).
//   2. Last-admin guard is transactional: counting then disconnecting across
//      two Prisma calls races. Two concurrent revokes could both see
//      count >= 2 and both succeed, leaving zero admins. We wrap the check
//      AND the mutation in a single $transaction, and count admins EXCLUDING
//      the target (id: { not: targetUserId }) — that's the invariant we
//      actually want.
// Emits admin_role_granted / admin_role_revoked AFTER the transaction
// closes (plan §1.10.3) so a SQLITE_BUSY-on-write inside the txn can't
// collide with the parent's lock.
// ---------------------------------------------------------------------------

export class AdminRoleError extends Error {
  code: 'CANNOT_DEMOTE_SELF' | 'LAST_ADMIN' | 'USER_NOT_FOUND';
  constructor(
    code: 'CANNOT_DEMOTE_SELF' | 'LAST_ADMIN' | 'USER_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

export async function toggleAdminRole({
  targetUserId,
  actingUserId,
  intent,
}: {
  targetUserId: string;
  actingUserId: string;
  intent: 'grant' | 'revoke';
}): Promise<void> {
  if (intent === 'revoke' && targetUserId === actingUserId) {
    throw new AdminRoleError(
      'CANNOT_DEMOTE_SELF',
      'You cannot revoke your own admin role.',
    );
  }

  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!target) {
      throw new AdminRoleError('USER_NOT_FOUND', 'User not found.');
    }

    if (intent === 'revoke') {
      // Count admins OTHER than the target. If that's 0, this revoke would
      // leave zero admins in the system.
      const remaining = await tx.user.count({
        where: {
          roles: { some: { name: 'admin' } },
          id: { not: targetUserId },
        },
      });
      if (remaining < 1) {
        throw new AdminRoleError(
          'LAST_ADMIN',
          'Cannot revoke the last admin.',
        );
      }
    }

    await tx.user.update({
      where: { id: targetUserId },
      data: {
        roles: {
          [intent === 'grant' ? 'connect' : 'disconnect']: { name: 'admin' },
        },
      },
    });
  });

  queueLogEvent({
    name: intent === 'grant' ? 'admin_role_granted' : 'admin_role_revoked',
    userId: actingUserId,
    source: 'server',
    properties: { targetUserId },
  });
}

// ---------------------------------------------------------------------------
// revokeAllSessionsForUser — kick a user out of every active session. Also
// purges outstanding Verification rows keyed on that user's email (password
// reset, email change, 2fa setup) — otherwise the user can re-auth within
// the 10-minute OTP window.
// ---------------------------------------------------------------------------

export async function revokeAllSessionsForUser({
  targetUserId,
  actingUserId,
}: {
  targetUserId: string;
  actingUserId: string;
}): Promise<{ sessionsDeleted: number; verificationsDeleted: number }> {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { email: true },
  });
  if (!user) {
    throw new AdminRoleError('USER_NOT_FOUND', 'User not found.');
  }

  const [sessions, verifications] = await Promise.all([
    prisma.session.deleteMany({ where: { userId: targetUserId } }),
    prisma.verification.deleteMany({ where: { target: user.email } }),
  ]);

  queueLogEvent({
    name: 'admin_sessions_revoked',
    userId: actingUserId,
    source: 'server',
    properties: {
      targetUserId,
      sessionsDeleted: sessions.count,
      verificationsDeleted: verifications.count,
    },
  });

  return {
    sessionsDeleted: sessions.count,
    verificationsDeleted: verifications.count,
  };
}

// ===========================================================================
// Phase 4 — Analytics aggregates
// ===========================================================================

const ONE_HOUR = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Activation funnel — built from domain tables, no dependency on events.
// Cached 1h in the SQLite-backed cache (cross-instance coherent via LiteFS).
// ---------------------------------------------------------------------------

export type FunnelStep = {
  step: string;
  count: number;
  percent: number;
};

export async function getActivationFunnel({
  cohortStart,
  cohortEnd,
}: {
  cohortStart: Date;
  cohortEnd: Date;
}): Promise<FunnelStep[]> {
  const key = `admin:funnel:v1:${cohortStart.toISOString().slice(0, 10)}:${cohortEnd.toISOString().slice(0, 10)}`;
  return cachified({
    key,
    cache,
    ttl: ONE_HOUR,
    getFreshValue: async () => {
      const cohortUsers = await prisma.user.findMany({
        where: { createdAt: { gte: cohortStart, lte: cohortEnd } },
        select: { id: true },
      });

      const userIds = cohortUsers.map((u) => u.id);
      const total = userIds.length;
      if (total === 0) {
        return [
          { step: 'Signed up', count: 0, percent: 100 },
          { step: 'Added first wishlist item', count: 0, percent: 0 },
          { step: 'Made first friend', count: 0, percent: 0 },
          { step: 'Contributed to a pool', count: 0, percent: 0 },
          { step: 'Received a delivered gift', count: 0, percent: 0 },
        ];
      }

      const [withWishlist, withFriend, withContribution, withDelivered] =
        await Promise.all([
          prisma.wishlistItem.findMany({
            where: { ownerId: { in: userIds } },
            select: { ownerId: true },
            distinct: ['ownerId'],
          }),
          prisma.friendship.findMany({
            where: {
              OR: [
                { userAId: { in: userIds } },
                { userBId: { in: userIds } },
              ],
            },
            select: { userAId: true, userBId: true },
          }),
          prisma.poolContributor.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true },
            distinct: ['userId'],
          }),
          prisma.pool.findMany({
            where: {
              recipientUserId: { in: userIds },
              status: POOL_STATUS.DELIVERED,
            },
            select: { recipientUserId: true },
            distinct: ['recipientUserId'],
          }),
        ]);

      const friendUserIds = new Set<string>();
      for (const f of withFriend) {
        if (userIds.includes(f.userAId)) friendUserIds.add(f.userAId);
        if (userIds.includes(f.userBId)) friendUserIds.add(f.userBId);
      }

      const pct = (n: number) => Math.round((n / total) * 100);

      const wishlistCount = withWishlist.length;
      const friendCount = friendUserIds.size;
      const contribCount = withContribution.length;
      const deliveredCount = withDelivered.length;

      return [
        { step: 'Signed up', count: total, percent: 100 },
        {
          step: 'Added first wishlist item',
          count: wishlistCount,
          percent: pct(wishlistCount),
        },
        {
          step: 'Made first friend',
          count: friendCount,
          percent: pct(friendCount),
        },
        {
          step: 'Contributed to a pool',
          count: contribCount,
          percent: pct(contribCount),
        },
        {
          step: 'Received a delivered gift',
          count: deliveredCount,
          percent: pct(deliveredCount),
        },
      ];
    },
  });
}

// ---------------------------------------------------------------------------
// Weekly retention cohort grid — uses Session.createdAt as the retention
// signal. Works against today's data without depending on analytics events.
// Cached 1h in SQLite cache.
// ---------------------------------------------------------------------------

export type RetentionCohort = {
  cohortWeek: string;
  cohortSize: number;
  weeks: Array<{
    weekOffset: number;
    retainedUsers: number;
    retainedPercent: number;
  }>;
};

export async function getWeeklyRetention(
  weeks = 8,
): Promise<RetentionCohort[]> {
  const key = `admin:retention:v1:${weeks}`;
  return cachified({
    key,
    cache,
    ttl: ONE_HOUR,
    getFreshValue: async () => {
      const rows = await prisma.$queryRaw<
        Array<{
          cohort_week: string;
          cohort_size: bigint;
          week_offset: bigint;
          retained: bigint;
        }>
      >`
        WITH cohorts AS (
          SELECT
            id AS user_id,
            strftime('%Y-W%W', createdAt / 1000, 'unixepoch') AS cohort_week
          FROM User
          WHERE createdAt >= ${Date.now() - weeks * 7 * DAY_MS}
        ),
        cohort_sizes AS (
          SELECT cohort_week, COUNT(*) AS cohort_size
          FROM cohorts
          GROUP BY cohort_week
        ),
        sessions_by_week AS (
          SELECT
            c.user_id,
            c.cohort_week,
            CAST((s.createdAt - c_user.createdAt) / ${7 * DAY_MS} AS INTEGER) AS week_offset
          FROM cohorts c
          JOIN Session s ON s.userId = c.user_id
          JOIN User c_user ON c_user.id = c.user_id
          WHERE s.createdAt >= c_user.createdAt
        )
        SELECT
          cs.cohort_week,
          cs.cohort_size,
          sw.week_offset,
          COUNT(DISTINCT sw.user_id) AS retained
        FROM cohort_sizes cs
        LEFT JOIN sessions_by_week sw ON sw.cohort_week = cs.cohort_week
        WHERE sw.week_offset IS NOT NULL AND sw.week_offset >= 0 AND sw.week_offset < ${weeks}
        GROUP BY cs.cohort_week, cs.cohort_size, sw.week_offset
        ORDER BY cs.cohort_week, sw.week_offset
      `;

      const cohortMap = new Map<
        string,
        { cohortSize: number; weeks: Map<number, number> }
      >();

      for (const row of rows) {
        const key = row.cohort_week;
        if (!cohortMap.has(key)) {
          cohortMap.set(key, {
            cohortSize: Number(row.cohort_size),
            weeks: new Map(),
          });
        }
        cohortMap
          .get(key)!
          .weeks.set(Number(row.week_offset), Number(row.retained));
      }

      const result: RetentionCohort[] = [];
      for (const [cohortWeek, data] of cohortMap) {
        result.push({
          cohortWeek,
          cohortSize: data.cohortSize,
          weeks: Array.from({ length: weeks }, (_, i) => {
            const retained = data.weeks.get(i) ?? 0;
            return {
              weekOffset: i,
              retainedUsers: retained,
              retainedPercent:
                data.cohortSize > 0
                  ? Math.round((retained / data.cohortSize) * 100)
                  : 0,
            };
          }),
        });
      }

      return result;
    },
  });
}

// ---------------------------------------------------------------------------
// Notification opt-out matrix — how many users have opted out per type/channel.
// Not cached (fast single query, always fresh).
// ---------------------------------------------------------------------------

export type NotificationOptOutRow = {
  type: string;
  inAppOptOutPercent: number;
  emailOptOutPercent: number;
  total: number;
};

export async function getNotificationOptOutMatrix(): Promise<
  NotificationOptOutRow[]
> {
  const rows = await prisma.$queryRaw<
    Array<{
      type: string;
      inApp_off: bigint | null;
      email_off: bigint | null;
      total: bigint;
    }>
  >`
    SELECT
      type,
      SUM(CASE WHEN inAppEnabled = 0 THEN 1 ELSE 0 END) AS inApp_off,
      SUM(CASE WHEN emailEnabled = 0 THEN 1 ELSE 0 END) AS email_off,
      COUNT(*) AS total
    FROM UserNotificationPreference
    GROUP BY type
  `;

  return rows.map((row) => {
    const total = Number(row.total);
    const inAppOff = Number(row.inApp_off ?? 0);
    const emailOff = Number(row.email_off ?? 0);
    return {
      type: row.type,
      inAppOptOutPercent: total > 0 ? Math.round((inAppOff / total) * 100) : 0,
      emailOptOutPercent: total > 0 ? Math.round((emailOff / total) * 100) : 0,
      total,
    };
  });
}

// ---------------------------------------------------------------------------
// Feedback triage — NOT cached. This is a live queue where an admin flips a
// status and expects the change reflected on the next render, so stale reads
// (lruCache or SQLite) would be a regression. Volume is low.
// ---------------------------------------------------------------------------

export type AdminFeedbackListItem = {
  id: string;
  type: string;
  message: string;
  email: string | null;
  status: string;
  adminNotes: string | null;
  pageUrl: string | null;
  createdAt: Date;
  user: { id: string; username: string; name: string | null } | null;
};

export async function listAdminFeedback({
  status,
  limit = 25,
  offset = 0,
}: {
  status?: FeedbackStatus | 'all';
  limit?: number;
  offset?: number;
}): Promise<{ items: AdminFeedbackListItem[]; total: number }> {
  const where = status && status !== 'all' ? { status } : {};
  const [rows, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        type: true,
        message: true,
        email: true,
        status: true,
        adminNotes: true,
        pageUrl: true,
        createdAt: true,
        user: { select: { id: true, username: true, name: true } },
      },
    }),
    prisma.feedback.count({ where }),
  ]);
  return { items: rows, total };
}

export async function getFeedbackStatusCounts(): Promise<
  Record<FeedbackStatus, number> & { all: number }
> {
  const grouped = await prisma.feedback.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const counts = { NEW: 0, IN_PROGRESS: 0, RESOLVED: 0, WONT_FIX: 0, all: 0 };
  for (const row of grouped) {
    const n = row._count._all;
    counts.all += n;
    if (row.status in counts) {
      counts[row.status as FeedbackStatus] = n;
    }
  }
  return counts;
}

export async function updateFeedbackStatus({
  feedbackId,
  status,
  adminNotes,
}: {
  feedbackId: string;
  status: FeedbackStatus;
  adminNotes?: string | null;
}): Promise<void> {
  await prisma.feedback.update({
    where: { id: feedbackId },
    data: {
      status,
      ...(adminNotes !== undefined ? { adminNotes: adminNotes || null } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Link enrichment & affiliate health — powers the "Link enrichment" section
// on /admin/analytics. Aggregates AnalyticsEvent rows via json_extract over
// the JSON `properties` column (fine at current scale with the
// (name, createdAt) index narrowing the scan; promote hot properties to
// columns if this ever drags).
//
// Operational health with a short window → lruCache, 5-minute TTL (the
// SQLite cache tier is reserved for 1h+ aggregates).
// ---------------------------------------------------------------------------

const ENRICHMENT_CACHE_TTL = 1000 * 60 * 5;

export type EnrichmentFunnel = {
  attempts: number;
  successes: number;
  foundTitle: number;
  foundPrice: number;
  foundImage: number;
  llmAttempted: number;
  llmRescued: number;
  avgDurationMs: number | null;
  itemsSaved: number;
  itemsSavedEnriched: number;
  itemsSavedWithPrice: number;
};

export async function getEnrichmentFunnel({
  days = 30,
}: { days?: number } = {}): Promise<EnrichmentFunnel> {
  return cachified({
    key: `admin:enrichment:funnel:v1:${days}`,
    cache: lruCache,
    ttl: ENRICHMENT_CACHE_TTL,
    getFreshValue: async () => {
      const since = Date.now() - days * DAY_MS;

      const [unfurlRows, savedRows] = await Promise.all([
        prisma.$queryRaw<
          Array<{
            attempts: bigint;
            successes: bigint | null;
            foundTitle: bigint | null;
            foundPrice: bigint | null;
            foundImage: bigint | null;
            llmAttempted: bigint | null;
            llmRescued: bigint | null;
            avgDurationMs: number | null;
          }>
        >`
          SELECT
            COUNT(*) AS attempts,
            SUM(CASE WHEN json_extract(properties, '$.outcome') = 'success' THEN 1 ELSE 0 END) AS successes,
            SUM(CASE WHEN json_extract(properties, '$.foundTitle') THEN 1 ELSE 0 END) AS foundTitle,
            SUM(CASE WHEN json_extract(properties, '$.foundPrice') THEN 1 ELSE 0 END) AS foundPrice,
            SUM(CASE WHEN json_extract(properties, '$.foundImage') THEN 1 ELSE 0 END) AS foundImage,
            SUM(CASE WHEN json_extract(properties, '$.llmAttempted') THEN 1 ELSE 0 END) AS llmAttempted,
            SUM(CASE WHEN json_extract(properties, '$.source') IN ('llm', 'mixed') THEN 1 ELSE 0 END) AS llmRescued,
            AVG(json_extract(properties, '$.durationMs')) AS avgDurationMs
          FROM AnalyticsEvent
          WHERE name = 'wishlist_unfurl_completed' AND createdAt >= ${since}
        `,
        prisma.$queryRaw<
          Array<{
            itemsSaved: bigint;
            itemsSavedEnriched: bigint | null;
            itemsSavedWithPrice: bigint | null;
          }>
        >`
          SELECT
            COUNT(*) AS itemsSaved,
            SUM(CASE WHEN json_extract(properties, '$.enriched') THEN 1 ELSE 0 END) AS itemsSavedEnriched,
            SUM(CASE WHEN json_extract(properties, '$.hasPrice') THEN 1 ELSE 0 END) AS itemsSavedWithPrice
          FROM AnalyticsEvent
          WHERE name = 'wishlist_item_added' AND createdAt >= ${since}
        `,
      ]);

      const unfurl = unfurlRows[0];
      const saved = savedRows[0];
      return {
        attempts: Number(unfurl?.attempts ?? 0),
        successes: Number(unfurl?.successes ?? 0),
        foundTitle: Number(unfurl?.foundTitle ?? 0),
        foundPrice: Number(unfurl?.foundPrice ?? 0),
        foundImage: Number(unfurl?.foundImage ?? 0),
        llmAttempted: Number(unfurl?.llmAttempted ?? 0),
        llmRescued: Number(unfurl?.llmRescued ?? 0),
        avgDurationMs:
          unfurl?.avgDurationMs == null
            ? null
            : Math.round(Number(unfurl.avgDurationMs)),
        itemsSaved: Number(saved?.itemsSaved ?? 0),
        itemsSavedEnriched: Number(saved?.itemsSavedEnriched ?? 0),
        itemsSavedWithPrice: Number(saved?.itemsSavedWithPrice ?? 0),
      };
    },
  });
}

export type EnrichmentFailures = {
  byOutcome: Array<{ outcome: string; count: number }>;
  topFailingHosts: Array<{ host: string; count: number }>;
};

export async function getEnrichmentFailures({
  days = 30,
}: { days?: number } = {}): Promise<EnrichmentFailures> {
  return cachified({
    key: `admin:enrichment:failures:v1:${days}`,
    cache: lruCache,
    ttl: ENRICHMENT_CACHE_TTL,
    getFreshValue: async () => {
      const since = Date.now() - days * DAY_MS;

      const [outcomeRows, hostRows] = await Promise.all([
        prisma.$queryRaw<Array<{ outcome: string; count: bigint }>>`
          SELECT
            json_extract(properties, '$.outcome') AS outcome,
            COUNT(*) AS count
          FROM AnalyticsEvent
          WHERE name = 'wishlist_unfurl_completed'
            AND createdAt >= ${since}
            AND json_extract(properties, '$.outcome') != 'success'
          GROUP BY outcome
          ORDER BY count DESC
        `,
        prisma.$queryRaw<Array<{ host: string; count: bigint }>>`
          SELECT
            json_extract(properties, '$.host') AS host,
            COUNT(*) AS count
          FROM AnalyticsEvent
          WHERE name = 'wishlist_unfurl_completed'
            AND createdAt >= ${since}
            AND json_extract(properties, '$.outcome') != 'success'
          GROUP BY host
          ORDER BY count DESC
          LIMIT 10
        `,
      ]);

      return {
        byOutcome: outcomeRows.map((r) => ({
          outcome: r.outcome,
          count: Number(r.count),
        })),
        topFailingHosts: hostRows.map((r) => ({
          host: r.host,
          count: Number(r.count),
        })),
      };
    },
  });
}

export type LinkClickStats = {
  totalClicks: number;
  taggedClicks: number;
  itemClicks: number;
  ideaClicks: number;
  perDay: Array<{ day: string; clicks: number; tagged: number }>;
};

export async function getLinkClickStats({
  days = 30,
}: { days?: number } = {}): Promise<LinkClickStats> {
  return cachified({
    key: `admin:enrichment:clicks:v1:${days}`,
    cache: lruCache,
    ttl: ENRICHMENT_CACHE_TTL,
    getFreshValue: async () => {
      const since = Date.now() - days * DAY_MS;

      const rows = await prisma.$queryRaw<
        Array<{
          day: string;
          clicks: bigint;
          tagged: bigint | null;
          itemClicks: bigint | null;
        }>
      >`
        SELECT
          strftime('%Y-%m-%d', createdAt / 1000, 'unixepoch') AS day,
          COUNT(*) AS clicks,
          SUM(CASE WHEN json_extract(properties, '$.tagged') THEN 1 ELSE 0 END) AS tagged,
          SUM(CASE WHEN json_extract(properties, '$.entity') = 'item' THEN 1 ELSE 0 END) AS itemClicks
        FROM AnalyticsEvent
        WHERE name = 'wishlist_link_clicked' AND createdAt >= ${since}
        GROUP BY day
        ORDER BY day DESC
      `;

      const perDay = rows.map((r) => ({
        day: r.day,
        clicks: Number(r.clicks),
        tagged: Number(r.tagged ?? 0),
      }));
      const totalClicks = perDay.reduce((sum, d) => sum + d.clicks, 0);
      const taggedClicks = perDay.reduce((sum, d) => sum + d.tagged, 0);
      const itemClicks = rows.reduce(
        (sum, r) => sum + Number(r.itemClicks ?? 0),
        0,
      );

      return {
        totalClicks,
        taggedClicks,
        itemClicks,
        ideaClicks: totalClicks - itemClicks,
        perDay,
      };
    },
  });
}

export type SmartLinkAdoption = {
  proposed: number;
  fromWishlist: number;
  withPrice: number;
};

export async function getSmartLinkAdoption({
  days = 30,
}: { days?: number } = {}): Promise<SmartLinkAdoption> {
  return cachified({
    key: `admin:enrichment:smartlink:v1:${days}`,
    cache: lruCache,
    ttl: ENRICHMENT_CACHE_TTL,
    getFreshValue: async () => {
      const since = Date.now() - days * DAY_MS;

      const rows = await prisma.$queryRaw<
        Array<{
          proposed: bigint;
          fromWishlist: bigint | null;
          withPrice: bigint | null;
        }>
      >`
        SELECT
          COUNT(*) AS proposed,
          SUM(CASE WHEN json_extract(properties, '$.fromWishlist') THEN 1 ELSE 0 END) AS fromWishlist,
          SUM(CASE WHEN json_extract(properties, '$.hasPrice') THEN 1 ELSE 0 END) AS withPrice
        FROM AnalyticsEvent
        WHERE name = 'pool_idea_proposed' AND createdAt >= ${since}
      `;

      const row = rows[0];
      return {
        proposed: Number(row?.proposed ?? 0),
        fromWishlist: Number(row?.fromWishlist ?? 0),
        withPrice: Number(row?.withPrice ?? 0),
      };
    },
  });
}
