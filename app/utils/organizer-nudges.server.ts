import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/react-router';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  NOTIFICATION_CHANNEL_VALUES,
  NOTIFICATION_TYPES,
  type OrganizerNudgeNotificationType,
} from '#app/utils/notification-catalog.ts';
import { queueNotification } from '#app/utils/notification-dispatcher.server.ts';
import { resolveNotificationPoliciesForUsers } from '#app/utils/notification-policy.server.ts';
import { POOL_STATUS } from '#app/utils/pool-constants.ts';

export const ORGANIZER_NUDGE_KINDS = {
  CONTRIBUTION: 'CONTRIBUTION',
  VOTE: 'VOTE',
  PURCHASE: 'PURCHASE',
  DELIVERY: 'DELIVERY',
} as const;

export type OrganizerNudgeKind =
  (typeof ORGANIZER_NUDGE_KINDS)[keyof typeof ORGANIZER_NUDGE_KINDS];

export const ORGANIZER_NUDGE_KIND_VALUES = Object.values(ORGANIZER_NUDGE_KINDS);

export const ORGANIZER_NUDGE_KIND_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const ORGANIZER_NUDGE_POOL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const ORGANIZER_NUDGE_POOL_LIMIT = 3;

type LatestNudge = {
  createdAt: Date;
  targetCount: number;
  status: string;
};

type OrganizerNudgeResultBase = {
  kind: OrganizerNudgeKind;
  latestNudge: LatestNudge | null;
};

export type OrganizerNudgePreview = OrganizerNudgeResultBase &
  (
    | { status: 'AVAILABLE'; eligibleCount: number }
    | { status: 'NO_ELIGIBLE' }
    | { status: 'COOLDOWN'; availableAt: Date }
    | { status: 'WEEKLY_LIMIT'; availableAt: Date }
  );

export type OrganizerNudgeAvailability = OrganizerNudgeResultBase &
  (
    | { status: 'AVAILABLE' }
    | { status: 'NO_ELIGIBLE' }
    | { status: 'COOLDOWN'; availableAt: Date }
    | { status: 'WEEKLY_LIMIT'; availableAt: Date }
  );

export type OrganizerNudgeSendResult =
  | OrganizerNudgePreview
  | (OrganizerNudgeResultBase & {
      status: 'QUEUED';
      nudgeId: string;
      queuedCount: number;
      createdAt: Date;
      availableAt: Date;
    });

export type OrganizerNudgeErrorCode =
  | 'POOL_NOT_FOUND'
  | 'FORBIDDEN'
  | 'TASK_UNAVAILABLE'
  | 'INVALID_IDEMPOTENCY_KEY'
  | 'IDEMPOTENCY_CONFLICT';

export class OrganizerNudgeError extends Error {
  constructor(
    public readonly code: OrganizerNudgeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OrganizerNudgeError';
  }
}

type NudgeEvaluation = OrganizerNudgeResultBase &
  (
    | { status: 'READY'; candidateUserIds: string[] }
    | { status: 'NO_ELIGIBLE' }
    | { status: 'COOLDOWN'; availableAt: Date }
    | { status: 'WEEKLY_LIMIT'; availableAt: Date }
  );

type ExistingNudge = {
  id: string;
  poolId: string;
  senderId: string;
  kind: string;
  targetCount: number;
  status: string;
  createdAt: Date;
};

/**
 * Lightweight page-state interface. It deliberately stops before preference
 * resolution so pool pages can render task and rate-limit availability without
 * calculating or exposing a recipient count. The dialog calls
 * previewOrganizerNudge only after the manager opens it.
 */
export async function getOrganizerNudgeAvailability({
  poolId,
  senderId,
  kind,
}: {
  poolId: string;
  senderId: string;
  kind: OrganizerNudgeKind;
}): Promise<OrganizerNudgeAvailability> {
  const evaluation = await prisma.$transaction((tx) =>
    evaluateNudge(tx, { poolId, senderId, kind, now: new Date() }),
  );
  if (evaluation.status !== 'READY') return evaluation;
  return {
    status: 'AVAILABLE',
    kind,
    latestNudge: evaluation.latestNudge,
  };
}

/**
 * Read interface for the task-local confirmation surface. Audience details
 * remain inside the module; callers receive only the aggregate eligible count.
 */
