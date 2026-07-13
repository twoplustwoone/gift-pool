import {
  Prisma,
  type Notification as PrismaNotification,
} from '@prisma/client';
import * as Sentry from '@sentry/react-router';
import React from 'react';
import { FriendRequestAcceptedEmail } from '#app/emails/friend-request-accepted.tsx';
import { FriendRequestReceivedEmail } from '#app/emails/friend-request-received.tsx';
import { UpcomingBirthdayEmail } from '#app/emails/upcoming-birthday.tsx';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { OCCASION_REMINDER_EMAIL_SRC } from '#app/utils/analytics.ts';
import { buildAppUrl } from '#app/utils/app-url.server.ts';
import { formatBirthdayWhen } from '#app/utils/birthday.ts';
import { prisma } from '#app/utils/db.server.ts';
import { sendEmail } from '#app/utils/email.server.ts';
import { translate } from '#app/utils/i18n.tsx';
import {
  createPreferenceToken,
  getPreferenceManagementUrl,
} from '#app/utils/notification-preference-token.server.ts';
import { getNotificationPreferenceForChannels } from '#app/utils/notification-preferences.server.ts';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  type NotificationChannel,
  type NotificationPayload,
  type NotificationType,
  type FriendRelationshipSnapshot,
} from '#app/utils/notification-registry.ts';
import { sendWebPush } from '#app/utils/web-push.server.ts';

const appName = 'GiftPool';

export interface NotifyUserOptions<T extends NotificationType> {
  userId: string;
  type: T;
  payload: NotificationPayload<T>;
  sourceIdentifier?: string;
  friendRelationshipSnapshot?: FriendRelationshipSnapshot;
}

// Returns a delivery outcome for the ledger-gated UPCOMING_BIRTHDAY type
// (consumed by the sweep's counters); the one-shot friend-request types
// return void.
export async function notifyUser<T extends NotificationType>(
  options: NotifyUserOptions<T>,
): Promise<OccasionReminderDeliveryOutcome | void> {
  switch (options.type) {
    case NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED:
      return notifyFriendRequestReceived(
        options as NotifyUserOptions<'FRIEND_REQUEST_RECEIVED'>,
      );
    case NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED:
      return notifyFriendRequestAccepted(
        options as NotifyUserOptions<'FRIEND_REQUEST_ACCEPTED'>,
      );
    case NOTIFICATION_TYPES.UPCOMING_BIRTHDAY:
      return notifyUpcomingBirthday(
        options as NotifyUserOptions<'UPCOMING_BIRTHDAY'>,
      );
    default: {
      // Exhaustive check
      const neverType: never = options.type;
      throw new Error(`Unhandled notification type: ${neverType}`);
    }
  }
}

// One-shot event type: dedupe via createNotificationIfNeeded is sufficient
// because the trigger fires once. Recurring/sweep-driven types must NOT copy
// this pattern — see the ledger note on createNotificationIfNeeded below.
async function notifyFriendRequestReceived(
  options: NotifyUserOptions<'FRIEND_REQUEST_RECEIVED'>,
) {
  const { userId, payload } = options;
  const prefs = await getNotificationPreferenceForChannels(
    userId,
    NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
  );

  if (prefs.inAppEnabled) {
    await createNotificationIfNeeded({
      userId,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      sourceIdentifier:
        options.sourceIdentifier ??
        `friend-request:${payload.friendRequestId}:received`,
      data: {
        status: 'UNREAD',
        messageKey: 'notifications.friendRequest.message',
        messageParams: JSON.stringify({
          name: payload.actorDisplayName,
        }),
        targetUrl: `/friends#incoming-requests`,
        metadata: JSON.stringify({
          senderUserId: payload.actorUserId,
          senderDisplayName: payload.actorDisplayName,
          senderAvatarId: payload.actorAvatarId ?? null,
        }),
        actions: JSON.stringify([
          {
            kind: 'FRIEND_ACCEPT',
            labelKey: 'notifications.friendRequest.accept',
          },
          {
            kind: 'FRIEND_REJECT',
            labelKey: 'notifications.friendRequest.reject',
          },
        ]),
        friendRequestId: payload.friendRequestId,
      },
    });
  }

  if (prefs.emailEnabled) {
    await sendFriendRequestReceivedEmail(options);
  }

  if (prefs.pushEnabled) {
    await sendWebPush(userId, {
      title: translate('en', 'notifications.friendRequest.pushTitle'),
      body: translate('en', 'notifications.friendRequest.message', {
        name: payload.actorDisplayName,
      }),
      url: '/friends#incoming-requests',
      tag: `friend-request:${payload.friendRequestId}:received`,
    });
  }
}

