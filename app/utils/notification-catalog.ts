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

export const NOTIFICATION_CATEGORY_VALUES = Object.values(
  NOTIFICATION_CATEGORIES,
);

type NotificationCategoryDefinition = {
  label: string;
  description: string;
};

export const NOTIFICATION_CATEGORY_CATALOG = {
  [NOTIFICATION_CATEGORIES.SOCIAL]: {
    label: 'Friend activity',
    description: 'Requests and updates from people you connect with.',
  },
  [NOTIFICATION_CATEGORIES.OCCASIONS]: {
    label: 'Reminders',
    description: 'Timely reminders about occasions you can see.',
  },
} as const satisfies Record<
  NotificationCategory,
  NotificationCategoryDefinition
>;

export const NOTIFICATION_TOPICS = {
  FRIEND_REQUESTS: 'FRIEND_REQUESTS',
  BIRTHDAY_REMINDERS: 'BIRTHDAY_REMINDERS',
} as const;

export type NotificationTopic =
  (typeof NOTIFICATION_TOPICS)[keyof typeof NOTIFICATION_TOPICS];

export const NOTIFICATION_TOPIC_VALUES = Object.values(NOTIFICATION_TOPICS);

export type NotificationImportance = 'IMPORTANT' | 'ROUTINE';
export type NotificationContextKind = 'NONE' | 'GROUP' | 'POOL';
export type NotificationDeliveryStrategy = 'ONE_SHOT' | 'PER_CHANNEL_LEDGER';

export type NotificationContext =
  | { kind: 'GROUP'; groupId: string }
  | { kind: 'POOL'; poolId: string };

export type NotificationPreferenceDefaults = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
};

type NotificationEventDefinition = {
  topic: NotificationTopic;
  importance: NotificationImportance;
  context: NotificationContextKind;
  supportedChannels: ReadonlyArray<NotificationChannel>;
  deliveryStrategy: NotificationDeliveryStrategy;
};

type NotificationTopicDefinition = {
  category: NotificationCategory;
  label: string;
  description: string;
  defaults: NotificationPreferenceDefaults;
};

const allChannels = NOTIFICATION_CHANNEL_VALUES;

/** Topic policy is stable even when several concrete events map to one row. */
export const NOTIFICATION_TOPIC_CATALOG = {
  [NOTIFICATION_TOPICS.FRIEND_REQUESTS]: {
    category: NOTIFICATION_CATEGORIES.SOCIAL,
    label: 'Friend requests',
    description: 'When you receive a request or someone accepts yours.',
    defaults: {
      inAppEnabled: true,
      emailEnabled: true,
      pushEnabled: false,
    },
  },
  [NOTIFICATION_TOPICS.BIRTHDAY_REMINDERS]: {
    category: NOTIFICATION_CATEGORIES.OCCASIONS,
    label: 'Upcoming birthdays',
    description: 'A heads-up before a visible friend or group birthday.',
    defaults: {
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
    },
  },
} as const satisfies Record<NotificationTopic, NotificationTopicDefinition>;

/**
 * Typed source of truth for event policy and user-facing preference copy. The
 * stable identifiers let new events reuse existing preference concepts.
 */
export const NOTIFICATION_EVENT_CATALOG = {
  [NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED]: {
    topic: NOTIFICATION_TOPICS.FRIEND_REQUESTS,
    importance: 'IMPORTANT',
    context: 'NONE',
    supportedChannels: allChannels,
    deliveryStrategy: 'ONE_SHOT',
  },
  [NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED]: {
    topic: NOTIFICATION_TOPICS.FRIEND_REQUESTS,
    importance: 'IMPORTANT',
    context: 'NONE',
    supportedChannels: allChannels,
    deliveryStrategy: 'ONE_SHOT',
  },
  [NOTIFICATION_TYPES.UPCOMING_BIRTHDAY]: {
    topic: NOTIFICATION_TOPICS.BIRTHDAY_REMINDERS,
    importance: 'IMPORTANT',
    context: 'NONE',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
} as const satisfies Record<NotificationType, NotificationEventDefinition>;

export const NOTIFICATION_TYPE_VALUES = Object.values(NOTIFICATION_TYPES);

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.fromEntries(
  NOTIFICATION_TYPE_VALUES.map((type) => [
    type,
    {
      ...NOTIFICATION_TOPIC_CATALOG[NOTIFICATION_EVENT_CATALOG[type].topic]
        .defaults,
    },
  ]),
) as Record<NotificationType, NotificationPreferenceDefaults>;

export function getNotificationEventDefinition(type: NotificationType) {
  return NOTIFICATION_EVENT_CATALOG[type];
}

export function getNotificationTopicDefinition(topic: NotificationTopic) {
  return NOTIFICATION_TOPIC_CATALOG[topic];
}

export function getNotificationCategoryDefinition(
  category: NotificationCategory,
) {
  return NOTIFICATION_CATEGORY_CATALOG[category];
}

export function getNotificationCategoryTopics(
  category: NotificationCategory,
): Array<NotificationTopic> {
  return NOTIFICATION_TOPIC_VALUES.filter(
    (topic) => NOTIFICATION_TOPIC_CATALOG[topic].category === category,
  );
}

export function getNotificationTopicsForContext(
  contextKind: Exclude<NotificationContextKind, 'NONE'>,
): Array<NotificationTopic> {
  const eligibleContexts =
    contextKind === 'GROUP' ? new Set(['GROUP', 'POOL']) : new Set(['POOL']);
  return NOTIFICATION_TOPIC_VALUES.filter((topic) =>
    Object.values(NOTIFICATION_EVENT_CATALOG).some(
      (event) => event.topic === topic && eligibleContexts.has(event.context),
    ),
  );
}

export function matchesNotificationContext(
  expected: NotificationContextKind,
  context?: NotificationContext,
) {
  return expected === 'NONE'
    ? context === undefined
    : context?.kind === expected;
}

export function isNotificationType(value: unknown): value is NotificationType {
  return (
    typeof value === 'string' &&
    Object.hasOwn(NOTIFICATION_EVENT_CATALOG, value)
  );
}

export function isNotificationTopic(
  value: unknown,
): value is NotificationTopic {
  return (
    typeof value === 'string' &&
    Object.hasOwn(NOTIFICATION_TOPIC_CATALOG, value)
  );
}

export function isNotificationCategory(
  value: unknown,
): value is NotificationCategory {
  return (
    typeof value === 'string' &&
    Object.values(NOTIFICATION_CATEGORIES).includes(
      value as NotificationCategory,
    )
  );
}

export function isNotificationChannel(
  value: unknown,
): value is NotificationChannel {
  return (
    typeof value === 'string' &&
    NOTIFICATION_CHANNEL_VALUES.includes(value as NotificationChannel)
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
        context?: NotificationContext;
        sourceIdentifier?: string;
      }
    : never;
