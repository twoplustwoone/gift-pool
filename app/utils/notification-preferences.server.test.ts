import { randomUUID } from 'node:crypto';
import { describe, expect, it, beforeEach } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import {
  ensureNotificationPreferencesForUser,
  getNotificationPreferenceForChannels,
  setNotificationPreference,
  disableEmailForAll,
} from '#app/utils/notification-preferences.server.ts';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
} from '#app/utils/notification-registry.ts';

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

describe('notification preferences', () => {
  beforeEach(async () => {
    await prisma.notificationPreferenceAudit.deleteMany();
    await prisma.userNotificationPreference.deleteMany();
    await prisma.friendRequest.deleteMany();
    await prisma.friendship.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { contains: '@example.com' } },
    });
  });

  it('seeds defaults when ensuring preferences', async () => {
    const user = await createUser();
    await ensureNotificationPreferencesForUser(user.id);
    const preference = await getNotificationPreferenceForChannels(
      user.id,
      NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
    );
    expect(preference).toEqual({ inAppEnabled: true, emailEnabled: true });
  });

  it('persists preference changes with audit log entries', async () => {
    const user = await createUser();
    await ensureNotificationPreferencesForUser(user.id);

    await setNotificationPreference(
      user.id,
      NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      NOTIFICATION_CHANNELS.EMAIL,
      false,
      'test',
    );

    const preference = await getNotificationPreferenceForChannels(
      user.id,
      NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
    );
    expect(preference.emailEnabled).toBe(false);

    const audit = await prisma.notificationPreferenceAudit.findFirst({
      where: {
        userId: user.id,
        type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.previousValue).toBe(true);
    expect(audit?.newValue).toBe(false);
    expect(audit?.channel).toBe(NOTIFICATION_CHANNELS.EMAIL);
  });

  it('disables email for all types', async () => {
    const user = await createUser();
    await ensureNotificationPreferencesForUser(user.id);

    await disableEmailForAll(user.id, 'test');

    for (const type of Object.values(NOTIFICATION_TYPES)) {
      const pref = await getNotificationPreferenceForChannels(user.id, type);
      if (type === NOTIFICATION_TYPES.UPCOMING_BIRTHDAY) {
        expect(pref.emailEnabled).toBe(false);
      } else {
        expect(pref.emailEnabled).toBe(false);
      }
    }
  });
});