// One-shot event type — same dedupe caveat as notifyFriendRequestReceived.
async function notifyFriendRequestAccepted(
  options: NotifyUserOptions<'FRIEND_REQUEST_ACCEPTED'>,
) {
  const { userId, payload } = options;
  const prefs = await getNotificationPreferenceForChannels(
    userId,
    NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
  );

  if (prefs.inAppEnabled) {
    await createNotificationIfNeeded({
      userId,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
      sourceIdentifier:
        options.sourceIdentifier ??
        `friend-request:${payload.friendRequestId}:accepted`,
      data: {
        status: 'UNREAD',
        messageKey: 'notifications.friendRequestAccepted.message',
        messageParams: JSON.stringify({
          name: payload.actorDisplayName,
        }),
        targetUrl: `/friends`,
        metadata: JSON.stringify({
          senderUserId: payload.actorUserId,
          senderDisplayName: payload.actorDisplayName,
          senderAvatarId: payload.actorAvatarId ?? null,
        }),
        // Do not set friendRequestId here because it's unique and a
        // FRIEND_REQUEST_RECEIVED notification already uses it.
        // Keeping this null avoids unique constraint conflicts and we rely
        // on sourceIdentifier for idempotency.
        friendRequestId: null,
      },
    });
  }

  if (prefs.emailEnabled) {
    await sendFriendRequestAcceptedEmail(options);
  }

  if (prefs.pushEnabled) {
    await sendWebPush(userId, {
      title: translate('en', 'notifications.friendRequestAccepted.pushTitle'),
      body: translate('en', 'notifications.friendRequestAccepted.message', {
        name: payload.actorDisplayName,
      }),
      url: '/friends',
      tag: `friend-request:${payload.friendRequestId}:accepted`,
    });
  }
}

// Local-date key (yyyy-mm-dd). Deliberately NOT toISOString().slice(0, 10):
// that reads the UTC date, and on a non-UTC server an evening sweep crosses
// UTC midnight — the same birthday would get different keys on different
// sweep days, defeating the ledger. Local getters match how the sweep
// computes daysUntil (see getUpcomingBirthday in birthday.ts).
function formatLocalDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export type OccasionReminderDeliveryOutcome = {
  deliveredChannels: Array<NotificationChannel>;
  failedChannels: Array<NotificationChannel>;
};

