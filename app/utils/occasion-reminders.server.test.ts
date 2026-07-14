/**
 * @vitest-environment node
 */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OCCASION_REMINDER_EMAIL_SRC } from '#app/utils/analytics.ts';
import { prisma } from '#app/utils/db.server.ts';
import { sendEmail } from '#app/utils/email.server.ts';

vi.mock('#app/utils/email.server.ts', () => ({
  sendEmail: vi
    .fn()
    .mockResolvedValue({ status: 'success', data: { id: 'mock-email' } }),
}));

const sendWebPush = vi.fn().mockResolvedValue(undefined);
vi.mock('#app/utils/web-push.server.ts', () => ({
  sendWebPush: (...args: Array<unknown>) => sendWebPush(...args),
}));

const captureException = vi.fn();
vi.mock('@sentry/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    captureException: (...args: Array<unknown>) => captureException(...args),
  };
});

const queueLogEvent = vi.fn().mockReturnValue({ eventId: 'mock-event' });
vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: (...args: Array<unknown>) => queueLogEvent(...args),
}));

import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
} from '#app/utils/notification-catalog.ts';
import {
  ensureNotificationPreferencesForUser,
  setNotificationPreference,
} from '#app/utils/notification-preferences.server.ts';
import {
  findUpcomingBirthdayOwners,
  getBirthdayReminderRecipientIds,
  runOccasionReminderSweep,
  trackOccasionReminderEmailClick,
  UPCOMING_BIRTHDAY_LEAD_DAYS,
} from '#app/utils/occasion-reminders.server.ts';

// Local-time constructor (matches birthday.test.ts convention) so "today" is
// deterministic regardless of the test runner's TZ — getUpcomingBirthday
// reads "today" via local-time getters even though the birthday value itself
// is read via UTC getters (see birthday.ts).
const NOW = new Date(2026, 6, 11, 12, 0, 0); // July 11 2026, local

function birthdayInDays(days: number): Date {
  const target = new Date(NOW);
  target.setDate(target.getDate() + days);
  // Stored as noon UTC per BirthdaySchema convention.
  return new Date(
    Date.UTC(2000, target.getMonth(), target.getDate(), 12, 0, 0),
  );
}

async function createUser(
  overrides: Partial<{
    email: string;
    username: string;
    name: string;
    birthday: Date | null;
    birthdayVisibility: string;
  }> = {},
) {
  return prisma.user.create({
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      birthdayVisibility: true,
    },
    data: {
      email: overrides.email ?? `user-${randomUUID()}@example.com`,
      username: overrides.username ?? `user_${randomUUID().slice(0, 8)}`,
      name: overrides.name ?? 'Test User',
      birthday: overrides.birthday,
      birthdayVisibility: overrides.birthdayVisibility ?? 'FRIENDS',
      roles: {
        connectOrCreate: {
          where: { name: 'user' },
          create: { name: 'user' },
        },
      },
    },
  });
}

async function makeFriends(userAId: string, userBId: string) {
  const [a, b] = ([userAId, userBId] as [string, string]).sort();
  await prisma.friendship.create({ data: { userAId: a, userBId: b } });
}

async function optIntoEmail(userId: string) {
  await ensureNotificationPreferencesForUser(userId);
  await setNotificationPreference(
    userId,
    NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
    NOTIFICATION_CHANNELS.EMAIL,
    true,
    'test',
  );
}

async function cleanup() {
  await prisma.notificationDelivery.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.notificationPreferenceAudit.deleteMany();
  await prisma.userNotificationPreference.deleteMany();
  await prisma.usersInGiftGroups.deleteMany();
  await prisma.giftGroup.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.user.deleteMany({
    where: { email: { contains: '@example.com' } },
  });
}

