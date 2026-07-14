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

export const NOTIFICATION_CHANNEL_VALUES = Object.values(NOTIFICATION_CHANNELS);

export const NOTIFICATION_CATEGORIES = {
  SOCIAL: 'SOCIAL',
  OCCASIONS: 'OCCASIONS',
} as const;

export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORIES)[keyof typeof NOTIFICATION_CATEGORIES];

export const NOTIFICATION_TOPICS = {
  FRIEND_REQUESTS: 'FRIEND_REQUESTS',
  BIRTHDAY_REMINDERS: 'BIRTHDAY_REMINDERS',
} as const;

export type NotificationTopic =
  (typeof NOTIFICATION_TOPICS)[keyof typeof NOTIFICATION_TOPICS];

export type NotificationImportance = 'IMPORTANT' | 'ROUTINE';
export type NotificationContextKind = 'NONE' | 'GROUP' | 'POOL';
export type NotificationDeliveryStrategy = 'ONE_SHOT' | 'PER_CHANNEL_LEDGER';

export type NotificationPreferenceDefaults = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
};

type NotificationEventDefinition = {
  topic: NotificationTopic;
  category: NotificationCategory;
  importance: NotificationImportance;
  context: NotificationContextKind;
  supportedChannels: ReadonlyArray<NotificationChannel>;
  defaults: NotificationPreferenceDefaults;
  deliveryStrategy: NotificationDeliveryStrategy;
};

const allChannels = NOTIFICATION_CHANNEL_VALUES;

/**
 * Typed source of truth for event policy. User-facing topic/category copy will
 * be added with the scoped-preference UI; the stable identifiers live here now
 * so new events no longer have to become new preference concepts.
 */
export const NOTIFICATION_EVENT_CATALOG = {
  [NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED]: {
    topic: NOTIFICATION_TOPICS.FRIEND_REQUESTS,
    category: NOTIFICATION_CATEGORIES.SOCIAL,
    importance: 'IMPORTANT',
    context: 'NONE',
    supportedChannels: allChannels,
    defaults: {
      inAppEnabled: true,
      emailEnabled: true,
      pushEnabled: false,
    },
    deliveryStrategy: 'ONE_SHOT',
  },
  [NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED]: {
    topic: NOTIFICATION_TOPICS.FRIEND_REQUESTS,
    category: NOTIFICATION_CATEGORIES.SOCIAL,
    importance: 'IMPORTANT',
    context: 'NONE',
    supportedChannels: allChannels,
    defaults: {
      inAppEnabled: true,
      emailEnabled: true,
      pushEnabled: false,
    },
    deliveryStrategy: 'ONE_SHOT',
  },
  [NOTIFICATION_TYPES.UPCOMING_BIRTHDAY]: {
    topic: NOTIFICATION_TOPICS.BIRTHDAY_REMINDERS,
    category: NOTIFICATION_CATEGORIES.OCCASIONS,
    importance: 'IMPORTANT',
    context: 'NONE',
    supportedChannels: allChannels,
    defaults: {
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
    },
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
} as const satisfies Record<NotificationType, NotificationEventDefinition>;

export const NOTIFICATION_TYPE_VALUES = Object.values(NOTIFICATION_TYPES);

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.fromEntries(
  NOTIFICATION_TYPE_VALUES.map((type) => [
    type,
    { ...NOTIFICATION_EVENT_CATALOG[type].defaults },
  ]),
) as Record<NotificationType, NotificationPreferenceDefaults>;

export function getNotificationEventDefinition(type: NotificationType) {
  return NOTIFICATION_EVENT_CATALOG[type];
}

export function isNotificationType(value: unknown): value is NotificationType {
  return (
    typeof value === 'string' &&
    Object.hasOwn(NOTIFICATION_EVENT_CATALOG, value)
  );
}

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
    birthdayUsername: string;
    birthdayDisplayName: string;
    daysUntil: number;
    // Computed once by the sweep so occurrence keys cannot shift if a sweep
    // spans local midnight.
    birthdayDate: Date;
  };
};

export type NotificationPayload<T extends NotificationType> = PayloadByType[T];

export type NotificationIntent<T extends NotificationType = NotificationType> =
  T extends NotificationType
    ? {
        userId: string;
        type: T;
        payload: NotificationPayload<T>;
        sourceIdentifier?: string;
      }
    : never;
