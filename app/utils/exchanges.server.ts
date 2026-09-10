// Exchanges — the deep module. Routes and UI call ONLY the exported functions
// here; audience selection, authorization, lifecycle guards, the draw, and
// every secrecy decision live inside.
//
// SECRECY INVARIANT (the whole point of the product):
//   - `ExchangeAssignment` rows leave the database only through
//     `getOwnAssignment` (the viewer's own live row) and `getRevealedLoop`
//     (only when status = REVEALED — a SECRET_FOREVER exchange finishes as
//     FINISHED and never yields a loop).
//   - `getViewerProjection` is the ONLY thing a page loader calls. Its
//     organizer panel is exchange-wide totals: no per-person figure, no list of
//     who is behind, nothing that can be inverted into a pairing.
//   - Every denial (non-member, nonexistent, cancelled-and-not-yours) is one
//     404 body. A 403 would confirm the exchange exists.
//   - Nothing about the draw is optimistic: the loop exists in the database
//     before anyone is told anything.
import { type Prisma } from '@prisma/client';
import * as Sentry from '@sentry/react-router';
import { data } from 'react-router';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  AUTO_REVEAL_DEFAULT_DAYS,
  CANCEL_REASON,
  EXCHANGE_MIN_PARTICIPANTS,
  EXCHANGE_STATUS,
  EXCHANGE_TITLE_MAX_LENGTH,
  GIFT_OUTCOME,
  GIFT_STAGE,
  PARTICIPANT_STATUS,
  REVEAL_MODE,
  SPENDING_GUIDELINE_MAX_LENGTH,
  getExchangeStage,
  type CancelReason,
  type ExchangeStage,
  type ExchangeStatus,
  type GiftOutcome,
  type GiftStage,
  type ParticipantStatus,
  type RevealMode,
} from '#app/utils/exchange-constants.ts';
import { hasCalendarDayArrived } from '#app/utils/exchange-dates.ts';
import {
  buildDraw,
  type DrawRepeats,
  type DrawResult,
} from '#app/utils/exchange-draw.ts';
import {
  queueExchangeCancelled,
  queueExchangeNamesDrawn,
  queueExchangeRevealed,
  queueExchangeStarted,
} from '#app/utils/exchange-notifications.server.ts';
import { canViewWishlistOf } from '#app/utils/friends.server.ts';
import { OCCASION_TYPE, type OccasionType } from '#app/utils/pool-constants.ts';

// ─── Lifecycle guard ──────────────────────────────────────────────────────────

// Forward-only lifecycle. For each status, the statuses an exchange may be in
// for a transition INTO it to be valid. REVEALED, FINISHED and CANCELLED are
// terminal; a re-draw is not a transition (cancel and start again).
export const EXCHANGE_STATUS_PREDECESSORS: Record<
  ExchangeStatus,
  ExchangeStatus[]
> = {
  GATHERING: [],
  DRAWN: [EXCHANGE_STATUS.GATHERING],
  REVEALED: [EXCHANGE_STATUS.DRAWN],
  FINISHED: [EXCHANGE_STATUS.DRAWN],
  CANCELLED: [EXCHANGE_STATUS.GATHERING, EXCHANGE_STATUS.DRAWN],
};

export function assertExchangeStatus(
  exchange: { status: string },
  allowed: ExchangeStatus[],
): void {
  if (!allowed.includes(exchange.status as ExchangeStatus)) {
    throw data(
      {
        error: `This action isn't available while the exchange is ${exchange.status.toLowerCase()}.`,
      },
      { status: 409 },
    );
  }
}

const notFound = () => data({ error: 'Exchange not found.' }, { status: 404 });

// ─── Shapes ───────────────────────────────────────────────────────────────────

const personSelect = {
  id: true,
  username: true,
  name: true,
  image: { select: { id: true, altText: true } },
} as const;

export type ExchangePerson = {
  id: string;
  username: string;
  name: string | null;
  image: { id: string; altText: string | null } | null;
};

// The base select. Deliberately contains NO `assignments` relation.
const exchangeSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  title: true,
  occasionType: true,
  eventDate: true,
  spendingGuideline: true,
  status: true,
  revealMode: true,
  autoRevealAt: true,
  avoidRepeatsLookback: true,
  giftGroupId: true,
  organizerId: true,
  inviteCode: true,
  drawnAt: true,
  revealedAt: true,
  cancelledAt: true,
  cancelReason: true,
  giftGroup: { select: { id: true, name: true } },
  organizer: { select: personSelect },
} as const;

type ExchangeRow = Prisma.ExchangeGetPayload<{ select: typeof exchangeSelect }>;

// The shared client or an interactive-transaction handle. Reads that happen
// INSIDE a write transaction must go through the handle: SQLite has a single
// writer, so a read on another connection waits on the transaction's own lock
// until Prisma's 5s timeout (this failed 12 tests on CI before it was caught).
type Db = Prisma.TransactionClient | typeof prisma;

export type ViewerRole = 'ORGANIZER' | 'PARTICIPANT' | 'MEMBER';

export type RosterEntry = {
  user: ExchangePerson;
  status: ParticipantStatus;
  isOrganizer: boolean;
};

export type DrawPreview =
  | {
      kind: 'ok';
      participantCount: number;
      names: string[];
      repeats: DrawRepeats;
    }
  | { kind: 'TOO_FEW'; have: number; need: number }
  | {
      kind: 'INFEASIBLE';
      blockedUserId: string;
      blockedName: string;
      exclusions: Array<{ id: string; aName: string; bName: string }>;
    };

export type ExchangeExclusionView = {
  id: string;
  userA: ExchangePerson;
  userB: ExchangePerson;
};

// Totals only, across the whole exchange. Adding any array or id here is a
// secrecy regression — see the property test.
export type ExchangeOrganizerProgress = {
  total: number;
  haveGift: number;
  wrapped: number;
  given: number;
  received: number;
};

export type OwnAssignmentView = {
  id: string;
  giftee: ExchangePerson;
  giftStage: GiftStage;
  giftStageAt: Date | null;
  giftLabel: string | null;
  wishlistItemCount: number;
  canViewWishlist: boolean;
};

export type RevealedPair = {
  gifter: ExchangePerson;
  giftee: ExchangePerson;
  giftLabel: string | null;
  outcome: GiftOutcome | null;
};

export type ExchangeView = {
  exchange: {
    id: string;
    title: string;
    occasionType: OccasionType;
    eventDate: Date;
    spendingGuideline: string | null;
    status: ExchangeStatus;
    stage: ExchangeStage;
    revealMode: RevealMode;
    autoRevealAt: Date | null;
    avoidRepeatsLookback: number | null;
    giftGroup: { id: string; name: string } | null;
    organizer: ExchangePerson;
    drawnAt: Date | null;
    revealedAt: Date | null;
    cancelledAt: Date | null;
    cancelReason: CancelReason | null;
    // Organizer only; null for everyone else.
    inviteCode: string | null;
  };
  viewer: {
    id: string;
    role: ViewerRole;
    participation: ParticipantStatus | null;
    dismissedJoinPrompt: boolean;
  };
  roster: RosterEntry[];
  counts: { in: number; pending: number; out: number };
  exclusionCount: number;
  // Organizer only, while GATHERING.
  exclusions: ExchangeExclusionView[] | null;
  draw: DrawPreview | null;
  // Live participants only, from DRAWN onwards.
  you: {
    assignment: OwnAssignmentView | null;
    covered: boolean;
    received: { receivedAt: Date; outcome: GiftOutcome | null } | null;
  } | null;
  // Organizer only, from DRAWN onwards.
  progress: ExchangeOrganizerProgress | null;
  // REVEALED only.
  loop: RevealedPair[] | null;
  yourGifter: ExchangePerson | null;
};

// ─── Visibility ───────────────────────────────────────────────────────────────

