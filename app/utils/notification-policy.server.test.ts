import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TOPICS,
  NOTIFICATION_TYPES,
} from '#app/utils/notification-catalog.ts';
import { NOTIFICATION_ACTIVITY_LEVELS } from '#app/utils/notification-context.ts';
import {
  resolveNotificationPolicy,
  resolveNotificationPoliciesForUsers,
} from '#app/utils/notification-policy.server.ts';
import {
  setContextActivityPreference,
  setGlobalChannelPreference,
  setTopicChannelPreference,
} from '#app/utils/notification-preferences.server.ts';

async function createUser() {
  return prisma.user.create({
    select: { id: true },
    data: {
      email: `user-${randomUUID()}@example.com`,
      username: `user_${randomUUID().slice(0, 8)}`,
      roles: {
        connectOrCreate: {
          where: { name: 'user' },
          create: { name: 'user' },
        },
      },
    },
  });
}

// The pool is deliberately owned by a gift group: without one, giftGroupId is
// null and the pool -> group inheritance branch of the contextual read is never
// exercised, so the equivalence test below would pass against a resolver that
// gets the fallback wrong.
async function createPoolWithContributors(contributorUserIds: string[]) {
  const group = await prisma.giftGroup.create({
    data: {
      name: `Group ${randomUUID()}`,
      createdById: contributorUserIds[0]!,
      groupMembers: {
        create: contributorUserIds.map((userId) => ({ userId })),
      },
    },
    select: { id: true },
  });
  return prisma.pool.create({
    data: {
      title: `Pool ${randomUUID()}`,
      organizerId: contributorUserIds[0]!,
      giftGroupId: group.id,
      contributors: {
        create: contributorUserIds.map((userId) => ({ userId })),
      },
    },
    select: { id: true, giftGroupId: true },
  });
}

describe('resolveNotificationPolicy', () => {
  beforeEach(async () => {
    await prisma.notificationPreferenceAudit.deleteMany();
    await prisma.notificationTopicPreference.deleteMany();
    await prisma.notificationCategoryPreference.deleteMany();
    await prisma.notificationChannelPreference.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { contains: '@example.com' } },
    });
  });

  it('explains catalog defaults when sparse rows are missing', async () => {
    const user = await createUser();
    const policy = await resolveNotificationPolicy({
      userId: user.id,
      type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
    });

    expect(policy.channels[NOTIFICATION_CHANNELS.IN_APP]).toEqual({
      channel: NOTIFICATION_CHANNELS.IN_APP,
      allowed: true,
      reason: 'allowed',
      source: 'catalog_default',
    });
    expect(policy.channels[NOTIFICATION_CHANNELS.EMAIL]).toEqual({
      channel: NOTIFICATION_CHANNELS.EMAIL,
      allowed: false,
      reason: 'preference_disabled',
      source: 'catalog_default',
    });
  });

  it('reflects a topic override shared by concrete events', async () => {
    const user = await createUser();
    await setTopicChannelPreference({
      userId: user.id,
      topic: NOTIFICATION_TOPICS.FRIEND_REQUESTS,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      enabled: false,
      source: 'policy-test',
    });

    for (const type of [
      NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
    ]) {
      const policy = await resolveNotificationPolicy({ userId: user.id, type });
      expect(policy.channels[NOTIFICATION_CHANNELS.EMAIL]).toEqual({
        channel: NOTIFICATION_CHANNELS.EMAIL,
        allowed: false,
        reason: 'preference_disabled',
        source: 'topic_override',
      });
    }
  });

  it('applies a disabled global channel gate before topic choices', async () => {
    const user = await createUser();
    await setGlobalChannelPreference({
      userId: user.id,
      channel: NOTIFICATION_CHANNELS.IN_APP,
      enabled: false,
      source: 'policy-test',
    });
    const policy = await resolveNotificationPolicy({
      userId: user.id,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
    });
    expect(policy.channels[NOTIFICATION_CHANNELS.IN_APP]).toMatchObject({
      allowed: false,
      reason: 'preference_disabled',
      source: 'global_channel',
    });
  });

  it('fails closed when an event receives the wrong context kind', async () => {
    const user = await createUser();

    await expect(
      resolveNotificationPolicy({
        userId: user.id,
        type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
        context: { kind: 'POOL', poolId: 'pool-1' },
      }),
    ).rejects.toThrow('requires context kind NONE');
  });
});

