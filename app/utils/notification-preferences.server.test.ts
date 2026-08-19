import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TOPICS,
  NOTIFICATION_TYPES,
} from '#app/utils/notification-catalog.ts';
import {
  allowsContextActivity,
  clearContextActivityPreference,
  disableEmailForAll,
  dismissContextNotificationNotice,
  dismissContextMutedNotice,
  getCentralNotificationSettings,
  getContextNotificationAwareness,
  getContextNotificationPreference,
  getContextNotificationPreferencesForUsers,
  getNotificationPreferenceForChannels,
  getNotificationPreferences,
  NOTIFICATION_ACTIVITY_LEVELS,
  resolveCentralNotificationPreferences,
  resolveCentralNotificationPreferencesForUsers,
  setCategoryChannelPreference,
  setContextActivityPreference,
  setGlobalChannelPreference,
  setNotificationPreference,
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

async function createGroupPool(userId: string) {
  const group = await prisma.giftGroup.create({
    data: {
      name: `Group ${randomUUID()}`,
      groupMembers: { create: { userId } },
    },
    select: { id: true },
  });
  const pool = await prisma.pool.create({
    data: {
      title: `Pool ${randomUUID()}`,
      organizerId: userId,
      giftGroupId: group.id,
      contributors: { create: { userId } },
    },
    select: { id: true },
  });
  return { group, pool };
}

describe('notification preferences', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await prisma.notificationPreferenceAudit.deleteMany();
    await prisma.poolNotificationPreference.deleteMany();
    await prisma.groupNotificationPreference.deleteMany();
    await prisma.notificationTopicPreference.deleteMany();
    await prisma.notificationCategoryPreference.deleteMany();
    await prisma.notificationChannelPreference.deleteMany();
    await prisma.poolContributor.deleteMany();
    await prisma.pool.deleteMany();
    await prisma.usersInGiftGroups.deleteMany();
    await prisma.giftGroup.deleteMany();
    await prisma.friendRequest.deleteMany();
    await prisma.friendship.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { contains: '@example.com' } },
    });
  });

  it('inherits catalog defaults without materializing rows', async () => {
    const user = await createUser();
    const preferences = await getNotificationPreferences(user.id);

    for (const type of Object.values(NOTIFICATION_TYPES)) {
      expect(preferences.get(type)).toEqual(
        DEFAULT_NOTIFICATION_PREFERENCES[type],
      );
    }
    await expect(
      prisma.notificationTopicPreference.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
  });

  it('maps both friend events to one sparse topic override', async () => {
    const user = await createUser();
    await setNotificationPreference(
      user.id,
      NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      NOTIFICATION_CHANNELS.EMAIL,
      false,
      'test',
    );

    for (const type of [
      NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
    ]) {
      await expect(
        getNotificationPreferenceForChannels(user.id, type),
      ).resolves.toMatchObject({ emailEnabled: false });
    }
    await expect(
      prisma.notificationTopicPreference.findUnique({
        where: {
          userId_topic_channel: {
            userId: user.id,
            topic: NOTIFICATION_TOPICS.FRIEND_REQUESTS,
            channel: NOTIFICATION_CHANNELS.EMAIL,
          },
        },
      }),
    ).resolves.toMatchObject({ enabled: false });
    await expect(
      prisma.notificationPreferenceAudit.findFirst({
        where: { userId: user.id, source: 'test' },
      }),
    ).resolves.toMatchObject({
      kind: 'TOPIC',
      preferenceKey: NOTIFICATION_TOPICS.FRIEND_REQUESTS,
      previousValue: 'true',
      newValue: 'false',
    });
  });

  it('resolves topic over category over catalog, with the global gate absolute', async () => {
    const user = await createUser();
    await setCategoryChannelPreference({
      userId: user.id,
      category: NOTIFICATION_CATEGORIES.OCCASIONS,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      enabled: true,
      source: 'test-category',
    });
    let resolved = await resolveCentralNotificationPreferences({
      userId: user.id,
      type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
    });
    expect(resolved.channels.EMAIL).toEqual({
      enabled: true,
      source: 'category_override',
    });

    await setTopicChannelPreference({
      userId: user.id,
      topic: NOTIFICATION_TOPICS.BIRTHDAY_REMINDERS,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      enabled: false,
      source: 'test-topic',
    });
    resolved = await resolveCentralNotificationPreferences({
      userId: user.id,
      type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
    });
    expect(resolved.channels.EMAIL).toEqual({
      enabled: false,
      source: 'topic_override',
    });

    await setGlobalChannelPreference({
      userId: user.id,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      enabled: false,
      source: 'test-global',
    });
    resolved = await resolveCentralNotificationPreferences({
      userId: user.id,
      type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
    });
    expect(resolved.channels.EMAIL).toEqual({
      enabled: false,
      source: 'global_channel',
    });
    const settings = await getCentralNotificationSettings(user.id);
    expect(
      settings.topics.find(
        ({ topic }) => topic === NOTIFICATION_TOPICS.BIRTHDAY_REMINDERS,
      )?.channels.EMAIL,
    ).toEqual({ enabled: false, source: 'topic_override' });

    await setTopicChannelPreference({
      userId: user.id,
      topic: NOTIFICATION_TOPICS.BIRTHDAY_REMINDERS,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      enabled: true,
      source: 'test-topic-while-gated',
    });
    await setGlobalChannelPreference({
      userId: user.id,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      enabled: true,
      source: 'test-global-enable',
    });
    resolved = await resolveCentralNotificationPreferences({
      userId: user.id,
      type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
    });
    expect(resolved.channels.EMAIL).toEqual({
      enabled: true,
      source: 'topic_override',
    });
  });

  // Regression for GIFTPOOL-UI-1M: filterPreferenceEligibleRecipients used
  // to resolve one candidate at a time, each its own transaction — a burst
  // proportional to pool size that could time out against SQLite. This
  // bulk read must match resolveCentralNotificationPreferences per user
  // while doing it in a single transaction regardless of how many users.
  it('resolves central preferences for many users in one transaction', async () => {
    const [userA, userB, userC] = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
    ]);
    await setGlobalChannelPreference({
      userId: userB.id,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      enabled: false,
      source: 'test-global',
    });
    await setTopicChannelPreference({
      userId: userC.id,
      topic: NOTIFICATION_TOPICS.BIRTHDAY_REMINDERS,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      enabled: false,
      source: 'test-topic',
    });

    const transactionSpy = vi.spyOn(prisma, '$transaction');

    const bulk = await resolveCentralNotificationPreferencesForUsers({
      userIds: [userA.id, userB.id, userC.id],
      type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
    });

    expect(transactionSpy).toHaveBeenCalledTimes(1);
    transactionSpy.mockRestore();

    for (const user of [userA, userB, userC]) {
      const individual = await resolveCentralNotificationPreferences({
        userId: user.id,
        type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      });
      expect(bulk.get(user.id)).toEqual(individual);
    }
  });

  it('applies category bulk changes atomically and clears narrower overrides', async () => {
    const user = await createUser();
    await setTopicChannelPreference({
      userId: user.id,
      topic: NOTIFICATION_TOPICS.FRIEND_REQUESTS,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      enabled: false,
      source: 'test-topic',
    });
    await setCategoryChannelPreference({
      userId: user.id,
      category: NOTIFICATION_CATEGORIES.SOCIAL,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      enabled: true,
      source: 'test-bulk',
    });

    await expect(
      prisma.notificationTopicPreference.count({
        where: {
          userId: user.id,
          topic: NOTIFICATION_TOPICS.FRIEND_REQUESTS,
          channel: NOTIFICATION_CHANNELS.EMAIL,
        },
      }),
    ).resolves.toBe(0);
    const resolved = await resolveCentralNotificationPreferences({
      userId: user.id,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
    });
    expect(resolved.channels.EMAIL).toEqual({
      enabled: true,
      source: 'category_override',
    });
  });

  it('rolls back a category operation when its user does not exist', async () => {
    await expect(
      setCategoryChannelPreference({
        userId: 'missing-user',
        category: NOTIFICATION_CATEGORIES.SOCIAL,
        channel: NOTIFICATION_CHANNELS.EMAIL,
        enabled: false,
        source: 'test-rollback',
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.notificationCategoryPreference.count({
        where: { userId: 'missing-user' },
      }),
    ).resolves.toBe(0);
  });

  it('disableEmailForAll creates one durable gate and is idempotent', async () => {
    const user = await createUser();
    await disableEmailForAll(user.id, 'test-disable');
    await disableEmailForAll(user.id, 'test-disable-again');

    await expect(
      prisma.notificationChannelPreference.findUnique({
        where: {
          userId_channel: {
            userId: user.id,
            channel: NOTIFICATION_CHANNELS.EMAIL,
          },
        },
      }),
    ).resolves.toMatchObject({ enabled: false });
    await expect(
      prisma.notificationPreferenceAudit.count({
        where: { userId: user.id, kind: 'GLOBAL_CHANNEL' },
      }),
    ).resolves.toBe(1);
  });

  it('inherits a group activity setting and permits an explicit child-pool override', async () => {
    const user = await createUser();
    const { group, pool } = await createGroupPool(user.id);
    await setContextActivityPreference({
      userId: user.id,
      context: { kind: 'GROUP', groupId: group.id },
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.MUTED,
      source: 'test-group',
    });

    let resolved = await getContextNotificationPreference({
      userId: user.id,
      context: { kind: 'POOL', poolId: pool.id },
    });
    expect(resolved).toMatchObject({
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.MUTED,
      source: 'group_override',
      controllingContext: { kind: 'GROUP', groupId: group.id },
      noticeVisible: true,
    });

    await setContextActivityPreference({
      userId: user.id,
      context: { kind: 'POOL', poolId: pool.id },
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.ALL_ACTIVITY,
      source: 'test-pool',
    });
    resolved = await getContextNotificationPreference({
      userId: user.id,
      context: { kind: 'POOL', poolId: pool.id },
    });
    expect(resolved).toMatchObject({
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.ALL_ACTIVITY,
      source: 'pool_override',
    });

    await clearContextActivityPreference({
      userId: user.id,
      context: { kind: 'POOL', poolId: pool.id },
      source: 'test-clear',
    });
    resolved = await getContextNotificationPreference({
      userId: user.id,
      context: { kind: 'POOL', poolId: pool.id },
    });
    expect(resolved.activityLevel).toBe(NOTIFICATION_ACTIVITY_LEVELS.MUTED);
  });

  it('normalizes empty Custom to Muted and filters populated Custom by topic', async () => {
    const user = await createUser();
    const { pool } = await createGroupPool(user.id);
    const context = { kind: 'POOL', poolId: pool.id } as const;
    await setContextActivityPreference({
      userId: user.id,
      context,
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.CUSTOM,
      customTopics: [],
      source: 'test-empty',
    });
    let resolved = await getContextNotificationPreference({
      userId: user.id,
      context,
    });
    expect(resolved.activityLevel).toBe(NOTIFICATION_ACTIVITY_LEVELS.MUTED);

    await setContextActivityPreference({
      userId: user.id,
      context,
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.CUSTOM,
      customTopics: [NOTIFICATION_TOPICS.FRIEND_REQUESTS],
      source: 'test-custom',
    });
    resolved = await getContextNotificationPreference({
      userId: user.id,
      context,
    });
    expect(
      allowsContextActivity(
        resolved,
        NOTIFICATION_TOPICS.FRIEND_REQUESTS,
        'ROUTINE',
      ),
    ).toBe(true);
    expect(
      allowsContextActivity(
        resolved,
        NOTIFICATION_TOPICS.BIRTHDAY_REMINDERS,
        'IMPORTANT',
      ),
    ).toBe(false);
  });

  it('dismisses one mute cycle and shows the notice after a later re-mute', async () => {
    vi.useFakeTimers();
    const user = await createUser();
    const { group } = await createGroupPool(user.id);
    const context = { kind: 'GROUP', groupId: group.id } as const;
    vi.setSystemTime(new Date('2026-07-13T12:00:00Z'));
    await setContextActivityPreference({
      userId: user.id,
      context,
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.MUTED,
      source: 'test-mute',
    });
    await dismissContextMutedNotice({
      userId: user.id,
      context,
      source: 'test-dismiss',
    });
    let resolved = await getContextNotificationPreference({
      userId: user.id,
      context,
    });
    expect(resolved.noticeVisible).toBe(false);

    vi.setSystemTime(new Date('2026-07-14T12:00:00Z'));
    await setContextActivityPreference({
      userId: user.id,
      context,
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.ALL_ACTIVITY,
      source: 'test-unmute',
    });
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
    await setContextActivityPreference({
      userId: user.id,
      context,
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.MUTED,
      source: 'test-remute',
    });
    resolved = await getContextNotificationPreference({
      userId: user.id,
      context,
    });
    expect(resolved.noticeVisible).toBe(true);
    expect(resolved.noticeDismissedAt).toBeNull();
  });

  it('starts a new inherited notice cycle when the controlling group is re-muted', async () => {
    vi.useFakeTimers();
    const user = await createUser();
    const { group, pool } = await createGroupPool(user.id);
    const groupContext = { kind: 'GROUP', groupId: group.id } as const;
    const poolContext = { kind: 'POOL', poolId: pool.id } as const;

    vi.setSystemTime(new Date('2026-07-13T12:00:00Z'));
    await setContextActivityPreference({
      userId: user.id,
      context: groupContext,
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.MUTED,
      source: 'test-group-mute',
    });
    const first = await getContextNotificationAwareness({
      userId: user.id,
      context: poolContext,
    });
    expect(first).toMatchObject({
      reason: 'inherited_mute',
      noticeVisible: true,
    });
    await dismissContextNotificationNotice({
      userId: user.id,
      context: poolContext,
      source: 'test-dismiss-inherited',
    });
    await expect(
      getContextNotificationAwareness({
        userId: user.id,
        context: poolContext,
      }),
    ).resolves.toMatchObject({ noticeVisible: false });

    vi.setSystemTime(new Date('2026-07-14T12:00:00Z'));
    await setContextActivityPreference({
      userId: user.id,
      context: groupContext,
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.ALL_ACTIVITY,
      source: 'test-group-unmute',
    });
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
    await setContextActivityPreference({
      userId: user.id,
      context: groupContext,
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.MUTED,
      source: 'test-group-remute',
    });
    const next = await getContextNotificationAwareness({
      userId: user.id,
      context: poolContext,
    });
    expect(next.noticeVisible).toBe(true);
    expect(next.noticeKey).not.toBe(first.noticeKey);
  });

  it('shows and revisions a dismissible warning when every delivery channel is off', async () => {
    vi.useFakeTimers();
    const user = await createUser();
    const { group } = await createGroupPool(user.id);
    const context = { kind: 'GROUP', groupId: group.id } as const;
    vi.setSystemTime(new Date('2026-07-13T12:00:00Z'));
    for (const channel of Object.values(NOTIFICATION_CHANNELS)) {
      await setGlobalChannelPreference({
        userId: user.id,
        channel,
        enabled: false,
        source: 'test-all-off',
      });
    }
    const first = await getContextNotificationAwareness({
      userId: user.id,
      context,
    });
    expect(first).toMatchObject({
      notificationOff: true,
      reason: 'no_channels',
      noticeVisible: true,
    });
    await dismissContextNotificationNotice({
      userId: user.id,
      context,
      source: 'test-dismiss-all-off',
    });
    await expect(
      getContextNotificationAwareness({ userId: user.id, context }),
    ).resolves.toMatchObject({ noticeVisible: false });

    vi.setSystemTime(new Date('2026-07-14T12:00:00Z'));
    await setGlobalChannelPreference({
      userId: user.id,
      channel: NOTIFICATION_CHANNELS.IN_APP,
      enabled: true,
      source: 'test-one-on',
    });
    await expect(
      getContextNotificationAwareness({ userId: user.id, context }),
    ).resolves.toMatchObject({ notificationOff: false, reason: null });
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
    await setGlobalChannelPreference({
      userId: user.id,
      channel: NOTIFICATION_CHANNELS.IN_APP,
      enabled: false,
      source: 'test-all-off-again',
    });
    const next = await getContextNotificationAwareness({
      userId: user.id,
      context,
    });
    expect(next.noticeVisible).toBe(true);
    expect(next.noticeKey).not.toBe(first.noticeKey);
  });

  it('rejects context writes for non-members without persisting state', async () => {
    const member = await createUser();
    const outsider = await createUser();
    const { group } = await createGroupPool(member.id);
    await expect(
      setContextActivityPreference({
        userId: outsider.id,
        context: { kind: 'GROUP', groupId: group.id },
        activityLevel: NOTIFICATION_ACTIVITY_LEVELS.MUTED,
        source: 'test-unauthorized',
      }),
    ).rejects.toMatchObject({ init: { status: 404 } });
    await expect(
      prisma.groupNotificationPreference.count({
        where: { userId: outsider.id },
      }),
    ).resolves.toBe(0);
  });
});

