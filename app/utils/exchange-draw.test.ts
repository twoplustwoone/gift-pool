import { describe, expect, it } from 'vitest';
import {
  buildDraw,
  type DrawExclusion,
  type DrawResult,
} from './exchange-draw.ts';

// Deterministic PRNG so failures reproduce.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const people = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`);

function excl(a: string, b: string, id = `${a}-${b}`): DrawExclusion {
  return { id, userAId: a, userBId: b };
}

function forbids(exclusions: DrawExclusion[], from: string, to: string) {
  return exclusions.some(
    (e) =>
      (e.userAId === from && e.userBId === to) ||
      (e.userAId === to && e.userBId === from),
  );
}

// Every participant gives exactly once and receives exactly once, nobody gives
// to themselves, no excluded pair is used, and following the assignments from
// any start visits everyone before returning (a single cycle, not several).
function assertValidCycle(
  result: DrawResult,
  participants: string[],
  exclusions: DrawExclusion[],
) {
  expect(result.kind).toBe('ok');
  if (result.kind !== 'ok') return;
  const { assignments } = result;
  expect(assignments).toHaveLength(participants.length);
  const gifters = new Set(assignments.map((a) => a.gifterId));
  const giftees = new Set(assignments.map((a) => a.gifteeId));
  expect([...gifters].sort()).toEqual([...participants].sort());
  expect([...giftees].sort()).toEqual([...participants].sort());
  for (const a of assignments) {
    expect(a.gifterId).not.toBe(a.gifteeId);
    expect(forbids(exclusions, a.gifterId, a.gifteeId)).toBe(false);
  }
  const next = new Map(assignments.map((a) => [a.gifterId, a.gifteeId]));
  let cursor = participants[0]!;
  const seen = new Set<string>();
  do {
    seen.add(cursor);
    cursor = next.get(cursor)!;
  } while (!seen.has(cursor));
  expect(seen.size).toBe(participants.length);
}

// Exhaustive reference: does any Hamiltonian cycle exist under `forbidden`?
function bruteForceFeasible(
  participants: string[],
  forbidden: (from: string, to: string) => boolean,
): boolean {
  const [start, ...rest] = participants;
  if (!start) return false;
  const permute = (arr: string[]): string[][] => {
    if (arr.length === 0) return [[]];
    return arr.flatMap((x, i) =>
      permute([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]),
    );
  };
  return permute(rest).some((order) => {
    const cycle = [start, ...order];
    return cycle.every((from, i) => {
      const to = cycle[(i + 1) % cycle.length]!;
      return !forbidden(from, to);
    });
  });
}

