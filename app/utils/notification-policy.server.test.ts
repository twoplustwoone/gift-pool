import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TOPICS,
  NOTIFICATION_TYPES,
} from '#app/utils/notification-catalog.ts';
import { resolveNotificationPolicy } from '#app/utils/notification-policy.server.ts';
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
