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

  it('keeps email opt-in for new topics except grandfathered friend defaults', () => {
    const grandfatheredEmailDefaults = new Set<string>([
      NOTIFICATION_TOPICS.FRIEND_REQUESTS,
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

  it('exposes pool topics for pool and group context controls', () => {
    const poolTopics = [
      NOTIFICATION_TOPICS.IDEAS_AND_VOTING,
      NOTIFICATION_TOPICS.POOL_PROGRESS,
      NOTIFICATION_TOPICS.ASSIGNMENTS,
    ];

    expect(getNotificationTopicsForContext('POOL')).toEqual(poolTopics);
    expect(getNotificationTopicsForContext('GROUP')).toEqual(poolTopics);
  });

  it('validates persisted type strings through the catalog', () => {
    expect(isNotificationType(NOTIFICATION_TYPES.UPCOMING_BIRTHDAY)).toBe(true);
    expect(isNotificationType('SOMETHING_NEW')).toBe(false);
    expect(isNotificationType(null)).toBe(false);
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