describe('occasion-reminders', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // vite.config.ts sets `restoreMocks: true`, which strips vi.fn()
    // implementations before every test — factory-level defaults don't
    // survive, so the success default must be (re)set here.
    vi.mocked(sendEmail).mockResolvedValue({
      status: 'success',
      data: { id: 'mock-email' },
    } as never);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.mocked(sendEmail).mockClear();
    sendWebPush.mockClear();
    captureException.mockClear();
    queueLogEvent.mockClear();
    await cleanup();
  });

  describe('findUpcomingBirthdayOwners', () => {
    it('includes a birthday inside the lead window', async () => {
      const user = await createUser({ birthday: birthdayInDays(3) });
      const owners = await findUpcomingBirthdayOwners();
      expect(owners.map((o) => o.user.id)).toContain(user.id);
    });

    it('includes a birthday exactly on the lead-day boundary', async () => {
      const user = await createUser({
        birthday: birthdayInDays(UPCOMING_BIRTHDAY_LEAD_DAYS),
      });
      const owners = await findUpcomingBirthdayOwners();
      expect(owners.map((o) => o.user.id)).toContain(user.id);
    });

    it('excludes a birthday outside the lead window', async () => {
      const user = await createUser({
        birthday: birthdayInDays(UPCOMING_BIRTHDAY_LEAD_DAYS + 1),
      });
      const owners = await findUpcomingBirthdayOwners();
      expect(owners.map((o) => o.user.id)).not.toContain(user.id);
    });

    it('excludes users with no birthday set', async () => {
      const user = await createUser({ birthday: null });
      const owners = await findUpcomingBirthdayOwners();
      expect(owners.map((o) => o.user.id)).not.toContain(user.id);
    });
  });

  describe('getBirthdayReminderRecipientIds', () => {
    it('returns nobody when birthdayVisibility is NOBODY, even for direct friends', async () => {
      const owner = await createUser({ birthdayVisibility: 'NOBODY' });
      const friend = await createUser();
      await makeFriends(owner.id, friend.id);
      const recipientIds = await getBirthdayReminderRecipientIds(owner);
      expect(recipientIds).toEqual([]);
    });

    it('includes a direct friend under the default FRIENDS visibility', async () => {
      const owner = await createUser({ birthdayVisibility: 'FRIENDS' });
      const friend = await createUser();
      const stranger = await createUser();
      await makeFriends(owner.id, friend.id);
      const recipientIds = await getBirthdayReminderRecipientIds(owner);
      expect(recipientIds).toContain(friend.id);
      expect(recipientIds).not.toContain(stranger.id);
    });

    it('includes every co-member of a shareBirthday group, overriding FRIENDS', async () => {
      const owner = await createUser({ birthdayVisibility: 'FRIENDS' });
      const coMember = await createUser();
      const group = await prisma.giftGroup.create({
        data: { name: 'Test Group' },
      });
      await prisma.usersInGiftGroups.createMany({
        data: [
          { userId: owner.id, giftGroupId: group.id, shareBirthday: true },
          { userId: coMember.id, giftGroupId: group.id },
        ],
      });
      const recipientIds = await getBirthdayReminderRecipientIds(owner);
      expect(recipientIds).toContain(coMember.id);
    });

    it('does NOT ping strangers under EVERYONE visibility — can-view is not the reminder audience', async () => {
      const owner = await createUser({ birthdayVisibility: 'EVERYONE' });
      const friend = await createUser();
      const stranger = await createUser();
      await makeFriends(owner.id, friend.id);
      const recipientIds = await getBirthdayReminderRecipientIds(owner);
      expect(recipientIds).toContain(friend.id);
      expect(recipientIds).not.toContain(stranger.id);
    });

    it('does NOT ping mutual-friend-only viewers under FRIENDS_OF_FRIENDS', async () => {
      const owner = await createUser({
        birthdayVisibility: 'FRIENDS_OF_FRIENDS',
      });
      const bridge = await createUser();
      const friendOfFriend = await createUser();
      const unrelated = await createUser();
      await makeFriends(owner.id, bridge.id);
      await makeFriends(bridge.id, friendOfFriend.id);
      const recipientIds = await getBirthdayReminderRecipientIds(owner);
      expect(recipientIds).toContain(bridge.id);
      // A friend-of-friend may view the birthday on the profile, but is not
      // proactively notified about it.
      expect(recipientIds).not.toContain(friendOfFriend.id);
      expect(recipientIds).not.toContain(unrelated.id);
    });
  });

  describe('runOccasionReminderSweep', () => {
    it('notifies each eligible viewer exactly once, idempotently across repeated runs', async () => {
      const owner = await createUser({
        birthday: birthdayInDays(3),
        birthdayVisibility: 'FRIENDS',
      });
      const friend = await createUser();
      await makeFriends(owner.id, friend.id);

      const first = await runOccasionReminderSweep();
      expect(first.viewersNotified).toBe(1);
      expect(first.viewersSkipped).toBe(0);

      const notificationsAfterFirst = await prisma.notification.findMany({
        where: { userId: friend.id, type: 'UPCOMING_BIRTHDAY' },
      });
      expect(notificationsAfterFirst).toHaveLength(1);

      // Re-running the sweep (e.g. the scheduled Machine firing again, or a
      // missed-day catch-up) must not create a second notification — and the
      // summary must report the no-op as skipped, not notified.
      const second = await runOccasionReminderSweep();
      expect(second.viewersNotified).toBe(0);
      expect(second.viewersSkipped).toBe(1);

      const notificationsAfterSecond = await prisma.notification.findMany({
        where: { userId: friend.id, type: 'UPCOMING_BIRTHDAY' },
      });
      expect(notificationsAfterSecond).toHaveLength(1);
    });

    it('does not send email by default (v1 in-app-only default)', async () => {
      const owner = await createUser({
        birthday: birthdayInDays(1),
        birthdayVisibility: 'FRIENDS',
      });
      const friend = await createUser();
      await makeFriends(owner.id, friend.id);

      await runOccasionReminderSweep();

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends the opted-in email only once across repeated sweep runs', async () => {
      const owner = await createUser({
        birthday: birthdayInDays(3),
        birthdayVisibility: 'FRIENDS',
      });
      const friend = await createUser();
      await makeFriends(owner.id, friend.id);
      await optIntoEmail(friend.id);

      // The daily scheduled Machine re-fires the sweep on every day of the
      // lead window — the delivery ledger must make every channel (not just
      // the in-app row) a no-op on re-entry.
      await runOccasionReminderSweep();
      await runOccasionReminderSweep();
      await runOccasionReminderSweep();

      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it('does not resurrect a reminder the user deleted from the bell', async () => {
      const owner = await createUser({
        birthday: birthdayInDays(3),
        birthdayVisibility: 'FRIENDS',
      });
      const friend = await createUser();
      await makeFriends(owner.id, friend.id);
      await optIntoEmail(friend.id);

      await runOccasionReminderSweep();
      // Simulate the user deleting the notification from the bell (the
      // api.notifications.$id.delete route hard-deletes the row). The
      // delivery ledger, not the notification row, is the dedupe record.
      await prisma.notification.deleteMany({ where: { userId: friend.id } });

      await runOccasionReminderSweep();

      const notifications = await prisma.notification.findMany({
        where: { userId: friend.id, type: 'UPCOMING_BIRTHDAY' },
      });
      expect(notifications).toHaveLength(0);
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it('continues past a failing recipient and reports it in the summary', async () => {
      const owner = await createUser({
        birthday: birthdayInDays(3),
        birthdayVisibility: 'FRIENDS',
      });
      const friendA = await createUser();
      const friendB = await createUser();
      await makeFriends(owner.id, friendA.id);
      await makeFriends(owner.id, friendB.id);
      await optIntoEmail(friendA.id);
      await optIntoEmail(friendB.id);

      vi.mocked(sendEmail).mockRejectedValueOnce(new Error('resend outage'));

      const summary = await runOccasionReminderSweep();

      // Channel isolation: the recipient whose email failed still got the
      // in-app row (and counts as failed in the summary); the other recipient
      // delivered fully on both channels.
      expect(summary).toEqual({
        birthdayOwnersConsidered: 1,
        viewersNotified: 1,
        viewersSkipped: 0,
        viewersFailed: 1,
      });
      expect(captureException).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledTimes(2);
      const notifications = await prisma.notification.findMany({
        where: { type: 'UPCOMING_BIRTHDAY' },
      });
      expect(notifications).toHaveLength(2);
    });
  });

  describe('trackOccasionReminderEmailClick', () => {
    const makeRequest = (search: string) =>
      new Request(`https://giftpool.app/users/someone${search}`);

    it('fires occasion_reminder_email_clicked when the src param matches', async () => {
      await trackOccasionReminderEmailClick(
        makeRequest(`?src=${OCCASION_REMINDER_EMAIL_SRC}`),
        { viewerId: 'viewer-1', birthdayUserId: 'owner-1' },
      );
      expect(queueLogEvent).toHaveBeenCalledTimes(1);
      expect(queueLogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'occasion_reminder_email_clicked',
          source: 'server',
          userId: 'viewer-1',
          properties: { birthdayUserId: 'owner-1' },
        }),
      );
    });

    it('is a no-op without the src param or with a different value', async () => {
      await trackOccasionReminderEmailClick(makeRequest(''), {
        viewerId: 'viewer-1',
        birthdayUserId: 'owner-1',
      });
      await trackOccasionReminderEmailClick(makeRequest('?src=newsletter'), {
        viewerId: 'viewer-1',
        birthdayUserId: 'owner-1',
      });
      expect(queueLogEvent).not.toHaveBeenCalled();
    });
  });
});
