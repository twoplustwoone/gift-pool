/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_TYPES } from '#app/utils/notification-catalog.ts';

const captureException = vi.fn();
const poolFindUnique = vi.fn();
const queueNotification = vi.fn();

vi.mock('@sentry/react-router', () => ({
  captureException: (...args: Array<unknown>) => captureException(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    pool: {
      findUnique: (...args: Array<unknown>) => poolFindUnique(...args),
    },
  },
}));

vi.mock('#app/utils/notification-dispatcher.server.ts', () => ({
  queueNotification: (...args: Array<unknown>) => queueNotification(...args),
}));

// The fan-out resolves one policy for the whole audience and hands each
// recipient's in, so the real resolver would need a fully stubbed preference
// schema here. Stub the seam instead and assert the wiring: resolved once for
// everyone, then indexed correctly per recipient.
vi.mock('#app/utils/notification-policy.server.ts', () => ({
  resolveNotificationPoliciesForUsers: (args: {
    userIds: string[];
    type: string;
    context?: unknown;
  }) => resolvePolicies(args),
}));

const resolvePolicies = vi.fn(
  ({ userIds, type }: { userIds: string[]; type: string }) =>
    Promise.resolve(
      new Map(
        userIds.map((userId) => [userId, { userId, type, channels: {} }]),
      ),
    ),
);

const policyFor = (userId: string, type: string) => ({
  policy: { userId, type, channels: {} },
});

import { queuePoolActivityNotifications } from './pool-notifications.server.ts';

const pool = {
  id: 'pool-1',
  title: 'Taylor birthday',
  recipientUserId: 'recipient-1',
  purchaserId: 'purchaser-1',
  delivererId: 'deliverer-1',
  chosenIdea: { name: 'Record player' },
  contributors: [
    { userId: 'actor-1' },
    { userId: 'recipient-1' },
    { userId: 'member-1' },
    { userId: 'purchaser-1' },
    { userId: 'deliverer-1' },
  ],
};

beforeEach(() => {
  captureException.mockReset();
  poolFindUnique.mockReset().mockResolvedValue(pool);
  queueNotification.mockReset();
  resolvePolicies.mockClear();
});

