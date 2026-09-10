/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';

// Delivery has its own unit test (exchange-notifications.server.test.ts). Here
// the fan-out is stubbed so its background writes don't contend with the next
// test's transaction on SQLite's single writer.
const fanOut = vi.hoisted(() => ({
  started: vi.fn(),
  drawn: vi.fn(),
  revealed: vi.fn(),
  cancelled: vi.fn(),
  splice: vi.fn(),
}));
vi.mock('#app/utils/exchange-notifications.server.ts', () => ({
  queueExchangeStarted: (...args: Array<unknown>) => fanOut.started(...args),
  queueExchangeNamesDrawn: (...args: Array<unknown>) => fanOut.drawn(...args),
  queueExchangeRevealed: (...args: Array<unknown>) => fanOut.revealed(...args),
  queueExchangeCancelled: (...args: Array<unknown>) =>
    fanOut.cancelled(...args),
  queueExchangeNotesDelivered: vi.fn(),
  queueExchangeSpliceNotices: (...args: Array<unknown>) =>
    fanOut.splice(...args),
}));
import {
  EXCHANGE_STATUS,
  GIFT_OUTCOME,
  GIFT_STAGE,
  PARTICIPANT_STATUS,
  REVEAL_MODE,
} from './exchange-constants.ts';
import {
  cancelExchange,
  createExchange,
  drawNames,
  getOwnAssignment,
  getRevealedLoop,
  getViewerProjection,
  listExchangesForUser,
  getGroupExchangeSummary,
  previewDraw,
  requireExchangeVisible,
  reveal,
  runAutoRevealSweep,
  setGiftStage,
  setParticipation,
  setReceived,
  updateExchangeSettings,
  addExclusion,
  markAssignmentViewed,
  dismissJoinPrompt,
  getGroupExchangeArchive,
  hasGroupExchangeArchive,
  setGuess,
  leaveAfterDraw,
  leaveGroupExchanges,
  generateExchangeInviteCode,
  getExchangeInvite,
  joinExchangeByCode,
  revokeExchangeInviteCode,
  announceExchangeAccountDeletion,
  prepareExchangesForAccountDeletion,
  type ExchangeView,
} from './exchanges.server.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-12-01T12:00:00Z');
const EVENT = new Date('2026-12-24T00:00:00Z');
const AFTER_EVENT = new Date('2026-12-25T12:00:00Z');

const statusOf = (err: unknown): number | undefined => {
  const e = err as { status?: number; init?: { status?: number } };
  return e?.init?.status ?? e?.status;
};
const bodyOf = (err: unknown): unknown => (err as { data?: unknown })?.data;

async function expectThrows(promise: Promise<unknown>, status: number) {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught, 'expected a thrown response').toBeDefined();
  expect(statusOf(caught)).toBe(status);
  return caught;
}

// Every test seeds six users and a group; under coverage instrumentation on CI
// that plus the transactional draw takes longer than vitest's 5s default.
vi.setConfig({ testTimeout: 20_000 });

// No password row: the module never authenticates, and bcrypt hashing six
// users per test was most of each test's wall-clock.
async function makeUser(name: string) {
  return prisma.user.create({
    data: { ...createUser(), name },
    select: { id: true, name: true, username: true },
  });
}

type Fixture = Awaited<ReturnType<typeof makeFixture>>;

async function makeFixture() {
  const [organizer, a, b, c, d, outsider] = await Promise.all([
    makeUser('Francisco'),
    makeUser('Nicolas P'),
    makeUser('Nicolas B'),
    makeUser('Francisco C'),
    makeUser('Agustin'),
    makeUser('Outsider'),
  ]);
  const group = await prisma.giftGroup.create({
    data: {
      name: 'The Painted',
      groupMembers: {
        create: [organizer, a, b, c, d].map((u, i) => ({
          userId: u.id,
          role: i === 0 ? 'OWNER' : 'MEMBER',
        })),
      },
    },
  });
  return { organizer, a, b, c, d, outsider, group, members: [a, b, c, d] };
}

async function createGroupExchange(
  f: Fixture,
  overrides: Partial<Parameters<typeof createExchange>[0]> = {},
) {
  return createExchange({
    organizerId: f.organizer.id,
    title: 'The Painted 2026',
    eventDate: EVENT,
    giftGroupId: f.group.id,
    spendingGuideline: 'Around $50',
    now: NOW,
    ...overrides,
  });
}

async function optInAll(f: Fixture, exchangeId: string, users = f.members) {
  for (const u of users) {
    await setParticipation({
      exchangeId,
      userId: u.id,
      status: 'IN',
      now: NOW,
    });
  }
}

// Deterministic rng so the drawn cycle is stable across runs.
function seededRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let f: Fixture;
beforeEach(async () => {
  f = await makeFixture();
});

describe('createExchange', () => {
  it('seeds the organizer IN, every other member PENDING, and canonical exclusions', async () => {
    const { id } = await createGroupExchange(f, {
      exclusions: [[f.b.id, f.a.id]],
    });
    const rows = await prisma.exchangeParticipant.findMany({
      where: { exchangeId: id },
    });
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.userId === f.organizer.id)?.status).toBe('IN');
    expect(
      rows.filter((r) => r.userId !== f.organizer.id).map((r) => r.status),
    ).toEqual(['PENDING', 'PENDING', 'PENDING', 'PENDING']);
    const exclusion = await prisma.exchangeExclusion.findFirstOrThrow({
      where: { exchangeId: id },
    });
    expect(exclusion.userAId.localeCompare(exclusion.userBId)).toBeLessThan(0);
    const exchange = await prisma.exchange.findUniqueOrThrow({ where: { id } });
    expect(exchange.status).toBe(EXCHANGE_STATUS.GATHERING);
    expect(exchange.avoidRepeatsLookback).toBe(2);
    expect(exchange.autoRevealAt).toEqual(new Date(EVENT.getTime() + 3 * DAY));
  });

  it('rejects a past date, a non-member organizer, and exclusions naming strangers', async () => {
    await expectThrows(
      createGroupExchange(f, { eventDate: new Date(NOW.getTime() - DAY) }),
      400,
    );
    await expectThrows(
      createGroupExchange(f, { organizerId: f.outsider.id }),
      404,
    );
    await expectThrows(
      createGroupExchange(f, { exclusions: [[f.a.id, f.outsider.id]] }),
      400,
    );
  });

  it('gives a standalone exchange no lookback and no pending roster', async () => {
    const { id } = await createExchange({
      organizerId: f.organizer.id,
      title: 'Studio Christmas',
      eventDate: EVENT,
      now: NOW,
      avoidRepeatsLookback: 2,
    });
    const exchange = await prisma.exchange.findUniqueOrThrow({ where: { id } });
    expect(exchange.avoidRepeatsLookback).toBeNull();
    expect(
      await prisma.exchangeParticipant.count({ where: { exchangeId: id } }),
    ).toBe(1);
  });
});

describe('visibility', () => {
  it('returns the same 404 body for an outsider and for a missing id', async () => {
    const { id } = await createGroupExchange(f);
    const outsiderErr = await expectThrows(
      requireExchangeVisible(f.outsider.id, id),
      404,
    );
    const missingErr = await expectThrows(
      requireExchangeVisible(f.organizer.id, 'does-not-exist'),
      404,
    );
    expect(bodyOf(outsiderErr)).toEqual(bodyOf(missingErr));
  });

  it('is visible to organizer, pending members, and participants', async () => {
    const { id } = await createGroupExchange(f);
    await expect(
      requireExchangeVisible(f.organizer.id, id),
    ).resolves.toBeDefined();
    await expect(requireExchangeVisible(f.a.id, id)).resolves.toBeDefined();
  });
});

