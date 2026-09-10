/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const exchangeFindUnique = vi.fn();
const participantFindMany = vi.fn();
const queueNotification = vi.fn();
const resolvePolicies = vi.fn();
const captureException = vi.fn();

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    exchange: {
      findUnique: (...args: Array<unknown>) => exchangeFindUnique(...args),
    },
    exchangeParticipant: {
      findMany: (...args: Array<unknown>) => participantFindMany(...args),
    },
  },
}));
vi.mock('#app/utils/notification-dispatcher.server.ts', () => ({
  queueNotification: (...args: Array<unknown>) => queueNotification(...args),
}));
vi.mock('#app/utils/notification-policy.server.ts', () => ({
  resolveNotificationPoliciesForUsers: (...args: Array<unknown>) =>
    resolvePolicies(...args),
}));
vi.mock('@sentry/react-router', () => ({
  captureException: (...args: Array<unknown>) => captureException(...args),
}));

import {
  queueExchangeCancelled,
  queueExchangeNamesDrawn,
  queueExchangeRevealed,
  queueExchangeStarted,
} from './exchange-notifications.server.ts';

const exchange = {
  id: 'x1',
  title: 'The Painted 2026',
  eventDate: new Date('2026-12-24T00:00:00Z'),
  giftGroupId: 'g1',
  organizerId: 'fd',
  organizer: { name: 'Francisco Di Giandomenico', username: 'fd' },
};

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  exchangeFindUnique.mockReset().mockResolvedValue(exchange);
  participantFindMany.mockReset();
  queueNotification.mockReset();
  captureException.mockReset();
  resolvePolicies
    .mockReset()
    .mockImplementation(
      async ({ userIds, type }: { userIds: string[]; type: string }) =>
        new Map(
          userIds.map((userId) => [userId, { userId, type, channels: {} }]),
        ),
    );
});

describe('exchange notification fan-out', () => {
  it('tells every live participant names are drawn, with a body that names nobody', async () => {
    participantFindMany.mockResolvedValue([
      { userId: 'fd' },
      { userId: 'np' },
      { userId: 'al' },
    ]);
    queueExchangeNamesDrawn('x1');
    await flush();
    await flush();
    expect(participantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { exchangeId: 'x1', status: 'IN' } }),
    );
    expect(resolvePolicies).toHaveBeenCalledTimes(1);
    expect(queueNotification).toHaveBeenCalledTimes(3);
    for (const [intent, options] of queueNotification.mock.calls) {
      expect(intent).toMatchObject({
        type: 'EXCHANGE_NAMES_DRAWN',
        payload: {
          exchangeId: 'x1',
          exchangeTitle: 'The Painted 2026',
          organizerUserId: 'fd',
          organizerDisplayName: 'Francisco Di Giandomenico',
        },
      });
      expect(intent.context).toBeUndefined();
      const keys = Object.keys(intent.payload);
      expect(keys.some((k) => /gift(ee|er)|assignment/i.test(k))).toBe(false);
      expect(options.policy.userId).toBe(intent.userId);
    }
  });

  it('produces the same reveal intent for manual and automatic reveals', async () => {
    participantFindMany.mockResolvedValue([{ userId: 'fd' }, { userId: 'np' }]);
    queueExchangeRevealed('x1', 'REVEALED');
    await flush();
    await flush();
    const first = queueNotification.mock.calls.map(([i]) => i);
    queueNotification.mockClear();
    queueExchangeRevealed('x1', 'REVEALED');
    await flush();
    await flush();
    const second = queueNotification.mock.calls.map(([i]) => i);
    expect(second).toEqual(first);
    expect(first[0]).toMatchObject({
      type: 'EXCHANGE_REVEALED',
      payload: { finalStatus: 'REVEALED' },
    });
  });

  it('scopes "exchange started" to the group and the members still deciding', async () => {
    participantFindMany.mockResolvedValue([{ userId: 'np' }, { userId: 'jl' }]);
    queueExchangeStarted('x1');
    await flush();
    await flush();
    // Snapshotted PENDING rows intersected with CURRENT group membership, so a
    // member who left the group is not told about its exchange.
    expect(participantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          exchangeId: 'x1',
          status: 'PENDING',
          // `removedAt: null` matters: membership is soft-removed, so
          // without it somebody who left the group still hears about its
          // exchange.
          user: {
            giftGroups: { some: { giftGroupId: 'g1', removedAt: null } },
          },
        },
      }),
    );
    expect(resolvePolicies).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'EXCHANGE_STARTED',
        context: { kind: 'GROUP', groupId: 'g1' },
      }),
    );
    expect(queueNotification).toHaveBeenCalledTimes(2);
  });

  it('does nothing for a standalone exchange start and never throws', async () => {
    exchangeFindUnique.mockResolvedValue({ ...exchange, giftGroupId: null });
    queueExchangeStarted('x1');
    await flush();
    await flush();
    expect(queueNotification).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('tells pending invitees too when an exchange is cancelled before the draw', async () => {
    participantFindMany
      .mockResolvedValueOnce([{ userId: 'fd' }])
      .mockResolvedValueOnce([{ userId: 'np' }, { userId: 'jl' }]);
    queueExchangeCancelled('x1', { includePending: true });
    await flush();
    await flush();
    expect(participantFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          exchangeId: 'x1',
          status: 'PENDING',
          // `removedAt: null` matters: membership is soft-removed, so
          // without it somebody who left the group still hears about its
          // exchange.
          user: {
            giftGroups: { some: { giftGroupId: 'g1', removedAt: null } },
          },
        },
      }),
    );
    expect(queueNotification.mock.calls.map(([i]) => i.userId).sort()).toEqual([
      'fd',
      'jl',
      'np',
    ]);
  });

  it('tells only live participants when a drawn exchange is cancelled', async () => {
    participantFindMany.mockResolvedValue([{ userId: 'fd' }, { userId: 'np' }]);
    queueExchangeCancelled('x1');
    await flush();
    await flush();
    expect(participantFindMany).toHaveBeenCalledTimes(1);
    expect(queueNotification.mock.calls.map(([i]) => i.userId)).toEqual([
      'fd',
      'np',
    ]);
  });

  it('reports a failed fan-out to Sentry instead of throwing', async () => {
    participantFindMany.mockRejectedValue(new Error('db down'));
    queueExchangeCancelled('x1');
    await flush();
    await flush();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(queueNotification).not.toHaveBeenCalled();
  });
});
