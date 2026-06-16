import { type RelationshipState } from '#app/utils/friends.ts';

export const NOTIFICATION_TYPES = {
  FRIEND_REQUEST_RECEIVED: 'FRIEND_REQUEST_RECEIVED',
  FRIEND_REQUEST_ACCEPTED: 'FRIEND_REQUEST_ACCEPTED',
  UPCOMING_BIRTHDAY: 'UPCOMING_BIRTHDAY',
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const NOTIFICATION_CHANNELS = {
  IN_APP: 'IN_APP',
  EMAIL: 'EMAIL',
  WEB_PUSH: 'WEB_PUSH',
} as const;

export type NotificationChannel =
  (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

export type NotificationPreferenceColumn =
  | 'inAppEnabled'
  | 'emailEnabled'
  | 'pushEnabled';

export function channelToColumn(
  channel: NotificationChannel,
): NotificationPreferenceColumn {
  switch (channel) {
    case NOTIFICATION_CHANNELS.EMAIL:
      return 'emailEnabled';
    case NOTIFICATION_CHANNELS.WEB_PUSH:
      return 'pushEnabled';
    case NOTIFICATION_CHANNELS.IN_APP:
    default:
      return 'inAppEnabled';
  }
}

type FriendRequestPayload = {
  friendRequestId: string;
  actorUserId: string;
  actorDisplayName: string;
  actorUsername: string;
  actorAvatarId?: string | null;
  recipientUserId: string;
};

type PayloadByType = {
  [NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED]: FriendRequestPayload;
  [NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED]: FriendRequestPayload;
  [NOTIFICATION_TYPES.UPCOMING_BIRTHDAY]: {
    targetUserId: string;
    birthdayUserId: string;
    birthdayDisplayName: string;
    daysUntil: number;
  };
};

export type NotificationPayload<T extends NotificationType> = PayloadByType[T];

export interface NotificationPreferenceDefaults {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  // Web Push defaults OFF for every type — it requires explicit opt-in + browser
  // permission, so it's never on until the user enables it.
  pushEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: Record<
  NotificationType,
  NotificationPreferenceDefaults
> = {
  [NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED]: {
    inAppEnabled: true,
    emailEnabled: true,
    pushEnabled: false,
  },
  [NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED]: {
    inAppEnabled: true,
    emailEnabled: true,
    pushEnabled: false,
  },
  [NOTIFICATION_TYPES.UPCOMING_BIRTHDAY]: {
    inAppEnabled: true,
    emailEnabled: false,
    pushEnabled: false,
  },
};

export interface NotificationContextBase {
  type: NotificationType;
}

export interface FriendRelationshipSnapshot {
  state: RelationshipState;
  friendshipId: string | null;
  incomingRequestId: string | null;
  outgoingRequestId: string | null;
}