describe('participation', () => {
  it('opts in and out while gathering, and refuses the organizer sitting out', async () => {
    const { id } = await createGroupExchange(f);
    await setParticipation({ exchangeId: id, userId: f.a.id, status: 'IN' });
    let row = await prisma.exchangeParticipant.findUniqueOrThrow({
      where: { exchangeId_userId: { exchangeId: id, userId: f.a.id } },
    });
    expect(row.status).toBe('IN');
    expect(row.joinedAt).not.toBeNull();
    await setParticipation({ exchangeId: id, userId: f.a.id, status: 'OUT' });
    row = await prisma.exchangeParticipant.findUniqueOrThrow({
      where: { exchangeId_userId: { exchangeId: id, userId: f.a.id } },
    });
    expect(row.status).toBe('OUT');
    await expectThrows(
      setParticipation({
        exchangeId: id,
        userId: f.organizer.id,
        status: 'OUT',
      }),
      400,
    );
    await expectThrows(
      setParticipation({ exchangeId: id, userId: f.outsider.id, status: 'IN' }),
      404,
    );
  });

  it('is locked after the draw (409, not silent)', async () => {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id);
    await drawNames({ exchangeId: id, actorId: f.organizer.id, now: NOW });
    await expectThrows(
      setParticipation({ exchangeId: id, userId: f.a.id, status: 'OUT' }),
      409,
    );
  });
});

describe('the draw', () => {
  it('stays blocked with TOO_FEW below three and never writes anything', async () => {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id, [f.a]);
    const preview = await previewDraw({
      exchangeId: id,
      actorId: f.organizer.id,
    });
    expect(preview).toEqual({ kind: 'TOO_FEW', have: 2, need: 3 });
    const result = await drawNames({ exchangeId: id, actorId: f.organizer.id });
    expect(result.status).toBe('BLOCKED');
    expect(
      await prisma.exchangeAssignment.count({ where: { exchangeId: id } }),
    ).toBe(0);
    const exchange = await prisma.exchange.findUniqueOrThrow({ where: { id } });
    expect(exchange.status).toBe(EXCHANGE_STATUS.GATHERING);
  });

  it('names the blocked person and the exact exclusions when no loop exists', async () => {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id, [f.a, f.b, f.c]);
    // Four people: organizer, a, b, c. b excluded from a and c → b can only
    // pair with the organizer both ways, so the loop cannot close.
    await addExclusion({
      exchangeId: id,
      actorId: f.organizer.id,
      userAId: f.b.id,
      userBId: f.a.id,
    });
    await addExclusion({
      exchangeId: id,
      actorId: f.organizer.id,
      userAId: f.b.id,
      userBId: f.c.id,
    });
    const preview = await previewDraw({
      exchangeId: id,
      actorId: f.organizer.id,
    });
    expect(preview.kind).toBe('INFEASIBLE');
    if (preview.kind !== 'INFEASIBLE') return;
    expect(preview.blockedUserId).toBe(f.b.id);
    expect(preview.blockedName).toBe('Nicolas B');
    expect(preview.exclusions).toHaveLength(2);
    expect(
      preview.exclusions.every(
        (e) => e.aName === 'Nicolas B' || e.bName === 'Nicolas B',
      ),
    ).toBe(true);
  });

  it('writes one closed loop, flips to DRAWN, and refuses a second draw', async () => {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id);
    const result = await drawNames({
      exchangeId: id,
      actorId: f.organizer.id,
      now: NOW,
      rng: seededRng(1),
    });
    expect(result).toEqual({
      status: 'DRAWN',
      participantCount: 5,
      repeats: 'NOT_APPLICABLE',
    });
    expect(fanOut.drawn).toHaveBeenCalledWith(id);
    const assignments = await prisma.exchangeAssignment.findMany({
      where: { exchangeId: id },
    });
    expect(assignments).toHaveLength(5);
    const next = new Map(assignments.map((x) => [x.gifterId, x.gifteeId]));
    let cursor = f.organizer.id;
    const seen = new Set<string>();
    do {
      seen.add(cursor);
      cursor = next.get(cursor)!;
    } while (!seen.has(cursor));
    expect(seen.size).toBe(5);
    const exchange = await prisma.exchange.findUniqueOrThrow({ where: { id } });
    expect(exchange.status).toBe(EXCHANGE_STATUS.DRAWN);
    expect(exchange.drawnAt).toEqual(NOW);
    await expectThrows(
      drawNames({ exchangeId: id, actorId: f.organizer.id }),
      409,
    );
  });

  it('only the organizer may draw', async () => {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id);
    await expectThrows(drawNames({ exchangeId: id, actorId: f.a.id }), 403);
    await expectThrows(
      drawNames({ exchangeId: id, actorId: f.outsider.id }),
      404,
    );
  });

  it('avoids pairings from the previous draw when the lookback is on', async () => {
    const first = await createGroupExchange(f, {
      eventDate: new Date('2025-12-24T00:00:00Z'),
      now: new Date('2025-12-01T00:00:00Z'),
    });
    await optInAll(f, first.id);
    await drawNames({
      exchangeId: first.id,
      actorId: f.organizer.id,
      rng: seededRng(2),
    });
    const previous = await prisma.exchangeAssignment.findMany({
      where: { exchangeId: first.id },
    });

    const second = await createGroupExchange(f, { avoidRepeatsLookback: 1 });
    await optInAll(f, second.id);
    const preview = await previewDraw({
      exchangeId: second.id,
      actorId: f.organizer.id,
    });
    expect(preview.kind === 'ok' && preview.repeats).toBe('NONE');
    const result = await drawNames({
      exchangeId: second.id,
      actorId: f.organizer.id,
      rng: seededRng(3),
    });
    expect(result.status === 'DRAWN' && result.repeats).toBe('NONE');
    const current = await prisma.exchangeAssignment.findMany({
      where: { exchangeId: second.id },
    });
    for (const p of previous) {
      expect(
        current.some(
          (c) => c.gifterId === p.gifterId && c.gifteeId === p.gifteeId,
        ),
      ).toBe(false);
    }
  });
});

describe('gift progress and receipt', () => {
  async function drawn() {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id);
    await drawNames({
      exchangeId: id,
      actorId: f.organizer.id,
      now: NOW,
      rng: seededRng(4),
    });
    return id;
  }

  it('lets a gifter move through stages, reversibly', async () => {
    const id = await drawn();
    await setGiftStage({
      exchangeId: id,
      userId: f.a.id,
      stage: GIFT_STAGE.WRAPPED,
      now: NOW,
    });
    let own = await getOwnAssignment(id, f.a.id);
    expect(own?.giftStage).toBe('WRAPPED');
    expect(own?.giftStageAt).toEqual(NOW);
    await setGiftStage({
      exchangeId: id,
      userId: f.a.id,
      stage: GIFT_STAGE.NONE,
    });
    own = await getOwnAssignment(id, f.a.id);
    expect(own?.giftStage).toBe('NONE');
    expect(own?.giftStageAt).toBeNull();
  });

  it('gates "received" on the exchange date and records the outcome on the inbound row', async () => {
    const id = await drawn();
    await expectThrows(
      setReceived({
        exchangeId: id,
        userId: f.a.id,
        outcome: GIFT_OUTCOME.LOVED,
        now: NOW,
      }),
      409,
    );
    await setReceived({
      exchangeId: id,
      userId: f.a.id,
      outcome: GIFT_OUTCOME.LOVED,
      now: AFTER_EVENT,
    });
    const inbound = await prisma.exchangeAssignment.findFirstOrThrow({
      where: { exchangeId: id, gifteeId: f.a.id },
    });
    expect(inbound.outcome).toBe('LOVED');
    expect(inbound.receivedAt).toEqual(AFTER_EVENT);
  });

  it('marks the covered card opened exactly once', async () => {
    const id = await drawn();
    await markAssignmentViewed({ exchangeId: id, userId: f.a.id, now: NOW });
    await markAssignmentViewed({
      exchangeId: id,
      userId: f.a.id,
      now: AFTER_EVENT,
    });
    const row = await prisma.exchangeParticipant.findUniqueOrThrow({
      where: { exchangeId_userId: { exchangeId: id, userId: f.a.id } },
    });
    expect(row.assignmentViewedAt).toEqual(NOW);
  });
});