describe('pool activity notification fanout', () => {
  it('broadcasts to current contributors except the actor and concealed recipient', async () => {
    queuePoolActivityNotifications({
      type: NOTIFICATION_TYPES.POOL_GIFT_CHOSEN,
      poolId: pool.id,
      actorUserId: 'actor-1',
      occurrenceId: 'event-1',
    });

    await vi.waitFor(() => expect(queueNotification).toHaveBeenCalledTimes(3));
    expect(
      queueNotification.mock.calls.map(([intent]) => intent.userId),
    ).toEqual(['member-1', 'purchaser-1', 'deliverer-1']);
    expect(queueNotification).toHaveBeenCalledWith(
      {
        userId: 'member-1',
        type: NOTIFICATION_TYPES.POOL_GIFT_CHOSEN,
        context: { kind: 'POOL', poolId: pool.id },
        sourceIdentifier: `pool-activity:${NOTIFICATION_TYPES.POOL_GIFT_CHOSEN}:event-1`,
        payload: {
          poolId: pool.id,
          poolTitle: pool.title,
          actorUserId: 'actor-1',
          chosenIdeaName: 'Record player',
        },
      },
      policyFor('member-1', NOTIFICATION_TYPES.POOL_GIFT_CHOSEN),
    );

    // Resolved once for the audience, not once per recipient — this is the
    // wiring that GIFTPOOL-UI-1P/-1Q came down to.
    expect(resolvePolicies).toHaveBeenCalledTimes(1);
    expect(resolvePolicies).toHaveBeenCalledWith({
      userIds: ['member-1', 'purchaser-1', 'deliverer-1'],
      type: NOTIFICATION_TYPES.POOL_GIFT_CHOSEN,
      context: { kind: 'POOL', poolId: pool.id },
    });
    // ...and each recipient got their own entry, not a neighbour's.
    for (const [intent, options] of queueNotification.mock.calls) {
      expect(options.policy.userId).toBe(intent.userId);
    }
  });

  it('targets a current assignment only when the assignee is still a contributor', async () => {
    queuePoolActivityNotifications({
      type: NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED,
      poolId: pool.id,
      actorUserId: 'actor-1',
      assigneeUserId: 'purchaser-1',
      occurrenceId: 'event-2',
    });

    await vi.waitFor(() => expect(queueNotification).toHaveBeenCalledTimes(1));
    expect(queueNotification).toHaveBeenCalledWith(
      {
        userId: 'purchaser-1',
        type: NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED,
        context: { kind: 'POOL', poolId: pool.id },
        sourceIdentifier: `pool-activity:${NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED}:event-2`,
        payload: {
          poolId: pool.id,
          poolTitle: pool.title,
          actorUserId: 'actor-1',
        },
      },
      policyFor('purchaser-1', NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED),
    );
  });

  it('targets the current deliverer through the same assignment boundary', async () => {
    queuePoolActivityNotifications({
      type: NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED,
      poolId: pool.id,
      actorUserId: 'actor-1',
      assigneeUserId: 'deliverer-1',
      occurrenceId: 'event-deliverer',
    });

    await vi.waitFor(() => expect(queueNotification).toHaveBeenCalledTimes(1));
    expect(queueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'deliverer-1',
        type: NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED,
      }),
      policyFor('deliverer-1', NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED),
    );
  });

  it('drops stale, self, recipient, and non-contributor assignments', async () => {
    const events = [
      {
        assigneeUserId: 'former-purchaser',
        actorUserId: 'actor-1',
        currentAssigneeUserId: 'purchaser-1',
      },
      {
        assigneeUserId: 'purchaser-1',
        actorUserId: 'purchaser-1',
        currentAssigneeUserId: 'purchaser-1',
      },
      {
        assigneeUserId: 'recipient-1',
        actorUserId: 'actor-1',
        currentAssigneeUserId: 'recipient-1',
      },
      {
        assigneeUserId: 'outsider-1',
        actorUserId: 'actor-1',
        currentAssigneeUserId: 'outsider-1',
      },
    ];

    for (const [index, event] of events.entries()) {
      poolFindUnique.mockResolvedValueOnce({
        ...pool,
        purchaserId: event.currentAssigneeUserId,
      });
      queuePoolActivityNotifications({
        type: NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED,
        poolId: pool.id,
        occurrenceId: `event-${index + 3}`,
        actorUserId: event.actorUserId,
        assigneeUserId: event.assigneeUserId,
      });
    }

    await vi.waitFor(() => expect(poolFindUnique).toHaveBeenCalledTimes(4));
    expect(queueNotification).not.toHaveBeenCalled();
  });

  it('does nothing when the pool disappeared before fanout', async () => {
    poolFindUnique.mockResolvedValue(null);

    queuePoolActivityNotifications({
      type: NOTIFICATION_TYPES.POOL_CANCELLED,
      poolId: pool.id,
      actorUserId: 'actor-1',
      occurrenceId: 'event-7',
    });

    await vi.waitFor(() => expect(poolFindUnique).toHaveBeenCalledTimes(1));
    expect(queueNotification).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('reports an inconsistent chosen-gift snapshot instead of sending partial copy', async () => {
    poolFindUnique.mockResolvedValue({ ...pool, chosenIdea: null });

    queuePoolActivityNotifications({
      type: NOTIFICATION_TYPES.POOL_GIFT_CHOSEN,
      poolId: pool.id,
      actorUserId: 'actor-1',
      occurrenceId: 'event-missing-idea',
    });

    await vi.waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    expect(queueNotification).not.toHaveBeenCalled();
  });

  it('reports background setup failures without rejecting the mutation path', async () => {
    const error = new Error('database unavailable');
    poolFindUnique.mockRejectedValue(error);

    expect(() =>
      queuePoolActivityNotifications({
        type: NOTIFICATION_TYPES.POOL_VOTE_STARTED,
        poolId: pool.id,
        actorUserId: 'actor-1',
        occurrenceId: 'event-8',
      }),
    ).not.toThrow();

    await vi.waitFor(() =>
      expect(captureException).toHaveBeenCalledWith(error),
    );
  });
});