describe('buildDraw', () => {
  it('returns TOO_FEW below three participants', () => {
    expect(buildDraw({ participants: people(2), exclusions: [] })).toEqual({
      kind: 'TOO_FEW',
      have: 2,
      need: 3,
    });
  });

  it('draws a single valid cycle with no exclusions', () => {
    for (const n of [3, 4, 5, 12, 30]) {
      const ps = people(n);
      assertValidCycle(
        buildDraw({ participants: ps, exclusions: [], rng: mulberry32(n) }),
        ps,
        [],
      );
    }
  });

  it('is deterministic for a seeded rng and varies across seeds', () => {
    const ps = people(6);
    const a = buildDraw({
      participants: ps,
      exclusions: [],
      rng: mulberry32(7),
    });
    const b = buildDraw({
      participants: ps,
      exclusions: [],
      rng: mulberry32(7),
    });
    const c = buildDraw({
      participants: ps,
      exclusions: [],
      rng: mulberry32(8),
    });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('honours exclusions in both directions', () => {
    const ps = people(5);
    const exclusions = [excl('u0', 'u1'), excl('u3', 'u2')];
    for (let seed = 0; seed < 25; seed++) {
      assertValidCycle(
        buildDraw({ participants: ps, exclusions, rng: mulberry32(seed) }),
        ps,
        exclusions,
      );
    }
  });

  it('agrees with brute force on feasibility for every n up to 7 with random exclusions', () => {
    const rng = mulberry32(2026);
    for (let n = 3; n <= 7; n++) {
      const ps = people(n);
      for (let trial = 0; trial < 40; trial++) {
        const exclusions: DrawExclusion[] = [];
        const pairs = Math.floor(rng() * n);
        for (let k = 0; k < pairs; k++) {
          const a = ps[Math.floor(rng() * n)]!;
          const b = ps[Math.floor(rng() * n)]!;
          if (a !== b && !forbids(exclusions, a, b)) {
            exclusions.push(excl(a, b, `e${k}`));
          }
        }
        const feasible = bruteForceFeasible(ps, (f, t) =>
          forbids(exclusions, f, t),
        );
        const result = buildDraw({ participants: ps, exclusions, rng });
        if (feasible) {
          assertValidCycle(result, ps, exclusions);
        } else {
          expect(result.kind).toBe('INFEASIBLE');
        }
      }
    }
  });

  it('names the blocked person and exactly their conflicting exclusions', () => {
    // Four people; nb is excluded from two of the other three, so he can only
    // give to fc and only receive from fc, and a loop cannot close through him.
    const ps = ['nb', 'al', 'np', 'fc'];
    const exclusions = [
      excl('nb', 'al', 'x1'),
      excl('nb', 'np', 'x2'),
      excl('al', 'fc', 'x3'),
    ];
    const result = buildDraw({
      participants: ps,
      exclusions,
      rng: mulberry32(1),
    });
    expect(result).toEqual({
      kind: 'INFEASIBLE',
      blockedUserId: 'nb',
      exclusionIds: ['x1', 'x2'],
    });
  });

  it('with three people any exclusion is infeasible and blames one of the pair', () => {
    const ps = people(3);
    const exclusions = [excl('u1', 'u2', 'only')];
    const result = buildDraw({
      participants: ps,
      exclusions,
      rng: mulberry32(3),
    });
    expect(result.kind).toBe('INFEASIBLE');
    if (result.kind !== 'INFEASIBLE') return;
    expect(['u1', 'u2']).toContain(result.blockedUserId);
    expect(result.exclusionIds).toEqual(['only']);
  });

  describe('lookback ("give everyone someone new")', () => {
    it('reports NOT_APPLICABLE when no previous draws are supplied', () => {
      const result = buildDraw({ participants: people(4), exclusions: [] });
      expect(result.kind === 'ok' && result.repeats).toBe('NOT_APPLICABLE');
    });

    it('avoids previous pairings when a fresh cycle exists and reports NONE', () => {
      const ps = people(5);
      const avoidPairs: Array<[string, string]> = [
        ['u0', 'u1'],
        ['u1', 'u2'],
        ['u2', 'u3'],
      ];
      for (let seed = 0; seed < 20; seed++) {
        const result = buildDraw({
          participants: ps,
          exclusions: [],
          avoidPairs,
          rng: mulberry32(seed),
        });
        assertValidCycle(result, ps, []);
        if (result.kind !== 'ok') return;
        expect(result.repeats).toBe('NONE');
        for (const [g, r] of avoidPairs) {
          expect(
            result.assignments.some(
              (a) => a.gifterId === g && a.gifteeId === r,
            ),
          ).toBe(false);
        }
      }
    });

    it('relaxes the lookback rather than failing, and reports SOME', () => {
      // Three people: the only two cycles are u0>u1>u2>u0 and u0>u2>u1>u0.
      // Forbidding one edge from each makes a fresh cycle impossible.
      const ps = people(3);
      const result = buildDraw({
        participants: ps,
        exclusions: [],
        avoidPairs: [
          ['u0', 'u1'],
          ['u0', 'u2'],
        ],
        rng: mulberry32(5),
      });
      assertValidCycle(result, ps, []);
      expect(result.kind === 'ok' && result.repeats).toBe('SOME');
    });

    it('still respects hard exclusions when relaxing', () => {
      const ps = people(4);
      const exclusions = [excl('u0', 'u1')];
      const result = buildDraw({
        participants: ps,
        exclusions,
        avoidPairs: [
          ['u0', 'u2'],
          ['u0', 'u3'],
        ],
        rng: mulberry32(9),
      });
      assertValidCycle(result, ps, exclusions);
      expect(result.kind === 'ok' && result.repeats).toBe('SOME');
    });
  });

  it('gives up and reports INFEASIBLE when the search budget is exhausted', () => {
    const result = buildDraw({
      participants: people(8),
      exclusions: [],
      rng: mulberry32(1),
      budget: 1,
    });
    expect(result.kind).toBe('INFEASIBLE');
  });
});
