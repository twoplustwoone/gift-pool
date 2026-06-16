import { prisma } from '#app/utils/db.server.ts';
import {
  channelToColumn,
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

// Shape used for `createMany` / nested `create` when bootstrapping a new user.
// Kept as a plain data builder so callers can either pass it to signup's
// nested-create or hand it to a standalone createMany.
export function notificationPreferenceDefaultsFor(userId: string) {
  const now = new Date();
  return preferenceTypes.map((type) => ({
    userId,
    type,
    inAppEnabled: defaultForType(type).inAppEnabled,
    emailEnabled: defaultForType(type).emailEnabled,
    pushEnabled: defaultForType(type).pushEnabled,
    createdAt: now,
    updatedAt: now,
  }));
}

// Legacy bootstrap: upserts one row per notification type. Still exported for
// tests and for the settings route's "heal missing rows" paths, but it should
// NOT be called on the hot read path — reads tolerate missing rows by falling
// back to `DEFAULT_NOTIFICATION_PREFERENCES`, and new users get their rows
// via `createMany` in the signup flow.
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
          pushEnabled: defaultForType(type).pushEnabled,
          createdAt: now,
          updatedAt: now,
        },
      }),
    ),
  );
}

export async function getNotificationPreferences(userId: string) {
  const prefs = await prisma.userNotificationPreference.findMany({
    where: { userId },
    select: {
      type: true,
      inAppEnabled: true,
      emailEnabled: true,
      pushEnabled: true,
    },
  });
  const map = new Map<
    NotificationType,
    { inAppEnabled: boolean; emailEnabled: boolean; pushEnabled: boolean }
  >();
  for (const pref of prefs) {
    map.set(pref.type as NotificationType, {
      inAppEnabled: pref.inAppEnabled,
      emailEnabled: pref.emailEnabled,
      pushEnabled: pref.pushEnabled,
    });
  }
  // Fill in defaults for any type that doesn't yet have a row. This replaces
  // the old "ensure upsert" pattern that ran N writes on every read.
  for (const type of preferenceTypes) {
    if (!map.has(type)) {
      map.set(type, { ...defaultForType(type) });
    }
  }
  return map;
}

export async function getNotificationPreferenceForChannels(
  userId: string,
  type: NotificationType,
) {
  const pref = await prisma.userNotificationPreference.findUnique({
    where: { userId_type: { userId, type } },
    select: { inAppEnabled: true, emailEnabled: true, pushEnabled: true },
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
  const column = channelToColumn(channel);
  const existing = await prisma.userNotificationPreference.findUnique({
    where: { userId_type: { userId, type } },
    select: { inAppEnabled: true, emailEnabled: true, pushEnabled: true },
  });
  const defaults = defaultForType(type);
  const previousValue = existing?.[column] ?? defaults[column];
  if (existing && previousValue === enabled) {
    return existing;
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.userNotificationPreference.upsert({
      where: { userId_type: { userId, type } },
      update: {
        [column]: enabled,
      },
      create: {
        userId,
        type,
        inAppEnabled:
          column === 'inAppEnabled' ? enabled : defaults.inAppEnabled,
        emailEnabled:
          column === 'emailEnabled' ? enabled : defaults.emailEnabled,
        pushEnabled:
          column === 'pushEnabled' ? enabled : defaults.pushEnabled,
      },
    });

    // Only emit an audit row when the flag actually moved. Upserting a fresh
    // row with the default value (equal to `enabled`) is a no-op audit-wise.
    if (previousValue !== enabled) {
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
    }

    return updated;
  });

  return result;
}

export async function disableEmailForAll(userId: string, source: string) {
  // Previously this function iterated each preference row inside a transaction
  // and issued one UPDATE + one INSERT per type. Even on 3 types that was 6
  // round-trips. Now we do one findMany to capture the "which rows were
  // actually ON" set (for audit), then a single updateMany + a single
  // createMany inside one transaction.
  const previouslyEnabled = await prisma.userNotificationPreference.findMany({
    where: { userId, emailEnabled: true },
    select: { type: true },
  });
  if (previouslyEnabled.length === 0) return;

  await prisma.$transaction([
    prisma.userNotificationPreference.updateMany({
      where: { userId, emailEnabled: true },
      data: { emailEnabled: false },
    }),
    prisma.notificationPreferenceAudit.createMany({
      data: previouslyEnabled.map((pref) => ({
        userId,
        type: pref.type,
        channel: NOTIFICATION_CHANNELS.EMAIL,
        previousValue: true,
        newValue: false,
        source,
      })),
    }),
  ]);
}
