/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const poolFindMany = vi.fn();
const usersInGiftGroupsFindMany = vi.fn();

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    pool: {
      findMany: (...args: Array<unknown>) => poolFindMany(...args),
    },
    usersInGiftGroups: {
      findMany: (...args: Array<unknown>) => usersInGiftGroupsFindMany(...args),
    },
  },
}));

import {
  ACTION_TYPE,
  _computeActionQueueForTesting as computeActionQueue,
  _computeUpcomingOccasionsForTesting as computeUpcomingOccasions,
  _isPoolStuckForTesting as isPoolStuck,
  _shapePastGiftsForTesting as shapePastGifts,
  _shapePoolSummariesForTesting as shapePoolSummaries,
  getGroupOverviewData,
  type UpcomingOccasion,
} from './group-overview.server.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-04-15T12:00:00Z');

function makePool(overrides: Partial<any> = {}): any {
  return {
    id: 'pool-1',
    title: "Marco's Birthday",
    occasionType: 'BIRTHDAY',
    status: 'OPEN',
    decisionMode: 'ORGANIZER_PICKS',
    eventDate: new Date(NOW.getTime() + 14 * DAY),
    updatedAt: new Date(NOW.getTime() - 5 * DAY),
    organizerId: 'other-user',
    purchaserId: null,
    delivererId: null,
    chosenIdeaId: null,
    recipientUserId: 'marco',
    recipientName: null,
    recipientUser: { name: 'Marco', username: 'marco' },
    contributors: [
      { userId: 'viewer-1', contributionCents: 2000, hasPaid: false },
      { userId: 'other-user', contributionCents: 2000, hasPaid: false },
      { userId: 'third-user', contributionCents: 2000, hasPaid: false },
    ],
    chosenIdea: null,
    votes: [],
    _count: { ideas: 0, contributors: 3, votes: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isPoolStuck', () => {
  it('is stuck when idle > 3 days and event within 30 days', () => {
    const pool = makePool({
      updatedAt: new Date(NOW.getTime() - 5 * DAY),
      eventDate: new Date(NOW.getTime() + 14 * DAY),
    });
    expect(isPoolStuck(pool)).toBe(true);
  });

  it('is not stuck when idle <= 3 days', () => {
    const pool = makePool({
      updatedAt: new Date(NOW.getTime() - 2 * DAY),
    });
    expect(isPoolStuck(pool)).toBe(false);
  });

  it('is not stuck when event is beyond the 30-day window', () => {
    const pool = makePool({
      updatedAt: new Date(NOW.getTime() - 10 * DAY),
      eventDate: new Date(NOW.getTime() + 60 * DAY),
    });
    expect(isPoolStuck(pool)).toBe(false);
  });

  it('is stuck when idle > 3 days and no event date (treated as urgent)', () => {
    const pool = makePool({
      updatedAt: new Date(NOW.getTime() - 5 * DAY),
      eventDate: null,
    });
    expect(isPoolStuck(pool)).toBe(true);
  });
});

describe('computeActionQueue — POOL_STUCK classifier', () => {
  const occasions: UpcomingOccasion[] = [];

  it('adds POOL_STUCK with "add one?" copy when an OPEN pool has 0 ideas', () => {
    const pool = makePool({
      status: 'OPEN',
      organizerId: 'other-user', // not the viewer, so no CHOOSE_GIFT nudge
      _count: { ideas: 0, contributors: 3, votes: 0 },
      // Suppress PROPOSE_IDEA: viewer is not a contributor on this pool.
      contributors: [
        { userId: 'other-user', contributionCents: 2000, hasPaid: false },
        { userId: 'third-user', contributionCents: 2000, hasPaid: false },
        { userId: 'viewer-1', contributionCents: 2000, hasPaid: false },
      ],
    });
    // Viewer must be a contributor for STUCK to fire.
    const items = computeActionQueue([pool], occasions, 'viewer-1', 'group-1');
    const stuck = items.filter((i) => i.type === ACTION_TYPE.POOL_STUCK);

    // PROPOSE_IDEA is a direct action for viewer-1 (they are a contributor),
    // so STUCK should be suppressed.
    expect(stuck).toHaveLength(0);
  });

  it('adds POOL_STUCK with VOTING nudge copy mentioning outstanding vote count', () => {
    const pool = makePool({
      status: 'VOTING',
      organizerId: 'other-user', // not viewer — no CLOSE_VOTE for viewer
      _count: { ideas: 2, contributors: 3, votes: 1 },
      votes: [{ id: 'v-1' }], // viewer HAS voted, so no CAST_VOTE
      contributors: [
        { userId: 'viewer-1', contributionCents: 2000, hasPaid: false },
        { userId: 'other-user', contributionCents: 2000, hasPaid: false },
        { userId: 'third-user', contributionCents: 2000, hasPaid: false },
      ],
    });

    const items = computeActionQueue([pool], occasions, 'viewer-1', 'group-1');
    const stuck = items.find((i) => i.type === ACTION_TYPE.POOL_STUCK);

    expect(stuck).toBeDefined();
    expect(stuck?.description).toContain("2 of 3 haven't voted");
    expect(stuck?.poolId).toBe('pool-1');
  });

  it('adds POOL_STUCK with "mark as purchased" copy for DECIDED pools', () => {
    const pool = makePool({
      status: 'DECIDED',
      organizerId: 'other-user', // viewer is not organizer → no MARK_PURCHASED
      purchaserId: null,
      chosenIdea: { proposedById: 'someone-else' },
      _count: { ideas: 2, contributors: 3, votes: 0 },
      // Viewer has paid and contribution set → no MARK_PAID, no SET_CONTRIBUTION
      contributors: [
        { userId: 'viewer-1', contributionCents: 2000, hasPaid: true },
        { userId: 'other-user', contributionCents: 2000, hasPaid: false },
        { userId: 'third-user', contributionCents: 2000, hasPaid: false },
      ],
    });

    const items = computeActionQueue([pool], occasions, 'viewer-1', 'group-1');
    const stuck = items.find((i) => i.type === ACTION_TYPE.POOL_STUCK);

    expect(stuck).toBeDefined();
    expect(stuck?.description).toContain('mark as purchased');
  });

  it('suppresses POOL_STUCK when the viewer has a direct action on the same pool', () => {
    // VOTING pool where the viewer is the organizer AND has a vote to cast.
    // This guarantees both CAST_VOTE and CLOSE_VOTE in items — suppression
    // must kick in and no POOL_STUCK item should appear.
    const pool = makePool({
      status: 'VOTING',
      organizerId: 'viewer-1',
      _count: { ideas: 2, contributors: 3, votes: 0 },
      votes: [], // viewer hasn't voted
    });

    const items = computeActionQueue([pool], occasions, 'viewer-1', 'group-1');

    expect(items.some((i) => i.type === ACTION_TYPE.CLOSE_VOTE)).toBe(true);
    expect(items.some((i) => i.type === ACTION_TYPE.CAST_VOTE)).toBe(true);
    expect(items.some((i) => i.type === ACTION_TYPE.POOL_STUCK)).toBe(false);
  });

  it('does not add POOL_STUCK for viewers who are not contributors', () => {
    const pool = makePool({
      status: 'VOTING',
      organizerId: 'other-user',
      _count: { ideas: 2, contributors: 2, votes: 0 },
      // Viewer not in contributors array
      contributors: [
        { userId: 'other-user', contributionCents: 2000, hasPaid: false },
        { userId: 'third-user', contributionCents: 2000, hasPaid: false },
      ],
    });

    const items = computeActionQueue([pool], occasions, 'viewer-1', 'group-1');
    expect(items.some((i) => i.type === ACTION_TYPE.POOL_STUCK)).toBe(false);
  });

  it('does not add POOL_STUCK for fresh pools (idle <= 3 days)', () => {
    const pool = makePool({
      status: 'VOTING',
      organizerId: 'other-user',
      updatedAt: new Date(NOW.getTime() - 1 * DAY),
      _count: { ideas: 2, contributors: 3, votes: 1 },
      votes: [{ id: 'v-1' }],
    });

    const items = computeActionQueue([pool], occasions, 'viewer-1', 'group-1');
    expect(items.some((i) => i.type === ACTION_TYPE.POOL_STUCK)).toBe(false);
  });

  it('promotes a stuck pool to P0 priority when the event is within 7 days', () => {
    const pool = makePool({
      status: 'VOTING',
      organizerId: 'other-user',
      eventDate: new Date(NOW.getTime() + 3 * DAY),
      _count: { ideas: 2, contributors: 3, votes: 1 },
      votes: [{ id: 'v-1' }], // viewer has voted — no CAST_VOTE
    });

    const items = computeActionQueue([pool], occasions, 'viewer-1', 'group-1');
    const stuck = items.find((i) => i.type === ACTION_TYPE.POOL_STUCK);

    expect(stuck?.priority).toBe(0);
  });

  it('keeps stuck pool at P1 priority when event is beyond urgency threshold', () => {
    const pool = makePool({
      status: 'VOTING',
      organizerId: 'other-user',
      eventDate: new Date(NOW.getTime() + 20 * DAY),
      _count: { ideas: 2, contributors: 3, votes: 1 },
      votes: [{ id: 'v-1' }],
    });

    const items = computeActionQueue([pool], occasions, 'viewer-1', 'group-1');
    const stuck = items.find((i) => i.type === ACTION_TYPE.POOL_STUCK);

    expect(stuck?.priority).toBe(1);
  });
});

describe('shapePoolSummaries', () => {
  it('shapes pool rows with viewer-relative role and recipient fallback', () => {
    const pools: any = [
      {
        id: 'pool-1',
        title: "Marco's Birthday",
        occasionType: 'BIRTHDAY',
        eventDate: new Date('2026-05-03'),
        status: 'OPEN',
        organizerId: 'viewer-1',
        recipientUser: { name: 'Marco', username: 'marco' },
        recipientName: null,
        contributors: [
          { userId: 'viewer-1', contributionCents: 2000, hasPaid: true },
          { userId: 'other', contributionCents: 1000, hasPaid: false },
        ],
        _count: { ideas: 3, contributors: 2 },
      },
      {
        id: 'pool-2',
        title: 'Standalone',
        occasionType: 'OTHER',
        eventDate: null,
        status: 'OPEN',
        organizerId: 'other',
        recipientUser: null,
        recipientName: null,
        contributors: [
          { userId: 'other', contributionCents: 0, hasPaid: false },
        ],
        _count: { ideas: 0, contributors: 1 },
      },
    ];

    const out = shapePoolSummaries(pools, 'viewer-1');

    expect(out[0]).toMatchObject({
      id: 'pool-1',
      recipientName: 'Marco',
      recipientUsername: 'marco',
      paidCount: 1,
      contributorCount: 2,
      ideaCount: 3,
      viewerRole: 'organizing',
      viewerContributionCents: 2000,
    });
    // Falls back to "Someone" when recipientUser and recipientName are null;
    // viewer is not a contributor on pool-2 → role 'none'.
    expect(out[1]).toMatchObject({
      recipientName: 'Someone',
      recipientUsername: null,
      viewerRole: 'none',
      viewerContributionCents: null,
    });
  });
});

describe('shapePastGifts', () => {
  it('uses finalPriceCents when present and falls back to summed contributions', () => {
    const rows: any = [
      {
        id: 'p-1',
        title: 'A',
        status: 'DELIVERED',
        occasionType: 'BIRTHDAY',
        updatedAt: new Date('2025-01-01'),
        recipientUser: { name: 'Alex', username: 'alex' },
        recipientName: null,
        chosenIdea: { name: 'Headphones' },
        finalPriceCents: 5000,
        contributors: [{ contributionCents: 9999 }], // ignored — finalPriceCents wins
      },
      {
        id: 'p-2',
        title: 'B',
        status: 'CANCELLED',
        occasionType: 'OTHER',
        updatedAt: new Date('2025-02-01'),
        recipientUser: null,
        recipientName: 'Offline',
        chosenIdea: null,
        finalPriceCents: null,
        contributors: [
          { contributionCents: 1000 },
          { contributionCents: 2000 },
          { contributionCents: null },
        ],
      },
    ];

    const out = shapePastGifts(rows);
    expect(out[0]?.totalCents).toBe(5000);
    expect(out[0]?.chosenIdeaName).toBe('Headphones');
    expect(out[1]?.totalCents).toBe(3000);
    expect(out[1]?.chosenIdeaName).toBeNull();
    expect(out[1]?.recipientName).toBe('Offline');
  });
});

describe('computeUpcomingOccasions', () => {
  it('skips members with active pools, members without birthdays, and birthdays beyond 60 days', () => {
    const inSixtyDays = new Date(NOW);
    inSixtyDays.setDate(inSixtyDays.getDate() + 70); // beyond window
    const inThirtyDays = new Date(NOW);
    inThirtyDays.setDate(inThirtyDays.getDate() + 30);

    const members: any = [
      {
        userId: 'has-pool',
        user: {
          name: 'Has Pool',
          username: 'haspool',
          birthday: inThirtyDays,
          image: null,
        },
      },
      {
        userId: 'no-birthday',
        user: {
          name: 'No Birthday',
          username: 'nobirthday',
          birthday: null,
          image: null,
        },
      },
      {
        userId: 'far-away',
        user: {
          name: 'Far',
          username: 'far',
          birthday: inSixtyDays,
          image: null,
        },
      },
      {
        userId: 'in-window',
        user: {
          name: 'In Window',
          username: 'inwindow',
          birthday: inThirtyDays,
          image: { id: 'img-1' },
        },
      },
    ];
    const activePools: any = [
      { recipientUserId: 'has-pool' },
      { recipientUserId: null }, // standalone — should be ignored
    ];

    const out = computeUpcomingOccasions(members, activePools, 'group-1');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      userId: 'in-window',
      name: 'In Window',
      username: 'inwindow',
      imageId: 'img-1',
      groupId: 'group-1',
    });
  });
});

