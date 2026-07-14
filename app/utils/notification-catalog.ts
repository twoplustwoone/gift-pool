export const NOTIFICATION_TYPES = {
  FRIEND_REQUEST_RECEIVED: 'FRIEND_REQUEST_RECEIVED',
  FRIEND_REQUEST_ACCEPTED: 'FRIEND_REQUEST_ACCEPTED',
  UPCOMING_BIRTHDAY: 'UPCOMING_BIRTHDAY',
  POOL_VOTE_STARTED: 'POOL_VOTE_STARTED',
  POOL_GIFT_CHOSEN: 'POOL_GIFT_CHOSEN',
  POOL_CANCELLED: 'POOL_CANCELLED',
  POOL_PURCHASER_ASSIGNED: 'POOL_PURCHASER_ASSIGNED',
  POOL_DELIVERER_ASSIGNED: 'POOL_DELIVERER_ASSIGNED',
  POOL_CONTRIBUTION_REMINDER: 'POOL_CONTRIBUTION_REMINDER',
  POOL_VOTE_REMINDER: 'POOL_VOTE_REMINDER',
  POOL_PURCHASE_REMINDER: 'POOL_PURCHASE_REMINDER',
  POOL_DELIVERY_REMINDER: 'POOL_DELIVERY_REMINDER',
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const POOL_ACTIVITY_NOTIFICATION_TYPES = [
  NOTIFICATION_TYPES.POOL_VOTE_STARTED,
  NOTIFICATION_TYPES.POOL_GIFT_CHOSEN,
  NOTIFICATION_TYPES.POOL_CANCELLED,
  NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED,
  NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED,
] as const;

export type PoolActivityNotificationType =
  (typeof POOL_ACTIVITY_NOTIFICATION_TYPES)[number];

export function isPoolActivityNotificationType(
  type: NotificationType,
): type is PoolActivityNotificationType {
  return POOL_ACTIVITY_NOTIFICATION_TYPES.includes(
    type as PoolActivityNotificationType,
  );
}

export const ORGANIZER_NUDGE_NOTIFICATION_TYPES = [
  NOTIFICATION_TYPES.POOL_CONTRIBUTION_REMINDER,
  NOTIFICATION_TYPES.POOL_VOTE_REMINDER,
  NOTIFICATION_TYPES.POOL_PURCHASE_REMINDER,
  NOTIFICATION_TYPES.POOL_DELIVERY_REMINDER,
] as const;

export type OrganizerNudgeNotificationType =
  (typeof ORGANIZER_NUDGE_NOTIFICATION_TYPES)[number];

export function isOrganizerNudgeNotificationType(
  type: NotificationType,
): type is OrganizerNudgeNotificationType {
  return ORGANIZER_NUDGE_NOTIFICATION_TYPES.includes(
    type as OrganizerNudgeNotificationType,
  );
}

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
  POOL_COORDINATION: 'POOL_COORDINATION',
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
  [NOTIFICATION_CATEGORIES.POOL_COORDINATION]: {
    label: 'Pool coordination',
    description: 'Important decisions and assignments in your gift pools.',
  },
} as const satisfies Record<
  NotificationCategory,
  NotificationCategoryDefinition
>;