// The batched resolver is what the dispatch path uses; the single-user one
// still serves the requireAccess: true loaders. They apply the same precedence
// rules through the same builders, and these tests exist so the two cannot
// drift apart silently — every case asserts the batch entry equals what the
// single-user read returns for that same user.
describe('getContextNotificationPreferencesForUsers', () => {
  beforeEach(async () => {
    await prisma.notificationPreferenceAudit.deleteMany();
    await prisma.poolNotificationPreference.deleteMany();
    await prisma.groupNotificationPreference.deleteMany();
    await prisma.poolContributor.deleteMany();
    await prisma.pool.deleteMany();
    await prisma.usersInGiftGroups.deleteMany();
    await prisma.giftGroup.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { contains: '@example.com' } },
    });
  });

  async function createCohort(size: number) {
    const users = await Promise.all(
      Array.from({ length: size }, () => createUser()),
    );
    const group = await prisma.giftGroup.create({
      data: {
        name: `Group ${randomUUID()}`,
        groupMembers: { create: users.map(({ id }) => ({ userId: id })) },
      },
      select: { id: true },
    });
    const pool = await prisma.pool.create({
      data: {
        title: `Pool ${randomUUID()}`,
        organizerId: users[0]!.id,
        giftGroupId: group.id,
        contributors: { create: users.map(({ id }) => ({ userId: id })) },
      },
      select: { id: true },
    });
    return { users, group, pool };
  }

  async function expectMatchesSingleUserReads(
    userIds: string[],
    context: Parameters<typeof getContextNotificationPreference>[0]['context'],
  ) {
    const bulk = await getContextNotificationPreferencesForUsers({
      userIds,
      context,
    });
    expect(bulk.size).toBe(userIds.length);
    for (const userId of userIds) {
      expect(bulk.get(userId)).toEqual(
        await getContextNotificationPreference({
          userId,
          context,
          requireAccess: false,
        }),
      );
    }
    return bulk;
  }

  it('resolves a mixed pool cohort exactly as the single-user read does', async () => {
    const { users, group, pool } = await createCohort(4);
    const context = { kind: 'POOL', poolId: pool.id } as const;

    // A pool override, which must win outright.
    await setContextActivityPreference({
      userId: users[0]!.id,
      context,
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.ALL_ACTIVITY,
      source: 'preferences-test',
    });
    // A group mute with no pool row, which must be inherited.
    await setContextActivityPreference({
      userId: users[1]!.id,
      context: { kind: 'GROUP', groupId: group.id },
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.MUTED,
      source: 'preferences-test',
    });
    // A group mute the user has dismissed the notice for on this one pool.
    // The dismissal lives on the POOL row while the group row is what mutes,
    // so this is the case that catches a builder reading notice fields off
    // the wrong row.
    await setContextActivityPreference({
      userId: users[2]!.id,
      context: { kind: 'GROUP', groupId: group.id },
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.MUTED,
      source: 'preferences-test',
    });
    await dismissContextNotificationNotice({
      userId: users[2]!.id,
      context,
      source: 'preferences-test',
    });
    // users[3] has no rows at all — the sparse default.

    const bulk = await expectMatchesSingleUserReads(
      users.map(({ id }) => id),
      context,
    );

    // Guard that the cohort really is mixed, so the equality above is not
    // four copies of the same answer.
    expect(bulk.get(users[0]!.id)!.source).toBe('pool_override');
    expect(bulk.get(users[1]!.id)!.source).toBe('group_override');
    expect(bulk.get(users[1]!.id)!.noticeVisible).toBe(true);
    expect(bulk.get(users[2]!.id)!.noticeVisible).toBe(false);
    expect(bulk.get(users[3]!.id)!.source).toBe('application_default');
    expect(bulk.get(users[3]!.id)!.activityLevel).toBe(
      NOTIFICATION_ACTIVITY_LEVELS.IMPORTANT_ONLY,
    );
  });

  it('resolves a group context cohort exactly as the single-user read does', async () => {
    const { users, group } = await createCohort(3);
    const context = { kind: 'GROUP', groupId: group.id } as const;

    await setContextActivityPreference({
      userId: users[0]!.id,
      context,
      activityLevel: NOTIFICATION_ACTIVITY_LEVELS.MUTED,
      source: 'preferences-test',
    });

    const bulk = await expectMatchesSingleUserReads(
      users.map(({ id }) => id),
      context,
    );
    expect(bulk.get(users[0]!.id)!.source).toBe('group_override');
    expect(bulk.get(users[1]!.id)!.source).toBe('application_default');
  });

  it('falls back to the application default for a pool with no group', async () => {
    const users = await Promise.all([createUser(), createUser()]);
    const pool = await prisma.pool.create({
      data: {
        title: `Pool ${randomUUID()}`,
        organizerId: users[0]!.id,
        contributors: { create: users.map(({ id }) => ({ userId: id })) },
      },
      select: { id: true },
    });
    const context = { kind: 'POOL', poolId: pool.id } as const;

    const bulk = await expectMatchesSingleUserReads(
      users.map(({ id }) => id),
      context,
    );
    for (const { id } of users) {
      expect(bulk.get(id)!.source).toBe('application_default');
      expect(bulk.get(id)!.controllingContext).toBeNull();
    }
  });

  it('deduplicates repeated user ids', async () => {
    const { users, pool } = await createCohort(1);
    const userId = users[0]!.id;

    const bulk = await getContextNotificationPreferencesForUsers({
      userIds: [userId, userId, userId],
      context: { kind: 'POOL', poolId: pool.id },
    });

    expect(bulk.size).toBe(1);
    expect(bulk.get(userId)).toBeDefined();
  });

  it('rejects for a pool that does not exist', async () => {
    const user = await createUser();

    await expect(
      getContextNotificationPreferencesForUsers({
        userIds: [user.id],
        context: { kind: 'POOL', poolId: 'missing-pool' },
      }),
    ).rejects.toBeDefined();
  });

  it('returns an empty map without querying for an empty audience', async () => {
    const bulk = await getContextNotificationPreferencesForUsers({
      userIds: [],
      context: { kind: 'POOL', poolId: 'missing-pool' },
    });

    // Note the deliberately bogus pool id: an empty audience must short-circuit
    // before the pool is even read, so this must not throw the 404 above.
    expect(bulk.size).toBe(0);
  });
});