describe('reveal', () => {
  async function drawn(
    overrides: Partial<Parameters<typeof createExchange>[0]> = {},
  ) {
    const { id } = await createGroupExchange(f, overrides);
    await optInAll(f, id);
    await drawNames({
      exchangeId: id,
      actorId: f.organizer.id,
      now: NOW,
      rng: seededRng(5),
    });
    return id;
  }

  it('is refused before the exchange date and by non-organizers', async () => {
    const id = await drawn();
    await expectThrows(
      reveal({ exchangeId: id, actorId: f.organizer.id, now: NOW }),
      409,
    );
    await expectThrows(
      reveal({ exchangeId: id, actorId: f.a.id, now: AFTER_EVENT }),
      403,
    );
  });

  it("gates the reveal on the organizer's calendar day, not a UTC instant", async () => {
    const id = await drawn();
    // 24 Dec 00:30Z is still 23 Dec in Los Angeles: the exchange day has not
    // arrived for that organizer even though UTC has ticked over.
    const justAfterUtcMidnight = new Date('2026-12-24T00:30:00Z');
    await expectThrows(
      reveal({
        exchangeId: id,
        actorId: f.organizer.id,
        now: justAfterUtcMidnight,
        timeZone: 'America/Los_Angeles',
      }),
      409,
    );
    // Sydney is already on the 24th while UTC is still on the 23rd.
    const result = await reveal({
      exchangeId: id,
      actorId: f.organizer.id,
      now: new Date('2026-12-23T22:00:00Z'),
      timeZone: 'Australia/Sydney',
    });
    expect(result.status).toBe('REVEALED');
  });

  it('reveals once, is idempotent, and exposes the loop afterwards', async () => {
    const id = await drawn();
    const first = await reveal({
      exchangeId: id,
      actorId: f.organizer.id,
      now: AFTER_EVENT,
    });
    expect(first).toEqual({
      status: 'REVEALED',
      finalStatus: 'REVEALED',
      auto: false,
    });
    expect(fanOut.revealed).toHaveBeenCalledWith(id, 'REVEALED');
    const again = await reveal({
      exchangeId: id,
      actorId: f.organizer.id,
      now: AFTER_EVENT,
    });
    expect(again).toEqual({ status: 'ALREADY' });
    const loop = await getRevealedLoop(id);
    expect(loop).toHaveLength(5);
  });

  it('secret-forever finishes without ever exposing the loop', async () => {
    const id = await drawn({ revealMode: REVEAL_MODE.SECRET_FOREVER });
    const result = await reveal({
      exchangeId: id,
      actorId: f.organizer.id,
      now: AFTER_EVENT,
    });
    expect(result).toEqual({
      status: 'REVEALED',
      finalStatus: 'FINISHED',
      auto: false,
    });
    await expect(getRevealedLoop(id)).rejects.toThrow(/revealed/);
  });

  it('the sweep reveals only what is due and produces the same state as a manual reveal', async () => {
    const due = await drawn();
    const notDue = await drawn({
      autoRevealAt: new Date('2027-01-15T00:00:00Z'),
    });
    const off = await drawn({ autoRevealAt: null });
    const summary = await runAutoRevealSweep({
      now: new Date('2026-12-27T10:00:00Z'),
    });
    expect(summary).toEqual({
      considered: 1,
      revealed: 1,
      skipped: 0,
      failed: 0,
    });
    const [d, n, o] = await Promise.all(
      [due, notDue, off].map((id) =>
        prisma.exchange.findUniqueOrThrow({ where: { id } }),
      ),
    );
    expect(d!.status).toBe('REVEALED');
    expect(n!.status).toBe('DRAWN');
    expect(o!.status).toBe('DRAWN');
    // Running again is a no-op.
    expect(
      await runAutoRevealSweep({ now: new Date('2026-12-27T11:00:00Z') }),
    ).toEqual({
      considered: 0,
      revealed: 0,
      skipped: 0,
      failed: 0,
    });
  });

  it('cannot reveal a cancelled exchange', async () => {
    const id = await drawn();
    await cancelExchange({ exchangeId: id, actorId: f.organizer.id });
    await expectThrows(
      reveal({ exchangeId: id, actorId: f.organizer.id, now: AFTER_EVENT }),
      409,
    );
  });
});

describe('settings', () => {
  it('moves the auto-reveal date along with a postponed exchange date', async () => {
    const { id } = await createGroupExchange(f);
    const later = new Date('2027-01-10T00:00:00Z');
    await updateExchangeSettings({
      exchangeId: id,
      actorId: f.organizer.id,
      patch: { eventDate: later },
      now: NOW,
    });
    const exchange = await prisma.exchange.findUniqueOrThrow({ where: { id } });
    expect(exchange.autoRevealAt).toEqual(new Date(later.getTime() + 3 * DAY));
    // The sweep fails closed even if a stale auto-reveal date slipped through.
    await prisma.exchange.update({
      where: { id },
      data: { autoRevealAt: new Date('2026-12-05T00:00:00Z') },
    });
    await optInAll(f, id);
    await drawNames({ exchangeId: id, actorId: f.organizer.id, now: NOW });
    const summary = await runAutoRevealSweep({
      now: new Date('2026-12-06T00:00:00Z'),
    });
    expect(summary).toEqual({
      considered: 1,
      revealed: 0,
      skipped: 1,
      failed: 0,
    });
    expect(
      (await prisma.exchange.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('DRAWN');
  });

  it('locks everything but the auto-reveal date after the draw', async () => {
    const { id } = await createGroupExchange(f);
    await updateExchangeSettings({
      exchangeId: id,
      actorId: f.organizer.id,
      patch: { title: 'Renamed' },
      now: NOW,
    });
    await optInAll(f, id);
    await drawNames({ exchangeId: id, actorId: f.organizer.id, now: NOW });
    await updateExchangeSettings({
      exchangeId: id,
      actorId: f.organizer.id,
      patch: { autoRevealAt: null },
      now: NOW,
    });
    await expectThrows(
      updateExchangeSettings({
        exchangeId: id,
        actorId: f.organizer.id,
        patch: { revealMode: REVEAL_MODE.SECRET_FOREVER },
        now: NOW,
      }),
      409,
    );
    const exchange = await prisma.exchange.findUniqueOrThrow({ where: { id } });
    expect(exchange.title).toBe('Renamed');
    expect(exchange.autoRevealAt).toBeNull();
  });
});

// ─── The secrecy property ──────────────────────────────────────────────────────

// Walk a projection and collect every object that looks like a pairing.
function findPairings(value: unknown, path = '$'): string[] {
  const found: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => found.push(...findPairings(v, `${path}[${i}]`)));
  } else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (
      (keys.includes('gifter') && keys.includes('giftee')) ||
      (keys.includes('gifterId') && keys.includes('gifteeId'))
    ) {
      found.push(path);
    }
    for (const k of keys) found.push(...findPairings(obj[k], `${path}.${k}`));
  }
  return found;
}