async function isCurrentGroupMember(
  userId: string,
  giftGroupId: string | null,
): Promise<boolean> {
  if (!giftGroupId) return false;
  const row = await prisma.usersInGiftGroups.findUnique({
    where: { userId_giftGroupId: { userId, giftGroupId } },
    select: { userId: true },
  });
  return row !== null;
}

// The single denial seam. Visible iff organizer, participant row of any
// status, or current member of the linked group. Everything else — including
// "this exchange does not exist" — is the same 404.
export async function requireExchangeVisible(
  viewerId: string,
  exchangeId: string,
): Promise<ExchangeRow> {
  const exchange = await prisma.exchange.findUnique({
    where: { id: exchangeId },
    select: exchangeSelect,
  });
  if (!exchange) throw notFound();
  if (exchange.organizerId === viewerId) return exchange;
  const participant = await prisma.exchangeParticipant.findUnique({
    where: { exchangeId_userId: { exchangeId, userId: viewerId } },
    select: { id: true },
  });
  if (participant) return exchange;
  if (await isCurrentGroupMember(viewerId, exchange.giftGroupId)) {
    return exchange;
  }
  throw notFound();
}

export function isExchangeOrganizer(
  userId: string,
  exchange: { organizerId: string },
): boolean {
  return exchange.organizerId === userId;
}

// 403 is acceptable here: the caller has already passed `requireExchangeVisible`.
export function requireExchangeOrganizer(
  userId: string,
  exchange: { organizerId: string },
): void {
  if (!isExchangeOrganizer(userId, exchange)) {
    throw data({ error: 'Only the organizer can do this.' }, { status: 403 });
  }
}

async function requireLiveParticipant(
  exchangeId: string,
  userId: string,
): Promise<void> {
  const row = await prisma.exchangeParticipant.findUnique({
    where: { exchangeId_userId: { exchangeId, userId } },
    select: { status: true },
  });
  if (row?.status !== PARTICIPANT_STATUS.IN) {
    throw data({ error: "You're not in this exchange." }, { status: 403 });
  }
}

// ─── Assignment access (the only two doors) ───────────────────────────────────

const assignmentSelect = {
  id: true,
  gifterId: true,
  gifteeId: true,
  giftStage: true,
  giftStageAt: true,
  giftLabel: true,
  receivedAt: true,
  outcome: true,
  giftee: { select: personSelect },
  gifter: { select: personSelect },
} as const;

export async function getOwnAssignment(exchangeId: string, viewerId: string) {
  return prisma.exchangeAssignment.findFirst({
    where: { exchangeId, gifterId: viewerId, supersededAt: null },
    select: assignmentSelect,
  });
}

// Throws unless the exchange is REVEALED. FINISHED (secret forever) never
// returns pairings, by design.
export async function getRevealedLoop(exchangeId: string) {
  const exchange = await prisma.exchange.findUnique({
    where: { id: exchangeId },
    select: { status: true },
  });
  if (exchange?.status !== EXCHANGE_STATUS.REVEALED) {
    throw new Error(
      'Pairings are only readable once the exchange is revealed.',
    );
  }
  return prisma.exchangeAssignment.findMany({
    where: { exchangeId, supersededAt: null },
    select: assignmentSelect,
    orderBy: { createdAt: 'asc' },
  });
}

// ─── Roster ───────────────────────────────────────────────────────────────────

async function loadRoster(exchange: ExchangeRow): Promise<RosterEntry[]> {
  const rows = await prisma.exchangeParticipant.findMany({
    where: { exchangeId: exchange.id },
    select: { userId: true, status: true, user: { select: personSelect } },
    orderBy: { createdAt: 'asc' },
  });
  const byUser = new Map(rows.map((r) => [r.userId, r]));
  const entries: RosterEntry[] = rows.map((r) => ({
    user: r.user,
    status: r.status as ParticipantStatus,
    isOrganizer: r.userId === exchange.organizerId,
  }));
  // Group members who joined the group after the exchange was created have no
  // row yet; while gathering they still belong on the roster as "deciding".
  if (exchange.giftGroupId && exchange.status === EXCHANGE_STATUS.GATHERING) {
    const members = await prisma.usersInGiftGroups.findMany({
      where: { giftGroupId: exchange.giftGroupId },
      select: { user: { select: personSelect } },
    });
    for (const m of members) {
      if (!byUser.has(m.user.id)) {
        entries.push({
          user: m.user,
          status: PARTICIPANT_STATUS.PENDING,
          isOrganizer: false,
        });
      }
    }
  }
  // Organizer first, then IN, then PENDING, then OUT.
  const rank: Record<ParticipantStatus, number> = { IN: 0, PENDING: 1, OUT: 2 };
  return entries.sort(
    (a, b) =>
      Number(b.isOrganizer) - Number(a.isOrganizer) ||
      rank[a.status] - rank[b.status],
  );
}

function displayName(p: ExchangePerson): string {
  return p.name ?? p.username;
}

// ─── Draw preview ─────────────────────────────────────────────────────────────

async function loadLookbackPairs(
  exchange: Pick<ExchangeRow, 'id' | 'giftGroupId' | 'avoidRepeatsLookback'>,
  db: Db = prisma,
): Promise<Array<[string, string]>> {
  if (!exchange.giftGroupId || !exchange.avoidRepeatsLookback) return [];
  const previous = await db.exchange.findMany({
    where: {
      giftGroupId: exchange.giftGroupId,
      id: { not: exchange.id },
      drawnAt: { not: null },
      status: {
        in: [
          EXCHANGE_STATUS.DRAWN,
          EXCHANGE_STATUS.REVEALED,
          EXCHANGE_STATUS.FINISHED,
        ],
      },
    },
    orderBy: { drawnAt: 'desc' },
    take: exchange.avoidRepeatsLookback,
    select: { id: true },
  });
  if (previous.length === 0) return [];
  const pairs = await db.exchangeAssignment.findMany({
    where: {
      exchangeId: { in: previous.map((p) => p.id) },
      supersededAt: null,
    },
    select: { gifterId: true, gifteeId: true },
  });
  return pairs.map((p) => [p.gifterId, p.gifteeId]);
}

async function computeDraw(
  exchange: ExchangeRow,
  roster: RosterEntry[],
  rng?: () => number,
  db: Db = prisma,
): Promise<{ result: DrawResult; preview: DrawPreview }> {
  const inRoster = roster.filter((r) => r.status === PARTICIPANT_STATUS.IN);
  const participants = inRoster.map((r) => r.user.id);
  const exclusions = await db.exchangeExclusion.findMany({
    where: { exchangeId: exchange.id },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      userA: { select: personSelect },
      userB: { select: personSelect },
    },
  });
  const avoidPairs = await loadLookbackPairs(exchange, db);
  const result = buildDraw({ participants, exclusions, avoidPairs, rng });
  const nameOf = (id: string) => {
    const entry = roster.find((r) => r.user.id === id);
    return entry ? displayName(entry.user) : 'Someone';
  };
  let preview: DrawPreview;
  switch (result.kind) {
    case 'ok':
      preview = {
        kind: 'ok',
        participantCount: participants.length,
        names: inRoster.map((r) => displayName(r.user)),
        repeats: result.repeats,
      };
      break;
    case 'TOO_FEW':
      preview = result;
      break;
    case 'INFEASIBLE':
      preview = {
        kind: 'INFEASIBLE',
        blockedUserId: result.blockedUserId,
        blockedName: nameOf(result.blockedUserId),
        exclusions: exclusions
          .filter((e) => result.exclusionIds.includes(e.id))
          .map((e) => ({
            id: e.id,
            aName: displayName(e.userA),
            bName: displayName(e.userB),
          })),
      };
      break;
  }
  return { result, preview };
}

