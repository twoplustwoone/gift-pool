import { describe, expect, it } from 'vitest';
import {
  getNotificationEventDefinition,
  getNotificationTopicsForContext,
  isNotificationType,
  matchesNotificationContext,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_CATALOG,
  NOTIFICATION_TOPIC_CATALOG,
  NOTIFICATION_TOPICS,
  NOTIFICATION_TYPES,
  ORGANIZER_NUDGE_NOTIFICATION_TYPES,
  POOL_ACTIVITY_NOTIFICATION_TYPES,
} from '#app/utils/notification-catalog.ts';

describe('notification catalog', () => {
  it('maps concrete friend events to one stable preference topic', () => {
    expect(
      getNotificationEventDefinition(NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED)
        .topic,
    ).toBe(NOTIFICATION_TOPICS.FRIEND_REQUESTS);
    expect(
      getNotificationEventDefinition(NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED)
        .topic,
    ).toBe(NOTIFICATION_TOPICS.FRIEND_REQUESTS);
  });

  it('keeps email opt-in except for consent-bearing social invitations', () => {
    const grandfatheredEmailDefaults = new Set<string>([
      NOTIFICATION_TOPICS.FRIEND_REQUESTS,
      NOTIFICATION_TOPICS.POOL_INVITATIONS,
    ]);

    for (const [topic, definition] of Object.entries(
      NOTIFICATION_TOPIC_CATALOG,
    )) {
      if (!grandfatheredEmailDefaults.has(topic)) {
        expect(definition.defaults.emailEnabled).toBe(false);
      }
      expect(definition.defaults.pushEnabled).toBe(false);
    }
    for (const definition of Object.values(NOTIFICATION_EVENT_CATALOG)) {
      expect(definition.supportedChannels).toContain(
        NOTIFICATION_CHANNELS.IN_APP,
      );
    }
  });

  it('classifies important pool activity into scoped, ledger-backed topics', () => {
    for (const type of POOL_ACTIVITY_NOTIFICATION_TYPES) {
      expect(getNotificationEventDefinition(type)).toMatchObject({
        context: 'POOL',
        importance: 'IMPORTANT',
        deliveryStrategy: 'PER_CHANNEL_LEDGER',
      });
    }

    expect(
      getNotificationEventDefinition(NOTIFICATION_TYPES.POOL_VOTE_STARTED)
        .topic,
    ).toBe(NOTIFICATION_TOPICS.IDEAS_AND_VOTING);
    expect(
      getNotificationEventDefinition(NOTIFICATION_TYPES.POOL_GIFT_CHOSEN).topic,
    ).toBe(NOTIFICATION_TOPICS.IDEAS_AND_VOTING);
    expect(
      getNotificationEventDefinition(NOTIFICATION_TYPES.POOL_CANCELLED).topic,
    ).toBe(NOTIFICATION_TOPICS.POOL_PROGRESS);
    expect(
      getNotificationEventDefinition(NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED)
        .topic,
    ).toBe(NOTIFICATION_TOPICS.ASSIGNMENTS);
  });

  it('maps every organizer nudge to one in-app-first pool topic', () => {
    for (const type of ORGANIZER_NUDGE_NOTIFICATION_TYPES) {
      expect(getNotificationEventDefinition(type)).toMatchObject({
        topic: NOTIFICATION_TOPICS.ORGANIZER_NUDGES,
        context: 'POOL',
        importance: 'IMPORTANT',
        deliveryStrategy: 'PER_CHANNEL_LEDGER',
      });
    }
    expect(
      NOTIFICATION_TOPIC_CATALOG[NOTIFICATION_TOPICS.ORGANIZER_NUDGES].defaults,
    ).toEqual({
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
    });
  });

  it('exposes pool topics for pool and group context controls', () => {
    const poolTopics = [
      NOTIFICATION_TOPICS.IDEAS_AND_VOTING,
      NOTIFICATION_TOPICS.POOL_PROGRESS,
      NOTIFICATION_TOPICS.ASSIGNMENTS,
      NOTIFICATION_TOPICS.ORGANIZER_NUDGES,
      // WISHLIST_CLAIM_TRANSFERRED (context: 'POOL') shares this topic with
      // WISHLIST_CLAIM_CONFLICT (context: 'NONE'), so the topic as a whole
      // qualifies for pool/group context controls even though one of its two
      // events does not.
      NOTIFICATION_TOPICS.WISHLIST_CLAIM_CONFLICTS,
    ];

    expect(getNotificationTopicsForContext('POOL')).toEqual(poolTopics);
    // EXCHANGE_STARTED is the one exchange event with GROUP context, so its
    // topic appears under group controls only — a muted group stays quiet
    // about new exchanges but can never swallow a draw or reveal.
    expect(getNotificationTopicsForContext('GROUP')).toEqual([
      ...poolTopics,
      NOTIFICATION_TOPICS.EXCHANGE_INVITATIONS,
    ]);
  });

  it('scopes WISHLIST_CLAIM_TRANSFERRED to pool context so a muted pool suppresses it, but leaves WISHLIST_CLAIM_CONFLICT unscoped', () => {
    // WISHLIST_CLAIM_CONFLICT's recipient may have no relationship to the
    // pool's group at all (see the catalog entry's own comment) — it must
    // stay context: 'NONE'. WISHLIST_CLAIM_TRANSFERRED's audience is always
    // the inheriting pool's own contributors, so it must be context: 'POOL'
    // for pool-mute settings to apply.
    expect(
      getNotificationEventDefinition(NOTIFICATION_TYPES.WISHLIST_CLAIM_CONFLICT)
        .context,
    ).toBe('NONE');
    expect(
      getNotificationEventDefinition(
        NOTIFICATION_TYPES.WISHLIST_CLAIM_TRANSFERRED,
      ).context,
    ).toBe('POOL');
  });

  it('validates persisted type strings through the catalog', () => {
    expect(isNotificationType(NOTIFICATION_TYPES.UPCOMING_BIRTHDAY)).toBe(true);
    expect(isNotificationType('SOMETHING_NEW')).toBe(false);
    expect(isNotificationType(null)).toBe(false);
  });

  it('maps both wishlist-claim events to one shared topic', () => {
    const topics = [
      NOTIFICATION_TYPES.WISHLIST_CLAIM_CONFLICT,
      NOTIFICATION_TYPES.WISHLIST_CLAIM_TRANSFERRED,
    ].map((t) => getNotificationEventDefinition(t).topic);
    expect(new Set(topics).size).toBe(1);
  });

  it('keeps the exchange key moments unscoped so a muted group cannot swallow them', () => {
    for (const type of [
      NOTIFICATION_TYPES.EXCHANGE_NAMES_DRAWN,
      NOTIFICATION_TYPES.EXCHANGE_REVEALED,
      NOTIFICATION_TYPES.EXCHANGE_CANCELLED,
    ]) {
      expect(getNotificationEventDefinition(type)).toMatchObject({
        topic: NOTIFICATION_TOPICS.EXCHANGE_KEY_MOMENTS,
        context: 'NONE',
        importance: 'IMPORTANT',
        deliveryStrategy: 'PER_CHANNEL_LEDGER',
      });
      expect(matchesNotificationContext('NONE', undefined)).toBe(true);
    }
    expect(
      getNotificationEventDefinition(NOTIFICATION_TYPES.EXCHANGE_STARTED),
    ).toMatchObject({
      topic: NOTIFICATION_TOPICS.EXCHANGE_INVITATIONS,
      context: 'GROUP',
    });
    expect(getNotificationTopicsForContext('GROUP')).toContain(
      NOTIFICATION_TOPICS.EXCHANGE_INVITATIONS,
    );
    expect(getNotificationTopicsForContext('GROUP')).not.toContain(
      NOTIFICATION_TOPICS.EXCHANGE_KEY_MOMENTS,
    );
  });

  it('requires the context kind declared by an event', () => {
    const groupContext = { kind: 'GROUP', groupId: 'group-1' } as const;
    const poolContext = { kind: 'POOL', poolId: 'pool-1' } as const;

    expect(matchesNotificationContext('NONE')).toBe(true);
    expect(matchesNotificationContext('NONE', groupContext)).toBe(false);
    expect(matchesNotificationContext('GROUP', groupContext)).toBe(true);
    expect(matchesNotificationContext('GROUP')).toBe(false);
    expect(matchesNotificationContext('GROUP', poolContext)).toBe(false);
  });
});
