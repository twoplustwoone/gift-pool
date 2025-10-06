import { prisma } from '#app/utils/db.server.ts';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  type NotificationChannel,
  type NotificationType,
} from '#app/utils/notification-registry.ts';

const preferenceTypes = Object.values(NOTIFICATION_TYPES);

function defaultForType(type: NotificationType) {
  return DEFAULT_NOTIFICATION_PREFERENCES[type];
}

export async function ensureNotificationPreferencesForUser(
  userId: string,
  tx = prisma,
) {
  const now = new Date();
  await Promise.all(
    preferenceTypes.map((type) =>
      tx.userNotificationPreference.upsert({
        where: {
          userId_type: {
            userId,
            type,
          },
        },
        update: {},
        create: {
          userId,
          type,
          inAppEnabled: defaultForType(type).inAppEnabled,
          emailEnabled: defaultForType(type).emailEnabled,
          createdAt: now,
          updatedAt: now,
        },
      }),
    ),
  );
}

export async function getNotificationPreferences(userId: string) {
  await ensureNotificationPreferencesForUser(userId);
  const prefs = await prisma.userNotificationPreference.findMany({
    where: { userId },
  });
  const map = new Map<
    NotificationType,
    { inAppEnabled: boolean; emailEnabled: boolean }
  >();
  for (const pref of prefs) {
    map.set(pref.type as NotificationType, {
      inAppEnabled: pref.inAppEnabled,
      emailEnabled: pref.emailEnabled,
    });
  }
  return map;
}

export async function getNotificationPreferenceForChannels(
  userId: string,
  type: NotificationType,
) {
  await ensureNotificationPreferencesForUser(userId);
  const pref = await prisma.userNotificationPreference.findUnique({
    where: { userId_type: { userId, type } },
    select: { inAppEnabled: true, emailEnabled: true },
  });
  if (!pref) {
    const defaults = defaultForType(type);
    return { ...defaults };
  }
  return pref;
}

export async function setNotificationPreference(
  userId: string,
  type: NotificationType,
  channel: NotificationChannel,
  enabled: boolean,
  source: string,
) {
  await ensureNotificationPreferencesForUser(userId);
  const column =
    channel === NOTIFICATION_CHANNELS.EMAIL ? 'emailEnabled' : 'inAppEnabled';
  const existing = await prisma.userNotificationPreference.findUnique({
    where: { userId_type: { userId, type } },
    select: { inAppEnabled: true, emailEnabled: true },
  });
  const previousValue = existing?.[column] ?? defaultForType(type)[column];
  if (previousValue === enabled) {
    return existing ?? { inAppEnabled: enabled, emailEnabled: enabled };
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.userNotificationPreference.update({
      where: { userId_type: { userId, type } },
      data: {
        [column]: enabled,
      },
    });

    await tx.notificationPreferenceAudit.create({
      data: {
        userId,
        type,
        channel,
        previousValue,
        newValue: enabled,
        source,
      },
    });

    return updated;
  });

  return result;
}

export async function disableEmailForAll(userId: string, source: string) {
  await ensureNotificationPreferencesForUser(userId);
  const preferences = await prisma.userNotificationPreference.findMany({
    where: { userId },
    select: { type: true, emailEnabled: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const pref of preferences) {
      if (!pref.emailEnabled) continue;
      await tx.userNotificationPreference.update({
        where: { userId_type: { userId, type: pref.type } },
        data: {
          emailEnabled: false,
        },
      });
      await tx.notificationPreferenceAudit.create({
        data: {
          userId,
          type: pref.type,
          channel: NOTIFICATION_CHANNELS.EMAIL,
          previousValue: true,
          newValue: false,
          source,
        },
      });
    }
  });
}