// Computed server-side before the confirmation opens, so the repeats sentence
// is a fact about the graph, never a guess.
export async function previewDraw({
  exchangeId,
  actorId,
}: {
  exchangeId: string;
  actorId: string;
}): Promise<DrawPreview> {
  const exchange = await requireExchangeVisible(actorId, exchangeId);
  requireExchangeOrganizer(actorId, exchange);
  assertExchangeStatus(exchange, [EXCHANGE_STATUS.GATHERING]);
  const roster = await loadRoster(exchange);
  return (await computeDraw(exchange, roster)).preview;
}

// ─── Create / settings ────────────────────────────────────────────────────────

export type CreateExchangeInput = {
  organizerId: string;
  title: string;
  occasionType?: OccasionType;
  eventDate: Date;
  spendingGuideline?: string | null;
  giftGroupId?: string | null;
  revealMode?: RevealMode;
  // undefined → default (eventDate + 3 days); null → auto-reveal off.
  autoRevealAt?: Date | null;
  // undefined → default 2 for group exchanges; null → off. Ignored for standalone.
  avoidRepeatsLookback?: number | null;
  exclusions?: Array<[string, string]>;
  now?: Date;
};

function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function defaultAutoRevealAt(eventDate: Date): Date {
  return new Date(eventDate.getTime() + AUTO_REVEAL_DEFAULT_DAYS * DAY_MS);
}

function validationError(message: string) {
  return data({ error: message }, { status: 400 });
}

export async function createExchange(
  input: CreateExchangeInput,
): Promise<{ id: string }> {
  const now = input.now ?? new Date();
  const title = input.title.trim();
  if (!title || title.length > EXCHANGE_TITLE_MAX_LENGTH) {
    throw validationError('Give the exchange a name.');
  }
  if (
    !(input.eventDate instanceof Date) ||
    Number.isNaN(input.eventDate.getTime())
  ) {
    throw validationError('Pick an exchange date.');
  }
  if (input.eventDate <= now) {
    throw validationError('The exchange date needs to be in the future.');
  }
  const spendingGuideline = input.spendingGuideline?.trim() || null;
  if (
    spendingGuideline &&
    spendingGuideline.length > SPENDING_GUIDELINE_MAX_LENGTH
  ) {
    throw validationError('Keep the spending guideline short.');
  }
  const occasionType: OccasionType =
    input.occasionType && input.occasionType in OCCASION_TYPE
      ? input.occasionType
      : OCCASION_TYPE.OTHER;
  const revealMode = input.revealMode ?? REVEAL_MODE.ORGANIZER;
  const autoRevealAt =
    input.autoRevealAt === undefined
      ? defaultAutoRevealAt(input.eventDate)
      : input.autoRevealAt;
  if (autoRevealAt && autoRevealAt < input.eventDate) {
    throw validationError(
      'Auto-reveal has to be on or after the exchange date.',
    );
  }
  const giftGroupId = input.giftGroupId ?? null;

  let memberIds: string[] = [];
  if (giftGroupId) {
    const members = await prisma.usersInGiftGroups.findMany({
      where: { giftGroupId },
      select: { userId: true },
    });
    memberIds = members.map((m) => m.userId);
    if (!memberIds.includes(input.organizerId)) {
      throw data({ error: 'Group not found.' }, { status: 404 });
    }
  }
  const avoidRepeatsLookback = giftGroupId
    ? input.avoidRepeatsLookback === undefined
      ? 2
      : input.avoidRepeatsLookback
    : null;

  const eligible = new Set(giftGroupId ? memberIds : [input.organizerId]);
  const exclusionPairs = new Map<string, [string, string]>();
  for (const [a, b] of input.exclusions ?? []) {
    if (a === b || !eligible.has(a) || !eligible.has(b)) {
      throw validationError('Exclusions can only name people in the group.');
    }
    const pair = canonicalPair(a, b);
    exclusionPairs.set(pair.join(' '), pair);
  }

  const exchange = await prisma.$transaction(async (tx) => {
    const created = await tx.exchange.create({
      data: {
        title,
        occasionType,
        eventDate: input.eventDate,
        spendingGuideline,
        revealMode,
        autoRevealAt,
        avoidRepeatsLookback,
        giftGroupId,
        organizerId: input.organizerId,
      },
      select: { id: true },
    });
    await tx.exchangeParticipant.createMany({
      data: [
        {
          exchangeId: created.id,
          userId: input.organizerId,
          status: PARTICIPANT_STATUS.IN,
          joinedAt: now,
        },
        ...memberIds
          .filter((id) => id !== input.organizerId)
          .map((userId) => ({
            exchangeId: created.id,
            userId,
            status: PARTICIPANT_STATUS.PENDING,
          })),
      ],
    });
    if (exclusionPairs.size > 0) {
      await tx.exchangeExclusion.createMany({
        data: [...exclusionPairs.values()].map(([userAId, userBId]) => ({
          exchangeId: created.id,
          userAId,
          userBId,
        })),
      });
    }
    return created;
  });

  if (giftGroupId) queueExchangeStarted(exchange.id);

  queueLogEvent({
    name: 'exchange_created',
    userId: input.organizerId,
    source: 'server',
    properties: {
      exchangeId: exchange.id,
      hasGroup: giftGroupId != null,
      revealMode,
      autoReveal: autoRevealAt != null,
      lookback: avoidRepeatsLookback,
      exclusionCount: exclusionPairs.size,
      occasionType,
    },
  });

  return exchange;
}

export type UpdateExchangeSettingsInput = {
  title?: string;
  occasionType?: OccasionType;
  eventDate?: Date;
  spendingGuideline?: string | null;
  revealMode?: RevealMode;
  autoRevealAt?: Date | null;
  avoidRepeatsLookback?: number | null;
};

// Everything is editable while GATHERING. After the draw only the auto-reveal
// date may change (the organizer may realise mid-way they want a deadline, or
// none) — reveal mode is locked because it changes what the reveal means.
export async function updateExchangeSettings({
  exchangeId,
  actorId,
  patch,
  now = new Date(),
}: {
  exchangeId: string;
  actorId: string;
  patch: UpdateExchangeSettingsInput;
  now?: Date;
}): Promise<void> {
  const exchange = await requireExchangeVisible(actorId, exchangeId);
  requireExchangeOrganizer(actorId, exchange);
  const onlyAutoReveal = Object.keys(patch).every((k) => k === 'autoRevealAt');
  assertExchangeStatus(
    exchange,
    onlyAutoReveal
      ? [EXCHANGE_STATUS.GATHERING, EXCHANGE_STATUS.DRAWN]
      : [EXCHANGE_STATUS.GATHERING],
  );

  const next: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title || title.length > EXCHANGE_TITLE_MAX_LENGTH) {
      throw validationError('Give the exchange a name.');
    }
    next.title = title;
  }
  if (patch.occasionType !== undefined) {
    next.occasionType =
      patch.occasionType in OCCASION_TYPE
        ? patch.occasionType
        : OCCASION_TYPE.OTHER;
  }
  const eventDate = patch.eventDate ?? exchange.eventDate;
  if (patch.eventDate !== undefined) {
    if (patch.eventDate <= now) {
      throw validationError('The exchange date needs to be in the future.');
    }
    next.eventDate = patch.eventDate;
    // The auto-reveal date rides along with the event date (same offset), so a
    // postponed exchange cannot reveal itself before the new date. An explicit
    // autoRevealAt in the same patch still wins below.
    if (exchange.autoRevealAt && patch.autoRevealAt === undefined) {
      const offset =
        exchange.autoRevealAt.getTime() - exchange.eventDate.getTime();
      next.autoRevealAt = new Date(patch.eventDate.getTime() + offset);
    }
  }
  if (patch.spendingGuideline !== undefined) {
    const guideline = patch.spendingGuideline?.trim() || null;
    if (guideline && guideline.length > SPENDING_GUIDELINE_MAX_LENGTH) {
      throw validationError('Keep the spending guideline short.');
    }
    next.spendingGuideline = guideline;
  }
  if (patch.revealMode !== undefined) next.revealMode = patch.revealMode;
  if (patch.autoRevealAt !== undefined) {
    if (patch.autoRevealAt && patch.autoRevealAt < eventDate) {
      throw validationError(
        'Auto-reveal has to be on or after the exchange date.',
      );
    }
    next.autoRevealAt = patch.autoRevealAt;
  }
  if (patch.avoidRepeatsLookback !== undefined) {
    next.avoidRepeatsLookback = exchange.giftGroupId
      ? patch.avoidRepeatsLookback
      : null;
  }
  if (Object.keys(next).length === 0) return;
  await prisma.exchange.update({ where: { id: exchangeId }, data: next });
}