// UPCOMING_BIRTHDAY is the only recurring, sweep-driven notification type:
// the daily sweep re-fires notifyUser for the same (viewer, birthday) pair on
// every day of the lead window, so idempotency has to gate EVERY channel —
// not just the in-app row, which is also user-deletable and therefore can't
// serve as the dedupe record. Each channel claims its own NotificationDelivery
// ledger row (`birthday:<owner>:<yyyy-mm-dd>:<channel>`), which gives three
// properties at once:
// - re-sweeps are no-ops per channel, and disabled channels claim nothing, so
//   enabling a channel mid-window delivers on the next sweep;
// - keying on the birthday's calendar DATE (not year) means an owner who
//   edits their birthday gets a fresh key, so the corrected date still
//   produces a reminder;
// - each send sits in its own try/catch, so one channel's failure can't block
//   another. Delivery stays at-most-once per channel: a send that fails after
//   its claim goes to Sentry and is never retried — a duplicate reminder is
//   worse than a missed one.
async function notifyUpcomingBirthday(
  options: NotifyUserOptions<'UPCOMING_BIRTHDAY'>,
): Promise<OccasionReminderDeliveryOutcome> {
  const { userId, payload } = options;
  const prefs = await getNotificationPreferenceForChannels(
    userId,
    NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
  );

  // payload.birthdayDate was computed once by the sweep's owner scan — never
  // rebuild it from now+daysUntil here, or a sweep spanning local midnight
  // forks the key onto the wrong day (and the next day's sweep double-sends).
  const baseKey =
    options.sourceIdentifier ??
    `birthday:${payload.birthdayUserId}:${formatLocalDateKey(payload.birthdayDate)}`;

  const messageParams = {
    name: payload.birthdayDisplayName,
    when: formatBirthdayWhen(payload.daysUntil, payload.birthdayDate),
  };

  const deliveredChannels: Array<NotificationChannel> = [];
  const failedChannels: Array<NotificationChannel> = [];

  const deliverToChannel = async (
    channel: NotificationChannel,
    send: () => Promise<unknown>,
  ) => {
    const claimed = await claimNotificationDelivery({
      userId,
      type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
      sourceIdentifier: `${baseKey}:${channel}`,
    });
    if (!claimed) return;
    try {
      await send();
      deliveredChannels.push(channel);
    } catch (error) {
      failedChannels.push(channel);
      Sentry.captureException(error);
    }
  };

  if (prefs.inAppEnabled) {
    await deliverToChannel(NOTIFICATION_CHANNELS.IN_APP, () =>
      prisma.notification.create({
        data: {
          userId,
          type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
          sourceIdentifier: `${baseKey}:${NOTIFICATION_CHANNELS.IN_APP}`,
          status: 'UNREAD',
          messageKey: 'notifications.upcomingBirthday.message',
          messageParams: JSON.stringify(messageParams),
          targetUrl: `/users/${payload.birthdayUsername}`,
          metadata: JSON.stringify({
            birthdayUserId: payload.birthdayUserId,
            birthdayUsername: payload.birthdayUsername,
            birthdayDisplayName: payload.birthdayDisplayName,
            daysUntil: payload.daysUntil,
          }),
          friendRequestId: null,
        },
      }),
    );
  }

  if (prefs.emailEnabled) {
    await deliverToChannel(NOTIFICATION_CHANNELS.EMAIL, () =>
      sendUpcomingBirthdayEmail(options, messageParams.when),
    );
  }

  if (prefs.pushEnabled) {
    await deliverToChannel(NOTIFICATION_CHANNELS.WEB_PUSH, () =>
      sendWebPush(userId, {
        title: translate('en', 'notifications.upcomingBirthday.pushTitle'),
        body: translate(
          'en',
          'notifications.upcomingBirthday.message',
          messageParams,
        ),
        url: `/users/${payload.birthdayUsername}`,
        tag: baseKey,
      }),
    );
  }

  if (deliveredChannels.length > 0) {
    // Entry event of the reminder funnel — see the pairing comment in
    // analytics.ts. queueLogEvent detaches internally (fire-and-forget), and
    // the recipient is always a signed-in user, so the user-required event
    // always has its userId.
    queueLogEvent({
      name: 'occasion_reminder_sent',
      source: 'server',
      userId,
      properties: {
        birthdayUserId: payload.birthdayUserId,
        daysUntil: payload.daysUntil,
        channels: deliveredChannels,
      },
    });
  }

  return { deliveredChannels, failedChannels };
}

