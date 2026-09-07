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
}));
vi.mock('#app/utils/exchange-notifications.server.ts', () => ({
  queueExchangeStarted: (...args: Array<unknown>) => fanOut.started(...args),
  queueExchangeNamesDrawn: (...args: Array<unknown>) => fanOut.drawn(...args),
  queueExchangeRevealed: (...args: Array<unknown>) => fanOut.revealed(...args),
  queueExchangeCancelled: (...args: Array<unknown>) =>
    fanOut.cancelled(...args),
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