// ─── Participation ────────────────────────────────────────────────────────────

export async function setParticipation({
  exchangeId,
  userId,
  status,
  now = new Date(),
}: {
  exchangeId: string;
  userId: string;
  status: 'IN' | 'OUT';
  now?: Date;
}): Promise<void> {
  const exchange = await requireExchangeVisible(userId, exchangeId);
  assertExchangeStatus(exchange, [EXCHANGE_STATUS.GATHERING]);
  if (userId === exchange.organizerId && status === PARTICIPANT_STATUS.OUT) {
    throw data(
      { error: 'The organizer draws a name like everyone else.' },
      { status: 400 },
    );
  }
  const timestamps =
    status === PARTICIPANT_STATUS.IN ? { joinedAt: now } : { leftAt: now };
  // The status is re-read inside the write transaction: SQLite serializes
  // writers, so a draw that commits first flips the status before this runs
  // and the recheck refuses — no roster change can land on a DRAWN exchange.
  const changed = await prisma.$transaction(async (tx) => {
    const current = await tx.exchange.findUnique({
      where: { id: exchangeId },
      select: { status: true, giftGroupId: true },
    });
    if (!current) throw notFound();
    assertExchangeStatus(current, [EXCHANGE_STATUS.GATHERING]);
    const existing = await tx.exchangeParticipant.findUnique({
      where: { exchangeId_userId: { exchangeId, userId } },
      select: { id: true, status: true },
    });
    // Standalone exchanges are joined by invite link only; someone with no row
    // there is not on the roster and cannot opt themselves in.
    if (!existing && !current.giftGroupId) throw notFound();
    if (existing?.status === status) return false;
    await tx.exchangeParticipant.upsert({
      where: { exchangeId_userId: { exchangeId, userId } },
      update: { status, ...timestamps },
      create: { exchangeId, userId, status, ...timestamps },
    });
    return true;
  });
  if (!changed) return;

  queueLogEvent({
    name:
      status === PARTICIPANT_STATUS.IN
        ? 'exchange_participant_opted_in'
        : 'exchange_participant_opted_out',
    userId,
    source: 'server',
    properties: { exchangeId },
  });
}

// ─── Exclusions ───────────────────────────────────────────────────────────────

export async function addExclusion({
  exchangeId,
  actorId,
  userAId,
  userBId,
}: {
  exchangeId: string;
  actorId: string;
  userAId: string;
  userBId: string;
}): Promise<void> {
  const exchange = await requireExchangeVisible(actorId, exchangeId);
  requireExchangeOrganizer(actorId, exchange);
  assertExchangeStatus(exchange, [EXCHANGE_STATUS.GATHERING]);
  if (userAId === userBId) {
    throw validationError('Pick two different people.');
  }
  const roster = await loadRoster(exchange);
  const onRoster = (id: string) => roster.some((r) => r.user.id === id);
  if (!onRoster(userAId) || !onRoster(userBId)) {
    throw validationError('Exclusions can only name people in the group.');
  }
  const [a, b] = canonicalPair(userAId, userBId);
  await prisma.$transaction(async (tx) => {
    const current = await tx.exchange.findUnique({
      where: { id: exchangeId },
      select: { status: true },
    });
    if (!current) throw notFound();
    assertExchangeStatus(current, [EXCHANGE_STATUS.GATHERING]);
    await tx.exchangeExclusion.upsert({
      where: {
        exchangeId_userAId_userBId: { exchangeId, userAId: a, userBId: b },
      },
      update: {},
      create: { exchangeId, userAId: a, userBId: b },
    });
  });
}

export async function removeExclusion({
  exchangeId,
  actorId,
  exclusionId,
}: {
  exchangeId: string;
  actorId: string;
  exclusionId: string;
}): Promise<void> {
  const exchange = await requireExchangeVisible(actorId, exchangeId);
  requireExchangeOrganizer(actorId, exchange);
  assertExchangeStatus(exchange, [EXCHANGE_STATUS.GATHERING]);
  await prisma.$transaction(async (tx) => {
    const current = await tx.exchange.findUnique({
      where: { id: exchangeId },
      select: { status: true },
    });
    if (!current) throw notFound();
    assertExchangeStatus(current, [EXCHANGE_STATUS.GATHERING]);
    await tx.exchangeExclusion.deleteMany({
      where: { id: exclusionId, exchangeId },
    });
  });
}

// ─── The draw ─────────────────────────────────────────────────────────────────

export type DrawNamesResult =
  | { status: 'DRAWN'; participantCount: number; repeats: DrawRepeats }
  | { status: 'BLOCKED'; preview: DrawPreview };

// The point of no return. Everything is re-checked inside one transaction:
// status, roster, exclusions, lookback — then the loop is written and the
// status flips in the same commit. Notifications fan out only after commit.
export async function drawNames({
  exchangeId,
  actorId,
  now = new Date(),
  rng,
}: {
  exchangeId: string;
  actorId: string;
  now?: Date;
  rng?: () => number;
}): Promise<DrawNamesResult> {
  const visible = await requireExchangeVisible(actorId, exchangeId);
  requireExchangeOrganizer(actorId, visible);
  assertExchangeStatus(visible, [EXCHANGE_STATUS.GATHERING]);

  const outcome = await prisma.$transaction(async (tx) => {
    const exchange = await tx.exchange.findUnique({
      where: { id: exchangeId },
      select: exchangeSelect,
    });
    if (!exchange) throw notFound();
    assertExchangeStatus(exchange, [EXCHANGE_STATUS.GATHERING]);

    const rows = await tx.exchangeParticipant.findMany({
      where: { exchangeId, status: PARTICIPANT_STATUS.IN },
      select: { userId: true, user: { select: personSelect } },
    });
    const roster: RosterEntry[] = rows.map((r) => ({
      user: r.user,
      status: PARTICIPANT_STATUS.IN,
      isOrganizer: r.userId === exchange.organizerId,
    }));
    // Every read goes through `tx`: a read on the shared client here would
    // queue behind this transaction's own write lock.
    const { result, preview } = await computeDraw(exchange, roster, rng, tx);
    if (result.kind !== 'ok') {
      return { status: 'BLOCKED' as const, preview };
    }
    await tx.exchangeAssignment.createMany({
      data: result.assignments.map((a) => ({
        exchangeId,
        gifterId: a.gifterId,
        gifteeId: a.gifteeId,
      })),
    });
    const updated = await tx.exchange.updateMany({
      where: { id: exchangeId, status: EXCHANGE_STATUS.GATHERING },
      data: { status: EXCHANGE_STATUS.DRAWN, drawnAt: now },
    });
    if (updated.count !== 1) {
      throw data({ error: 'Names were already drawn.' }, { status: 409 });
    }
    return {
      status: 'DRAWN' as const,
      participantCount: result.assignments.length,
      repeats: result.repeats,
    };
  });

  if (outcome.status === 'DRAWN') {
    queueExchangeNamesDrawn(exchangeId);
    queueLogEvent({
      name: 'exchange_drawn',
      userId: actorId,
      source: 'server',
      properties: {
        exchangeId,
        participantCount: outcome.participantCount,
        repeats: outcome.repeats,
      },
    });
    return {
      status: 'DRAWN',
      participantCount: outcome.participantCount,
      repeats: outcome.repeats,
    };
  }
  return outcome;
}

