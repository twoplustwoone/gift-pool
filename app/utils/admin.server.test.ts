import { beforeEach, describe, expect, it } from 'vitest';
import {
  expireGroupBans,
  getCleanupPreviewCounts,
  getDiskUsageCounts,
  getOverviewCounts,
  getRecentActivity,
  getStuckPools,
  purgeDeadGroupInvitations,
  purgeExpiredSessions,
  purgeExpiredVerifications,
  purgeStaleFriendRequests,
} from '#app/utils/admin.server.ts';
import { lruCache } from '#app/utils/cache.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { POOL_STATUS } from '#app/utils/pool-constants.ts';
import { createUser } from '#tests/db-utils.ts';

const DAY_MS = 1000 * 60 * 60 * 24;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

// Every admin helper is cached in lruCache with 60s TTL. We purge the keys
// between tests so each `it` block sees a cold cache.
beforeEach(() => {
  const keys = [
    'admin:overview:counts:v1',
    'admin:overview:cleanup-preview:v1',
    'admin:ops:disk-usage:v1',
  ];
  for (const key of keys) lruCache.delete(key);
  for (let n = 1; n <= 20; n++)
    lruCache.delete(`admin:overview:stuck-pools:v1:${n}`);
});

async function seedAdmin() {
  await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin', description: 'Admin role' },
  });
  return prisma.user.create({
    data: {
      ...createUser(),
      roles: { connect: { name: 'admin' } },
    },
    select: { id: true },
  });
}

describe('getOverviewCounts', () => {
  it('returns zeros against an empty database', async () => {
    const counts = await getOverviewCounts();
    expect(counts.users.total).toBe(0);
    expect(counts.pools.total).toBe(0);
    expect(counts.pools.stuck).toBe(0);
    expect(counts.pools.active).toBe(0);
    expect(counts.wishlist.items).toBe(0);
    expect(counts.friendships.total).toBe(0);
  });

  it('counts users by window', async () => {
    await prisma.user.create({ data: createUser() });
    await prisma.user.create({
      data: { ...createUser(), createdAt: daysAgo(10) },
    });
    await prisma.user.create({
      data: { ...createUser(), createdAt: daysAgo(45) },
    });

    const counts = await getOverviewCounts();
    expect(counts.users.total).toBe(3);
    expect(counts.users.last24h).toBe(1);
    expect(counts.users.last7d).toBe(1);
    expect(counts.users.last30d).toBe(2);
  });

  it('detects stuck OPEN pools (event date past)', async () => {
    const user = await prisma.user.create({ data: createUser() });
    await prisma.pool.create({
      data: {
        title: 'Overdue pool',
        organizerId: user.id,
        status: POOL_STATUS.OPEN,
        eventDate: daysAgo(2),
      },
    });

    const counts = await getOverviewCounts();
    expect(counts.pools.stuck).toBe(1);
    expect(counts.pools.byStatus.OPEN).toBe(1);
  });

  it('detects stuck VOTING pools (no votes, stale updatedAt)', async () => {
    const user = await prisma.user.create({ data: createUser() });
    await prisma.pool.create({
      data: {
        title: 'Stale vote',
        organizerId: user.id,
        status: POOL_STATUS.VOTING,
        updatedAt: daysAgo(10),
      },
    });

    const counts = await getOverviewCounts();
    expect(counts.pools.stuck).toBe(1);
  });

  it('does not flag VOTING pools that have votes even if old', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const pool = await prisma.pool.create({
      data: {
        title: 'Voting but active',
        organizerId: user.id,
        status: POOL_STATUS.VOTING,
        updatedAt: daysAgo(10),
        contributors: { create: { userId: user.id } },
      },
    });
    const idea = await prisma.giftIdea.create({
      data: { poolId: pool.id, proposedById: user.id, name: 'something' },
    });
    await prisma.ideaVote.create({
      data: { poolId: pool.id, ideaId: idea.id, voterId: user.id },
    });

    const counts = await getOverviewCounts();
    expect(counts.pools.stuck).toBe(0);
  });

  it('counts wishlist items split by status', async () => {
    const user = await prisma.user.create({ data: createUser() });
    await prisma.wishlistItem.createMany({
      data: [
        {
          ownerId: user.id,
          title: 'a',
          sortOrder: 0,
          type: 'text',
          status: 'ACTIVE',
        },
        {
          ownerId: user.id,
          title: 'b',
          sortOrder: 1,
          type: 'text',
          status: 'ARCHIVED',
        },
      ],
    });

    const counts = await getOverviewCounts();
    expect(counts.wishlist.items).toBe(2);
    expect(counts.wishlist.active).toBe(1);
    expect(counts.wishlist.archived).toBe(1);
  });
});