export async function previewOrganizerNudge({
  poolId,
  senderId,
  kind,
}: {
  poolId: string;
  senderId: string;
  kind: OrganizerNudgeKind;
}): Promise<OrganizerNudgePreview> {
  const now = new Date();
  const evaluation = await prisma.$transaction((tx) =>
    evaluateNudge(tx, { poolId, senderId, kind, now }),
  );
  if (evaluation.status !== 'READY') return evaluation;

  const eligibleUserIds = await filterPreferenceEligibleRecipients({
    poolId,
    kind,
    candidateUserIds: evaluation.candidateUserIds,
  });
  return eligibleUserIds.length === 0
    ? {
        status: 'NO_ELIGIBLE',
        kind,
        latestNudge: evaluation.latestNudge,
      }
    : {
        status: 'AVAILABLE',
        kind,
        latestNudge: evaluation.latestNudge,
        eligibleCount: eligibleUserIds.length,
      };
}

/**
 * Command interface for one preset nudge. Authorization, current task state,
 * target selection, preference suppression, rolling limits, audit creation,
 * idempotency, and background fanout all stay behind this seam.
 */
export async function sendOrganizerNudge({
  poolId,
  senderId,
  kind,
  idempotencyKey,
}: {
  poolId: string;
  senderId: string;
  kind: OrganizerNudgeKind;
  idempotencyKey: string;
}): Promise<OrganizerNudgeSendResult> {
  assertIdempotencyKey(idempotencyKey);

  const existing = await prisma.organizerNudge.findUnique({
    where: { senderId_idempotencyKey: { senderId, idempotencyKey } },
  });
  if (existing) return replayExistingNudge(existing, { poolId, kind });

  const now = new Date();
  const initial = await prisma.$transaction((tx) =>
    evaluateNudge(tx, { poolId, senderId, kind, now }),
  );
  if (initial.status !== 'READY') {
    const raced = await prisma.organizerNudge.findUnique({
      where: { senderId_idempotencyKey: { senderId, idempotencyKey } },
    });
    if (raced) return replayExistingNudge(raced, { poolId, kind });
    recordSkippedOrganizerNudge({ poolId, senderId, result: initial });
    return initial;
  }

  const preferenceEligibleUserIds = await filterPreferenceEligibleRecipients({
    poolId,
    kind,
    candidateUserIds: initial.candidateUserIds,
  });

  let result: OrganizerNudgeSendResult;
  try {
    result = await prisma.$transaction(async (tx) => {
      const concurrentExisting = await tx.organizerNudge.findUnique({
        where: { senderId_idempotencyKey: { senderId, idempotencyKey } },
      });
      if (concurrentExisting) {
        return replayExistingNudge(concurrentExisting, { poolId, kind });
      }

      // Re-evaluate every mutable domain and rate-limit input immediately before
      // the audit row is claimed. Preference policy is rechecked by the delivery
      // dispatcher as well, so a concurrent opt-out still suppresses delivery.
      const current = await evaluateNudge(tx, {
        poolId,
        senderId,
        kind,
        now: new Date(),
      });
      if (current.status !== 'READY') {
        const raced = await tx.organizerNudge.findUnique({
          where: { senderId_idempotencyKey: { senderId, idempotencyKey } },
        });
        return raced ? replayExistingNudge(raced, { poolId, kind }) : current;
      }

      const allowed = new Set(preferenceEligibleUserIds);
      const recipientIds = current.candidateUserIds.filter((userId) =>
        allowed.has(userId),
      );
      if (recipientIds.length === 0) {
        return {
          status: 'NO_ELIGIBLE' as const,
          kind,
          latestNudge: current.latestNudge,
        };
      }

      const nudge = await tx.organizerNudge.create({
        data: {
          poolId,
          senderId,
          kind,
          idempotencyKey,
          targetCount: recipientIds.length,
          recipients: {
            create: recipientIds.map((userId) => ({ userId })),
          },
        },
      });

      return {
        status: 'QUEUED' as const,
        kind,
        nudgeId: nudge.id,
        queuedCount: recipientIds.length,
        createdAt: nudge.createdAt,
        availableAt: addMilliseconds(
          nudge.createdAt,
          ORGANIZER_NUDGE_KIND_COOLDOWN_MS,
        ),
        latestNudge: {
          createdAt: nudge.createdAt,
          targetCount: nudge.targetCount,
          status: nudge.status,
        },
      };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await prisma.organizerNudge.findUnique({
      where: { senderId_idempotencyKey: { senderId, idempotencyKey } },
    });
    if (!raced) throw error;
    result = replayExistingNudge(raced, { poolId, kind });
  }

  if (result.status === 'QUEUED') {
    queueOrganizerNudgeNotifications(result.nudgeId);
  } else {
    recordSkippedOrganizerNudge({ poolId, senderId, result });
  }
  return result;
}

function recordSkippedOrganizerNudge({
  poolId,
  senderId,
  result,
}: {
  poolId: string;
  senderId: string;
  result: Exclude<OrganizerNudgeSendResult, { status: 'QUEUED' }>;
}) {
  queueLogEvent({
    name: 'organizer_reminder_skipped',
    source: 'server',
    userId: senderId,
    properties: {
      poolId,
      kind: result.kind,
      reason: result.status,
    },
  });
}

async function evaluateNudge(
  tx: Prisma.TransactionClient,
  {
    poolId,
    senderId,
    kind,
    now,
  }: {
    poolId: string;
    senderId: string;
    kind: OrganizerNudgeKind;
    now: Date;
  },
): Promise<NudgeEvaluation> {
  const pool = await tx.pool.findUnique({
    where: { id: poolId },
    select: {
      id: true,
      status: true,
      organizerId: true,
      giftGroupId: true,
      recipientUserId: true,
      purchaserId: true,
      delivererId: true,
      contributors: {
        select: { userId: true, contributionCents: true },
      },
      votes: { select: { voterId: true } },
    },
  });
  if (!pool || pool.recipientUserId === senderId) {
    throw new OrganizerNudgeError('POOL_NOT_FOUND', 'Pool not found.');
  }

  const senderIsContributor = pool.contributors.some(
    (contributor) => contributor.userId === senderId,
  );
  if (!senderIsContributor) {
    throw new OrganizerNudgeError('POOL_NOT_FOUND', 'Pool not found.');
  }

  if (!(await senderCanManagePool(tx, senderId, pool))) {
    throw new OrganizerNudgeError(
      'FORBIDDEN',
      'Only a Pool Manager can send this reminder.',
    );
  }

  const taskCandidateUserIds = getTaskCandidateUserIds(pool, senderId, kind);
  const [latest, recentPoolNudges] = await Promise.all([
    tx.organizerNudge.findFirst({
      where: { poolId, kind },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, targetCount: true, status: true },
    }),
    tx.organizerNudge.findMany({
      where: {
        poolId,
        createdAt: {
          gt: addMilliseconds(now, -ORGANIZER_NUDGE_POOL_WINDOW_MS),
        },
      },
      orderBy: { createdAt: 'asc' },
      take: ORGANIZER_NUDGE_POOL_LIMIT,
      select: { createdAt: true },
    }),
  ]);

  const limit = getBlockingLimit({ latest, recentPoolNudges, now });
  if (limit) return { ...limit, kind, latestNudge: latest };

  if (taskCandidateUserIds.length === 0) {
    return { status: 'NO_ELIGIBLE', kind, latestNudge: latest };
  }

  const recentRecipients = await tx.organizerNudgeRecipient.findMany({
    where: {
      userId: { in: taskCandidateUserIds },
      nudge: {
        poolId,
        createdAt: {
          gt: addMilliseconds(now, -ORGANIZER_NUDGE_KIND_COOLDOWN_MS),
        },
      },
    },
    select: { userId: true },
  });
  const recentlyNudged = new Set(
    recentRecipients.map((recipient) => recipient.userId),
  );
  const candidateUserIds = taskCandidateUserIds.filter(
    (userId) => !recentlyNudged.has(userId),
  );

  return candidateUserIds.length === 0
    ? { status: 'NO_ELIGIBLE', kind, latestNudge: latest }
    : {
        status: 'READY',
        kind,
        latestNudge: latest,
        candidateUserIds,
      };
}

async function senderCanManagePool(
  tx: Prisma.TransactionClient,
  senderId: string,
  pool: { organizerId: string; giftGroupId: string | null },
) {
  if (pool.organizerId === senderId) return true;
  if (!pool.giftGroupId) return false;
  const membership = await tx.usersInGiftGroups.findUnique({
    where: {
      userId_giftGroupId: { userId: senderId, giftGroupId: pool.giftGroupId },
    },
    select: { role: true, removedAt: true },
  });
  return (
    membership?.removedAt === null &&
    (membership.role === 'OWNER' || membership.role === 'ADMIN')
  );
}

function getTaskCandidateUserIds(
  pool: {
    status: string;
    recipientUserId: string | null;
    purchaserId: string | null;
    delivererId: string | null;
    contributors: Array<{ userId: string; contributionCents: number | null }>;
    votes: Array<{ voterId: string }>;
  },
  senderId: string,
  kind: OrganizerNudgeKind,
) {
  const currentContributors = new Set(
    pool.contributors.map((contributor) => contributor.userId),
  );
  const excludePrivateActors = (userId: string) =>
    userId !== senderId &&
    userId !== pool.recipientUserId &&
    currentContributors.has(userId);

  switch (kind) {
    case ORGANIZER_NUDGE_KINDS.CONTRIBUTION:
      if (
        pool.status !== POOL_STATUS.OPEN &&
        pool.status !== POOL_STATUS.VOTING
      ) {
        throw taskUnavailable(kind);
      }
      return pool.contributors
        .filter(
          (contributor) =>
            contributor.contributionCents === null &&
            excludePrivateActors(contributor.userId),
        )
        .map((contributor) => contributor.userId);
    case ORGANIZER_NUDGE_KINDS.VOTE: {
      if (pool.status !== POOL_STATUS.VOTING) throw taskUnavailable(kind);
      const voters = new Set(pool.votes.map((vote) => vote.voterId));
      return pool.contributors
        .map((contributor) => contributor.userId)
        .filter(
          (userId) => excludePrivateActors(userId) && !voters.has(userId),
        );
    }
    case ORGANIZER_NUDGE_KINDS.PURCHASE:
      if (
        pool.status !== POOL_STATUS.DECIDED ||
        !pool.purchaserId ||
        pool.purchaserId === senderId
      ) {
        throw taskUnavailable(kind);
      }
      return excludePrivateActors(pool.purchaserId) ? [pool.purchaserId] : [];
    case ORGANIZER_NUDGE_KINDS.DELIVERY:
      if (
        pool.status !== POOL_STATUS.PURCHASED ||
        !pool.delivererId ||
        pool.delivererId === senderId
      ) {
        throw taskUnavailable(kind);
      }
      return excludePrivateActors(pool.delivererId) ? [pool.delivererId] : [];
  }
}

function getBlockingLimit({
  latest,
  recentPoolNudges,
  now,
}: {
  latest: LatestNudge | null;
  recentPoolNudges: Array<{ createdAt: Date }>;
  now: Date;
}) {
  const kindAvailableAt = latest
    ? addMilliseconds(latest.createdAt, ORGANIZER_NUDGE_KIND_COOLDOWN_MS)
    : null;
  const weeklyAvailableAt =
    recentPoolNudges.length >= ORGANIZER_NUDGE_POOL_LIMIT
      ? addMilliseconds(
          recentPoolNudges[0]!.createdAt,
          ORGANIZER_NUDGE_POOL_WINDOW_MS,
        )
      : null;
  const kindBlocked = kindAvailableAt && kindAvailableAt > now;
  const weeklyBlocked = weeklyAvailableAt && weeklyAvailableAt > now;
  if (!kindBlocked && !weeklyBlocked) return null;
  if (weeklyBlocked && (!kindBlocked || weeklyAvailableAt >= kindAvailableAt)) {
    return { status: 'WEEKLY_LIMIT' as const, availableAt: weeklyAvailableAt };
  }
  return { status: 'COOLDOWN' as const, availableAt: kindAvailableAt! };
}

async function filterPreferenceEligibleRecipients({
  poolId,
  kind,
  candidateUserIds,
}: {
  poolId: string;
  kind: OrganizerNudgeKind;
  candidateUserIds: string[];
}) {
  const type = notificationTypeForKind(kind);
  const policies = await resolveNotificationPoliciesForUsers({
    userIds: candidateUserIds,
    type,
    context: { kind: 'POOL', poolId },
  });
  return candidateUserIds.filter((userId) => {
    const policy = policies.get(userId);
    return (
      policy !== undefined &&
      NOTIFICATION_CHANNEL_VALUES.some(
        (channel) => policy.channels[channel].allowed,
      )
    );
  });
}

function queueOrganizerNudgeNotifications(nudgeId: string): void {
  void fanoutOrganizerNudgeNotifications(nudgeId).catch((error: unknown) => {
    Sentry.captureException(error);
  });
}

async function fanoutOrganizerNudgeNotifications(nudgeId: string) {
  const nudge = await prisma.organizerNudge.findUnique({
    where: { id: nudgeId },
    select: {
      id: true,
      kind: true,
      pool: { select: { id: true, title: true } },
      sender: { select: { id: true, name: true, username: true } },
      recipients: { select: { userId: true } },
    },
  });
  if (!nudge) return;

  const type = notificationTypeForKind(nudge.kind as OrganizerNudgeKind);
  const senderDisplayName = nudge.sender.name ?? nudge.sender.username;
  for (const recipient of nudge.recipients) {
    queueNotification({
      userId: recipient.userId,
      type,
      context: { kind: 'POOL', poolId: nudge.pool.id },
      sourceIdentifier: `organizer-nudge:${nudge.id}`,
      payload: {
        nudgeId: nudge.id,
        poolId: nudge.pool.id,
        poolTitle: nudge.pool.title,
        senderUserId: nudge.sender.id,
        senderDisplayName,
      },
    });
  }
}

function notificationTypeForKind(
  kind: OrganizerNudgeKind,
): OrganizerNudgeNotificationType {
  const byKind: Record<OrganizerNudgeKind, OrganizerNudgeNotificationType> = {
    [ORGANIZER_NUDGE_KINDS.CONTRIBUTION]:
      NOTIFICATION_TYPES.POOL_CONTRIBUTION_REMINDER,
    [ORGANIZER_NUDGE_KINDS.VOTE]: NOTIFICATION_TYPES.POOL_VOTE_REMINDER,
    [ORGANIZER_NUDGE_KINDS.PURCHASE]: NOTIFICATION_TYPES.POOL_PURCHASE_REMINDER,
    [ORGANIZER_NUDGE_KINDS.DELIVERY]: NOTIFICATION_TYPES.POOL_DELIVERY_REMINDER,
  };
  return byKind[kind];
}

function replayExistingNudge(
  existing: ExistingNudge,
  expected: { poolId: string; kind: OrganizerNudgeKind },
): OrganizerNudgeSendResult {
  if (existing.poolId !== expected.poolId || existing.kind !== expected.kind) {
    throw new OrganizerNudgeError(
      'IDEMPOTENCY_CONFLICT',
      'This idempotency key was already used for another reminder.',
    );
  }
  return {
    status: 'QUEUED',
    kind: expected.kind,
    nudgeId: existing.id,
    queuedCount: existing.targetCount,
    createdAt: existing.createdAt,
    availableAt: addMilliseconds(
      existing.createdAt,
      ORGANIZER_NUDGE_KIND_COOLDOWN_MS,
    ),
    latestNudge: {
      createdAt: existing.createdAt,
      targetCount: existing.targetCount,
      status: existing.status,
    },
  };
}

function assertIdempotencyKey(value: string) {
  if (value.trim().length === 0 || value.length > 200) {
    throw new OrganizerNudgeError(
      'INVALID_IDEMPOTENCY_KEY',
      'A valid idempotency key is required.',
    );
  }
}

function taskUnavailable(kind: OrganizerNudgeKind) {
  return new OrganizerNudgeError(
    'TASK_UNAVAILABLE',
    `The ${kind.toLowerCase()} reminder is no longer available.`,
  );
}

function addMilliseconds(date: Date, milliseconds: number) {
  return new Date(date.getTime() + milliseconds);
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

export function isOrganizerNudgeKind(
  value: unknown,
): value is OrganizerNudgeKind {
  return (
    typeof value === 'string' &&
    ORGANIZER_NUDGE_KIND_VALUES.includes(value as OrganizerNudgeKind)
  );
}