// ─── Gift progress ────────────────────────────────────────────────────────────

async function requireOwnLiveAssignment(exchangeId: string, userId: string) {
  const assignment = await getOwnAssignment(exchangeId, userId);
  if (!assignment) {
    throw data({ error: "You're not in this exchange." }, { status: 403 });
  }
  return assignment;
}

export async function setGiftStage({
  exchangeId,
  userId,
  stage,
  now = new Date(),
}: {
  exchangeId: string;
  userId: string;
  stage: GiftStage;
  now?: Date;
}): Promise<void> {
  const exchange = await requireExchangeVisible(userId, exchangeId);
  assertExchangeStatus(exchange, [EXCHANGE_STATUS.DRAWN]);
  if (!(stage in GIFT_STAGE)) throw validationError('Unknown gift stage.');
  const assignment = await requireOwnLiveAssignment(exchangeId, userId);
  await prisma.exchangeAssignment.update({
    where: { id: assignment.id },
    data: {
      giftStage: stage,
      giftStageAt: stage === GIFT_STAGE.NONE ? null : now,
    },
  });
  queueLogEvent({
    name: 'exchange_gift_stage_set',
    userId,
    source: 'server',
    properties: { exchangeId, stage },
  });
}

export async function setGiftLabel({
  exchangeId,
  userId,
  label,
}: {
  exchangeId: string;
  userId: string;
  label: string | null;
}): Promise<void> {
  const exchange = await requireExchangeVisible(userId, exchangeId);
  assertExchangeStatus(exchange, [
    EXCHANGE_STATUS.DRAWN,
    EXCHANGE_STATUS.REVEALED,
  ]);
  const trimmed = label?.trim() || null;
  if (trimmed && trimmed.length > 120) {
    throw validationError('Keep it to a short line.');
  }
  const assignment = await requireOwnLiveAssignment(exchangeId, userId);
  await prisma.exchangeAssignment.update({
    where: { id: assignment.id },
    data: { giftLabel: trimmed },
  });
}

// The giftee confirms on their side. Only from the exchange date onwards, and
// the gifter learns the outcome only after the reveal.
export async function setReceived({
  exchangeId,
  userId,
  outcome,
  now = new Date(),
  timeZone = 'UTC',
}: {
  exchangeId: string;
  userId: string;
  outcome: GiftOutcome;
  now?: Date;
  timeZone?: string;
}): Promise<void> {
  const exchange = await requireExchangeVisible(userId, exchangeId);
  assertExchangeStatus(exchange, [EXCHANGE_STATUS.DRAWN]);
  if (!(outcome in GIFT_OUTCOME)) throw validationError('Unknown outcome.');
  if (!hasCalendarDayArrived(exchange.eventDate, now, timeZone)) {
    throw data(
      { error: 'You can say how it landed from the exchange day onwards.' },
      { status: 409 },
    );
  }
  await requireLiveParticipant(exchangeId, userId);
  const updated = await prisma.exchangeAssignment.updateMany({
    where: { exchangeId, gifteeId: userId, supersededAt: null },
    data: { receivedAt: now, outcome },
  });
  if (updated.count === 0) {
    throw data({ error: "You're not in this exchange." }, { status: 403 });
  }
  queueLogEvent({
    name: 'exchange_received_set',
    userId,
    source: 'server',
    properties: { exchangeId, outcome },
  });
}

export async function markAssignmentViewed({
  exchangeId,
  userId,
  now = new Date(),
}: {
  exchangeId: string;
  userId: string;
  now?: Date;
}): Promise<void> {
  const exchange = await requireExchangeVisible(userId, exchangeId);
  assertExchangeStatus(exchange, [
    EXCHANGE_STATUS.DRAWN,
    EXCHANGE_STATUS.REVEALED,
    EXCHANGE_STATUS.FINISHED,
  ]);
  const updated = await prisma.exchangeParticipant.updateMany({
    where: {
      exchangeId,
      userId,
      status: PARTICIPANT_STATUS.IN,
      assignmentViewedAt: null,
    },
    data: { assignmentViewedAt: now },
  });
  if (updated.count === 1) {
    queueLogEvent({
      name: 'exchange_assignment_viewed',
      userId,
      source: 'server',
      properties: { exchangeId },
    });
  }
}

// ─── Reveal ───────────────────────────────────────────────────────────────────

export type RevealResult =
  | { status: 'REVEALED'; finalStatus: 'REVEALED' | 'FINISHED'; auto: boolean }
  | { status: 'ALREADY' }
  | { status: 'NOT_YET' };

// Manual and automatic reveals are the same operation with the same result, so
// nobody can tell whether the button was pressed or the date arrived.
export async function reveal({
  exchangeId,
  actorId,
  now = new Date(),
  timeZone = 'UTC',
}: {
  exchangeId: string;
  // 'SYSTEM' = the auto-reveal sweep.
  actorId: string | 'SYSTEM';
  now?: Date;
  // The acting organizer's zone. The exchange date is a calendar day, so
  // "has it arrived" has to be asked where the organizer is: comparing
  // instants against UTC midnight opens the reveal on the previous afternoon
  // west of UTC and holds it until late morning east of it.
  timeZone?: string;
}): Promise<RevealResult> {
  const exchange = await prisma.exchange.findUnique({
    where: { id: exchangeId },
    select: exchangeSelect,
  });
  if (!exchange) throw notFound();
  if (actorId !== 'SYSTEM') {
    await requireExchangeVisible(actorId, exchangeId);
    requireExchangeOrganizer(actorId, exchange);
  }
  // Nobody — not even the sweep — reveals before the exchange date. The sweep
  // selects by autoRevealAt, which is kept on or after eventDate, but a stale
  // value must fail closed rather than expose pairings early. The sweep uses
  // UTC, which is the strictest reading: it never fires early anywhere.
  if (!hasCalendarDayArrived(exchange.eventDate, now, timeZone)) {
    if (actorId === 'SYSTEM') return { status: 'NOT_YET' };
    throw data(
      { error: 'You can reveal from the exchange date onwards.' },
      { status: 409 },
    );
  }
  if (exchange.status !== EXCHANGE_STATUS.DRAWN) {
    if (
      exchange.status === EXCHANGE_STATUS.REVEALED ||
      exchange.status === EXCHANGE_STATUS.FINISHED
    ) {
      return { status: 'ALREADY' };
    }
    assertExchangeStatus(exchange, [EXCHANGE_STATUS.DRAWN]);
  }
  const finalStatus =
    exchange.revealMode === REVEAL_MODE.SECRET_FOREVER
      ? EXCHANGE_STATUS.FINISHED
      : EXCHANGE_STATUS.REVEALED;
  const updated = await prisma.exchange.updateMany({
    where: { id: exchangeId, status: EXCHANGE_STATUS.DRAWN },
    data: { status: finalStatus, revealedAt: now },
  });
  if (updated.count === 0) return { status: 'ALREADY' };

  const auto = actorId === 'SYSTEM';
  queueExchangeRevealed(exchangeId, finalStatus);
  queueLogEvent({
    name: 'exchange_revealed',
    userId: exchange.organizerId,
    source: 'server',
    properties: { exchangeId, auto, revealMode: exchange.revealMode },
  });
  return { status: 'REVEALED', finalStatus, auto };
}

export type AutoRevealSweepSummary = {
  considered: number;
  revealed: number;
  skipped: number;
  failed: number;
};

