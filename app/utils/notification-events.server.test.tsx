/**
 * @vitest-environment node
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  type NotificationIntent,
} from '#app/utils/notification-catalog.ts';

vi.mock('#app/utils/app-url.server.ts', () => ({
  buildAppUrl: (path: string) => `https://giftpool.example${path}`,
}));

const createPreferenceToken = vi.fn();

vi.mock('#app/utils/notification-preference-token.server.ts', () => ({
  createPreferenceToken: (...args: Array<unknown>) =>
    createPreferenceToken(...args),
  getPreferenceManagementUrl: (token: string) =>
    `https://giftpool.example/settings/profile/notifications?token=${token}`,
}));

import {
  getNotificationOccurrenceKey,
  renderNotificationChannel,
} from './notification-events.server.tsx';

const base = {
  userId: 'member-1',
  context: { kind: 'POOL' as const, poolId: 'pool-1' },
  sourceIdentifier: 'pool-event-1',
};

const poolCases = [
  {
    intent: {
      ...base,
      type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
      payload: {
        poolId: 'pool-1',
        poolTitle: 'Taylor birthday',
        actorUserId: 'actor-1',
      },
    },
    messageKey: 'notifications.poolVoteStarted.message',
    message: 'Voting has started in Taylor birthday',
    pushTitle: 'Voting started',
  },
  {
    intent: {
      ...base,
      type: NOTIFICATION_TYPES.POOL_GIFT_CHOSEN,
      payload: {
        poolId: 'pool-1',
        poolTitle: 'Taylor birthday',
        actorUserId: 'actor-1',
        chosenIdeaName: 'Record player',
      },
    },
    messageKey: 'notifications.poolGiftChosen.message',
    message: 'Record player was chosen for Taylor birthday',
    pushTitle: 'Gift chosen',
  },
  {
    intent: {
      ...base,
      type: NOTIFICATION_TYPES.POOL_CANCELLED,
      payload: {
        poolId: 'pool-1',
        poolTitle: 'Taylor birthday',
        actorUserId: 'actor-1',
      },
    },
    messageKey: 'notifications.poolCancelled.message',
    message: 'Taylor birthday was cancelled',
    pushTitle: 'Pool cancelled',
  },
  {
    intent: {
      ...base,
      type: NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED,
      payload: {
        poolId: 'pool-1',
        poolTitle: 'Taylor birthday',
        actorUserId: 'actor-1',
      },
    },
    messageKey: 'notifications.poolPurchaserAssigned.message',
    message: "You're the purchaser for Taylor birthday",
    pushTitle: 'Purchase assignment',
  },
  {
    intent: {
      ...base,
      type: NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED,
      payload: {
        poolId: 'pool-1',
        poolTitle: 'Taylor birthday',
        actorUserId: 'actor-1',
      },
    },
    messageKey: 'notifications.poolDelivererAssigned.message',
    message: "You're delivering the gift for Taylor birthday",
    pushTitle: 'Delivery assignment',
  },
] as const satisfies ReadonlyArray<{
  intent: NotificationIntent;
  messageKey: string;
  message: string;
  pushTitle: string;
}>;

describe('pool activity notification rendering', () => {
  beforeEach(() => {
    createPreferenceToken.mockResolvedValue('preference-token');
  });

  it('renders every pool event for the bell and web push', async () => {
    for (const { intent, messageKey, message, pushTitle } of poolCases) {
      const inApp = await renderNotificationChannel(
        intent,
        NOTIFICATION_CHANNELS.IN_APP,
      );
      expect(inApp).toMatchObject({
        messageKey,
        targetUrl: '/pools/pool-1',
        metadata: JSON.stringify({ poolId: 'pool-1' }),
      });

      const push = await renderNotificationChannel(
        intent,
        NOTIFICATION_CHANNELS.WEB_PUSH,
      );
      expect(push).toEqual({
        title: pushTitle,
        body: message,
        url: '/pools/pool-1',
        tag: 'pool-event-1',
      });
    }
  });

  it('renders the opt-in email with its pool and preference links', async () => {
    const message = await renderNotificationChannel(
      poolCases[1].intent,
      NOTIFICATION_CHANNELS.EMAIL,
    );
    const markup = renderToStaticMarkup(message.react);

    expect(message.subject).toBe(
      'Record player was chosen for Taylor birthday on GiftPool',
    );
    expect(markup).toContain('Open pool');
    expect(markup).toContain('https://giftpool.example/pools/pool-1');
    expect(markup).toContain('Manage notification preferences');
    expect(markup).toContain('preference-token');
  });

  it('requires callers to provide a stable pool occurrence identifier', () => {
    const { sourceIdentifier: _sourceIdentifier, ...withoutSource } =
      poolCases[0].intent;

    expect(() => getNotificationOccurrenceKey(withoutSource)).toThrow(
      'POOL_VOTE_STARTED requires a sourceIdentifier',
    );
  });
});