describe('projection secrecy (property over role × status)', () => {
  async function setupAt(
    status: string,
    revealMode: (typeof REVEAL_MODE)[keyof typeof REVEAL_MODE] = REVEAL_MODE.ORGANIZER,
  ) {
    const { id } = await createGroupExchange(f, { revealMode });
    // d stays PENDING so there is a non-participating member to check.
    await optInAll(f, id, [f.a, f.b, f.c]);
    if (status === 'GATHERING') return id;
    await drawNames({
      exchangeId: id,
      actorId: f.organizer.id,
      now: NOW,
      rng: seededRng(6),
    });
    await setGiftStage({
      exchangeId: id,
      userId: f.a.id,
      stage: GIFT_STAGE.GIVEN,
      now: NOW,
    });
    if (status === 'DRAWN') return id;
    if (status === 'CANCELLED') {
      await cancelExchange({ exchangeId: id, actorId: f.organizer.id });
      return id;
    }
    await reveal({ exchangeId: id, actorId: f.organizer.id, now: AFTER_EVENT });
    return id;
  }

  const cases: Array<
    [string, typeof REVEAL_MODE.ORGANIZER | typeof REVEAL_MODE.SECRET_FOREVER]
  > = [
    ['GATHERING', REVEAL_MODE.ORGANIZER],
    ['DRAWN', REVEAL_MODE.ORGANIZER],
    ['REVEALED', REVEAL_MODE.ORGANIZER],
    ['FINISHED', REVEAL_MODE.SECRET_FOREVER],
    ['CANCELLED', REVEAL_MODE.ORGANIZER],
  ];

  for (const [status, mode] of cases) {
    it(`never leaks another person's pairing while ${status}`, async () => {
      const id = await setupAt(status, mode);
      const live = await prisma.exchangeAssignment.findMany({
        where: { exchangeId: id, supersededAt: null },
      });
      const viewers = [
        ['organizer', f.organizer],
        ['participant', f.a],
        ['member', f.d],
      ] as const;
      for (const [label, viewer] of viewers) {
        const view: ExchangeView = await getViewerProjection({
          exchangeId: id,
          viewerId: viewer.id,
          now: AFTER_EVENT,
        });
        const json = JSON.stringify(view);
        expect(json, `${label}: raw assignments key`).not.toContain(
          '"assignments"',
        );
        expect(json).not.toContain('"gifterId"');
        expect(json).not.toContain('"gifteeId"');

        const pairings = findPairings(view);
        if (status === 'REVEALED') {
          expect(pairings.every((p) => p.startsWith('$.loop['))).toBe(true);
          expect(view.loop).toHaveLength(live.length);
        } else {
          expect(pairings, `${label}: ${pairings.join(', ')}`).toEqual([]);
          expect(view.loop).toBeNull();
          expect(view.yourGifter).toBeNull();
        }

        // Own assignment only ever names the viewer's own giftee.
        const ownRow = live.find((x) => x.gifterId === viewer.id);
        if (view.you?.assignment) {
          expect(view.you.assignment.giftee.id).toBe(ownRow?.gifteeId);
        }
        if (label === 'member') {
          expect(view.you).toBeNull();
          expect(view.progress).toBeNull();
          expect(view.viewer.role).toBe('MEMBER');
          // Notes and guessing belong to people in the loop.
          expect(view.notes).toBeNull();
          expect(view.clues).toBeNull();
          expect(view.guess).toBeNull();
        }
        // A secret-forever exchange keeps the scoreboard and drops the loop,
        // so the awards must state right and wrong without implying who had
        // who — "three accused them, one was right" would tell three people
        // that one of them is holding the answer.
        if (status === 'FINISHED') {
          expect(view.loop).toBeNull();
          expect(view.youGuessedRight).toBeNull();
          expect(
            view.scoreboard?.awards.map((a) => a.kind) ?? [],
          ).not.toContain('MOST_ACCUSED');
        }
        if (status !== 'REVEALED' && status !== 'FINISHED') {
          expect(view.scoreboard).toBeNull();
        }
        // Notes and guesses only exist between the draw and the reveal, and a
        // note never carries its sender — the projection is the last place
        // that could leak one.
        if (status !== 'DRAWN') {
          expect(view.notes, `${label}: notes outside DRAWN`).toBeNull();
          expect(view.guess).toBeNull();
        }
        for (const note of [
          ...(view.notes?.fromYourGifter ?? []),
          ...(view.notes?.toYourPerson ?? []),
        ]) {
          // Only a thank-you carries a name, and thank-yous exist after the
          // reveal — so nothing in a drawn thread may name anyone.
          expect(note.from, `${label}: attributed note`).toBeNull();
        }
        // A clue is about the viewer themselves; it must not name a candidate
        // or carry anyone's id.
        for (const clue of view.clues ?? []) {
          for (const other of [f.organizer, f.a, f.b, f.c, f.d]) {
            expect(clue.text).not.toContain(other.id);
            expect(clue.text).not.toContain(other.name);
          }
        }
        // Organizer panel: numbers only.
        if (view.progress) {
          expect(label).toBe('organizer');
          for (const v of Object.values(view.progress))
            expect(typeof v).toBe('number');
        }
        // Received card never carries the gifter.
        if (view.you?.received) {
          expect(Object.keys(view.you.received).sort()).toEqual([
            'outcome',
            'receivedAt',
          ]);
        }
      }
      // An outsider gets the plain 404 in every status.
      await expectThrows(
        getViewerProjection({ exchangeId: id, viewerId: f.outsider.id }),
        404,
      );
    });
  }

  it('after the draw the roster shows live participants only', async () => {
    const id = await setupAt('DRAWN');
    const view = await getViewerProjection({
      exchangeId: id,
      viewerId: f.d.id,
      now: NOW,
    });
    expect(view.roster.map((r) => r.status)).toEqual(['IN', 'IN', 'IN', 'IN']);
    expect(view.counts).toEqual({ in: 4, pending: 1, out: 0 });
  });

  it('exposes the draw preview and exclusions to the organizer only, while gathering', async () => {
    const id = await setupAt('GATHERING');
    const organizer = await getViewerProjection({
      exchangeId: id,
      viewerId: f.organizer.id,
      now: NOW,
    });
    expect(organizer.draw?.kind).toBe('ok');
    expect(organizer.exclusions).toEqual([]);
    const participant = await getViewerProjection({
      exchangeId: id,
      viewerId: f.a.id,
      now: NOW,
    });
    expect(participant.draw).toBeNull();
    expect(participant.exclusions).toBeNull();
    expect(participant.exchange.inviteCode).toBeNull();
  });
});

