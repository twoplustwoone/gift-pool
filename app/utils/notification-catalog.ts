export const NOTIFICATION_TYPES = {
  FRIEND_REQUEST_RECEIVED: 'FRIEND_REQUEST_RECEIVED',
  FRIEND_REQUEST_ACCEPTED: 'FRIEND_REQUEST_ACCEPTED',
  POOL_INVITATION_RECEIVED: 'POOL_INVITATION_RECEIVED',
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
  WISHLIST_CLAIM_CONFLICT: 'WISHLIST_CLAIM_CONFLICT',
  WISHLIST_CLAIM_TRANSFERRED: 'WISHLIST_CLAIM_TRANSFERRED',
  EXCHANGE_STARTED: 'EXCHANGE_STARTED',
  EXCHANGE_NAMES_DRAWN: 'EXCHANGE_NAMES_DRAWN',
  EXCHANGE_REVEALED: 'EXCHANGE_REVEALED',
  EXCHANGE_CANCELLED: 'EXCHANGE_CANCELLED',
  EXCHANGE_NOTE_RECEIVED: 'EXCHANGE_NOTE_RECEIVED',
  EXCHANGE_ANSWER_REMINDER: 'EXCHANGE_ANSWER_REMINDER',
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

export const WISHLIST_CLAIM_NOTIFICATION_TYPES = [
  NOTIFICATION_TYPES.WISHLIST_CLAIM_CONFLICT,
  NOTIFICATION_TYPES.WISHLIST_CLAIM_TRANSFERRED,
] as const;

export type WishlistClaimNotificationType =
  (typeof WISHLIST_CLAIM_NOTIFICATION_TYPES)[number];

export function isWishlistClaimNotificationType(
  type: NotificationType,
): type is WishlistClaimNotificationType {
  return WISHLIST_CLAIM_NOTIFICATION_TYPES.includes(
    type as WishlistClaimNotificationType,
  );
}

export const EXCHANGE_NOTIFICATION_TYPES = [
  NOTIFICATION_TYPES.EXCHANGE_STARTED,
  NOTIFICATION_TYPES.EXCHANGE_NAMES_DRAWN,
  NOTIFICATION_TYPES.EXCHANGE_REVEALED,
  NOTIFICATION_TYPES.EXCHANGE_CANCELLED,
  NOTIFICATION_TYPES.EXCHANGE_NOTE_RECEIVED,
  NOTIFICATION_TYPES.EXCHANGE_ANSWER_REMINDER,
] as const;

export type ExchangeNotificationType =
  (typeof EXCHANGE_NOTIFICATION_TYPES)[number];

export function isExchangeNotificationType(
  type: NotificationType,
): type is ExchangeNotificationType {
  return EXCHANGE_NOTIFICATION_TYPES.includes(type as ExchangeNotificationType);
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
  EXCHANGES: 'EXCHANGES',
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
  [NOTIFICATION_CATEGORIES.EXCHANGES]: {
    label: 'Gift exchanges',
    description: "Draws, reveals and joins in gift exchanges you're part of.",
  },
} as const satisfies Record<
  NotificationCategory,
  NotificationCategoryDefinition
>;

export const NOTIFICATION_TOPICS = {
  FRIEND_REQUESTS: 'FRIEND_REQUESTS',
  POOL_INVITATIONS: 'POOL_INVITATIONS',
  BIRTHDAY_REMINDERS: 'BIRTHDAY_REMINDERS',
  IDEAS_AND_VOTING: 'IDEAS_AND_VOTING',
  POOL_PROGRESS: 'POOL_PROGRESS',
  ASSIGNMENTS: 'ASSIGNMENTS',
  ORGANIZER_NUDGES: 'ORGANIZER_NUDGES',
  WISHLIST_CLAIM_CONFLICTS: 'WISHLIST_CLAIM_CONFLICTS',
  EXCHANGE_KEY_MOMENTS: 'EXCHANGE_KEY_MOMENTS',
  EXCHANGE_INVITATIONS: 'EXCHANGE_INVITATIONS',
  EXCHANGE_NOTES: 'EXCHANGE_NOTES',
  EXCHANGE_REMINDERS: 'EXCHANGE_REMINDERS',
} as const;

export type NotificationTopic =
  (typeof NOTIFICATION_TOPICS)[keyof typeof NOTIFICATION_TOPICS];

export const NOTIFICATION_TOPIC_VALUES = Object.values(NOTIFICATION_TOPICS);

export type NotificationImportance = 'IMPORTANT' | 'ROUTINE';
export type NotificationContextKind = 'NONE' | 'GROUP' | 'POOL';
export type NotificationDeliveryStrategy = 'ONE_SHOT' | 'PER_CHANNEL_LEDGER';

export type NotificationContext =
  { kind: 'GROUP'; groupId: string } | { kind: 'POOL'; poolId: string };

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
  [NOTIFICATION_TOPICS.POOL_INVITATIONS]: {
    category: NOTIFICATION_CATEGORIES.POOL_COORDINATION,
    label: 'Pool invitations',
    description: 'When someone invites you to contribute to a gift pool.',
    defaults: {
      inAppEnabled: true,
      emailEnabled: true,
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
  [NOTIFICATION_TOPICS.WISHLIST_CLAIM_CONFLICTS]: {
    category: NOTIFICATION_CATEGORIES.POOL_COORDINATION,
    label: 'Wishlist claim conflicts',
    description:
      'When a pool decides on a gift you already claimed, and when that conflict resolves.',
    defaults: {
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
    },
  },
  // Defaults follow the house rule (in-app on, email/push opt-in). What makes
  // "names are drawn" the notification nobody may miss is not its defaults but
  // its scope: every channel the user has enabled fires, and it is never
  // filtered by a group's activity level (see the event catalog).
  [NOTIFICATION_TOPICS.EXCHANGE_KEY_MOMENTS]: {
    category: NOTIFICATION_CATEGORIES.EXCHANGES,
    label: 'Draws and reveals',
    description:
      'When names are drawn, the pairings are revealed, or an exchange is cancelled.',
    defaults: {
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
    },
  },
  [NOTIFICATION_TOPICS.EXCHANGE_NOTES]: {
    category: NOTIFICATION_CATEGORIES.EXCHANGES,
    label: 'Notes and clues',
    description:
      'When the person who has you sends a note or a clue, or your person replies.',
    // Push off by default like every other topic — that invariant is asserted
    // repo-wide in notification-catalog.test.ts, and a note is not urgent
    // enough to be the exception that breaks it.
    defaults: {
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
    },
  },
  [NOTIFICATION_TOPICS.EXCHANGE_REMINDERS]: {
    category: NOTIFICATION_CATEGORIES.EXCHANGES,
    label: 'Exchange reminders',
    description:
      'When an organizer reminds the group about something the exchange needs.',
    defaults: {
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
    },
  },
  [NOTIFICATION_TOPICS.EXCHANGE_INVITATIONS]: {
    category: NOTIFICATION_CATEGORIES.EXCHANGES,
    label: 'Exchange invitations',
    description: "When a group you're in starts a gift exchange.",
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
  [NOTIFICATION_TYPES.POOL_INVITATION_RECEIVED]: {
    topic: NOTIFICATION_TOPICS.POOL_INVITATIONS,
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
  // The claimant of a wishlist item is not necessarily a member or
  // contributor of the pool that decided on it (context: 'NONE', same
  // reasoning as POOL_INVITATION_RECEIVED above) — this notifies a person
  // outside the pool about what happened to their claim.
  [NOTIFICATION_TYPES.WISHLIST_CLAIM_CONFLICT]: {
    topic: NOTIFICATION_TOPICS.WISHLIST_CLAIM_CONFLICTS,
    importance: 'IMPORTANT',
    context: 'NONE',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  // Unlike CONFLICT, this notifies the pool's own contributors — context:
  // 'POOL', because the audience is exactly the inheriting pool's
  // contributors (see queueWishlistClaimTransferredNotification in
  // pool.server.ts, which fans this out to each contributor individually and
  // passes `{ kind: 'POOL', poolId }` on every intent). A contributor who has
  // muted that pool must not be pinged, so contextual activity settings have
  // to actually apply here — unlike CONFLICT, where the recipient may have no
  // relationship to the pool's group at all and there is no pool context to
  // consult.
  [NOTIFICATION_TYPES.WISHLIST_CLAIM_TRANSFERRED]: {
    topic: NOTIFICATION_TOPICS.WISHLIST_CLAIM_CONFLICTS,
    importance: 'IMPORTANT',
    context: 'POOL',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  // A group starting an exchange is group activity: a member who muted the
  // group has asked not to hear about it, so this one carries GROUP context.
  [NOTIFICATION_TYPES.EXCHANGE_STARTED]: {
    topic: NOTIFICATION_TOPICS.EXCHANGE_INVITATIONS,
    importance: 'IMPORTANT',
    context: 'GROUP',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  // The three key moments are deliberately context: 'NONE'. A participant
  // opted INTO this exchange; a group's IMPORTANT_ONLY or muted activity level
  // must not swallow the one message that tells them they have someone to
  // shop for (design board §3a note 4). Standalone exchanges have no group at
  // all, so a group context would not even exist for them. Central channel
  // gates still apply. Bodies never name the drawn person.
  [NOTIFICATION_TYPES.EXCHANGE_NAMES_DRAWN]: {
    topic: NOTIFICATION_TOPICS.EXCHANGE_KEY_MOMENTS,
    importance: 'IMPORTANT',
    context: 'NONE',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  [NOTIFICATION_TYPES.EXCHANGE_REVEALED]: {
    topic: NOTIFICATION_TOPICS.EXCHANGE_KEY_MOMENTS,
    importance: 'IMPORTANT',
    context: 'NONE',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  [NOTIFICATION_TYPES.EXCHANGE_CANCELLED]: {
    topic: NOTIFICATION_TOPICS.EXCHANGE_KEY_MOMENTS,
    importance: 'IMPORTANT',
    context: 'NONE',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  // Also context: 'NONE'. A note is addressed to one person by another
  // person in an exchange they opted into; a muted group must not eat it.
  // The body never carries the note's text or its sender — the whole point of
  // the thread is that you don't know who wrote it.
  [NOTIFICATION_TYPES.EXCHANGE_NOTE_RECEIVED]: {
    topic: NOTIFICATION_TOPICS.EXCHANGE_NOTES,
    importance: 'ROUTINE',
    context: 'NONE',
    supportedChannels: allChannels,
    deliveryStrategy: 'PER_CHANNEL_LEDGER',
  },
  // context: 'NONE' like the other exchange moments — a reminder is about an
  // exchange someone was invited to, and a muted group must not swallow the
  // one message asking them to answer before the draw closes.
  [NOTIFICATION_TYPES.EXCHANGE_ANSWER_REMINDER]: {
    topic: NOTIFICATION_TOPICS.EXCHANGE_REMINDERS,
    importance: 'ROUTINE',
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
  'inAppEnabled' | 'emailEnabled' | 'pushEnabled';

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

type PoolInvitationPayload = {
  invitationId: string;
  poolId: string;
  poolTitle: string;
  recipientLabel: string;
  inviterUserId: string;
  inviterDisplayName: string;
  inviterAvatarId?: string | null;
};

type OrganizerNudgePayload = {
  nudgeId: string;
  poolId: string;
  poolTitle: string;
  senderUserId: string;
  senderDisplayName: string;
};

// Shared by both wishlist-claim events. `wishlistItemId` identifies the
// claim; `itemTitle`/`recipientName`/`recipientUsername` describe what's on
// the line and are safe to disclose to either audience outright — a claim
// holder already knows both (they claimed this exact item on this exact
// person's wishlist), and a pool contributor already sees the item through
// the pool's own idea list. `poolId`/`poolTitle` identify the pool whose
// decision created or resolved the conflict. They must NOT appear in
// WISHLIST_CLAIM_CONFLICT's rendered copy: that notification can reach
// someone with no relationship to the pool's group, and the privacy ladder
// (wishlist-claim-disclosure.ts) never names a pool to an outsider. They ARE
// safe in WISHLIST_CLAIM_TRANSFERRED's rendered copy: that notification's
// audience is the inheriting pool's own contributors, who already know their
// own pool.
type WishlistClaimEventPayload = {
  wishlistItemId: string;
  itemTitle: string;
  recipientName: string;
  recipientUsername: string;
  poolId: string;
  poolTitle: string;
};

// CONFLICT-only: identifies the specific WishlistClaim occurrence this
// notification was raised about. Its Release action carries this back
// through the request so the mutation can be bound to that exact occurrence
// (see releaseUserClaim's expectedClaimId in wishlist-claims.server.ts) — a
// stale notification (claimant released elsewhere, re-claimed, then clicked
// an old notification's Release) fails safely instead of dropping the
// user's current claim. TRANSFERRED has no equivalent need: it isn't
// actionable, so there is nothing for a stale click to destroy.
type WishlistClaimConflictPayload = WishlistClaimEventPayload & {
  claimId: string;
};

// Exchange events name the exchange and its organizer, nothing else. There is
// no giftee/gifter field on purpose: nothing in a notification body, push
// preview, or metadata may identify a pairing.
type ExchangeEventPayload = {
  exchangeId: string;
  exchangeTitle: string;
  organizerUserId: string;
  organizerDisplayName: string;
};

type PayloadByType = {
  [NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED]: FriendRequestPayload;
  [NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED]: FriendRequestPayload;
  [NOTIFICATION_TYPES.POOL_INVITATION_RECEIVED]: PoolInvitationPayload;
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
  [NOTIFICATION_TYPES.WISHLIST_CLAIM_CONFLICT]: WishlistClaimConflictPayload;
  [NOTIFICATION_TYPES.WISHLIST_CLAIM_TRANSFERRED]: WishlistClaimEventPayload;
  [NOTIFICATION_TYPES.EXCHANGE_STARTED]: ExchangeEventPayload & {
    giftGroupId: string;
    eventDate: Date;
  };
  [NOTIFICATION_TYPES.EXCHANGE_NAMES_DRAWN]: ExchangeEventPayload;
  [NOTIFICATION_TYPES.EXCHANGE_REVEALED]: ExchangeEventPayload & {
    finalStatus: 'REVEALED' | 'FINISHED';
  };
  [NOTIFICATION_TYPES.EXCHANGE_CANCELLED]: ExchangeEventPayload;
  // No sender, no text: the notification says a note arrived and where to
  // read it. Anything more would either name the person or let the body be
  // read from a lock screen by whoever is standing next to them.
  [NOTIFICATION_TYPES.EXCHANGE_ANSWER_REMINDER]: ExchangeEventPayload & {
    /** Distinguishes one send from the next in the ledger. */
    reminderAt: Date;
  };
  [NOTIFICATION_TYPES.EXCHANGE_NOTE_RECEIVED]: ExchangeEventPayload & {
    noteId: string;
    /** Their gifter's thread, or their own person's reply. */
    thread: 'FROM_YOUR_GIFTER' | 'FROM_YOUR_PERSON';
    /** How many landed in this morning's batch, for a single summary line. */
    noteCount: number;
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
