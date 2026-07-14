import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
} from '#app/utils/notification-catalog.ts';
import { resolveNotificationPolicy } from '#app/utils/notification-policy.server.ts';
import { setNotificationPreference } from '#app/utils/notification-preferences.server.ts';

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
    await prisma.userNotificationPreference.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { contains: '@example.com' } },
    });
  });

  it('explains catalog defaults when legacy rows are missing', async () => {
    const user = await createUser();

    const policy = await resolveNotificationPolicy({
      userId: user.id,
      type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
    });

    expect(policy.channels[NOTIFICATION_CHANNELS.IN_APP]).toMatchObject({
      allowed: true,
      reason: 'allowed',
    });
    expect(policy.channels[NOTIFICATION_CHANNELS.EMAIL]).toMatchObject({
      allowed: false,
      reason: 'preference_disabled',
    });
  });

  it('reflects an explicit legacy event preference', async () => {
    const user = await createUser();
    await setNotificationPreference(
      user.id,
      NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      NOTIFICATION_CHANNELS.EMAIL,
      true,
      'policy-test',
    );

    const policy = await resolveNotificationPolicy({
      userId: user.id,
      type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
    });

    expect(policy.channels[NOTIFICATION_CHANNELS.EMAIL]).toEqual({
      channel: NOTIFICATION_CHANNELS.EMAIL,
      allowed: true,
      reason: 'allowed',
      source: 'legacy_event_preference',
    });
  });
});