describe('lists and group summary', () => {
  it('lists exchanges the user organizes, joined, or can see through a group', async () => {
    const mine = await createGroupExchange(f);
    const standalone = await createExchange({
      organizerId: f.outsider.id,
      title: 'Elsewhere',
      eventDate: EVENT,
      now: NOW,
    });
    const list = await listExchangesForUser(f.d.id, { now: NOW });
    expect(list.active.map((e) => e.id)).toEqual([mine.id]);
    expect(list.active[0]?.participation).toBe(PARTICIPANT_STATUS.PENDING);
    expect(list.past).toEqual([]);
    const outsiderList = await listExchangesForUser(f.outsider.id, {
      now: NOW,
    });
    expect(outsiderList.active.map((e) => e.id)).toEqual([standalone.id]);
  });

  it('never carries a pairing in the group summary, in any status', async () => {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id);
    for (const status of ['GATHERING', 'DRAWN'] as const) {
      if (status === 'DRAWN') {
        await drawNames({
          exchangeId: id,
          actorId: f.organizer.id,
          now: NOW,
          rng: seededRng(11),
        });
      }
      for (const viewer of [f.organizer, f.a, f.d]) {
        const summary = await getGroupExchangeSummary({
          giftGroupId: f.group.id,
          viewerId: viewer.id,
          now: NOW,
        });
        const json = JSON.stringify(summary);
        expect(json).not.toContain('"gifterId"');
        expect(json).not.toContain('"gifteeId"');
        expect(json).not.toContain('"giftee"');
        expect(json).not.toContain('"assignments"');
        expect(findPairings(summary)).toEqual([]);
        // Only the viewer's own participation, and an exchange-wide count.
        expect(Object.keys(summary!.viewer).sort()).toEqual([
          'dismissedJoinPrompt',
          'isOrganizer',
          'participation',
        ]);
        expect(typeof summary!.exchange.participantCount).toBe('number');
      }
    }
  });

  it('prefers an exchange still waiting on the viewer over the soonest one', async () => {
    const answered = await createGroupExchange(f, {
      title: 'Answered first',
      eventDate: new Date('2026-12-20T00:00:00Z'),
    });
    const waiting = await createGroupExchange(f, {
      title: 'Still waiting',
      eventDate: new Date('2026-12-31T00:00:00Z'),
    });
    // The viewer has answered the earlier one but not the later one.
    await setParticipation({
      exchangeId: answered.id,
      userId: f.a.id,
      status: 'IN',
    });

    const summary = await getGroupExchangeSummary({
      giftGroupId: f.group.id,
      viewerId: f.a.id,
      now: NOW,
    });
    expect(summary?.exchange.id).toBe(waiting.id);

    // Dismissing is not answering: the later exchange must still be the one
    // shown, so it can degrade to the quiet Join line instead of vanishing.
    await dismissJoinPrompt({ exchangeId: waiting.id, userId: f.a.id });
    const dismissed = await getGroupExchangeSummary({
      giftGroupId: f.group.id,
      viewerId: f.a.id,
      now: NOW,
    });
    expect(dismissed?.exchange.id).toBe(waiting.id);
    expect(dismissed?.viewer.dismissedJoinPrompt).toBe(true);

    // Once they have answered both, the soonest is the one that matters.
    await setParticipation({
      exchangeId: waiting.id,
      userId: f.a.id,
      status: 'OUT',
    });
    const settled = await getGroupExchangeSummary({
      giftGroupId: f.group.id,
      viewerId: f.a.id,
      now: NOW,
    });
    expect(settled?.exchange.id).toBe(answered.id);

    // The organizer is never "awaiting an answer" on their own exchange.
    const organizerView = await getGroupExchangeSummary({
      giftGroupId: f.group.id,
      viewerId: f.organizer.id,
      now: NOW,
    });
    expect(organizerView?.exchange.id).toBe(answered.id);
  });

  it('summarises the current group exchange with the viewer dismissal', async () => {
    const { id } = await createGroupExchange(f);
    let summary = await getGroupExchangeSummary({
      giftGroupId: f.group.id,
      viewerId: f.d.id,
      now: NOW,
    });
    expect(summary?.exchange.id).toBe(id);
    expect(summary?.viewer).toEqual({
      isOrganizer: false,
      participation: 'PENDING',
      dismissedJoinPrompt: false,
    });
    await dismissJoinPrompt({ exchangeId: id, userId: f.d.id });
    summary = await getGroupExchangeSummary({
      giftGroupId: f.group.id,
      viewerId: f.d.id,
      now: NOW,
    });
    expect(summary?.viewer.dismissedJoinPrompt).toBe(true);
    await cancelExchange({ exchangeId: id, actorId: f.organizer.id });
    expect(
      await getGroupExchangeSummary({
        giftGroupId: f.group.id,
        viewerId: f.d.id,
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe('prepareExchangesForAccountDeletion', () => {
  // Every exchange FK to User cascades, so anything this misses is destroyed
  // silently by `prisma.user.delete`. Each test therefore performs the real
  // deletion and asserts on what survives it.
  //
  // Mirrors deleteDataAction: prepare and delete in one transaction, fan out
  // after it commits. `prisma.user.delete` is additionally blocked today by
  // unrelated RESTRICT foreign keys (UsersInGiftGroups, Pool, PoolContributor,
  // GiftIdea, IdeaVote, PoolMessage) — account deletion cannot currently
  // succeed for anyone in a group, which is a separate bug — so the
  // membership rows are cleared first to reach the exchange behaviour.
  async function deleteAccount(userId: string, now = NOW) {
    await prisma.usersInGiftGroups.deleteMany({ where: { userId } });
    const summary = await prisma.$transaction(async (tx) => {
      const s = await prepareExchangesForAccountDeletion({
        userId,
        db: tx,
        now,
      });
      await tx.user.delete({ where: { id: userId } });
      return s;
    });
    announceExchangeAccountDeletion(summary);
    return summary;
  }

  const liveAssignments = (exchangeId: string) =>
    prisma.exchangeAssignment.findMany({
      where: { exchangeId, supersededAt: null },
      select: { gifterId: true, gifteeId: true },
    });

  it("joins the leaver's gifter to their giftee, keeping one whole loop", async () => {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id);
    await drawNames({
      exchangeId: id,
      actorId: f.organizer.id,
      now: NOW,
      rng: seededRng(7),
    });
    const before = await liveAssignments(id);
    const leaver = f.a;
    const gifterOfLeaver = before.find((p) => p.gifteeId === leaver.id)!;
    const gifteeOfLeaver = before.find((p) => p.gifterId === leaver.id)!;

    const summary = await deleteAccount(leaver.id);
    expect(summary.spliced).toEqual([id]);

    const after = await liveAssignments(id);
    // Five people became four, and the leaver's two rows became one.
    expect(before).toHaveLength(5);
    expect(after).toHaveLength(4);
    expect(
      after.some((p) => p.gifterId === leaver.id || p.gifteeId === leaver.id),
    ).toBe(false);
    expect(
      after.find((p) => p.gifterId === gifterOfLeaver.gifterId)?.gifteeId,
    ).toBe(gifteeOfLeaver.gifteeId);

    // Still a single cycle: every gifter appears once, every giftee once, and
    // walking from anyone visits all four.
    expect(new Set(after.map((p) => p.gifterId)).size).toBe(4);
    expect(new Set(after.map((p) => p.gifteeId)).size).toBe(4);
    const next = new Map(after.map((p) => [p.gifterId, p.gifteeId]));
    let cursor = after[0]!.gifterId;
    const visited = new Set<string>();
    while (!visited.has(cursor)) {
      visited.add(cursor);
      cursor = next.get(cursor)!;
    }
    expect(visited.size).toBe(4);

    const exchange = await prisma.exchange.findUniqueOrThrow({ where: { id } });
    expect(exchange.status).toBe(EXCHANGE_STATUS.DRAWN);
  });

  it('cancels instead when too few people would be left for a loop', async () => {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id, [f.a, f.b]); // organizer + 2 = the 3-person minimum
    await drawNames({
      exchangeId: id,
      actorId: f.organizer.id,
      now: NOW,
      rng: seededRng(3),
    });

    const summary = await deleteAccount(f.a.id);
    expect(summary.cancelled).toEqual([
      { exchangeId: id, includePending: false },
    ]);
    expect(summary.spliced).toEqual([]);
    expect(fanOut.cancelled).toHaveBeenCalledWith(id, {
      includePending: false,
    });

    const exchange = await prisma.exchange.findUniqueOrThrow({ where: { id } });
    expect(exchange.status).toBe(EXCHANGE_STATUS.CANCELLED);
    expect(exchange.cancelReason).toBe('TOO_FEW_AFTER_LEAVE');
  });

  it('hands an organized exchange to someone else instead of destroying it', async () => {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id);

    const summary = await deleteAccount(f.organizer.id);
    expect(summary.reassigned).toEqual([id]);

    // Without the hand-over the cascade on organizerId takes the whole row.
    const exchange = await prisma.exchange.findUnique({ where: { id } });
    expect(exchange).not.toBeNull();
    expect(exchange!.organizerId).not.toBe(f.organizer.id);
    expect(f.members.map((m) => m.id)).toContain(exchange!.organizerId);
    expect(exchange!.status).toBe(EXCHANGE_STATUS.GATHERING);
  });

  it('keeps a revealed exchange in the group record when its organizer leaves', async () => {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id);
    await drawNames({
      exchangeId: id,
      actorId: f.organizer.id,
      now: NOW,
      rng: seededRng(11),
    });
    await reveal({
      exchangeId: id,
      actorId: f.organizer.id,
      now: AFTER_EVENT,
    });

    await deleteAccount(f.organizer.id, AFTER_EVENT);

    const exchange = await prisma.exchange.findUnique({ where: { id } });
    expect(exchange?.status).toBe(EXCHANGE_STATUS.REVEALED);
    // The departed person's two pairings go with them; the rest of the record
    // stays readable rather than the whole year disappearing.
    const pairs = await getRevealedLoop(id);
    expect(pairs).toHaveLength(3);
    expect(
      pairs.some(
        (p) => p.gifterId === f.organizer.id || p.gifteeId === f.organizer.id,
      ),
    ).toBe(false);
  });

  it('stops rather than pairing two people who excluded each other', async () => {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id);
    await drawNames({
      exchangeId: id,
      actorId: f.organizer.id,
      now: NOW,
      rng: seededRng(7),
    });
    // Exclude exactly the pair the splice would join, so the only closure of
    // the remaining path is the forbidden one.
    const pairs = await liveAssignments(id);
    const leaver = f.a;
    const gifterOfLeaver = pairs.find((p) => p.gifteeId === leaver.id)!;
    const gifteeOfLeaver = pairs.find((p) => p.gifterId === leaver.id)!;
    // Written directly: `addExclusion` refuses once names are drawn, by
    // design, but an exclusion set BEFORE the draw is perfectly legal and
    // says nothing about who ends up two places apart in the loop. This is
    // that row.
    const [userAId, userBId] = [
      gifterOfLeaver.gifterId,
      gifteeOfLeaver.gifteeId,
    ].sort();
    await prisma.exchangeExclusion.create({
      data: { exchangeId: id, userAId: userAId!, userBId: userBId! },
    });

    const summary = await deleteAccount(leaver.id);
    expect(summary.spliced).toEqual([]);
    expect(summary.cancelled).toEqual([
      { exchangeId: id, includePending: false },
    ]);

    const exchange = await prisma.exchange.findUniqueOrThrow({ where: { id } });
    expect(exchange.status).toBe(EXCHANGE_STATUS.CANCELLED);
    expect(exchange.cancelReason).toBe('EXCLUSIONS_AFTER_LEAVE');
    // Crucially, the excluded pair was never written.
    const after = await liveAssignments(id);
    expect(
      after.some(
        (p) =>
          p.gifterId === gifterOfLeaver.gifterId &&
          p.gifteeId === gifteeOfLeaver.gifteeId,
      ),
    ).toBe(false);
  });

  it('lets an exchange nobody joined go, rather than conscripting an invitee', async () => {
    // Everyone else is still PENDING: nobody agreed to be in it, let alone to
    // run it. Promoting an invitee would either force them in or leave them
    // organizing a page with no Join control, so the cascade takes it.
    const { id } = await createGroupExchange(f);

    const summary = await deleteAccount(f.organizer.id);
    expect(summary).toEqual({
      spliced: [],
      cancelled: [],
      reassigned: [],
      personChanged: [],
    });
    expect(fanOut.cancelled).not.toHaveBeenCalled();
    expect(await prisma.exchange.findUnique({ where: { id } })).toBeNull();
  });

  it('keeps the account and the exchange consistent when the delete fails', async () => {
    // The transaction is the point: a deletion blocked by an unrelated
    // constraint must not leave the exchange spliced with the account still
    // present. The membership row (RESTRICT) is deliberately left in place.
    const { id } = await createGroupExchange(f);
    await optInAll(f, id);
    await drawNames({
      exchangeId: id,
      actorId: f.organizer.id,
      now: NOW,
      rng: seededRng(7),
    });
    const before = await liveAssignments(id);

    await expect(
      prisma.$transaction(async (tx) => {
        await prepareExchangesForAccountDeletion({
          userId: f.a.id,
          db: tx,
          now: NOW,
        });
        await tx.user.delete({ where: { id: f.a.id } });
      }),
    ).rejects.toThrow();

    expect(
      await prisma.user.findUnique({ where: { id: f.a.id } }),
    ).not.toBeNull();
    expect(await liveAssignments(id)).toEqual(before);
  });

  it('leaves a gathering exchange alone beyond the hand-over', async () => {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id);

    const summary = await deleteAccount(f.a.id);
    expect(summary).toEqual({
      spliced: [],
      cancelled: [],
      reassigned: [],
      personChanged: [],
    });

    const exchange = await prisma.exchange.findUniqueOrThrow({ where: { id } });
    expect(exchange.status).toBe(EXCHANGE_STATUS.GATHERING);
    const rows = await prisma.exchangeParticipant.findMany({
      where: { exchangeId: id },
    });
    expect(rows.map((r) => r.userId)).not.toContain(f.a.id);
  });
});

