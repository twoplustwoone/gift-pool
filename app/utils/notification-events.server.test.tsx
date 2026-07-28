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
const queueLogEvent = vi.fn();

vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: (...args: Array<unknown>) => queueLogEvent(...args),
}));

vi.mock('#app/utils/notification-preference-token.server.ts', () => ({
  createPreferenceToken: (...args: Array<unknown>) =>
    createPreferenceToken(...args),
  getPreferenceManagementUrl: (token: string) =>
    `https://giftpool.example/settings/profile/notifications?token=${token}`,
}));

import {
  getNotificationOccurrenceKey,
  recordNotificationDelivery,
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
  {
    intent: {
      ...base,
      type: NOTIFICATION_TYPES.POOL_CONTRIBUTION_REMINDER,
      payload: {
        nudgeId: 'nudge-1',
        poolId: 'pool-1',
        poolTitle: 'Taylor birthday',
        senderUserId: 'manager-1',
        senderDisplayName: 'Wade Wilson',
      },
    },
    messageKey: 'notifications.poolContributionReminder.message',
    message:
      'Wade Wilson reminded you to set your contribution in Taylor birthday',
    pushTitle: 'Contribution reminder',
  },
  {
    intent: {
      ...base,
      type: NOTIFICATION_TYPES.POOL_VOTE_REMINDER,
      payload: {
        nudgeId: 'nudge-1',
        poolId: 'pool-1',
        poolTitle: 'Taylor birthday',
        senderUserId: 'manager-1',
        senderDisplayName: 'Wade Wilson',
      },
    },
    messageKey: 'notifications.poolVoteReminder.message',
    message: 'Wade Wilson reminded you to vote in Taylor birthday',
    pushTitle: 'Voting reminder',
  },
  {
    intent: {
      ...base,
      type: NOTIFICATION_TYPES.POOL_PURCHASE_REMINDER,
      payload: {
        nudgeId: 'nudge-1',
        poolId: 'pool-1',
        poolTitle: 'Taylor birthday',
        senderUserId: 'manager-1',
        senderDisplayName: 'Wade Wilson',
      },
    },
    messageKey: 'notifications.poolPurchaseReminder.message',
    message: 'Wade Wilson reminded you to buy the gift for Taylor birthday',
    pushTitle: 'Purchase reminder',
  },
  {
    intent: {
      ...base,
      type: NOTIFICATION_TYPES.POOL_DELIVERY_REMINDER,
      payload: {
        nudgeId: 'nudge-1',
        poolId: 'pool-1',
        poolTitle: 'Taylor birthday',
        senderUserId: 'manager-1',
        senderDisplayName: 'Wade Wilson',
      },
    },
    messageKey: 'notifications.poolDeliveryReminder.message',
    message: 'Wade Wilson reminded you to deliver the gift for Taylor birthday',
    pushTitle: 'Delivery reminder',
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
    queueLogEvent.mockReset();
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
        metadata: JSON.stringify({
          poolId: 'pool-1',
          ...('nudgeId' in intent.payload
            ? { organizerNudgeId: intent.payload.nudgeId }
            : {}),
        }),
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

  it('records actual organizer-reminder delivery without recipient-list analytics', () => {
    const intent = poolCases[6].intent;
    recordNotificationDelivery(intent, [NOTIFICATION_CHANNELS.IN_APP]);

    expect(queueLogEvent).toHaveBeenCalledWith({
      name: 'organizer_reminder_sent',
      source: 'server',
      userId: intent.userId,
      properties: {
        notificationType: NOTIFICATION_TYPES.POOL_VOTE_REMINDER,
        poolId: 'pool-1',
        organizerNudgeId: 'nudge-1',
        channels: [NOTIFICATION_CHANNELS.IN_APP],
      },
    });
  });
});

describe('wishlist claim conflict notification rendering', () => {
  const conflictIntent: NotificationIntent<'WISHLIST_CLAIM_CONFLICT'> = {
    userId: 'claimer-1',
    type: NOTIFICATION_TYPES.WISHLIST_CLAIM_CONFLICT,
    sourceIdentifier: 'claim-conflict:pool-1:wish-9',
    payload: {
      wishlistItemId: 'wish-9',
      itemTitle: 'Noise-cancelling headphones',
      recipientName: 'Taylor',
      recipientUsername: 'taylor',
      poolId: 'pool-1',
      poolTitle: 'Taylor birthday',
    },
  };

  beforeEach(() => {
    createPreferenceToken.mockResolvedValue('preference-token');
  });

  it('renders the bell notification with Keep/Release actions and no pool identity', async () => {
    const inApp = await renderNotificationChannel(
      conflictIntent,
      NOTIFICATION_CHANNELS.IN_APP,
    );

    expect(inApp).toMatchObject({
      messageKey: 'notifications.wishlistClaimConflict.message',
      messageParams: JSON.stringify({
        item: 'Noise-cancelling headphones',
        recipient: 'Taylor',
      }),
      targetUrl: '/users/taylor/wishlist',
      metadata: JSON.stringify({ wishlistItemId: 'wish-9' }),
      actions: JSON.stringify([
        {
          kind: 'WISHLIST_CLAIM_KEEP',
          labelKey: 'notifications.wishlistClaimConflict.keep',
        },
        {
          kind: 'WISHLIST_CLAIM_RELEASE',
          labelKey: 'notifications.wishlistClaimConflict.release',
        },
      ]),
    });
    // Never leaks the pool or group identity to the claim holder.
    expect(JSON.stringify(inApp)).not.toContain('pool-1');
    expect(JSON.stringify(inApp)).not.toContain('Taylor birthday');
  });

  it('renders web push pointing at the wishlist, not the pool', async () => {
    const push = await renderNotificationChannel(
      conflictIntent,
      NOTIFICATION_CHANNELS.WEB_PUSH,
    );

    expect(push).toEqual({
      title: 'Still getting this?',
      body: 'A group has also decided to get Noise-cancelling headphones for Taylor. Are you still getting it yourself?',
      url: '/users/taylor/wishlist',
      tag: 'claim-conflict:pool-1:wish-9',
    });
  });

  it('renders the opt-in email without naming the pool', async () => {
    const message = await renderNotificationChannel(
      conflictIntent,
      NOTIFICATION_CHANNELS.EMAIL,
    );
    const markup = renderToStaticMarkup(message.react);

    expect(message.subject).toBe(
      'Still getting Noise-cancelling headphones for Taylor?',
    );
    expect(markup).toContain('Open wishlist');
    expect(markup).toContain('https://giftpool.example/users/taylor/wishlist');
    expect(markup).toContain('Manage notification preferences');
    expect(markup).not.toContain('Taylor birthday');
    expect(markup).not.toContain('pool-1');
  });

  it('uses the caller-supplied sourceIdentifier instead of deriving one', () => {
    expect(getNotificationOccurrenceKey(conflictIntent)).toBe(
      'claim-conflict:pool-1:wish-9',
    );
  });
});
