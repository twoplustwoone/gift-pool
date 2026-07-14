import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { sendEmail } from '#app/utils/email.server.ts';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
} from '#app/utils/notification-catalog.ts';
import { dispatchNotification } from '#app/utils/notification-dispatcher.server.ts';
import { setNotificationPreference } from '#app/utils/notification-preferences.server.ts';

vi.mock('#app/utils/email.server.ts', () => ({
  sendEmail: vi
    .fn()
    .mockResolvedValue({ status: 'success', data: { id: 'mock-email' } }),
}));

const sendWebPush = vi.fn();
const hasWebPushCapability = vi.fn();
vi.mock('#app/utils/web-push.server.ts', () => ({
  sendWebPush: (...args: Array<unknown>) => sendWebPush(...args),
  hasWebPushCapability: (...args: Array<unknown>) =>
    hasWebPushCapability(...args),
}));

const queueLogEvent = vi.fn().mockReturnValue({ eventId: 'mock-event' });
vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: (...args: Array<unknown>) => queueLogEvent(...args),
}));

const captureException = vi.fn();
vi.mock('@sentry/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    captureException: (...args: Array<unknown>) => captureException(...args),
  };
});

async function createUser(
  overrides: Partial<{ email: string; username: string; name: string }> = {},
) {
  return prisma.user.create({
    select: { id: true, email: true, username: true, name: true },
    data: {
      email: overrides.email ?? `user-${randomUUID()}@example.com`,
      username: overrides.username ?? `user_${randomUUID().slice(0, 8)}`,
      name: overrides.name ?? 'Test User',
      roles: {
        connectOrCreate: {
          where: { name: 'user' },
          create: { name: 'user' },
        },
      },
    },
  });
}

// Mirrors the sweep: daysUntil and the birthday date are derived from the
// same moment (real or faked "now"), and the date travels in the payload.
function birthdayPayload(
  viewerId: string,
  birthdayOwner: { id: string; username: string; name: string | null },
  daysUntil: number,
) {
  const birthdayDate = new Date();
  birthdayDate.setDate(birthdayDate.getDate() + daysUntil);
  return {
    targetUserId: viewerId,
    birthdayUserId: birthdayOwner.id,
    birthdayUsername: birthdayOwner.username,
    birthdayDisplayName: birthdayOwner.name ?? birthdayOwner.username,
    daysUntil,
    birthdayDate,
  };
}