export const NOTIFICATION_TOPICS = {
  FRIEND_REQUESTS: 'FRIEND_REQUESTS',
  BIRTHDAY_REMINDERS: 'BIRTHDAY_REMINDERS',
  IDEAS_AND_VOTING: 'IDEAS_AND_VOTING',
  POOL_PROGRESS: 'POOL_PROGRESS',
  ASSIGNMENTS: 'ASSIGNMENTS',
  ORGANIZER_NUDGES: 'ORGANIZER_NUDGES',
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
  [NOTIFICATION_TOPICS.IDEAS_AND_VOTING]: {
    category: NOTIFICATION_CATEGORIES.POOL_COORDINATION,
    label: 'Ideas and voting',
    description: 'When voting starts or a gift is chosen.',
    defaults: {
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
    },
  },
  [NOTIFICATION_TOPICS.POOL_PROGRESS]: {
    category: NOTIFICATION_CATEGORIES.POOL_COORDINATION,
    label: 'Pool progress',
    description: "Important changes to a pool's lifecycle.",
    defaults: {
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
    },
  },
  [NOTIFICATION_TOPICS.ASSIGNMENTS]: {
    category: NOTIFICATION_CATEGORIES.POOL_COORDINATION,
    label: 'Assignments',
    description: 'When you are assigned to purchase or deliver a gift.',
    defaults: {
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
    },
  },
  [NOTIFICATION_TOPICS.ORGANIZER_NUDGES]: {
    category: NOTIFICATION_CATEGORIES.POOL_COORDINATION,
    label: 'Organizer reminders',
    description: 'Preset reminders from pool managers about unfinished tasks.',
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
  [NOTIFICATION_TYPES.POOL_VOTE_STARTED]: {
    topic: NOTIFICATION_TOPICS.IDEAS_AND_VOTING,
    importance: 'IMPORTANT',
    context: 'POOL',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  [NOTIFICATION_TYPES.POOL_GIFT_CHOSEN]: {
    topic: NOTIFICATION_TOPICS.IDEAS_AND_VOTING,
    importance: 'IMPORTANT',
    context: 'POOL',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  [NOTIFICATION_TYPES.POOL_CANCELLED]: {
    topic: NOTIFICATION_TOPICS.POOL_PROGRESS,
    importance: 'IMPORTANT',
    context: 'POOL',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  [NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED]: {
    topic: NOTIFICATION_TOPICS.ASSIGNMENTS,
    importance: 'IMPORTANT',
    context: 'POOL',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  [NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED]: {
    topic: NOTIFICATION_TOPICS.ASSIGNMENTS,
    importance: 'IMPORTANT',
    context: 'POOL',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  [NOTIFICATION_TYPES.POOL_CONTRIBUTION_REMINDER]: {
    topic: NOTIFICATION_TOPICS.ORGANIZER_NUDGES,
    importance: 'IMPORTANT',
    context: 'POOL',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  [NOTIFICATION_TYPES.POOL_VOTE_REMINDER]: {
    topic: NOTIFICATION_TOPICS.ORGANIZER_NUDGES,
    importance: 'IMPORTANT',
    context: 'POOL',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  [NOTIFICATION_TYPES.POOL_PURCHASE_REMINDER]: {
    topic: NOTIFICATION_TOPICS.ORGANIZER_NUDGES,
    importance: 'IMPORTANT',
    context: 'POOL',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  [NOTIFICATION_TYPES.POOL_DELIVERY_REMINDER]: {
    topic: NOTIFICATION_TOPICS.ORGANIZER_NUDGES,
    importance: 'IMPORTANT',
    context: 'POOL',
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

type PoolActivityPayload = {
  poolId: string;
  poolTitle: string;
  actorUserId: string;
};

type OrganizerNudgePayload = {
  nudgeId: string;
  poolId: string;
  poolTitle: string;
  senderUserId: string;
  senderDisplayName: string;
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
  [NOTIFICATION_TYPES.POOL_VOTE_STARTED]: PoolActivityPayload;
  [NOTIFICATION_TYPES.POOL_GIFT_CHOSEN]: PoolActivityPayload & {
    chosenIdeaName: string;
  };
  [NOTIFICATION_TYPES.POOL_CANCELLED]: PoolActivityPayload;
  [NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED]: PoolActivityPayload;
  [NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED]: PoolActivityPayload;
  [NOTIFICATION_TYPES.POOL_CONTRIBUTION_REMINDER]: OrganizerNudgePayload;
  [NOTIFICATION_TYPES.POOL_VOTE_REMINDER]: OrganizerNudgePayload;
  [NOTIFICATION_TYPES.POOL_PURCHASE_REMINDER]: OrganizerNudgePayload;
  [NOTIFICATION_TYPES.POOL_DELIVERY_REMINDER]: OrganizerNudgePayload;
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