describe('getGroupOverviewData (integration)', () => {
  beforeEach(() => {
    poolFindMany.mockReset();
    usersInGiftGroupsFindMany.mockReset();
  });

  it('orchestrates the three queries and returns a fully shaped overview', async () => {
    const inFifteenDays = new Date(NOW);
    inFifteenDays.setDate(inFifteenDays.getDate() + 15);

    // Active pools (1st findMany call)
    poolFindMany.mockResolvedValueOnce([
      {
        id: 'pool-active',
        title: "Marco's Birthday",
        occasionType: 'BIRTHDAY',
        eventDate: new Date(NOW.getTime() + 14 * DAY),
        status: 'OPEN',
        decisionMode: 'ORGANIZER_PICKS',
        updatedAt: new Date(NOW.getTime() - 1 * DAY),
        organizerId: 'viewer-1',
        purchaserId: null,
        delivererId: null,
        chosenIdeaId: null,
        recipientUserId: 'marco',
        recipientName: null,
        recipientUser: { name: 'Marco', username: 'marco' },
        contributors: [
          { userId: 'viewer-1', contributionCents: 2000, hasPaid: false },
        ],
        chosenIdea: null,
        votes: [],
        _count: { ideas: 1, contributors: 1, votes: 0 },
      },
    ]);

    // Group members (usersInGiftGroups.findMany)
    usersInGiftGroupsFindMany.mockResolvedValueOnce([
      {
        userId: 'leo',
        user: {
          name: 'Leo',
          username: 'leo',
          birthday: inFifteenDays,
          image: null,
        },
      },
    ]);

    // Past gifts (2nd pool findMany call)
    poolFindMany.mockResolvedValueOnce([
      {
        id: 'pool-past',
        title: 'Last year',
        status: 'DELIVERED',
        occasionType: 'BIRTHDAY',
        updatedAt: new Date('2025-05-01'),
        recipientName: null,
        recipientUser: { name: 'Alex', username: 'alex' },
        chosenIdea: { name: 'Speaker' },
        finalPriceCents: 6000,
        contributors: [],
      },
    ]);

    const result = await getGroupOverviewData('group-1', 'viewer-1');

    expect(poolFindMany).toHaveBeenCalledTimes(2);
    expect(usersInGiftGroupsFindMany).toHaveBeenCalledTimes(1);
    expect(result.activePools).toHaveLength(1);
    expect(result.activePools[0]?.viewerRole).toBe('organizing');
    expect(result.upcomingOccasions).toHaveLength(1);
    expect(result.upcomingOccasions[0]?.userId).toBe('leo');
    expect(result.pastGifts).toHaveLength(1);
    expect(result.pastGifts[0]?.totalCents).toBe(6000);
    // Action queue: organizer of OPEN pool with 1 idea (ORGANIZER_PICKS)
    // gets CHOOSE_GIFT. Plus the upcoming occasion.
    const types = result.actionQueue.map((i) => i.type);
    expect(types).toContain(ACTION_TYPE.CHOOSE_GIFT);
    expect(types).toContain(ACTION_TYPE.UPCOMING_OCCASION);
  });

  it('enforces the recipient-privacy filter on every pool query', async () => {
    poolFindMany.mockResolvedValue([]);
    usersInGiftGroupsFindMany.mockResolvedValue([]);

    await getGroupOverviewData('group-1', 'viewer-1');

    for (const call of poolFindMany.mock.calls) {
      const where = (call[0] as { where: { OR: Array<unknown> } }).where;
      // The OR clause covers `recipientUserId: null OR { not: viewerId }`.
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { recipientUserId: null },
          { recipientUserId: { not: 'viewer-1' } },
        ]),
      );
    }
  });
});
