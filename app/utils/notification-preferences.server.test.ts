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
  dismissContextMutedNotice,
  getContextNotificationPreference,
  getNotificationPreferenceForChannels,
  getNotificationPreferences,
  NOTIFICATION_ACTIVITY_LEVELS,
  resolveCentralNotificationPreferences,
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
