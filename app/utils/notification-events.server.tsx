import { type ReactElement } from 'react';
import { FriendRequestAcceptedEmail } from '#app/emails/friend-request-accepted.tsx';
import { FriendRequestReceivedEmail } from '#app/emails/friend-request-received.tsx';
import { PoolActivityEmail } from '#app/emails/pool-activity.tsx';
import { UpcomingBirthdayEmail } from '#app/emails/upcoming-birthday.tsx';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { OCCASION_REMINDER_EMAIL_SRC } from '#app/utils/analytics.ts';
import { buildAppUrl } from '#app/utils/app-url.server.ts';
import { formatBirthdayWhen } from '#app/utils/birthday.ts';
import { translate } from '#app/utils/i18n.tsx';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  isOrganizerNudgeNotificationType,
  isPoolActivityNotificationType,
  type NotificationChannel,
  type NotificationIntent,
  type OrganizerNudgeNotificationType,
  type PoolActivityNotificationType,
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
    case NOTIFICATION_TYPES.POOL_VOTE_STARTED:
    case NOTIFICATION_TYPES.POOL_GIFT_CHOSEN:
    case NOTIFICATION_TYPES.POOL_CANCELLED:
    case NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED:
    case NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED:
    case NOTIFICATION_TYPES.POOL_CONTRIBUTION_REMINDER:
    case NOTIFICATION_TYPES.POOL_VOTE_REMINDER:
    case NOTIFICATION_TYPES.POOL_PURCHASE_REMINDER:
    case NOTIFICATION_TYPES.POOL_DELIVERY_REMINDER:
      throw new Error(
        `Pool notification ${intent.type} requires a sourceIdentifier.`,
      );
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
    case NOTIFICATION_TYPES.POOL_VOTE_STARTED:
    case NOTIFICATION_TYPES.POOL_GIFT_CHOSEN:
    case NOTIFICATION_TYPES.POOL_CANCELLED:
    case NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED:
    case NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED:
    case NOTIFICATION_TYPES.POOL_CONTRIBUTION_REMINDER:
    case NOTIFICATION_TYPES.POOL_VOTE_REMINDER:
    case NOTIFICATION_TYPES.POOL_PURCHASE_REMINDER:
    case NOTIFICATION_TYPES.POOL_DELIVERY_REMINDER:
      return renderPoolActivity(intent, channel);
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

type PoolContextIntent = NotificationIntent<
  PoolActivityNotificationType | OrganizerNudgeNotificationType
>;
type OrganizerNudgeIntent = NotificationIntent<OrganizerNudgeNotificationType>;

type PoolActivityCopy = {
  messageKey:
    | 'notifications.poolVoteStarted.message'
    | 'notifications.poolGiftChosen.message'
    | 'notifications.poolCancelled.message'
    | 'notifications.poolPurchaserAssigned.message'
    | 'notifications.poolDelivererAssigned.message'
    | 'notifications.poolContributionReminder.message'
    | 'notifications.poolVoteReminder.message'
    | 'notifications.poolPurchaseReminder.message'
    | 'notifications.poolDeliveryReminder.message';
  pushTitleKey:
    | 'notifications.poolVoteStarted.pushTitle'
    | 'notifications.poolGiftChosen.pushTitle'
    | 'notifications.poolCancelled.pushTitle'
    | 'notifications.poolPurchaserAssigned.pushTitle'
    | 'notifications.poolDelivererAssigned.pushTitle'
    | 'notifications.poolContributionReminder.pushTitle'
    | 'notifications.poolVoteReminder.pushTitle'
    | 'notifications.poolPurchaseReminder.pushTitle'
    | 'notifications.poolDeliveryReminder.pushTitle';
  messageParams: Record<string, string>;
  emailBody: string;
};

async function renderPoolActivity<C extends NotificationChannel>(
  intent: PoolContextIntent,
  channel: C,
): Promise<NotificationChannelMessageMap[C]> {
  const copy = getPoolActivityCopy(intent);
  const message = translate('en', copy.messageKey, copy.messageParams);
  const poolUrl = `/pools/${intent.payload.poolId}`;

  switch (channel) {
    case NOTIFICATION_CHANNELS.IN_APP:
      return {
        status: 'UNREAD',
        messageKey: copy.messageKey,
        messageParams: JSON.stringify(copy.messageParams),
        targetUrl: poolUrl,
        metadata: JSON.stringify({
          poolId: intent.payload.poolId,
          ...(isOrganizerNudgeIntent(intent)
            ? { organizerNudgeId: intent.payload.nudgeId }
            : {}),
        }),
        friendRequestId: null,
      } as NotificationChannelMessageMap[C];
    case NOTIFICATION_CHANNELS.EMAIL: {
      const managePreferencesUrl = await buildManagePreferencesUrl(intent);
      return {
        subject: `${message} on ${appName}`,
        react: (
          <PoolActivityEmail
            appName={appName}
            heading={message}
            message={copy.emailBody}
            poolUrl={buildAppUrl(poolUrl)}
            managePreferencesUrl={managePreferencesUrl}
          />
        ),
      } as NotificationChannelMessageMap[C];
    }
    case NOTIFICATION_CHANNELS.WEB_PUSH:
      return {
        title: translate('en', copy.pushTitleKey),
        body: message,
        url: poolUrl,
        tag: getNotificationOccurrenceKey(intent),
      } as NotificationChannelMessageMap[C];
  }
}