describe('notification dispatcher', () => {
  const emailMock = vi.mocked(sendEmail);

  beforeEach(() => {
    // vite.config.ts sets `restoreMocks: true`, which strips vi.fn()
    // implementations before every test — factory-level defaults don't
    // survive, so the success default must be (re)set here.
    emailMock.mockResolvedValue({
      status: 'success',
      data: { id: 'mock-email' },
    } as never);
    hasWebPushCapability.mockResolvedValue(true);
    sendWebPush.mockResolvedValue({
      status: 'delivered',
      attempted: 1,
      delivered: 1,
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    emailMock.mockClear();
    sendWebPush.mockClear();
    hasWebPushCapability.mockClear();
    queueLogEvent.mockClear();
    captureException.mockClear();
    await prisma.notificationDelivery.deleteMany();
    await prisma.notificationPreferenceAudit.deleteMany();
    await prisma.notificationTopicPreference.deleteMany();
    await prisma.notificationCategoryPreference.deleteMany();
    await prisma.notificationChannelPreference.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.friendRequest.deleteMany();
    await prisma.friendship.deleteMany();
    await prisma.pool.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { contains: '@example.com' } },
    });
  });

  it('creates in-app notification and sends email by default', async () => {
    const recipient = await createUser();
    const actor = await createUser();
    const friendRequest = await prisma.friendRequest.create({
      data: {
        fromUserId: actor.id,
        toUserId: recipient.id,
        status: 'PENDING',
      },
      select: { id: true },
    });

    await dispatchNotification({
      userId: recipient.id,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      payload: {
        friendRequestId: friendRequest.id,
        actorUserId: actor.id,
        actorDisplayName: actor.name ?? actor.username,
        actorUsername: actor.username,
        actorAvatarId: null,
        recipientUserId: recipient.id,
      },
      sourceIdentifier: 'test-source',
    });

    const notifications = await prisma.notification.findMany({
      where: {
        userId: recipient.id,
        type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      },
    });
    expect(notifications).toHaveLength(1);
    expect(emailMock).toHaveBeenCalledTimes(1);
  });

  it('respects email preference toggles', async () => {
    const recipient = await createUser();
    const actor = await createUser();

    await setNotificationPreference(
      recipient.id,
      NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      NOTIFICATION_CHANNELS.EMAIL,
      false,
      'test',
    );

    const friendRequest = await prisma.friendRequest.create({
      data: {
        fromUserId: actor.id,
        toUserId: recipient.id,
        status: 'PENDING',
      },
      select: { id: true },
    });

    await dispatchNotification({
      userId: recipient.id,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      payload: {
        friendRequestId: friendRequest.id,
        actorUserId: actor.id,
        actorDisplayName: actor.name ?? actor.username,
        actorUsername: actor.username,
        actorAvatarId: null,
        recipientUserId: recipient.id,
      },
      sourceIdentifier: 'test-source-email-off',
    });

    expect(emailMock).not.toHaveBeenCalled();
  });

  it('sends a web push when the push preference is enabled', async () => {
    const recipient = await createUser();
    const actor = await createUser();

    await setNotificationPreference(
      recipient.id,
      NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      NOTIFICATION_CHANNELS.WEB_PUSH,
      true,
      'test',
    );

    const friendRequest = await prisma.friendRequest.create({
      data: { fromUserId: actor.id, toUserId: recipient.id, status: 'PENDING' },
      select: { id: true },
    });

    await dispatchNotification({
      userId: recipient.id,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      payload: {
        friendRequestId: friendRequest.id,
        actorUserId: actor.id,
        actorDisplayName: actor.name ?? actor.username,
        actorUsername: actor.username,
        actorAvatarId: null,
        recipientUserId: recipient.id,
      },
      sourceIdentifier: 'test-source-push-on',
    });

    expect(sendWebPush).toHaveBeenCalledTimes(1);
    expect(sendWebPush).toHaveBeenCalledWith(
      recipient.id,
      expect.objectContaining({ url: '/friends#incoming-requests' }),
    );
  });

  it('does not send a web push when the push preference is off (default)', async () => {
    const recipient = await createUser();
    const actor = await createUser();

    const friendRequest = await prisma.friendRequest.create({
      data: { fromUserId: actor.id, toUserId: recipient.id, status: 'PENDING' },
      select: { id: true },
    });

    await dispatchNotification({
      userId: recipient.id,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
      payload: {
        friendRequestId: friendRequest.id,
        actorUserId: actor.id,
        actorDisplayName: actor.name ?? actor.username,
        actorUsername: actor.username,
        actorAvatarId: null,
        recipientUserId: recipient.id,
      },
      sourceIdentifier: 'test-source-push-off',
    });

    expect(sendWebPush).not.toHaveBeenCalled();
  });

  it('creates an in-app UPCOMING_BIRTHDAY notification without email by default', async () => {
    const viewer = await createUser();
    const birthdayOwner = await createUser({ name: 'Birthday Person' });

    await dispatchNotification({
      userId: viewer.id,
      type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      payload: birthdayPayload(viewer.id, birthdayOwner, 5),
      sourceIdentifier: 'test-birthday-source',
    });

    const notifications = await prisma.notification.findMany({
      where: { userId: viewer.id, type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.targetUrl).toBe(
      `/users/${birthdayOwner.username}`,
    );
    expect(emailMock).not.toHaveBeenCalled();
  });

  it('delivers pool activity once per occurrence with email off by default', async () => {
    const organizer = await createUser();
    const recipient = await createUser();
    const member = await createUser();
    const pool = await prisma.pool.create({
      data: {
        title: 'Taylor birthday',
        organizerId: organizer.id,
        recipientUserId: recipient.id,
        contributors: {
          create: [{ userId: organizer.id }, { userId: member.id }],
        },
      },
      select: { id: true, title: true },
    });
    const notify = () =>
      dispatchNotification({
        userId: member.id,
        type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
        context: { kind: 'POOL', poolId: pool.id },
        sourceIdentifier: 'test-pool-vote-started',
        payload: {
          poolId: pool.id,
          poolTitle: pool.title,
          actorUserId: organizer.id,
        },
      });

    await notify();
    await notify();

    const notifications = await prisma.notification.findMany({
      where: {
        userId: member.id,
        type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
      },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      messageKey: 'notifications.poolVoteStarted.message',
      targetUrl: `/pools/${pool.id}`,
      sourceIdentifier: 'test-pool-vote-started:IN_APP',
    });
    expect(emailMock).not.toHaveBeenCalled();
    expect(queueLogEvent).toHaveBeenCalledTimes(1);
    expect(queueLogEvent).toHaveBeenCalledWith({
      name: 'pool_activity_notification_sent',
      source: 'server',
      userId: member.id,
      properties: {
        notificationType: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
        poolId: pool.id,
        channels: [NOTIFICATION_CHANNELS.IN_APP],
      },
    });
  });

  it('delivers an organizer reminder once with email off by default', async () => {
    const organizer = await createUser({ name: 'Wade Wilson' });
    const member = await createUser();
    const pool = await prisma.pool.create({
      data: {
        title: 'Taylor birthday',
        organizerId: organizer.id,
        contributors: {
          create: [{ userId: organizer.id }, { userId: member.id }],
        },
      },
      select: { id: true, title: true },
    });
    const notify = () =>
      dispatchNotification({
        userId: member.id,
        type: NOTIFICATION_TYPES.POOL_VOTE_REMINDER,
        context: { kind: 'POOL', poolId: pool.id },
        sourceIdentifier: 'organizer-nudge:nudge-1',
        payload: {
          nudgeId: 'nudge-1',
          poolId: pool.id,
          poolTitle: pool.title,
          senderUserId: organizer.id,
          senderDisplayName: organizer.name ?? organizer.username,
        },
      });

    await notify();
    await notify();

    const notifications = await prisma.notification.findMany({
      where: {
        userId: member.id,
        type: NOTIFICATION_TYPES.POOL_VOTE_REMINDER,
      },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      messageKey: 'notifications.poolVoteReminder.message',
      targetUrl: `/pools/${pool.id}`,
      sourceIdentifier: 'organizer-nudge:nudge-1:IN_APP',
    });
    expect(emailMock).not.toHaveBeenCalled();
    expect(queueLogEvent).toHaveBeenCalledTimes(1);
    expect(queueLogEvent).toHaveBeenCalledWith({
      name: 'organizer_reminder_sent',
      source: 'server',
      userId: member.id,
      properties: {
        notificationType: NOTIFICATION_TYPES.POOL_VOTE_REMINDER,
        poolId: pool.id,
        organizerNudgeId: 'nudge-1',
        channels: [NOTIFICATION_CHANNELS.IN_APP],
      },
    });
  });

  it('is idempotent per sourceIdentifier for UPCOMING_BIRTHDAY', async () => {
    const viewer = await createUser();
    const birthdayOwner = await createUser();

    const notify = () =>
      dispatchNotification({
        userId: viewer.id,
        type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
        payload: birthdayPayload(viewer.id, birthdayOwner, 5),
        sourceIdentifier: 'test-birthday-repeat',
      });

    await notify();
    await notify();

    const notifications = await prisma.notification.findMany({
      where: { userId: viewer.id, type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY },
    });
    expect(notifications).toHaveLength(1);
  });

  it('sends birthday email when the user has opted in', async () => {
    const viewer = await createUser();
    const birthdayOwner = await createUser();
    await setNotificationPreference(
      viewer.id,
      NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      NOTIFICATION_CHANNELS.EMAIL,
      true,
      'test',
    );

    await dispatchNotification({
      userId: viewer.id,
      type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      payload: birthdayPayload(viewer.id, birthdayOwner, 2),
      sourceIdentifier: 'test-birthday-email-opt-in',
    });

    expect(emailMock).toHaveBeenCalledTimes(1);
  });

  it('sends the birthday email only once across repeated calls — the delivery ledger gates every channel', async () => {
    const viewer = await createUser();
    const birthdayOwner = await createUser();
    await setNotificationPreference(
      viewer.id,
      NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      NOTIFICATION_CHANNELS.EMAIL,
      true,
      'test',
    );

    const notify = () =>
      dispatchNotification({
        userId: viewer.id,
        type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
        payload: birthdayPayload(viewer.id, birthdayOwner, 4),
        sourceIdentifier: 'test-birthday-email-repeat',
      });

    await notify();
    await notify();

    expect(emailMock).toHaveBeenCalledTimes(1);
    // One ledger claim per channel: IN_APP (default on) + EMAIL (opted in).
    const deliveries = await prisma.notificationDelivery.findMany({
      where: { userId: viewer.id },
    });
    expect(deliveries.map((d) => d.sourceIdentifier).sort()).toEqual([
      'test-birthday-email-repeat:EMAIL',
      'test-birthday-email-repeat:IN_APP',
    ]);
  });

  it('dedupes email for an email-only user with the in-app channel disabled', async () => {
    const viewer = await createUser();
    const birthdayOwner = await createUser();
    await setNotificationPreference(
      viewer.id,
      NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      NOTIFICATION_CHANNELS.IN_APP,
      false,
      'test',
    );
    await setNotificationPreference(
      viewer.id,
      NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      NOTIFICATION_CHANNELS.EMAIL,
      true,
      'test',
    );

    const notify = () =>
      dispatchNotification({
        userId: viewer.id,
        type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
        payload: birthdayPayload(viewer.id, birthdayOwner, 4),
        sourceIdentifier: 'test-birthday-email-only',
      });

    await notify();
    await notify();

    // No in-app row exists to anchor dedupe on — the ledger must carry it.
    const notifications = await prisma.notification.findMany({
      where: { userId: viewer.id, type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY },
    });
    expect(notifications).toHaveLength(0);
    expect(emailMock).toHaveBeenCalledTimes(1);
  });

  it('sends the birthday push only once across repeated calls', async () => {
    const viewer = await createUser();
    const birthdayOwner = await createUser();
    await setNotificationPreference(
      viewer.id,
      NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      NOTIFICATION_CHANNELS.WEB_PUSH,
      true,
      'test',
    );

    const notify = () =>
      dispatchNotification({
        userId: viewer.id,
        type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
        payload: birthdayPayload(viewer.id, birthdayOwner, 4),
        sourceIdentifier: 'test-birthday-push-repeat',
      });

    await notify();
    await notify();

    expect(sendWebPush).toHaveBeenCalledTimes(1);
  });

  it('does not claim a recurring channel when delivery capability is unavailable', async () => {
    const viewer = await createUser();
    const birthdayOwner = await createUser();
    await setNotificationPreference(
      viewer.id,
      NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      NOTIFICATION_CHANNELS.IN_APP,
      false,
      'test',
    );
    await setNotificationPreference(
      viewer.id,
      NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      NOTIFICATION_CHANNELS.WEB_PUSH,
      true,
      'test',
    );
    hasWebPushCapability.mockResolvedValueOnce(false);

    const outcome = await dispatchNotification({
      userId: viewer.id,
      type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      payload: birthdayPayload(viewer.id, birthdayOwner, 4),
      sourceIdentifier: 'test-birthday-push-unavailable',
    });

    expect(outcome.channels[NOTIFICATION_CHANNELS.WEB_PUSH].status).toBe(
      'unavailable',
    );
    expect(sendWebPush).not.toHaveBeenCalled();
    expect(
      await prisma.notificationDelivery.count({
        where: { userId: viewer.id },
      }),
    ).toBe(0);
  });

  it('derives a window-stable default sourceIdentifier — the birthday date, not the sweep day', async () => {
    const viewer = await createUser();
    const birthdayOwner = await createUser();

    // No sourceIdentifier passed: the event handler derives it from the birthday's
    // calendar date (now + daysUntil). Simulate the daily sweep advancing
    // through the window — same birthday date, so the second call must be a
    // no-op, not a second notification.
    const notify = (daysUntil: number) =>
      dispatchNotification({
        userId: viewer.id,
        type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
        payload: birthdayPayload(viewer.id, birthdayOwner, daysUntil),
      });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 12, 12, 0, 0));
    await notify(5);
    vi.setSystemTime(new Date(2026, 6, 14, 12, 0, 0));
    await notify(3);
    vi.useRealTimers();

    const notifications = await prisma.notification.findMany({
      where: { userId: viewer.id, type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY },
    });
    expect(notifications).toHaveLength(1);
    // The key pins the birthday's local calendar date (Jul 17) per channel.
    expect(notifications[0]?.sourceIdentifier).toBe(
      `birthday:${birthdayOwner.id}:2026-07-17:IN_APP`,
    );
  });

  it('re-notifies when the owner edits their birthday to a different date', async () => {
    const viewer = await createUser();
    const birthdayOwner = await createUser();

    const notify = (daysUntil: number) =>
      dispatchNotification({
        userId: viewer.id,
        type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
        payload: birthdayPayload(viewer.id, birthdayOwner, daysUntil),
      });

    // Same sweep day, different derived birthday date = the owner corrected
    // their birthday after the first reminder went out. A date-keyed ledger
    // must deliver for the new date (a year-keyed one silently wouldn't).
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 12, 12, 0, 0));
    await notify(2);
    await notify(6);
    vi.useRealTimers();

    const notifications = await prisma.notification.findMany({
      where: { userId: viewer.id, type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY },
    });
    expect(notifications).toHaveLength(2);
  });

  it('renders a date-based message that cannot go stale in the bell', async () => {
    const viewer = await createUser();

    const notifyFor = async (daysUntil: number) => {
      const birthdayOwner = await createUser({ name: 'Birthday Person' });
      await dispatchNotification({
        userId: viewer.id,
        type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
        payload: birthdayPayload(viewer.id, birthdayOwner, daysUntil),
        sourceIdentifier: `test-birthday-when-${daysUntil}`,
      });
      const notification = await prisma.notification.findFirst({
        where: {
          userId: viewer.id,
          // The in-app row stores its channel-suffixed ledger claim key.
          sourceIdentifier: `test-birthday-when-${daysUntil}:${NOTIFICATION_CHANNELS.IN_APP}`,
        },
      });
      return JSON.parse(notification?.messageParams ?? '{}') as {
        when?: string;
      };
    };

    expect((await notifyFor(0)).when).toBe('today');
    expect((await notifyFor(1)).when).toBe('tomorrow');
    // Beyond tomorrow the message pins the calendar date ('on Jul 18'), not
    // a relative count that would be wrong by the next morning.
    expect((await notifyFor(6)).when).toMatch(/^on [A-Z][a-z]{2} \d{1,2}$/);
  });

  it('claims nothing while all channels are disabled, so enabling one later in the window still delivers', async () => {
    const viewer = await createUser();
    const birthdayOwner = await createUser();
    await setNotificationPreference(
      viewer.id,
      NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      NOTIFICATION_CHANNELS.IN_APP,
      false,
      'test',
    );

    const notify = () =>
      dispatchNotification({
        userId: viewer.id,
        type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
        payload: birthdayPayload(viewer.id, birthdayOwner, 5),
        sourceIdentifier: 'test-birthday-disabled-then-enabled',
      });

    await notify();
    expect(
      await prisma.notificationDelivery.count({
        where: { userId: viewer.id },
      }),
    ).toBe(0);

    await setNotificationPreference(
      viewer.id,
      NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      NOTIFICATION_CHANNELS.IN_APP,
      true,
      'test',
    );
    await notify();

    const notifications = await prisma.notification.findMany({
      where: { userId: viewer.id, type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY },
    });
    expect(notifications).toHaveLength(1);
  });

  it('delivers to a channel enabled mid-window without repeating the others', async () => {
    const viewer = await createUser();
    const birthdayOwner = await createUser();

    const notify = () =>
      dispatchNotification({
        userId: viewer.id,
        type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
        payload: birthdayPayload(viewer.id, birthdayOwner, 5),
        sourceIdentifier: 'test-birthday-mid-window',
      });

    // Day 7: in-app (default) delivers. Day 4: the user, prompted by the
    // bell item, opts into email — the email channel's claim doesn't exist
    // yet, so the NEXT sweep delivers it, exactly once.
    await notify();
    await setNotificationPreference(
      viewer.id,
      NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      NOTIFICATION_CHANNELS.EMAIL,
      true,
      'test',
    );
    await notify();
    await notify();

    expect(emailMock).toHaveBeenCalledTimes(1);
    const notifications = await prisma.notification.findMany({
      where: { userId: viewer.id, type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY },
    });
    expect(notifications).toHaveLength(1);
  });

  it('isolates channel failures — a failing email does not block push', async () => {
    const viewer = await createUser();
    const birthdayOwner = await createUser();
    await setNotificationPreference(
      viewer.id,
      NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      NOTIFICATION_CHANNELS.EMAIL,
      true,
      'test',
    );
    await setNotificationPreference(
      viewer.id,
      NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      NOTIFICATION_CHANNELS.WEB_PUSH,
      true,
      'test',
    );
    emailMock.mockRejectedValueOnce(new Error('resend outage'));

    const outcome = await dispatchNotification({
      userId: viewer.id,
      type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      payload: birthdayPayload(viewer.id, birthdayOwner, 3),
      sourceIdentifier: 'test-birthday-channel-isolation',
    });

    expect(sendWebPush).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({
      deliveredChannels: [
        NOTIFICATION_CHANNELS.IN_APP,
        NOTIFICATION_CHANNELS.WEB_PUSH,
      ],
      failedChannels: [NOTIFICATION_CHANNELS.EMAIL],
    });
  });

  it('treats a sendEmail error status (no throw) as a failed channel', async () => {
    const viewer = await createUser();
    const birthdayOwner = await createUser();
    await setNotificationPreference(
      viewer.id,
      NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      NOTIFICATION_CHANNELS.EMAIL,
      true,
      'test',
    );
    // sendEmail reports Resend API failures as a status object, not a throw.
    emailMock.mockResolvedValueOnce({
      status: 'error',
      error: {
        name: 'rate_limit_exceeded',
        message: 'slow down',
        statusCode: 429,
      },
    } as never);

    const outcome = await dispatchNotification({
      userId: viewer.id,
      type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      payload: birthdayPayload(viewer.id, birthdayOwner, 3),
      sourceIdentifier: 'test-birthday-email-error-status',
    });

    expect(outcome?.failedChannels).toEqual([NOTIFICATION_CHANNELS.EMAIL]);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('fires occasion_reminder_sent once per delivery, never on no-op re-runs', async () => {
    const viewer = await createUser();
    const birthdayOwner = await createUser();

    const notify = () =>
      dispatchNotification({
        userId: viewer.id,
        type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
        payload: birthdayPayload(viewer.id, birthdayOwner, 5),
        sourceIdentifier: 'test-birthday-analytics',
      });

    await notify();
    await notify();

    expect(queueLogEvent).toHaveBeenCalledTimes(1);
    expect(queueLogEvent).toHaveBeenCalledWith({
      name: 'occasion_reminder_sent',
      source: 'server',
      userId: viewer.id,
      properties: {
        birthdayUserId: birthdayOwner.id,
        daysUntil: 5,
        channels: [NOTIFICATION_CHANNELS.IN_APP],
      },
    });
  });
});