describe('getStuckPools', () => {
  it('returns a classified stuck-pool list', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const overdue = await prisma.pool.create({
      data: {
        title: 'Overdue birthday',
        organizerId: user.id,
        status: POOL_STATUS.OPEN,
        eventDate: daysAgo(3),
        contributors: { create: { userId: user.id } },
      },
      select: { id: true },
    });
    await prisma.pool.create({
      data: {
        title: 'Decided long ago',
        organizerId: user.id,
        status: POOL_STATUS.DECIDED,
        updatedAt: daysAgo(20),
        contributors: { create: { userId: user.id } },
      },
    });

    const stuck = await getStuckPools(10);
    expect(stuck).toHaveLength(2);
    const byReason = Object.fromEntries(stuck.map((p) => [p.reason, p]));
    expect(byReason.open_overdue?.id).toBe(overdue.id);
    expect(byReason.open_overdue?.contributorCount).toBe(1);
    expect(byReason.decided_stalled).toBeDefined();
  });

  it('returns an empty array when nothing is stuck', async () => {
    const user = await prisma.user.create({ data: createUser() });
    await prisma.pool.create({
      data: {
        title: 'Fresh pool',
        organizerId: user.id,
        status: POOL_STATUS.OPEN,
        eventDate: new Date(Date.now() + 7 * DAY_MS),
      },
    });
    expect(await getStuckPools(10)).toEqual([]);
  });
});