function getPoolActivityCopy(intent: PoolContextIntent): PoolActivityCopy {
  const pool = intent.payload.poolTitle;
  switch (intent.type) {
    case NOTIFICATION_TYPES.POOL_VOTE_STARTED:
      return {
        messageKey: 'notifications.poolVoteStarted.message',
        pushTitleKey: 'notifications.poolVoteStarted.pushTitle',
        messageParams: { pool },
        emailBody: 'Open the pool to review the ideas and cast your vote.',
      };
    case NOTIFICATION_TYPES.POOL_GIFT_CHOSEN:
      return {
        messageKey: 'notifications.poolGiftChosen.message',
        pushTitleKey: 'notifications.poolGiftChosen.pushTitle',
        messageParams: {
          pool,
          idea: intent.payload.chosenIdeaName,
        },
        emailBody: 'Open the pool to see the chosen gift and next steps.',
      };
    case NOTIFICATION_TYPES.POOL_CANCELLED:
      return {
        messageKey: 'notifications.poolCancelled.message',
        pushTitleKey: 'notifications.poolCancelled.pushTitle',
        messageParams: { pool },
        emailBody: 'Open the pool to review its final status.',
      };
    case NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED:
      return {
        messageKey: 'notifications.poolPurchaserAssigned.message',
        pushTitleKey: 'notifications.poolPurchaserAssigned.pushTitle',
        messageParams: { pool },
        emailBody: 'Open the pool to review the gift and purchase details.',
      };
    case NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED:
      return {
        messageKey: 'notifications.poolDelivererAssigned.message',
        pushTitleKey: 'notifications.poolDelivererAssigned.pushTitle',
        messageParams: { pool },
        emailBody: 'Open the pool to review the delivery details.',
      };
    case NOTIFICATION_TYPES.POOL_CONTRIBUTION_REMINDER:
      return {
        messageKey: 'notifications.poolContributionReminder.message',
        pushTitleKey: 'notifications.poolContributionReminder.pushTitle',
        messageParams: {
          pool,
          sender: intent.payload.senderDisplayName,
        },
        emailBody: 'Open the pool to set your contribution.',
      };
    case NOTIFICATION_TYPES.POOL_VOTE_REMINDER:
      return {
        messageKey: 'notifications.poolVoteReminder.message',
        pushTitleKey: 'notifications.poolVoteReminder.pushTitle',
        messageParams: {
          pool,
          sender: intent.payload.senderDisplayName,
        },
        emailBody: 'Open the pool to review the ideas and cast your vote.',
      };
    case NOTIFICATION_TYPES.POOL_PURCHASE_REMINDER:
      return {
        messageKey: 'notifications.poolPurchaseReminder.message',
        pushTitleKey: 'notifications.poolPurchaseReminder.pushTitle',
        messageParams: {
          pool,
          sender: intent.payload.senderDisplayName,
        },
        emailBody: 'Open the pool to review the gift and purchase details.',
      };
    case NOTIFICATION_TYPES.POOL_DELIVERY_REMINDER:
      return {
        messageKey: 'notifications.poolDeliveryReminder.message',
        pushTitleKey: 'notifications.poolDeliveryReminder.pushTitle',
        messageParams: {
          pool,
          sender: intent.payload.senderDisplayName,
        },
        emailBody: 'Open the pool to review the delivery details.',
      };
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
  if (deliveredChannels.length === 0) return;

  if (intent.type === NOTIFICATION_TYPES.UPCOMING_BIRTHDAY) {
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
    return;
  }

  if (isOrganizerNudgeIntent(intent)) {
    queueLogEvent({
      name: 'organizer_reminder_sent',
      source: 'server',
      userId: intent.userId,
      properties: {
        notificationType: intent.type,
        poolId: intent.payload.poolId,
        organizerNudgeId: intent.payload.nudgeId,
        channels: deliveredChannels,
      },
    });
    return;
  }

  if (isPoolActivityIntent(intent)) {
    queueLogEvent({
      name: 'pool_activity_notification_sent',
      source: 'server',
      userId: intent.userId,
      properties: {
        notificationType: intent.type,
        poolId: intent.payload.poolId,
        channels: deliveredChannels,
      },
    });
  }
}

function isOrganizerNudgeIntent(
  intent: NotificationIntent,
): intent is OrganizerNudgeIntent {
  return isOrganizerNudgeNotificationType(intent.type);
}

function isPoolActivityIntent(
  intent: NotificationIntent,
): intent is NotificationIntent<PoolActivityNotificationType> {
  return isPoolActivityNotificationType(intent.type);
}
