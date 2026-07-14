import * as Sentry from '@sentry/react-router';
import { prisma } from '#app/utils/db.server.ts';
import {
  NOTIFICATION_TYPES,
  type PoolActivityNotificationType,
} from '#app/utils/notification-catalog.ts';
import { queueNotification } from '#app/utils/notification-dispatcher.server.ts';

type BroadcastPoolActivityEvent = {
  type:
    | typeof NOTIFICATION_TYPES.POOL_VOTE_STARTED
    | typeof NOTIFICATION_TYPES.POOL_GIFT_CHOSEN
    | typeof NOTIFICATION_TYPES.POOL_CANCELLED;
  poolId: string;
  actorUserId: string;
  occurrenceId: string;
};

type AssignmentPoolActivityEvent = {
  type:
    | typeof NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED
    | typeof NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED;
  poolId: string;
  actorUserId: string;
  assigneeUserId: string;
  occurrenceId: string;
};

export type PoolActivityNotificationEvent =
  | BroadcastPoolActivityEvent
  | AssignmentPoolActivityEvent;

type PoolAudienceSnapshot = {
  id: string;
  title: string;
  recipientUserId: string | null;
  purchaserId: string | null;
  delivererId: string | null;
  chosenIdea: { name: string } | null;
  contributors: Array<{ userId: string }>;
};

/**
 * Deep pool fanout module. Callers provide only the committed domain event;
 * audience lookup, privacy exclusions, stale-assignment checks, payloads, and
 * preference-aware delivery remain local to this implementation.
 */
export function queuePoolActivityNotifications(
  event: PoolActivityNotificationEvent,
): void {
  void fanoutPoolActivityNotifications(event).catch((error: unknown) => {
    Sentry.captureException(error);
  });
}

async function fanoutPoolActivityNotifications(
  event: PoolActivityNotificationEvent,
) {
  const pool = await prisma.pool.findUnique({
    where: { id: event.poolId },
    select: {
      id: true,
      title: true,
      recipientUserId: true,
      purchaserId: true,
      delivererId: true,
      chosenIdea: { select: { name: true } },
      contributors: { select: { userId: true } },
    },
  });
  if (!pool) return;

  const recipientIds = getEligibleRecipientIds(event, pool);
  const sourceIdentifier = occurrenceKey(event.type, event.occurrenceId);
  for (const userId of recipientIds) {
    queuePoolNotification({ event, pool, userId, sourceIdentifier });
  }
}

function getEligibleRecipientIds(
  event: PoolActivityNotificationEvent,
  pool: PoolAudienceSnapshot,
) {
  const contributors = new Set(
    pool.contributors.map((contributor) => contributor.userId),
  );
  let candidates = [...contributors];
  if (isAssignmentEvent(event)) {
    candidates = assignmentIsCurrent(event, pool) ? [event.assigneeUserId] : [];
  }

  return candidates.filter(
    (userId) =>
      contributors.has(userId) &&
      userId !== event.actorUserId &&
      userId !== pool.recipientUserId,
  );
}

function assignmentIsCurrent(
  event: AssignmentPoolActivityEvent,
  pool: PoolAudienceSnapshot,
) {
  return event.type === NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED
    ? pool.purchaserId === event.assigneeUserId
    : pool.delivererId === event.assigneeUserId;
}

function isAssignmentEvent(
  event: PoolActivityNotificationEvent,
): event is AssignmentPoolActivityEvent {
  return (
    event.type === NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED ||
    event.type === NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED
  );
}

function queuePoolNotification({
  event,
  pool,
  userId,
  sourceIdentifier,
}: {
  event: PoolActivityNotificationEvent;
  pool: PoolAudienceSnapshot;
  userId: string;
  sourceIdentifier: string;
}) {
  const base = {
    userId,
    context: { kind: 'POOL' as const, poolId: pool.id },
    sourceIdentifier,
  };
  const payload = {
    poolId: pool.id,
    poolTitle: pool.title,
    actorUserId: event.actorUserId,
  };

  switch (event.type) {
    case NOTIFICATION_TYPES.POOL_VOTE_STARTED:
    case NOTIFICATION_TYPES.POOL_CANCELLED:
    case NOTIFICATION_TYPES.POOL_PURCHASER_ASSIGNED:
    case NOTIFICATION_TYPES.POOL_DELIVERER_ASSIGNED:
      queueNotification({ ...base, type: event.type, payload });
      return;
    case NOTIFICATION_TYPES.POOL_GIFT_CHOSEN:
      if (!pool.chosenIdea) {
        throw new Error(`Pool ${pool.id} has no chosen idea after decision.`);
      }
      queueNotification({
        ...base,
        type: event.type,
        payload: { ...payload, chosenIdeaName: pool.chosenIdea.name },
      });
  }
}

function occurrenceKey(
  type: PoolActivityNotificationType,
  occurrenceId: string,
) {
  return `pool-activity:${type}:${occurrenceId}`;
}
