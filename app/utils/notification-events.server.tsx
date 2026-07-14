import { type ReactElement } from 'react';
import { FriendRequestAcceptedEmail } from '#app/emails/friend-request-accepted.tsx';
import { FriendRequestReceivedEmail } from '#app/emails/friend-request-received.tsx';
import { UpcomingBirthdayEmail } from '#app/emails/upcoming-birthday.tsx';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { OCCASION_REMINDER_EMAIL_SRC } from '#app/utils/analytics.ts';
import { buildAppUrl } from '#app/utils/app-url.server.ts';
import { formatBirthdayWhen } from '#app/utils/birthday.ts';
import { translate } from '#app/utils/i18n.tsx';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  type NotificationChannel,
  type NotificationIntent,
} from '#app/utils/notification-catalog.ts';
import {
  createPreferenceToken,
  getPreferenceManagementUrl,
} from '#app/utils/notification-preference-token.server.ts';
import { type WebPushMessage } from '#app/utils/web-push.server.ts';

const appName = 'GiftPool';

export type InAppNotificationMessage = {
  status: 'UNREAD';
  messageKey: string;
  messageParams?: string | null;
  targetUrl?: string | null;
  metadata?: string | null;
  actions?: string | null;
  friendRequestId?: string | null;
};

export type EmailNotificationMessage = {
  subject: string;
  react: ReactElement;
};

export type NotificationChannelMessageMap = {
  [NOTIFICATION_CHANNELS.IN_APP]: InAppNotificationMessage;
  [NOTIFICATION_CHANNELS.EMAIL]: EmailNotificationMessage;
  [NOTIFICATION_CHANNELS.WEB_PUSH]: WebPushMessage;
};

function formatLocalDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function getNotificationOccurrenceKey(
  intent: NotificationIntent,
): string {
  if (intent.sourceIdentifier) return intent.sourceIdentifier;

  switch (intent.type) {
    case NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED:
      return `friend-request:${intent.payload.friendRequestId}:received`;
    case NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED:
      return `friend-request:${intent.payload.friendRequestId}:accepted`;
    case NOTIFICATION_TYPES.UPCOMING_BIRTHDAY:
      return `birthday:${intent.payload.birthdayUserId}:${formatLocalDateKey(intent.payload.birthdayDate)}`;
  }
}

export async function renderNotificationChannel<C extends NotificationChannel>(
  intent: NotificationIntent,
  channel: C,
): Promise<NotificationChannelMessageMap[C]> {
  switch (intent.type) {
    case NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED:
      return renderFriendRequestReceived(intent, channel);
    case NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED:
      return renderFriendRequestAccepted(intent, channel);
    case NOTIFICATION_TYPES.UPCOMING_BIRTHDAY:
      return renderUpcomingBirthday(intent, channel);
  }
}

async function renderFriendRequestReceived<C extends NotificationChannel>(
  intent: NotificationIntent<'FRIEND_REQUEST_RECEIVED'>,
  channel: C,
): Promise<NotificationChannelMessageMap[C]> {
  const { payload } = intent;
  switch (channel) {
    case NOTIFICATION_CHANNELS.IN_APP:
      return {
        status: 'UNREAD',
        messageKey: 'notifications.friendRequest.message',
        messageParams: JSON.stringify({ name: payload.actorDisplayName }),
        targetUrl: '/friends#incoming-requests',
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
      } as NotificationChannelMessageMap[C];
    case NOTIFICATION_CHANNELS.EMAIL: {
      const managePreferencesUrl = await buildManagePreferencesUrl(intent);
      return {
        subject: `${payload.actorDisplayName} sent you a friend request on ${appName}`,
        react: (
          <FriendRequestReceivedEmail
            appName={appName}
            actorDisplayName={payload.actorDisplayName}
            actorProfileUrl={buildAppUrl(`/users/${payload.actorUsername}`)}
            managePreferencesUrl={managePreferencesUrl}
          />
        ),
      } as NotificationChannelMessageMap[C];
    }
    case NOTIFICATION_CHANNELS.WEB_PUSH:
      return {
        title: translate('en', 'notifications.friendRequest.pushTitle'),
        body: translate('en', 'notifications.friendRequest.message', {
          name: payload.actorDisplayName,
        }),
        url: '/friends#incoming-requests',
        tag: getNotificationOccurrenceKey(intent),
      } as NotificationChannelMessageMap[C];
  }
}

