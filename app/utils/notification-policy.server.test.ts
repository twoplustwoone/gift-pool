import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TOPICS,
  NOTIFICATION_TYPES,
} from '#app/utils/notification-catalog.ts';
import {
  resolveNotificationPolicy,
  resolveNotificationPoliciesForUsers,
} from '#app/utils/notification-policy.server.ts';
import {
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

async function createPoolWithContributors(contributorUserIds: string[]) {
  return prisma.pool.create({
    data: {
      title: `Pool ${randomUUID()}`,
      organizerId: contributorUserIds[0]!,
      contributors: {
        create: contributorUserIds.map((userId) => ({ userId })),
      },
    },
    select: { id: true },
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
  // Regression for GIFTPOOL-UI-1M: previewing reminders for a pool used to
  // resolve one contributor at a time via Promise.all — 2 concurrent SQLite
  // transactions per candidate, unbounded by pool size. This bulk resolver
  // must match resolveNotificationPolicy per user (batches the central half
  // into one transaction; contextual lookups are chunked to
  // CONTEXTUAL_LOOKUP_BATCH_SIZE rather than fired all at once).
  it('matches per-user resolveNotificationPolicy for every pool contributor', async () => {
    // 7 contributors — deliberately more than CONTEXTUAL_LOOKUP_BATCH_SIZE
    // (5) so this exercises more than one chunk.
    const users = await Promise.all(
      Array.from({ length: 7 }, () => createUser()),
    );
    const pool = await createPoolWithContributors(users.map((u) => u.id));

    // One contributor with a topic override, so the mix of results isn't
    // uniform across users.
    await setTopicChannelPreference({
      userId: users[3]!.id,
      topic: NOTIFICATION_TOPICS.IDEAS_AND_VOTING,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      enabled: false,
      source: 'policy-test',
    });

    const context = { kind: 'POOL', poolId: pool.id } as const;
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