describe('standalone invite links', () => {
  async function makeStandalone() {
    return createExchange({
      organizerId: f.organizer.id,
      title: 'Studio Christmas',
      eventDate: EVENT,
      giftGroupId: null,
      now: NOW,
    });
  }

  it('gathers people by link when there is no group to gather from', async () => {
    const { id } = await makeStandalone();
    const code = await generateExchangeInviteCode({
      exchangeId: id,
      actorId: f.organizer.id,
    });
    expect(code).toHaveLength(10);

    const invite = await getExchangeInvite(code);
    expect(invite?.exchangeId).toBe(id);
    expect(invite?.title).toBe('Studio Christmas');

    const joined = await joinExchangeByCode({
      code,
      userId: f.outsider.id,
      now: NOW,
    });
    expect(joined).toEqual({ status: 'JOINED', exchangeId: id });
    const row = await prisma.exchangeParticipant.findFirstOrThrow({
      where: { exchangeId: id, userId: f.outsider.id },
    });
    expect(row.status).toBe('IN');

    // Following it again is not an error — it is just already true.
    expect(
      await joinExchangeByCode({ code, userId: f.outsider.id, now: NOW }),
    ).toEqual({ status: 'ALREADY_IN', exchangeId: id });
  });

  it('lets someone who opted out change their mind through the link', async () => {
    const { id } = await makeStandalone();
    const code = await generateExchangeInviteCode({
      exchangeId: id,
      actorId: f.organizer.id,
    });
    await joinExchangeByCode({ code, userId: f.a.id, now: NOW });
    await setParticipation({
      exchangeId: id,
      userId: f.a.id,
      status: 'OUT',
      now: NOW,
    });

    expect(
      await joinExchangeByCode({ code, userId: f.a.id, now: NOW }),
    ).toEqual({ status: 'JOINED', exchangeId: id });
    const row = await prisma.exchangeParticipant.findFirstOrThrow({
      where: { exchangeId: id, userId: f.a.id },
    });
    expect(row.status).toBe('IN');
  });

  it('gives every dead cause the same answer', async () => {
    const { id } = await makeStandalone();
    const code = await generateExchangeInviteCode({
      exchangeId: id,
      actorId: f.organizer.id,
    });

    // Replaced.
    const replacement = await generateExchangeInviteCode({
      exchangeId: id,
      actorId: f.organizer.id,
    });
    expect(await getExchangeInvite(code)).toBeNull();
    expect(await getExchangeInvite(replacement)).not.toBeNull();

    // Revoked.
    await revokeExchangeInviteCode({
      exchangeId: id,
      actorId: f.organizer.id,
    });
    expect(await getExchangeInvite(replacement)).toBeNull();

    // Never existed.
    expect(await getExchangeInvite('nope123456')).toBeNull();
  });

  it('closes the link once the names are drawn', async () => {
    const { id } = await makeStandalone();
    const code = await generateExchangeInviteCode({
      exchangeId: id,
      actorId: f.organizer.id,
    });
    for (const u of [f.a, f.b]) {
      await joinExchangeByCode({ code, userId: u.id, now: NOW });
    }
    await drawNames({
      exchangeId: id,
      actorId: f.organizer.id,
      now: NOW,
      rng: seededRng(4),
    });

    // A drawn exchange reads exactly like one that never existed: saying
    // "already drawn" would confirm it does.
    expect(await getExchangeInvite(code)).toBeNull();
    expect(
      await joinExchangeByCode({ code, userId: f.c.id, now: NOW }),
    ).toEqual({ status: 'INVALID' });
    // And nobody was added to the closed loop.
    expect(
      await prisma.exchangeParticipant.count({
        where: { exchangeId: id, userId: f.c.id },
      }),
    ).toBe(0);
  });

  it('refuses to mint a link for a group exchange', async () => {
    // A group exchange's roster IS the group. A public link would be a way
    // around membership, not an invitation to it.
    const { id } = await createGroupExchange(f);
    await expectThrows(
      generateExchangeInviteCode({ exchangeId: id, actorId: f.organizer.id }),
      409,
    );
  });

  it('counts only the people who are actually in', async () => {
    const { id } = await makeStandalone();
    const code = await generateExchangeInviteCode({
      exchangeId: id,
      actorId: f.organizer.id,
    });
    await joinExchangeByCode({ code, userId: f.a.id, now: NOW });
    await joinExchangeByCode({ code, userId: f.b.id, now: NOW });
    expect((await getExchangeInvite(code))?.participantCount).toBe(3);

    // Someone who sat it out is not "in so far".
    await setParticipation({
      exchangeId: id,
      userId: f.b.id,
      status: 'OUT',
      now: NOW,
    });
    expect((await getExchangeInvite(code))?.participantCount).toBe(2);
  });

  it("is the organizer's link to make", async () => {
    const { id } = await makeStandalone();
    await expectThrows(
      generateExchangeInviteCode({ exchangeId: id, actorId: f.a.id }),
      404,
    );
  });
});

