import { describe, expect, it } from 'vitest';
import {
  getNotificationEventDefinition,
  isNotificationType,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_CATALOG,
  NOTIFICATION_TOPICS,
  NOTIFICATION_TYPES,
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

  it('keeps email opt-in for new events except grandfathered friend defaults', () => {
    const grandfatheredEmailDefaults = new Set<string>([
      NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
    ]);

    for (const [type, definition] of Object.entries(
      NOTIFICATION_EVENT_CATALOG,
    )) {
      if (!grandfatheredEmailDefaults.has(type)) {
        expect(definition.defaults.emailEnabled).toBe(false);
      }
      expect(definition.defaults.pushEnabled).toBe(false);
      expect(definition.supportedChannels).toContain(
        NOTIFICATION_CHANNELS.IN_APP,
      );
    }
  });

  it('validates persisted type strings through the catalog', () => {
    expect(isNotificationType(NOTIFICATION_TYPES.UPCOMING_BIRTHDAY)).toBe(true);
    expect(isNotificationType('SOMETHING_NEW')).toBe(false);
    expect(isNotificationType(null)).toBe(false);
  });
});