// Atomically claim the right to deliver (userId, sourceIdentifier) once.
// Returns false when a previous run already claimed it. The read makes the
// common path (every re-sweep day inside the lead window) a quiet no-op;
// the unique constraint, not the read, is what makes concurrent sweeps safe.
async function claimNotificationDelivery({
  userId,
  type,
  sourceIdentifier,
}: {
  userId: string;
  type: NotificationType;
  sourceIdentifier: string;
}): Promise<boolean> {
  const existing = await prisma.notificationDelivery.findUnique({
    where: { userId_sourceIdentifier: { userId, sourceIdentifier } },
    select: { userId: true },
  });
  if (existing) return false;
  try {
    await prisma.notificationDelivery.create({
      data: { userId, type, sourceIdentifier },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return false;
    }
    throw error;
  }
}

type NotificationInsert = {
  status: string;
  messageKey: string;
  messageParams?: string | null;
  targetUrl?: string | null;
  metadata?: string | null;
  actions?: string | null;
  friendRequestId?: string | null;
};

// Dedupe for ONE-SHOT event types only: the check-then-create on the
// Notification row doesn't gate email/push, and users can delete the row from
// the bell. A recurring/sweep-driven type that copies this pattern will
// re-send emails on every sweep — recurring types MUST claim per-channel
// NotificationDelivery ledger rows instead (see notifyUpcomingBirthday and
// claimNotificationDelivery).
async function createNotificationIfNeeded({
  userId,
  type,
  sourceIdentifier,
  data,
}: {
  userId: string;
  type: NotificationType;
  sourceIdentifier?: string;
  data: NotificationInsert;
}): Promise<PrismaNotification> {
  if (sourceIdentifier) {
    const existing = await prisma.notification.findFirst({
      where: { userId, sourceIdentifier },
    });
    if (existing) return existing;
  }

  return prisma.notification.create({
    data: {
      userId,
      type,
      status: data.status,
      messageKey: data.messageKey,
      messageParams: data.messageParams,
      targetUrl: data.targetUrl,
      metadata: data.metadata,
      actions: data.actions,
      friendRequestId: data.friendRequestId,
      sourceIdentifier,
    },
  });
}

async function sendFriendRequestReceivedEmail(
  options: NotifyUserOptions<'FRIEND_REQUEST_RECEIVED'>,
) {
  const { userId, payload } = options;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, username: true },
  });
  if (!user?.email) return;

  const preferencesUrl = await buildManagePreferencesUrl(
    userId,
    NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
  );
  const profileUrl = buildAppUrl(`/users/${payload.actorUsername}`);

  await sendEmail({
    to: user.email,
    subject: `${payload.actorDisplayName} sent you a friend request on ${appName}`,
    react: (
      <FriendRequestReceivedEmail
        appName={appName}
        actorDisplayName={payload.actorDisplayName}
        actorProfileUrl={profileUrl}
        managePreferencesUrl={preferencesUrl}
      />
    ),
  });
}

async function sendFriendRequestAcceptedEmail(
  options: NotifyUserOptions<'FRIEND_REQUEST_ACCEPTED'>,
) {
  const { userId, payload } = options;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, username: true },
  });
  if (!user?.email) return;

  const preferencesUrl = await buildManagePreferencesUrl(
    userId,
    NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
  );
  const profileUrl = buildAppUrl(`/users/${payload.actorUsername}`);

  await sendEmail({
    to: user.email,
    subject: `${payload.actorDisplayName} accepted your friend request on ${appName}`,
    react: (
      <FriendRequestAcceptedEmail
        appName={appName}
        actorDisplayName={payload.actorDisplayName}
        actorProfileUrl={profileUrl}
        managePreferencesUrl={preferencesUrl}
      />
    ),
  });
}

async function sendUpcomingBirthdayEmail(
  options: NotifyUserOptions<'UPCOMING_BIRTHDAY'>,
  when: string,
) {
  const { userId, payload } = options;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user?.email) return;

  const preferencesUrl = await buildManagePreferencesUrl(
    userId,
    NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
  );
  // `src` lets the profile loader attribute the visit to this email — the
  // click-through half of the occasion_reminder_sent funnel (analytics.ts).
  const profileUrl = buildAppUrl(
    `/users/${payload.birthdayUsername}?src=${OCCASION_REMINDER_EMAIL_SRC}`,
  );

  const result = await sendEmail({
    to: user.email,
    subject: `${payload.birthdayDisplayName}'s birthday is coming up on ${appName}`,
    react: (
      <UpcomingBirthdayEmail
        appName={appName}
        birthdayDisplayName={payload.birthdayDisplayName}
        when={when}
        profileUrl={profileUrl}
        managePreferencesUrl={preferencesUrl}
      />
    ),
  });
  // sendEmail reports Resend API failures as a status, not a throw — convert
  // so the per-channel catch counts this as a failed channel.
  if (result.status === 'error') {
    throw new Error(
      `upcoming-birthday email failed: ${result.error.name} (${result.error.statusCode})`,
    );
  }
}

async function buildManagePreferencesUrl(
  userId: string,
  type: NotificationType,
) {
  const token = await createPreferenceToken({ userId, type });
  return getPreferenceManagementUrl(token);
}