describe('resolveNotificationPoliciesForUsers', () => {
  // Regression for GIFTPOOL-UI-1M/-1P/-1Q/-1R: resolving a pool audience one
  // contributor at a time opened one interactive Prisma transaction per
  // recipient. Prisma opens those with BEGIN IMMEDIATE — SQLite's write lock,
  // one holder even for reads — so a fan-out that queues without awaiting had
  // N of them queued behind each other, each running its own 5s timer from
  // creation until the tail expired.
  //
  // Both halves are batched now and neither opens an interactive transaction;
  // notification-policy.server.queries.test.ts guards that query shape
  // directly. What this test guards is that batching did not change any
  // ANSWER: every contributor must resolve identically through both entry
  // points, across a deliberately non-uniform mix of central topic override,
  // pool override, and inherited group override.
  it('matches per-user resolveNotificationPolicy for every pool contributor', async () => {
    const users = await Promise.all(
      Array.from({ length: 7 }, () => createUser()),
    );
    const pool = await createPoolWithContributors(users.map((u) => u.id));
    const context = { kind: 'POOL', poolId: pool.id } as const;

    // A central topic override...
    await setTopicChannelPreference({
      userId: users[3]!.id,
      topic: NOTIFICATION_TOPICS.IDEAS_AND_VOTING,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      enabled: false,
      source: 'policy-test',
    });
    // ...a pool-level override, which must win over the group...
    await setContextActivityPreference({
      userId: users[1]!.id,
      context,
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.ALL_ACTIVITY,
      source: 'policy-test',
    });
    // ...and a group-level mute with no pool row, which must be inherited.
    await setContextActivityPreference({
      userId: users[2]!.id,
      context: { kind: 'GROUP', groupId: pool.giftGroupId! },
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.MUTED,
      source: 'policy-test',
    });

    const bulk = await resolveNotificationPoliciesForUsers({
      userIds: users.map((u) => u.id),
      type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
      context,
    });

    for (const user of users) {
      const individual = await resolveNotificationPolicy({
        userId: user.id,
        type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
        context,
      });
      expect(bulk.get(user.id)).toEqual(individual);
    }

    // The mix above must actually produce different outcomes, or the
    // equivalence assertion is comparing seven copies of the same answer.
    const muted = bulk.get(users[2]!.id)!;
    expect(muted.channels[NOTIFICATION_CHANNELS.IN_APP].allowed).toBe(false);
    expect(
      bulk.get(users[1]!.id)!.channels[NOTIFICATION_CHANNELS.IN_APP].allowed,
    ).toBe(true);
  });

  // Guards the collapse of resolveNotificationPolicy onto this resolver: the
  // single-user entry point is now a batch of one, and must stay that way.
  it('agrees with the single-user entry point for an audience of one', async () => {
    const user = await createUser();
    const pool = await createPoolWithContributors([user.id]);
    const context = { kind: 'POOL', poolId: pool.id } as const;

    const bulk = await resolveNotificationPoliciesForUsers({
      userIds: [user.id],
      type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
      context,
    });

    expect(bulk.get(user.id)).toEqual(
      await resolveNotificationPolicy({
        userId: user.id,
        type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
        context,
      }),
    );
  });

  it('fails closed when an event receives the wrong context kind', async () => {
    const user = await createUser();

    await expect(
      resolveNotificationPoliciesForUsers({
        userIds: [user.id],
        type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
        context: { kind: 'POOL', poolId: 'pool-1' },
      }),
    ).rejects.toThrow('requires context kind NONE');
  });
});