export async function runAutoRevealSweep({
  now = new Date(),
}: { now?: Date } = {}): Promise<AutoRevealSweepSummary> {
  const due = await prisma.exchange.findMany({
    where: { status: EXCHANGE_STATUS.DRAWN, autoRevealAt: { lte: now } },
    select: { id: true },
  });
  const summary: AutoRevealSweepSummary = {
    considered: due.length,
    revealed: 0,
    skipped: 0,
    failed: 0,
  };
  for (const { id } of due) {
    try {
      const result = await reveal({ exchangeId: id, actorId: 'SYSTEM', now });
      if (result.status === 'REVEALED') summary.revealed++;
      else summary.skipped++;
    } catch (error) {
      summary.failed++;
      Sentry.captureException(error, { extra: { exchangeId: id } });
    }
  }
  return summary;
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelExchange({
  exchangeId,
  actorId,
  reason = CANCEL_REASON.ORGANIZER,
  now = new Date(),
}: {
  exchangeId: string;
  actorId: string;
  reason?: CancelReason;
  now?: Date;
}): Promise<void> {
  const exchange = await requireExchangeVisible(actorId, exchangeId);
  requireExchangeOrganizer(actorId, exchange);
  assertExchangeStatus(exchange, EXCHANGE_STATUS_PREDECESSORS.CANCELLED);
  const updated = await prisma.exchange.updateMany({
    where: {
      id: exchangeId,
      status: { in: EXCHANGE_STATUS_PREDECESSORS.CANCELLED },
    },
    data: {
      status: EXCHANGE_STATUS.CANCELLED,
      cancelledAt: now,
      cancelReason: reason,
    },
  });
  if (updated.count === 0) {
    assertExchangeStatus(
      { status: EXCHANGE_STATUS.CANCELLED },
      EXCHANGE_STATUS_PREDECESSORS.CANCELLED,
    );
  }
  queueExchangeCancelled(exchangeId, {
    includePending: exchange.status === EXCHANGE_STATUS.GATHERING,
  });
  queueLogEvent({
    name: 'exchange_cancelled',
    userId: actorId,
    source: 'server',
    properties: { exchangeId, reason, fromStatus: exchange.status },
  });
}

// ─── Notes, clues and guesses ─────────────────────────────────────────────────

// Routes call only this module (AGENTS.md), so the notes half is re-exported
// here rather than imported directly. Implementation: exchange-notes.server.ts.
export {
  computeClueCandidates,
  getNoteThreads,
  getOwnGuess,
  runNoteDeliverySweep,
  sendNote,
  setGuess,
  type ClueCandidate,
  type GuessView,
  type NoteThreads,
  type NoteView,
  type NoteDeliverySweepSummary,
} from './exchange-notes.server.ts';

// ─── Account deletion ─────────────────────────────────────────────────────────

export type ExchangeAccountDeletionSummary = {
  spliced: string[];
  cancelled: Array<{ exchangeId: string; includePending: boolean }>;
  reassigned: string[];
};

// Every exchange foreign key to User cascades, so a bare `prisma.user.delete`
// takes the leaver's assignment rows with it and leaves a broken loop: their
// gifter has no one to give to, and the person who was gifting to them has no
// record at all. Worse, `Exchange.organizerId` cascades too — an organizer
// deleting their account would delete the whole exchange out from under the
// group, finished ones included.
//
// Runs inside the CALLER's transaction, alongside the `user.delete` itself, so
// a deletion that fails on some other constraint can't leave the exchange
// half-detached with the account still present. Every read therefore goes
// through `db` — a read on the shared client here would queue behind that
// transaction's own write lock until Prisma times out. Notifications are
// returned rather than sent: fan out with `announceExchangeAccountDeletion`
// once the transaction has committed.
//
// Deliberately not handled: REVEALED and FINISHED exchanges keep the gap. The
// pairing genuinely involved someone who no longer exists, and inventing a
// replacement would put a gift in someone's history they never gave. The loop
// walker in `getViewerProjection` already tolerates a missing link.
//
// No notification reaches the two people whose person changes: the types for
// that (`EXCHANGE_YOUR_PERSON_CHANGED` / `EXCHANGE_NEW_GIFTER`) arrive with
// Phase C's `leaveAfterDraw`, which should reuse `spliceOutParticipant` and
// add the fan-out in one place.
export async function prepareExchangesForAccountDeletion({
  userId,
  db,
  now = new Date(),
}: {
  userId: string;
  db: Db;
  now?: Date;
}): Promise<ExchangeAccountDeletionSummary> {
  const summary: ExchangeAccountDeletionSummary = {
    spliced: [],
    cancelled: [],
    reassigned: [],
  };

  // 1. Live loops the user is part of.
  const live = await db.exchangeAssignment.findMany({
    where: {
      supersededAt: null,
      exchange: { status: EXCHANGE_STATUS.DRAWN },
      OR: [{ gifterId: userId }, { gifteeId: userId }],
    },
    select: { exchangeId: true },
  });
  for (const exchangeId of new Set(live.map((l) => l.exchangeId))) {
    const outcome = await spliceOutParticipant({
      exchangeId,
      userId,
      now,
      db,
    });
    if (outcome === 'SPLICED') summary.spliced.push(exchangeId);
    if (outcome !== 'SPLICED' && outcome !== 'SKIPPED') {
      summary.cancelled.push({ exchangeId, includePending: false });
    }
  }

  // 2. Exchanges they organize, at any status — including terminal ones, whose
  // record belongs to the group rather than to the departing account.
  const organized = await db.exchange.findMany({
    where: { organizerId: userId },
    select: { id: true, status: true },
  });
  for (const { id, status } of organized) {
    // Someone who has actually joined. A PENDING member hasn't agreed to be
    // in the exchange, let alone to run it, so they are not an heir.
    const heir = await db.exchangeParticipant.findFirst({
      where: {
        exchangeId: id,
        userId: { not: userId },
        status: PARTICIPANT_STATUS.IN,
      },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    if (heir) {
      await db.exchange.update({
        where: { id },
        data: { organizerId: heir.userId },
      });
      summary.reassigned.push(id);
      continue;
    }
    // Nobody has joined yet. There is no one to hand a running exchange to,
    // and promoting a PENDING member would either conscript them into an
    // exchange they never accepted or leave them organizing a page with no
    // Join control. A gathering exchange nobody joined is worth less than
    // either, so let the cascade take it.
    if (
      status !== EXCHANGE_STATUS.REVEALED &&
      status !== EXCHANGE_STATUS.FINISHED &&
      status !== EXCHANGE_STATUS.CANCELLED
    ) {
      continue;
    }
    // A finished exchange is a record, not a running thing: it has no controls
    // for an heir to be unable to reach, so anyone still on the roster can
    // hold it and keep the year in the group's history.
    const keeper = await db.exchangeParticipant.findFirst({
      where: { exchangeId: id, userId: { not: userId } },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    if (!keeper) continue; // Nobody to keep it for; let the cascade take it.
    await db.exchange.update({
      where: { id },
      data: { organizerId: keeper.userId },
    });
    summary.reassigned.push(id);
  }

  return summary;
}

// Fan out what the deletion decided, AFTER its transaction has committed.
export function announceExchangeAccountDeletion(
  summary: ExchangeAccountDeletionSummary,
): void {
  for (const { exchangeId, includePending } of summary.cancelled) {
    queueExchangeCancelled(exchangeId, { includePending });
  }
}

// Removes one participant from a DRAWN loop by joining their gifter straight
// to their giftee (A→X→B becomes A→B), retiring the two rows rather than
// rewriting them so the record of the original draw survives. Cancels instead
// when too few people would be left, or when the join would pair two people
// who are excluded from each other.
async function spliceOutParticipant({
  exchangeId,
  userId,
  now,
  db,
}: {
  exchangeId: string;
  userId: string;
  now: Date;
  db: Db;
}): Promise<
  'SPLICED' | 'CANCELLED_TOO_FEW' | 'CANCELLED_EXCLUSIONS' | 'SKIPPED'
> {
  const exchange = await db.exchange.findUnique({
    where: { id: exchangeId },
    select: { id: true, status: true },
  });
  if (exchange?.status !== EXCHANGE_STATUS.DRAWN) return 'SKIPPED';

  const cancel = async (reason: CancelReason) => {
    await db.exchange.updateMany({
      where: { id: exchangeId, status: EXCHANGE_STATUS.DRAWN },
      data: {
        status: EXCHANGE_STATUS.CANCELLED,
        cancelledAt: now,
        cancelReason: reason,
      },
    });
  };

  const remaining = await db.exchangeParticipant.count({
    where: {
      exchangeId,
      userId: { not: userId },
      status: PARTICIPANT_STATUS.IN,
    },
  });
  if (remaining < EXCHANGE_MIN_PARTICIPANTS) {
    await cancel(CANCEL_REASON.TOO_FEW_AFTER_LEAVE);
    return 'CANCELLED_TOO_FEW';
  }

  const [outgoing, incoming] = await Promise.all([
    db.exchangeAssignment.findFirst({
      where: { exchangeId, gifterId: userId, supersededAt: null },
      select: { id: true, gifteeId: true },
    }),
    db.exchangeAssignment.findFirst({
      where: { exchangeId, gifteeId: userId, supersededAt: null },
      select: { id: true, gifterId: true },
    }),
  ]);
  if (!outgoing || !incoming) return 'SKIPPED';
  // A two-person cycle can't be spliced into anything; the count above should
  // have cancelled first, so this is belt and braces.
  if (incoming.gifterId === outgoing.gifteeId) return 'SKIPPED';

  // Exclusions are hard and symmetric. Closing the loop over the departing
  // person can land exactly on an excluded pair (A→X→B where A and B asked
  // not to draw each other), and the remaining path admits no other closure —
  // so the honest move is to stop, not to pair them quietly.
  const [lowId, highId] = canonicalPair(incoming.gifterId, outgoing.gifteeId);
  const excluded = await db.exchangeExclusion.findFirst({
    where: { exchangeId, userAId: lowId, userBId: highId },
    select: { id: true },
  });
  if (excluded) {
    await cancel(CANCEL_REASON.EXCLUSIONS_AFTER_LEAVE);
    return 'CANCELLED_EXCLUSIONS';
  }

  await db.exchangeAssignment.updateMany({
    where: { id: { in: [outgoing.id, incoming.id] } },
    data: { supersededAt: now },
  });
  await db.exchangeAssignment.create({
    data: {
      exchangeId,
      gifterId: incoming.gifterId,
      gifteeId: outgoing.gifteeId,
    },
  });
  return 'SPLICED';
}

// ─── Join prompt ──────────────────────────────────────────────────────────────

export async function dismissJoinPrompt({
  exchangeId,
  userId,
}: {
  exchangeId: string;
  userId: string;
}): Promise<void> {
  await requireExchangeVisible(userId, exchangeId);
  await prisma.exchangeJoinPromptDismissal.upsert({
    where: { exchangeId_userId: { exchangeId, userId } },
    update: {},
    create: { exchangeId, userId },
  });
  queueLogEvent({
    name: 'exchange_join_prompt_dismissed',
    userId,
    source: 'server',
    properties: { exchangeId },
  });
}

// ─── The projection (the only thing a page loader calls) ──────────────────────

export async function getViewerProjection({
  exchangeId,
  viewerId,
  now = new Date(),
  timeZone = 'UTC',
}: {
  exchangeId: string;
  viewerId: string;
  now?: Date;
  timeZone?: string;
}): Promise<ExchangeView> {
  const exchange = await requireExchangeVisible(viewerId, exchangeId);
  const isOrganizer = exchange.organizerId === viewerId;
  const roster = await loadRoster(exchange);
  const mine = roster.find((r) => r.user.id === viewerId);
  const participation = mine?.status ?? null;
  const isLive = participation === PARTICIPANT_STATUS.IN;
  const role: ViewerRole = isOrganizer
    ? 'ORGANIZER'
    : isLive
      ? 'PARTICIPANT'
      : 'MEMBER';
  const status = exchange.status as ExchangeStatus;
  const gathering = status === EXCHANGE_STATUS.GATHERING;
  const drawnOrLater =
    status === EXCHANGE_STATUS.DRAWN ||
    status === EXCHANGE_STATUS.REVEALED ||
    status === EXCHANGE_STATUS.FINISHED;

  const counts = {
    in: roster.filter((r) => r.status === PARTICIPANT_STATUS.IN).length,
    pending: roster.filter((r) => r.status === PARTICIPANT_STATUS.PENDING)
      .length,
    out: roster.filter((r) => r.status === PARTICIPANT_STATUS.OUT).length,
  };

  const [exclusionCount, dismissal] = await Promise.all([
    prisma.exchangeExclusion.count({ where: { exchangeId } }),
    prisma.exchangeJoinPromptDismissal.findUnique({
      where: { exchangeId_userId: { exchangeId, userId: viewerId } },
      select: { exchangeId: true },
    }),
  ]);

  let exclusions: ExchangeExclusionView[] | null = null;
  let draw: DrawPreview | null = null;
  if (isOrganizer && gathering) {
    const rows = await prisma.exchangeExclusion.findMany({
      where: { exchangeId },
      select: {
        id: true,
        userA: { select: personSelect },
        userB: { select: personSelect },
      },
      orderBy: { createdAt: 'asc' },
    });
    exclusions = rows;
    draw = (await computeDraw(exchange, roster)).preview;
  }

  let you: ExchangeView['you'] = null;
  if (isLive && drawnOrLater) {
    const [assignment, inbound, participantRow] = await Promise.all([
      getOwnAssignment(exchangeId, viewerId),
      prisma.exchangeAssignment.findFirst({
        where: { exchangeId, gifteeId: viewerId, supersededAt: null },
        // Only the giftee-owned fields. Never the gifter.
        select: { receivedAt: true, outcome: true },
      }),
      prisma.exchangeParticipant.findUnique({
        where: { exchangeId_userId: { exchangeId, userId: viewerId } },
        select: { assignmentViewedAt: true },
      }),
    ]);
    let assignmentView: OwnAssignmentView | null = null;
    if (assignment) {
      const [wishlistItemCount, canViewWishlist] = await Promise.all([
        prisma.wishlistItem.count({
          where: { ownerId: assignment.gifteeId, status: 'ACTIVE' },
        }),
        canViewWishlistOf(viewerId, assignment.gifteeId),
      ]);
      assignmentView = {
        id: assignment.id,
        giftee: assignment.giftee,
        giftStage: assignment.giftStage as GiftStage,
        giftStageAt: assignment.giftStageAt,
        giftLabel: assignment.giftLabel,
        wishlistItemCount,
        canViewWishlist,
      };
    }
    you = {
      assignment: assignmentView,
      covered: participantRow?.assignmentViewedAt == null,
      received: inbound?.receivedAt
        ? {
            receivedAt: inbound.receivedAt,
            outcome: (inbound.outcome as GiftOutcome | null) ?? null,
          }
        : null,
    };
  }

  let progress: ExchangeOrganizerProgress | null = null;
  if (isOrganizer && drawnOrLater) {
    const live = { exchangeId, supersededAt: null } as const;
    const [total, haveGift, wrapped, given, received] = await Promise.all([
      prisma.exchangeAssignment.count({ where: live }),
      prisma.exchangeAssignment.count({
        where: { ...live, giftStage: { not: GIFT_STAGE.NONE } },
      }),
      prisma.exchangeAssignment.count({
        where: {
          ...live,
          giftStage: { in: [GIFT_STAGE.WRAPPED, GIFT_STAGE.GIVEN] },
        },
      }),
      prisma.exchangeAssignment.count({
        where: { ...live, giftStage: GIFT_STAGE.GIVEN },
      }),
      prisma.exchangeAssignment.count({
        where: { ...live, receivedAt: { not: null } },
      }),
    ]);
    progress = { total, haveGift, wrapped, given, received };
  }

  let loop: RevealedPair[] | null = null;
  let yourGifter: ExchangePerson | null = null;
  if (status === EXCHANGE_STATUS.REVEALED) {
    const pairs = await getRevealedLoop(exchangeId);
    // Present the loop in visiting order starting from the organizer.
    const byGifter = new Map(pairs.map((p) => [p.gifterId, p]));
    const ordered: typeof pairs = [];
    let cursor: string | undefined = byGifter.has(exchange.organizerId)
      ? exchange.organizerId
      : pairs[0]?.gifterId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      const pair = byGifter.get(cursor);
      if (!pair) break;
      seen.add(cursor);
      ordered.push(pair);
      cursor = pair.gifteeId;
    }
    // Any pairs unreachable from the start (should not happen for a single
    // cycle, but a splice bug must not hide anyone from the record).
    for (const p of pairs) if (!seen.has(p.gifterId)) ordered.push(p);
    loop = ordered.map((p) => ({
      gifter: p.gifter,
      giftee: p.giftee,
      giftLabel: p.giftLabel,
      outcome: (p.outcome as GiftOutcome | null) ?? null,
    }));
    if (isLive) {
      yourGifter = pairs.find((p) => p.gifteeId === viewerId)?.gifter ?? null;
    }
  }

  // After the draw the roster shows live participants only; "sitting this one
  // out" was a pre-draw fact and OUT rows from a later leave would tell four
  // people which two were affected.
  const visibleRoster = gathering
    ? roster
    : roster.filter((r) => r.status === PARTICIPANT_STATUS.IN);

  return {
    exchange: {
      id: exchange.id,
      title: exchange.title,
      occasionType: exchange.occasionType as OccasionType,
      eventDate: exchange.eventDate,
      spendingGuideline: exchange.spendingGuideline,
      status,
      stage: getExchangeStage(exchange, now, timeZone),
      revealMode: exchange.revealMode as RevealMode,
      autoRevealAt: exchange.autoRevealAt,
      avoidRepeatsLookback: exchange.avoidRepeatsLookback,
      giftGroup: exchange.giftGroup,
      organizer: exchange.organizer,
      drawnAt: exchange.drawnAt,
      revealedAt: exchange.revealedAt,
      cancelledAt: exchange.cancelledAt,
      cancelReason: (exchange.cancelReason as CancelReason | null) ?? null,
      inviteCode: isOrganizer ? exchange.inviteCode : null,
    },
    viewer: {
      id: viewerId,
      role,
      participation,
      dismissedJoinPrompt: dismissal !== null,
    },
    roster: visibleRoster,
    counts,
    exclusionCount,
    exclusions,
    draw,
    you,
    progress,
    loop,
    yourGifter,
  };
}

// ─── Lists ────────────────────────────────────────────────────────────────────

export type ExchangeListItem = {
  id: string;
  title: string;
  occasionType: OccasionType;
  eventDate: Date;
  status: ExchangeStatus;
  stage: ExchangeStage;
  giftGroup: { id: string; name: string } | null;
  organizer: ExchangePerson;
  isOrganizer: boolean;
  participation: ParticipantStatus | null;
  participantCount: number;
};

export type ExchangeList = {
  active: ExchangeListItem[];
  past: ExchangeListItem[];
};

export async function listExchangesForUser(
  userId: string,
  {
    now = new Date(),
    timeZone = 'UTC',
  }: { now?: Date; timeZone?: string } = {},
): Promise<ExchangeList> {
  const rows = await prisma.exchange.findMany({
    where: {
      OR: [
        { organizerId: userId },
        { participants: { some: { userId } } },
        { giftGroup: { groupMembers: { some: { userId } } } },
      ],
    },
    select: {
      ...exchangeSelect,
      participants: {
        where: { userId },
        select: { status: true },
      },
      _count: {
        select: {
          participants: { where: { status: PARTICIPANT_STATUS.IN } },
        },
      },
    },
    orderBy: { eventDate: 'desc' },
  });
  const items: ExchangeListItem[] = rows.map((e) => ({
    id: e.id,
    title: e.title,
    occasionType: e.occasionType as OccasionType,
    eventDate: e.eventDate,
    status: e.status as ExchangeStatus,
    stage: getExchangeStage(e, now, timeZone),
    giftGroup: e.giftGroup,
    organizer: e.organizer,
    isOrganizer: e.organizerId === userId,
    participation: (e.participants[0]?.status as ParticipantStatus) ?? null,
    participantCount: e._count.participants,
  }));
  const isActive = (i: ExchangeListItem) =>
    i.status === EXCHANGE_STATUS.GATHERING ||
    i.status === EXCHANGE_STATUS.DRAWN;
  return {
    active: items
      .filter(isActive)
      .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime()),
    past: items.filter((i) => !isActive(i)),
  };
}

// For the group overview: the one exchange a member should hear about right
// now, plus what the viewer has already said about it.
export type GroupExchangeSummary = {
  exchange: {
    id: string;
    title: string;
    occasionType: OccasionType;
    eventDate: Date;
    status: ExchangeStatus;
    stage: ExchangeStage;
    organizer: ExchangePerson;
    participantCount: number;
  };
  viewer: {
    isOrganizer: boolean;
    participation: ParticipantStatus | null;
    dismissedJoinPrompt: boolean;
  };
} | null;

export async function getGroupExchangeSummary({
  giftGroupId,
  viewerId,
  now = new Date(),
  timeZone = 'UTC',
}: {
  giftGroupId: string;
  viewerId: string;
  now?: Date;
  timeZone?: string;
}): Promise<GroupExchangeSummary> {
  // A group may run more than one active exchange. The one worth surfacing is
  // whichever is still waiting on THIS viewer's answer — otherwise a member
  // who already answered the earliest one would never see the prompt for a
  // later one. Failing that, the soonest.
  const active = await prisma.exchange.findMany({
    where: {
      giftGroupId,
      status: { in: [EXCHANGE_STATUS.GATHERING, EXCHANGE_STATUS.DRAWN] },
    },
    orderBy: { eventDate: 'asc' },
    select: {
      ...exchangeSelect,
      participants: { where: { userId: viewerId }, select: { status: true } },
      joinPromptDismissals: {
        where: { userId: viewerId },
        select: { userId: true },
      },
      _count: {
        select: {
          participants: { where: { status: PARTICIPANT_STATUS.IN } },
        },
      },
    },
  });
  // Still unanswered by this viewer — whether or not they dismissed the
  // prompt. Dismissing is not answering: the exchange must still appear, as
  // the quiet Join line, or a stray tap would hide it entirely.
  const unanswered = active.filter(
    (e) =>
      e.status === EXCHANGE_STATUS.GATHERING &&
      e.organizerId !== viewerId &&
      (e.participants[0]?.status ?? PARTICIPANT_STATUS.PENDING) ===
        PARTICIPANT_STATUS.PENDING,
  );
  const exchange =
    unanswered.find((e) => e.joinPromptDismissals.length === 0) ??
    unanswered[0] ??
    active[0];
  if (!exchange) return null;
  return {
    exchange: {
      id: exchange.id,
      title: exchange.title,
      occasionType: exchange.occasionType as OccasionType,
      eventDate: exchange.eventDate,
      status: exchange.status as ExchangeStatus,
      stage: getExchangeStage(exchange, now, timeZone),
      organizer: exchange.organizer,
      participantCount: exchange._count.participants,
    },
    viewer: {
      isOrganizer: exchange.organizerId === viewerId,
      participation:
        (exchange.participants[0]?.status as ParticipantStatus) ?? null,
      dismissedJoinPrompt: exchange.joinPromptDismissals.length > 0,
    },
  };
}

// Re-exported so routes never import the constants module just for this.
export { EXCHANGE_MIN_PARTICIPANTS };
