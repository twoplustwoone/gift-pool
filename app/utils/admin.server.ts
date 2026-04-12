import { cachified, lruCache } from './cache.server.ts';
import { prisma } from './db.server.ts';
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
  eventDate: Date | null;
  updatedAt: Date;
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
          eventDate: true,
          updatedAt: true,
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
          eventDate: pool.eventDate,
          updatedAt: pool.updatedAt,
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
