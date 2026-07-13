import { randomUUID } from 'node:crypto';
import { describe, expect, it, beforeEach } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  type NotificationType,
} from '#app/utils/notification-catalog.ts';
import {
  disableEmailForAll,
  ensureNotificationPreferencesForUser,
  getNotificationPreferenceForChannels,
  getNotificationPreferences,
  notificationPreferenceDefaultsFor,
  setNotificationPreference,
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
    expect(preference).toEqual({
      inAppEnabled: true,
      emailEnabled: true,
      pushEnabled: false,
    });
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

  it('disableEmailForAll is a no-op when no email rows are enabled', async () => {
    const user = await createUser();
    await ensureNotificationPreferencesForUser(user.id);
    // Flip all email prefs off ahead of time.
    await prisma.userNotificationPreference.updateMany({
      where: { userId: user.id },
      data: { emailEnabled: false },
    });
    const beforeAudit = await prisma.notificationPreferenceAudit.count({
      where: { userId: user.id },
    });

    await disableEmailForAll(user.id, 'test-noop');

    const afterAudit = await prisma.notificationPreferenceAudit.count({
      where: { userId: user.id },
    });
    expect(afterAudit).toBe(beforeAudit);
  });

  it('disableEmailForAll only audits the rows that actually transitioned', async () => {
    const user = await createUser();
    await ensureNotificationPreferencesForUser(user.id);
    // Pre-disable one email pref so only one row transitions.
    await prisma.userNotificationPreference.updateMany({
      where: {
        userId: user.id,
        type: NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
      },
      data: { emailEnabled: false },
    });

    await disableEmailForAll(user.id, 'test-partial');

    const audits = await prisma.notificationPreferenceAudit.findMany({
      where: { userId: user.id, source: 'test-partial' },
      select: { type: true, previousValue: true, newValue: true },
    });
    // FRIEND_REQUEST_RECEIVED was true → false (and so was UPCOMING_BIRTHDAY
    // if its default is true). Defaults live in notification-catalog; we
    // assert we only audited rows whose previous value was true.
    expect(audits.every((a) => a.previousValue === true)).toBe(true);
    expect(audits.every((a) => a.newValue === false)).toBe(true);
    // FRIEND_REQUEST_ACCEPTED was already off, so there should be no audit.
    expect(
      audits.find((a) => a.type === NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED),
    ).toBeUndefined();
  });

  it('setNotificationPreference creates a row for users without one', async () => {
    const user = await createUser();
    // No ensure call — mimic a pre-bootstrap user visiting the toggle path.

    const result = await setNotificationPreference(
      user.id,
      NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      NOTIFICATION_CHANNELS.EMAIL,
      false,
      'test-fresh',
    );

    expect(result.emailEnabled).toBe(false);
    const stored = await prisma.userNotificationPreference.findUnique({
      where: {
        userId_type: {
          userId: user.id,
          type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
        },
      },
      select: { emailEnabled: true, inAppEnabled: true },
    });
    expect(stored?.emailEnabled).toBe(false);
    // The other channel defaults to the registry value.
    expect(stored?.inAppEnabled).toBe(
      DEFAULT_NOTIFICATION_PREFERENCES[
        NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED
      ].inAppEnabled,
    );
    // An audit row is written because the effective value moved from
    // "default true" → "explicit false".
    const audit = await prisma.notificationPreferenceAudit.findFirst({
      where: { userId: user.id, source: 'test-fresh' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.previousValue).toBe(true);
    expect(audit?.newValue).toBe(false);
  });

  it('setNotificationPreference returns the existing row when the value is unchanged', async () => {
    const user = await createUser();
    await ensureNotificationPreferencesForUser(user.id);

    // Idempotent call: try to "set" to the current default.
    const result = await setNotificationPreference(
      user.id,
      NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      NOTIFICATION_CHANNELS.EMAIL,
      DEFAULT_NOTIFICATION_PREFERENCES[
        NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED
      ].emailEnabled,
      'test-idempotent',
    );

    expect(result.emailEnabled).toBe(
      DEFAULT_NOTIFICATION_PREFERENCES[
        NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED
      ].emailEnabled,
    );
    // No audit row for no-op.
    const audit = await prisma.notificationPreferenceAudit.findFirst({
      where: { userId: user.id, source: 'test-idempotent' },
    });
    expect(audit).toBeNull();
  });

  it('getNotificationPreferences fills in defaults for types without a row', async () => {
    const user = await createUser();
    // Seed exactly one row so we can verify the fill-in merges with stored.
    await prisma.userNotificationPreference.create({
      data: {
        userId: user.id,
        type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
        inAppEnabled: false,
        emailEnabled: false,
      },
    });

    const prefs = await getNotificationPreferences(user.id);

    // The stored row comes back as-is.
    expect(prefs.get(NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED)).toEqual({
      inAppEnabled: false,
      emailEnabled: false,
      pushEnabled: false,
    });
    // Missing types come back with registry defaults.
    for (const type of Object.values(NOTIFICATION_TYPES)) {
      if (type === NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED) continue;
      expect(prefs.get(type)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES[type]);
    }
  });

  it('notificationPreferenceDefaultsFor produces one row per registered type', () => {
    const rows = notificationPreferenceDefaultsFor('user-xyz');
    const types = new Set(rows.map((r) => r.type as NotificationType));
    for (const type of Object.values(NOTIFICATION_TYPES)) {
      expect(types.has(type)).toBe(true);
    }
    for (const row of rows) {
      expect(row.userId).toBe('user-xyz');
      expect(row.inAppEnabled).toBe(
        DEFAULT_NOTIFICATION_PREFERENCES[row.type as NotificationType]
          .inAppEnabled,
      );
      expect(row.emailEnabled).toBe(
        DEFAULT_NOTIFICATION_PREFERENCES[row.type as NotificationType]
          .emailEnabled,
      );
    }
  });
});
