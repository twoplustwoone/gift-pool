/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolFindMany = vi.fn();
const ideaVoteFindMany = vi.fn();

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    pool: {
      findMany: (...args: Array<unknown>) => poolFindMany(...args),
    },
    ideaVote: {
      findMany: (...args: Array<unknown>) => ideaVoteFindMany(...args),
    },
  },
}));

import {
  getForYouActions,
  getRecentGiftMemory,
} from './home-for-you.server.ts';

const viewer = 'viewer-1';

function pool(overrides: Record<string, unknown>) {
  return {
    id: 'pool-x',
    title: 'A pool',
    status: 'OPEN',
    decisionMode: 'ORGANIZER_PICKS',
    purchaserId: null,
    delivererId: null,
    contributors: [{ hasPaid: false }],
    ...overrides,
  };
}

// eslint-disable-next-line epic-web/prefer-dispose-in-tests -- mock defaults must live in beforeEach: restoreMocks strips vi.fn factory implementations (see project test gotchas)
beforeEach(() => {
  // restoreMocks strips factory defaults — set them here.
  poolFindMany.mockResolvedValue([]);
  ideaVoteFindMany.mockResolvedValue([]);
});

describe('getForYouActions', () => {
  it('surfaces buy/deliver/vote/settle responsibilities from pools', async () => {
    poolFindMany
      .mockResolvedValueOnce([
        pool({
          id: 'p-buy',
          title: 'Buy me',
          status: 'DECIDED',
          purchaserId: viewer,
        }),
        pool({
          id: 'p-deliver',
          title: 'Deliver me',
          status: 'PURCHASED',
          delivererId: viewer,
          purchaserId: 'someone-else',
          contributors: [{ hasPaid: true }],
        }),
        pool({
          id: 'p-vote',
          title: 'Vote me',
          status: 'VOTING',
          decisionMode: 'VOTE',
        }),
      ])
      // planned-recipient lookup (no occasions → not called, but safe)
      .mockResolvedValue([]);

    const actions = await getForYouActions(viewer, []);

    expect(actions.map((a) => a.kind)).toEqual(['buy', 'deliver', 'vote']);
    expect(actions[0]).toMatchObject({
      href: '/pools/p-buy',
      title: 'Buy the gift',
      detail: 'Buy me',
    });
  });

  it('skips votes already cast and organizer-picks voting pools', async () => {
    poolFindMany
      .mockResolvedValueOnce([
        pool({
          id: 'p-voted',
          status: 'VOTING',
          decisionMode: 'VOTE',
        }),
        pool({
          id: 'p-organizer',
          status: 'VOTING',
          decisionMode: 'ORGANIZER_PICKS',
        }),
      ])
      .mockResolvedValue([]);
    ideaVoteFindMany.mockResolvedValue([{ poolId: 'p-voted' }]);

    const actions = await getForYouActions(viewer, []);

    expect(actions).toEqual([]);
    // Only VOTE-mode pools are checked for the viewer's votes.
    expect(ideaVoteFindMany).toHaveBeenCalledWith({
      where: { voterId: viewer, poolId: { in: ['p-voted'] } },
      select: { poolId: true },
    });
  });

  it('settle appears only for unpaid non-purchasers of purchased pools', async () => {
    poolFindMany
      .mockResolvedValueOnce([
        pool({
          id: 'p-settle',
          title: 'Settle me',
          status: 'PURCHASED',
          purchaserId: 'someone-else',
          contributors: [{ hasPaid: false }],
        }),
        pool({
          id: 'p-paid',
          status: 'PURCHASED',
          purchaserId: 'someone-else',
          contributors: [{ hasPaid: true }],
        }),
      ])
      .mockResolvedValue([]);

    const actions = await getForYouActions(viewer, []);

    expect(actions).toEqual([
      expect.objectContaining({ kind: 'settle', href: '/pools/p-settle' }),
    ]);
  });

  it('plans occasions without an existing pool and caps the list at three', async () => {
    poolFindMany
      .mockResolvedValueOnce([
        pool({
          id: 'p-buy',
          status: 'DECIDED',
          purchaserId: viewer,
        }),
        pool({
          id: 'p-vote',
          status: 'VOTING',
          decisionMode: 'VOTE',
        }),
        pool({
          id: 'p-settle',
          status: 'PURCHASED',
          purchaserId: 'someone-else',
          contributors: [{ hasPaid: false }],
        }),
      ])
      // planned recipients: alex already has a pool
      .mockResolvedValueOnce([{ recipientUserId: 'u-alex' }]);

    const actions = await getForYouActions(viewer, [
      { id: 'u-alex', name: 'Alex', username: 'alex', dateLabel: 'Apr 5' },
      { id: 'u-bea', name: 'Bea', username: 'bea', dateLabel: 'Apr 9' },
    ]);

    // Capped at 3, responsibility first; the plan action for Alex is
    // suppressed (pool exists) and Bea's would be rank 4 anyway.
    expect(actions).toHaveLength(3);
    expect(actions.map((a) => a.kind)).toEqual(['buy', 'vote', 'settle']);
  });

  it('plan actions link to the person page', async () => {
    poolFindMany.mockResolvedValue([]);

    const actions = await getForYouActions(viewer, [
      { id: 'u-bea', name: 'Bea', username: 'bea', dateLabel: 'Apr 9' },
      // No username → no person page → skipped rather than a dead link.
      { id: 'u-x', name: 'X', username: null, dateLabel: 'Apr 10' },
    ]);

    expect(actions).toEqual([
      expect.objectContaining({
        kind: 'plan',
        title: 'Plan a gift for Bea',
        detail: 'Birthday · Apr 9',
        href: '/users/bea',
      }),
    ]);
  });
});

describe('getRecentGiftMemory', () => {
  it('maps delivered pools to factual memory entries', async () => {
    poolFindMany.mockResolvedValue([
      {
        id: 'p-1',
        title: 'Marco 30th',
        updatedAt: new Date('2026-07-01T00:00:00Z'),
        recipientName: null,
        recipientUser: { name: 'Marco', username: 'marco' },
        chosenIdea: { name: 'Vintage camera' },
        _count: { contributors: 5 },
      },
      {
        id: 'p-2',
        title: 'Leo farewell',
        updatedAt: new Date('2026-06-01T00:00:00Z'),
        recipientName: 'Leo',
        recipientUser: null,
        chosenIdea: null,
        _count: { contributors: 1 },
      },
    ]);

    const memory = await getRecentGiftMemory(viewer);

    expect(memory).toEqual([
      {
        id: 'p-1',
        recipientLabel: 'Marco',
        giftLabel: 'Vintage camera',
        contributorCount: 5,
        whenISO: '2026-07-01T00:00:00.000Z',
      },
      {
        id: 'p-2',
        recipientLabel: 'Leo',
        giftLabel: 'Leo farewell',
        contributorCount: 1,
        whenISO: '2026-06-01T00:00:00.000Z',
      },
    ]);
    expect(poolFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'DELIVERED' }),
        take: 3,
      }),
    );
  });
});