async function renderFriendRequestAccepted<C extends NotificationChannel>(
  intent: NotificationIntent<'FRIEND_REQUEST_ACCEPTED'>,
  channel: C,
): Promise<NotificationChannelMessageMap[C]> {
  const { payload } = intent;
  switch (channel) {
    case NOTIFICATION_CHANNELS.IN_APP:
      return {
        status: 'UNREAD',
        messageKey: 'notifications.friendRequestAccepted.message',
        messageParams: JSON.stringify({ name: payload.actorDisplayName }),
        targetUrl: '/friends',
        metadata: JSON.stringify({
          senderUserId: payload.actorUserId,
          senderDisplayName: payload.actorDisplayName,
          senderAvatarId: payload.actorAvatarId ?? null,
        }),
        // The received notification already owns this unique relation.
        friendRequestId: null,
      } as NotificationChannelMessageMap[C];
    case NOTIFICATION_CHANNELS.EMAIL: {
      const managePreferencesUrl = await buildManagePreferencesUrl(intent);
      return {
        subject: `${payload.actorDisplayName} accepted your friend request on ${appName}`,
        react: (
          <FriendRequestAcceptedEmail
            appName={appName}
            actorDisplayName={payload.actorDisplayName}
            actorProfileUrl={buildAppUrl(`/users/${payload.actorUsername}`)}
            managePreferencesUrl={managePreferencesUrl}
          />
        ),
      } as NotificationChannelMessageMap[C];
    }
    case NOTIFICATION_CHANNELS.WEB_PUSH:
      return {
        title: translate('en', 'notifications.friendRequestAccepted.pushTitle'),
        body: translate('en', 'notifications.friendRequestAccepted.message', {
          name: payload.actorDisplayName,
        }),
        url: '/friends',
        tag: getNotificationOccurrenceKey(intent),
      } as NotificationChannelMessageMap[C];
  }
}

async function renderUpcomingBirthday<C extends NotificationChannel>(
  intent: NotificationIntent<'UPCOMING_BIRTHDAY'>,
  channel: C,
): Promise<NotificationChannelMessageMap[C]> {
  const { payload } = intent;
  const when = formatBirthdayWhen(payload.daysUntil, payload.birthdayDate);
  const messageParams = { name: payload.birthdayDisplayName, when };

  switch (channel) {
    case NOTIFICATION_CHANNELS.IN_APP:
      return {
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
      } as NotificationChannelMessageMap[C];
    case NOTIFICATION_CHANNELS.EMAIL: {
      const managePreferencesUrl = await buildManagePreferencesUrl(intent);
      const profileUrl = buildAppUrl(
        `/users/${payload.birthdayUsername}?src=${OCCASION_REMINDER_EMAIL_SRC}`,
      );
      return {
        subject: `${payload.birthdayDisplayName}'s birthday is coming up on ${appName}`,
        react: (
          <UpcomingBirthdayEmail
            appName={appName}
            birthdayDisplayName={payload.birthdayDisplayName}
            when={when}
            profileUrl={profileUrl}
            managePreferencesUrl={managePreferencesUrl}
          />
        ),
      } as NotificationChannelMessageMap[C];
    }
    case NOTIFICATION_CHANNELS.WEB_PUSH:
      return {
        title: translate('en', 'notifications.upcomingBirthday.pushTitle'),
        body: translate(
          'en',
          'notifications.upcomingBirthday.message',
          messageParams,
        ),
        url: `/users/${payload.birthdayUsername}`,
        tag: getNotificationOccurrenceKey(intent),
      } as NotificationChannelMessageMap[C];
  }
}

async function buildManagePreferencesUrl(intent: NotificationIntent) {
  const token = await createPreferenceToken({
    userId: intent.userId,
    type: intent.type,
  });
  return getPreferenceManagementUrl(token);
}

export function recordNotificationDelivery(
  intent: NotificationIntent,
  deliveredChannels: Array<NotificationChannel>,
) {
  if (
    intent.type !== NOTIFICATION_TYPES.UPCOMING_BIRTHDAY ||
    deliveredChannels.length === 0
  ) {
    return;
  }

  queueLogEvent({
    name: 'occasion_reminder_sent',
    source: 'server',
    userId: intent.userId,
    properties: {
      birthdayUserId: intent.payload.birthdayUserId,
      daysUntil: intent.payload.daysUntil,
      channels: deliveredChannels,
    },
  });
}
