// The draw: turn a roster plus "don't pair" rules into ONE closed loop of
// gifter -> giftee assignments. Pure: no Prisma, no Date, no randomness of its
// own (callers pass `rng`), so it is exhaustively testable against brute force.
//
// Two tiers of constraint:
//   - hard: exclusions (symmetric) and self-assignment. Never violated.
//   - soft: `avoidPairs`, the directional pairings from the group's previous
//     draws. Honoured when a cycle exists without them; otherwise relaxed and
//     the result says so (`repeats: 'SOME'`) so the organizer is told BEFORE
//     the draw, not after.
//
// The search is a randomised depth-first walk for a Hamiltonian cycle with
// Warnsdorff ordering (try the successor with the fewest onward options first).
// Rosters are small (3 to 30), so this is exhaustive in practice; a node budget
// keeps a hostile input from spinning.

export type DrawExclusion = { id: string; userAId: string; userBId: string };

export type DrawInput = {
  participants: string[];
  exclusions: DrawExclusion[];
  // Directional (gifter, giftee) pairs from previous draws to avoid if possible.
  avoidPairs?: Array<[gifterId: string, gifteeId: string]>;
  rng?: () => number;
  budget?: number;
};

export type DrawRepeats = 'NONE' | 'SOME' | 'NOT_APPLICABLE';

export type DrawResult =
  | {
      kind: 'ok';
      // Visiting order; assignments[i] = cycle[i] -> cycle[i+1 mod n].
      cycle: string[];
      assignments: Array<{ gifterId: string; gifteeId: string }>;
      repeats: DrawRepeats;
    }
  | { kind: 'TOO_FEW'; have: number; need: number }
  | { kind: 'INFEASIBLE'; blockedUserId: string; exclusionIds: string[] };

export const DRAW_MIN_PARTICIPANTS = 3;
const DEFAULT_BUDGET = 250_000;

const edgeKey = (from: string, to: string) => `${from} ${to}`;

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function buildForbidden(
  participants: string[],
  exclusions: DrawExclusion[],
  avoidPairs: Array<[string, string]>,
): Set<string> {
  const forbidden = new Set<string>();
  for (const p of participants) forbidden.add(edgeKey(p, p));
  for (const e of exclusions) {
    forbidden.add(edgeKey(e.userAId, e.userBId));
    forbidden.add(edgeKey(e.userBId, e.userAId));
  }
  for (const [g, r] of avoidPairs) forbidden.add(edgeKey(g, r));
  return forbidden;
}

function findCycle(
  participants: string[],
  forbidden: Set<string>,
  rng: () => number,
  budget: number,
): string[] | null {
  const n = participants.length;
  const allowed = (from: string, to: string) =>
    !forbidden.has(edgeKey(from, to));
  const order = shuffle(participants, rng);
  const start = order[0]!;
  const visited = new Set<string>([start]);
  const path = [start];
  let expansions = 0;

  const onwardOptions = (node: string) =>
    order.filter((p) => !visited.has(p) && allowed(node, p)).length;

  const extend = (): boolean => {
    if (expansions++ > budget) return false;
    const current = path[path.length - 1]!;
    if (path.length === n) return allowed(current, start);
    const candidates = shuffle(
      order.filter((p) => !visited.has(p) && allowed(current, p)),
      rng,
    ).sort((a, b) => onwardOptions(a) - onwardOptions(b));
    for (const next of candidates) {
      visited.add(next);
      path.push(next);
      if (extend()) return true;
      path.pop();
      visited.delete(next);
      if (expansions > budget) return false;
    }
    return false;
  };

  return extend() ? path : null;
}

// When no cycle exists under the hard constraints, name the person the
// exclusions leave nowhere to go (or nobody to receive from). Someone with an
// allowed out- or in-degree of zero is blocked outright; otherwise the most
// constrained person is the best explanation the organizer can act on.
function diagnose(
  participants: string[],
  exclusions: DrawExclusion[],
): { blockedUserId: string; exclusionIds: string[] } {
  const forbidden = buildForbidden(participants, exclusions, []);
  const degree = (p: string) => {
    let out = 0;
    let inn = 0;
    for (const q of participants) {
      if (!forbidden.has(edgeKey(p, q))) out++;
      if (!forbidden.has(edgeKey(q, p))) inn++;
    }
    return Math.min(out, inn);
  };
  const involvement = (p: string) =>
    exclusions.filter((e) => e.userAId === p || e.userBId === p).length;
  const blockedUserId = [...participants].sort(
    (a, b) => degree(a) - degree(b) || involvement(b) - involvement(a),
  )[0]!;
  const exclusionIds = exclusions
    .filter((e) => e.userAId === blockedUserId || e.userBId === blockedUserId)
    .map((e) => e.id);
  return { blockedUserId, exclusionIds };
}

export function buildDraw(input: DrawInput): DrawResult {
  const {
    participants,
    exclusions,
    avoidPairs = [],
    rng = Math.random,
    budget = DEFAULT_BUDGET,
  } = input;

  if (participants.length < DRAW_MIN_PARTICIPANTS) {
    return {
      kind: 'TOO_FEW',
      have: participants.length,
      need: DRAW_MIN_PARTICIPANTS,
    };
  }

  const relevantExclusions = exclusions.filter(
    (e) => participants.includes(e.userAId) && participants.includes(e.userBId),
  );

  const toResult = (cycle: string[], repeats: DrawRepeats): DrawResult => ({
    kind: 'ok',
    cycle,
    assignments: cycle.map((gifterId, i) => ({
      gifterId,
      gifteeId: cycle[(i + 1) % cycle.length]!,
    })),
    repeats,
  });

  if (avoidPairs.length > 0) {
    const strict = findCycle(
      participants,
      buildForbidden(participants, relevantExclusions, avoidPairs),
      rng,
      budget,
    );
    if (strict) return toResult(strict, 'NONE');
  }

  const relaxed = findCycle(
    participants,
    buildForbidden(participants, relevantExclusions, []),
    rng,
    budget,
  );
  if (relaxed) {
    return toResult(relaxed, avoidPairs.length > 0 ? 'SOME' : 'NOT_APPLICABLE');
  }

  return { kind: 'INFEASIBLE', ...diagnose(participants, relevantExclusions) };
}