describe('leaving after the draw', () => {
  async function drawnWith(users: Array<{ id: string }>) {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id, users as typeof f.members);
    await drawNames({
      exchangeId: id,
      actorId: f.organizer.id,
      now: NOW,
      rng: seededRng(5),
    });
    const pairs = await prisma.exchangeAssignment.findMany({
      where: { exchangeId: id, supersededAt: null },
      select: { gifterId: true, gifteeId: true },
    });
    return { id, pairs };
  }

  it('closes the loop up and tells exactly the two people it affects', async () => {
    const { id, pairs } = await drawnWith(f.members);
    const leaver = f.a;
    const theirGifter = pairs.find((p) => p.gifteeId === leaver.id)!.gifterId;
    const theirGiftee = pairs.find((p) => p.gifterId === leaver.id)!.gifteeId;

    expect(
      await leaveAfterDraw({ exchangeId: id, userId: leaver.id, now: NOW }),
    ).toEqual({ status: 'SPLICED' });

    // The leaver's gifter inherits the leaver's person.
    const after = await prisma.exchangeAssignment.findMany({
      where: { exchangeId: id, supersededAt: null },
      select: { gifterId: true, gifteeId: true },
    });
    expect(after.find((p) => p.gifterId === theirGifter)?.gifteeId).toBe(
      theirGiftee,
    );
    expect(
      after.some((p) => p.gifterId === leaver.id || p.gifteeId === leaver.id),
    ).toBe(false);

    // Exactly two, and the module says which is which: the gifter (who gets
    // a name) and the displaced giftee (who does not).
    expect(fanOut.splice).toHaveBeenCalledTimes(1);
    expect(fanOut.splice).toHaveBeenCalledWith({
      exchangeId: id,
      gifterId: theirGifter,
      displacedGifteeId: theirGiftee,
    });

    // They are out of the roster, not erased from it.
    const row = await prisma.exchangeParticipant.findFirstOrThrow({
      where: { exchangeId: id, userId: leaver.id },
    });
    expect(row.status).toBe('OUT');
    expect(row.leftAt).not.toBeNull();
  });

  it('never tells the leaver who had them', async () => {
    const { id } = await drawnWith(f.members);
    await leaveAfterDraw({ exchangeId: id, userId: f.a.id, now: NOW });
    const view = await getViewerProjection({
      exchangeId: id,
      viewerId: f.a.id,
      now: NOW,
    });
    // They walked away from a loop still running for everyone else; their own
    // gifter stays secret.
    expect(view.yourGifter).toBeNull();
    expect(view.you?.assignment ?? null).toBeNull();
  });

  it('retires the old thread rather than handing its notes to the new gifter', async () => {
    const { id, pairs } = await drawnWith(f.members);
    const leaver = f.a;
    const theirGiftee = pairs.find((p) => p.gifterId === leaver.id)!.gifteeId;
    const oldThread = await prisma.exchangeAssignment.findFirstOrThrow({
      where: { exchangeId: id, gifterId: leaver.id, supersededAt: null },
      select: { id: true },
    });

    await leaveAfterDraw({ exchangeId: id, userId: leaver.id, now: NOW });

    // The displaced person's new thread is a different row, so notes written
    // by the leaver can never be re-attributed to whoever inherited them.
    const newThread = await prisma.exchangeAssignment.findFirstOrThrow({
      where: { exchangeId: id, gifteeId: theirGiftee, supersededAt: null },
      select: { id: true },
    });
    expect(newThread.id).not.toBe(oldThread.id);
    expect(
      (
        await prisma.exchangeAssignment.findUniqueOrThrow({
          where: { id: oldThread.id },
        })
      ).supersededAt,
    ).not.toBeNull();
  });

  it('cancels rather than splicing when too few would be left', async () => {
    const { id } = await drawnWith([f.a, f.b]);
    const result = await leaveAfterDraw({
      exchangeId: id,
      userId: f.a.id,
      now: NOW,
    });
    expect(result).toEqual({
      status: 'CANCELLED',
      reason: 'TOO_FEW_AFTER_LEAVE',
    });
    expect(fanOut.cancelled).toHaveBeenCalledWith(id, {
      includePending: false,
    });
    expect(fanOut.splice).not.toHaveBeenCalled();
  });

  it('hands the exchange over when its organizer leaves the group', async () => {
    // Otherwise a former member keeps reveal, cancel and settings over a
    // group they are no longer in.
    const { id } = await drawnWith(f.members);
    await leaveGroupExchanges({
      userId: f.organizer.id,
      giftGroupId: f.group.id,
      now: NOW,
    });
    const after = await prisma.exchange.findUniqueOrThrow({ where: { id } });
    expect(after.organizerId).not.toBe(f.organizer.id);
    expect(f.members.map((m) => m.id)).toContain(after.organizerId);
    expect(after.status).toBe('DRAWN');
  });

  it('cancels an exchange whose organizer leaves with nobody else in it', async () => {
    const { id } = await createGroupExchange(f);
    await leaveGroupExchanges({
      userId: f.organizer.id,
      giftGroupId: f.group.id,
      now: NOW,
    });
    const after = await prisma.exchange.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe('CANCELLED');
    expect(fanOut.cancelled).toHaveBeenCalledWith(id, {
      includePending: true,
    });
  });

  it('does nothing to an exchange that has not drawn', async () => {
    const { id } = await createGroupExchange(f);
    await optInAll(f, id);
    expect(
      await leaveAfterDraw({ exchangeId: id, userId: f.a.id, now: NOW }),
    ).toEqual({ status: 'NOTHING_TO_DO' });
  });

  it("takes someone out of a group's exchanges when they leave the group", async () => {
    const drawn = await drawnWith(f.members);
    const gathering = await createGroupExchange(f, { title: 'Next year' });
    await optInAll(f, gathering.id);

    await leaveGroupExchanges({
      userId: f.a.id,
      giftGroupId: f.group.id,
      now: NOW,
    });

    // Spliced out of the drawn one...
    const after = await prisma.exchangeAssignment.findMany({
      where: { exchangeId: drawn.id, supersededAt: null },
    });
    expect(
      after.some((p) => p.gifterId === f.a.id || p.gifteeId === f.a.id),
    ).toBe(false);
    // ...and simply out of the one that has not drawn.
    const row = await prisma.exchangeParticipant.findFirstOrThrow({
      where: { exchangeId: gathering.id, userId: f.a.id },
    });
    expect(row.status).toBe('OUT');
  });
});