describe('cleanup preview + purges', () => {
  it('expired verifications: preview matches purge, and purge is idempotent', async () => {
    await prisma.verification.create({
      data: {
        type: '2fa',
        target: 'expired-user',
        secret: 'abc',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        charSet: '0123456789',
        expiresAt: daysAgo(1),
      },
    });
    await prisma.verification.create({
      data: {
        type: '2fa',
        target: 'valid-user',
        secret: 'def',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        charSet: '0123456789',
        expiresAt: new Date(Date.now() + DAY_MS),
      },
    });

    const preview = await getCleanupPreviewCounts();
    expect(preview.expiredVerifications).toBe(1);

    const first = await purgeExpiredVerifications();
    expect(first.deleted).toBe(1);

    const second = await purgeExpiredVerifications();
    expect(second.deleted).toBe(0);

    // The valid row is untouched.
    const remaining = await prisma.verification.count();
    expect(remaining).toBe(1);
  });

  it('expired sessions: preview matches purge', async () => {
    const user = await prisma.user.create({ data: createUser() });
    await prisma.session.create({
      data: { userId: user.id, expirationDate: daysAgo(1) },
    });
    await prisma.session.create({
      data: {
        userId: user.id,
        expirationDate: new Date(Date.now() + DAY_MS),
      },
    });

    const preview = await getCleanupPreviewCounts();
    expect(preview.expiredSessions).toBe(1);

    const result = await purgeExpiredSessions();
    expect(result.deleted).toBe(1);

    const second = await purgeExpiredSessions();
    expect(second.deleted).toBe(0);
  });

  it('stale friend requests: deletes PENDING >30d and REJECTED >90d together', async () => {
    const [a, b, c, d, e, f] = await Promise.all([
      prisma.user.create({ data: createUser() }),
      prisma.user.create({ data: createUser() }),
      prisma.user.create({ data: createUser() }),
      prisma.user.create({ data: createUser() }),
      prisma.user.create({ data: createUser() }),
      prisma.user.create({ data: createUser() }),
    ]);
    await prisma.friendRequest.createMany({
      data: [
        // stale PENDING — both createdAt AND updatedAt past the cutoff
        {
          fromUserId: a.id,
          toUserId: b.id,
          status: 'PENDING',
          createdAt: daysAgo(45),
          updatedAt: daysAgo(45),
        },
        // fresh PENDING — must survive
        {
          fromUserId: c.id,
          toUserId: d.id,
          status: 'PENDING',
          createdAt: daysAgo(5),
          updatedAt: daysAgo(5),
        },
        // stale REJECTED
        {
          fromUserId: e.id,
          toUserId: f.id,
          status: 'REJECTED',
          createdAt: daysAgo(120),
          updatedAt: daysAgo(120),
        },
      ],
    });

    const preview = await getCleanupPreviewCounts();
    expect(preview.stalePendingFriendRequests).toBe(1);
    expect(preview.staleRejectedFriendRequests).toBe(1);

    const result = await purgeStaleFriendRequests();
    expect(result.deleted).toBe(2);

    const remaining = await prisma.friendRequest.findMany({
      select: { status: true },
    });
    expect(remaining).toEqual([{ status: 'PENDING' }]);
  });

  it('stale friend requests: preserves rows that were re-opened recently even if createdAt is old', async () => {
    // Regression: sendFriendRequest upserts existing rows and flips
    // status back to PENDING. A row that was first created 100 days ago
    // but reopened TODAY has a stale createdAt but a fresh updatedAt.
    // The purge must key on updatedAt, not createdAt.
    const [a, b] = await Promise.all([
      prisma.user.create({ data: createUser() }),
      prisma.user.create({ data: createUser() }),
    ]);
    await prisma.friendRequest.create({
      data: {
        fromUserId: a.id,
        toUserId: b.id,
        status: 'PENDING',
        createdAt: daysAgo(100),
        // updatedAt defaults to now() via @updatedAt
      },
    });

    const preview = await getCleanupPreviewCounts();
    expect(preview.stalePendingFriendRequests).toBe(0);

    const result = await purgeStaleFriendRequests();
    expect(result.deleted).toBe(0);

    expect(await prisma.friendRequest.count()).toBe(1);
  });

  it('dead group invitations: only deletes unused revoked/expired rows', async () => {
    const admin = await seedAdmin();
    const group = await prisma.giftGroup.create({
      data: { name: 'Test', description: null },
    });
    await prisma.groupInvitation.createMany({
      data: [
        {
          code: 'rev1',
          createdById: admin.id,
          giftGroupId: group.id,
          expiresAt: new Date(Date.now() + DAY_MS),
          revokedAt: daysAgo(1),
          usedCount: 0,
        },
        {
          code: 'exp1',
          createdById: admin.id,
          giftGroupId: group.id,
          expiresAt: daysAgo(1),
          usedCount: 0,
        },
        // used-then-revoked: should stay for history
        {
          code: 'hist',
          createdById: admin.id,
          giftGroupId: group.id,
          expiresAt: daysAgo(1),
          revokedAt: daysAgo(1),
          usedCount: 3,
        },
        // live invite
        {
          code: 'live',
          createdById: admin.id,
          giftGroupId: group.id,
          expiresAt: new Date(Date.now() + DAY_MS),
          usedCount: 0,
        },
      ],
    });

    const preview = await getCleanupPreviewCounts();
    expect(preview.revokedOrExpiredGroupInvitations).toBe(2);

    const result = await purgeDeadGroupInvitations();
    expect(result.deleted).toBe(2);

    const remaining = await prisma.groupInvitation.findMany({
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    expect(remaining.map((r) => r.code)).toEqual(['hist', 'live']);
  });

  it('expire group bans: lifts past-due bans and is idempotent', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const group = await prisma.giftGroup.create({
      data: { name: 'Bans', description: null },
    });
    await prisma.usersInGiftGroups.create({
      data: {
        userId: user.id,
        giftGroupId: group.id,
        bannedUntil: daysAgo(1),
      },
    });

    const preview = await getCleanupPreviewCounts();
    expect(preview.expiredGroupBans).toBe(1);

    const first = await expireGroupBans();
    expect(first.updated).toBe(1);

    const second = await expireGroupBans();
    expect(second.updated).toBe(0);

    const row = await prisma.usersInGiftGroups.findUniqueOrThrow({
      where: { userId_giftGroupId: { userId: user.id, giftGroupId: group.id } },
    });
    expect(row.bannedUntil).toBeNull();
  });
});

describe('getRecentActivity', () => {
  it('unions recent users, pools, wishlist items, and friendships, newest first', async () => {
    const alice = await prisma.user.create({ data: createUser() });
    const bob = await prisma.user.create({ data: createUser() });
    await prisma.pool.create({
      data: {
        title: 'Birthday bash',
        organizerId: alice.id,
      },
    });
    await prisma.wishlistItem.create({
      data: {
        ownerId: alice.id,
        title: 'Hat',
        sortOrder: 0,
        type: 'text',
      },
    });
    await prisma.friendship.create({
      data: { userAId: alice.id, userBId: bob.id },
    });

    const rows = await getRecentActivity(15);
    const kinds = rows.map((r) => r.kind).sort();
    expect(kinds).toEqual(['friendship', 'pool', 'user', 'user', 'wishlist_item']);
  });
});

describe('getDiskUsageCounts', () => {
  it('reports item counts and total image bytes', async () => {
    const user = await prisma.user.create({ data: createUser() });
    await prisma.wishlistItem.create({
      data: {
        ownerId: user.id,
        title: 'No image',
        sortOrder: 0,
        type: 'text',
      },
    });
    await prisma.wishlistItem.create({
      data: {
        ownerId: user.id,
        title: 'With image',
        sortOrder: 1,
        type: 'text',
        image: Buffer.from('x'.repeat(1024)),
        hasImage: true,
        imageSource: 'UPLOAD',
      },
    });

    const disk = await getDiskUsageCounts();
    expect(disk.wishlistItemTotal).toBe(2);
    expect(disk.wishlistItemsWithImage).toBe(1);
    expect(disk.wishlistImageBytes).toBe(1024);
  });
});
