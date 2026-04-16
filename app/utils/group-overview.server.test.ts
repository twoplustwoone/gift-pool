/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Avoid pulling in prisma/db for pure-function tests.
vi.mock('#app/utils/db.server.ts', () => ({ prisma: {} }));

import {
  ACTION_TYPE,
  _computeActionQueueForTesting as computeActionQueue,
  _isPoolStuckForTesting as isPoolStuck,
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