describe('getGroupExchangeArchive', () => {
  // A revealed year and a secret-forever year, both with the same five people
  // and the same guesses, so the difference between them is only what the
  // archive is allowed to say.
  async function playYear({
    title,
    year,
    secretForever = false,
  }: {
    title: string;
    year: number;
    secretForever?: boolean;
  }) {
    // Each year is played at its own clock: createExchange refuses a date in
    // the past, so an archive has to be built by living through the years
    // rather than back-dating them.
    const eventDate = new Date(Date.UTC(year, 11, 24));
    const spring = new Date(Date.UTC(year, 2, 1));
    const { id } = await createGroupExchange(f, {
      title,
      eventDate,
      now: spring,
      revealMode: secretForever ? REVEAL_MODE.SECRET_FOREVER : undefined,
    });
    await optInAll(f, id);
    await drawNames({
      exchangeId: id,
      actorId: f.organizer.id,
      now: spring,
      rng: seededRng(year),
    });
    // Everyone guesses the organizer, so "nobody has ever guessed" is true of
    // somebody and the secret year still contributes its guesses.
    for (const u of f.members) {
      await setGuess({
        exchangeId: id,
        guesserId: u.id,
        guessedUserId: f.organizer.id,
        now: spring,
      });
    }
    await reveal({
      exchangeId: id,
      actorId: f.organizer.id,
      now: new Date(Date.UTC(year, 11, 27)),
    });
    return id;
  }

  it('shows a viewer only the years they were in, from their own angle', async () => {
    const id = await playYear({ title: 'The Painted 2026', year: 2026 });
    const pairs = await prisma.exchangeAssignment.findMany({
      where: { exchangeId: id, supersededAt: null },
      select: { gifterId: true, gifteeId: true },
    });

    const mine = await getGroupExchangeArchive({
      giftGroupId: f.group.id,
      viewerId: f.a.id,
    });
    expect(mine.years).toHaveLength(1);
    const year = mine.years[0]!;
    expect(year.year).toBe(2026);
    expect(year.secretForever).toBe(false);
    expect(year.yourGifter?.id).toBe(
      pairs.find((p) => p.gifteeId === f.a.id)!.gifterId,
    );
    expect(year.yourGiftee?.id).toBe(
      pairs.find((p) => p.gifterId === f.a.id)!.gifteeId,
    );

    // Two people in the same group see two different archives — that is the
    // design, not a bug.
    const theirs = await getGroupExchangeArchive({
      giftGroupId: f.group.id,
      viewerId: f.b.id,
    });
    expect(theirs.years[0]!.yourGifter?.id).not.toBe(year.yourGifter?.id);

    // Somebody who was never in it has no archive at all.
    expect(
      await getGroupExchangeArchive({
        giftGroupId: f.group.id,
        viewerId: f.outsider.id,
      }),
    ).toEqual({ years: [], memory: [], summary: null });
  });

  it('lets a secret year contribute its guesses but never its pairings', async () => {
    await playYear({
      title: 'The Painted 2025',
      year: 2025,
      secretForever: true,
    });
    const archive = await getGroupExchangeArchive({
      giftGroupId: f.group.id,
      viewerId: f.a.id,
    });
    const secret = archive.years[0]!;
    expect(secret.secretForever).toBe(true);
    expect(secret.yourGifter).toBeNull();
    expect(secret.yourGiftee).toBeNull();
    // Not even whether they called it: that is a pairing fact.
    expect(secret.youGuessedRight).toBeNull();
    expect(JSON.stringify(secret)).not.toContain('gifterId');
  });

  it('builds sentences about people out of more than one year', async () => {
    await playYear({ title: 'The Painted 2025', year: 2025 });
    await playYear({ title: 'The Painted 2026', year: 2026 });

    const archive = await getGroupExchangeArchive({
      giftGroupId: f.group.id,
      viewerId: f.a.id,
    });
    expect(archive.years.map((y) => y.year)).toEqual([2026, 2025]);
    expect(archive.summary).toBe('Two exchanges, 2025 to 2026.');

    // Everybody guessed the organizer every year, so somebody else has never
    // been guessed at all.
    const unguessed = archive.memory.find((m) => m.key === 'unguessed');
    expect(unguessed?.line).toMatch(/Nobody has ever guessed/);
    // And the same person ran both.
    const organizer = archive.memory.find((m) => m.key === 'organizer');
    expect(organizer?.person.id).toBe(f.organizer.id);
    expect(organizer?.line).toMatch(/has organized every one of them/);
  });

  it('tells the overview whether the link is worth offering', async () => {
    expect(
      await hasGroupExchangeArchive({
        giftGroupId: f.group.id,
        viewerId: f.a.id,
      }),
    ).toBe(false);
    await playYear({ title: 'The Painted 2026', year: 2026 });
    expect(
      await hasGroupExchangeArchive({
        giftGroupId: f.group.id,
        viewerId: f.a.id,
      }),
    ).toBe(true);
    expect(
      await hasGroupExchangeArchive({
        giftGroupId: f.group.id,
        viewerId: f.outsider.id,
      }),
    ).toBe(false);
  });
});
