// Fan-out for the exchange key moments. Called by `exchanges.server.ts` only
// AFTER the owning transaction has committed, fire-and-forget: a failure here
// goes to Sentry and never turns a committed draw or reveal into a 500.
//
// Audiences are resolved once per moment via resolveNotificationPoliciesForUsers
// (never per recipient, never inside a transaction — see the write-lock incident
// documented in notification-policy.server.ts). Payloads carry the exchange and
// its organizer only: no pairing-shaped field exists to leak.
import * as Sentry from '@sentry/react-router';
import { prisma } from '#app/utils/db.server.ts';
import { PARTICIPANT_STATUS } from '#app/utils/exchange-constants.ts';
import {
  NOTIFICATION_TYPES,
  type ExchangeNotificationType,
  type NotificationContext,
  type NotificationIntent,
} from '#app/utils/notification-catalog.ts';
import { queueNotification } from '#app/utils/notification-dispatcher.server.ts';
import { resolveNotificationPoliciesForUsers } from '#app/utils/notification-policy.server.ts';

async function loadExchangeForNotification(exchangeId: string) {
  const exchange = await prisma.exchange.findUnique({
    where: { id: exchangeId },
    select: {
      id: true,
      title: true,
      eventDate: true,
      giftGroupId: true,
      organizerId: true,
      organizer: { select: { name: true, username: true } },
    },
  });
  if (!exchange) return null;
  return {
    ...exchange,
    organizerDisplayName:
      exchange.organizer.name?.trim() || exchange.organizer.username,
  };
}

async function participantIds(exchangeId: string, status: string) {
  const rows = await prisma.exchangeParticipant.findMany({
    where: { exchangeId, status },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

// The PENDING rows were snapshotted at create time; a member who has since
// left the group must not be told about its exchanges. Intersect with current
// membership at send time.
async function pendingCurrentMemberIds(
  exchangeId: string,
  giftGroupId: string,
) {
  const rows = await prisma.exchangeParticipant.findMany({
    where: {
      exchangeId,
      status: PARTICIPANT_STATUS.PENDING,
      user: { giftGroups: { some: { giftGroupId } } },
    },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

type ExchangeMoment<T extends ExchangeNotificationType> = {
  type: T;
  userIds: string[];
  context?: NotificationContext;
  buildPayload: (
    exchange: NonNullable<
      Awaited<ReturnType<typeof loadExchangeForNotification>>
    >,
  ) => NotificationIntent<T>['payload'];
};

async function fanOut<T extends ExchangeNotificationType>(
  exchangeId: string,
  moment: ExchangeMoment<T>,
): Promise<number> {
  if (moment.userIds.length === 0) return 0;
  const exchange = await loadExchangeForNotification(exchangeId);
  if (!exchange) return 0;
  const policies = await resolveNotificationPoliciesForUsers({
    userIds: moment.userIds,
    type: moment.type,
    context: moment.context,
  });
  const payload = moment.buildPayload(exchange);
  for (const userId of moment.userIds) {
    const policy = policies.get(userId);
    queueNotification(
      {
        userId,
        type: moment.type,
        payload,
        context: moment.context,
      } as NotificationIntent<T>,
      policy ? { policy } : undefined,
    );
  }
  return moment.userIds.length;
}

function background(promise: Promise<unknown>, extra: Record<string, unknown>) {
  promise.catch((error) => Sentry.captureException(error, { extra }));
}

// Group members who have not answered yet hear that an exchange has started.
// Group-scoped: a member who muted the group has asked not to.
export function queueExchangeStarted(exchangeId: string): void {
  background(
    (async () => {
      const exchange = await loadExchangeForNotification(exchangeId);
      if (!exchange?.giftGroupId) return 0;
      const giftGroupId = exchange.giftGroupId;
      return fanOut(exchangeId, {
        type: NOTIFICATION_TYPES.EXCHANGE_STARTED,
        userIds: await pendingCurrentMemberIds(exchangeId, giftGroupId),
        context: { kind: 'GROUP', groupId: giftGroupId },
        buildPayload: (e) => ({
          exchangeId: e.id,
          exchangeTitle: e.title,
          organizerUserId: e.organizerId,
          organizerDisplayName: e.organizerDisplayName,
          giftGroupId,
          eventDate: e.eventDate,
        }),
      });
    })(),
    { exchangeId, moment: 'started' },
  );
}

// Every live participant, the organizer included: they drew a name too.
export function queueExchangeNamesDrawn(exchangeId: string): void {
  background(
    (async () =>
      fanOut(exchangeId, {
        type: NOTIFICATION_TYPES.EXCHANGE_NAMES_DRAWN,
        userIds: await participantIds(exchangeId, PARTICIPANT_STATUS.IN),
        buildPayload: (e) => ({
          exchangeId: e.id,
          exchangeTitle: e.title,
          organizerUserId: e.organizerId,
          organizerDisplayName: e.organizerDisplayName,
        }),
      }))(),
    { exchangeId, moment: 'drawn' },
  );
}

// Same intent whether the organizer pressed the button or the sweep did.
export function queueExchangeRevealed(
  exchangeId: string,
  finalStatus: 'REVEALED' | 'FINISHED',
): void {
  background(
    (async () =>
      fanOut(exchangeId, {
        type: NOTIFICATION_TYPES.EXCHANGE_REVEALED,
        userIds: await participantIds(exchangeId, PARTICIPANT_STATUS.IN),
        buildPayload: (e) => ({
          exchangeId: e.id,
          exchangeTitle: e.title,
          organizerUserId: e.organizerId,
          organizerDisplayName: e.organizerDisplayName,
          finalStatus,
        }),
      }))(),
    { exchangeId, moment: 'revealed' },
  );
}

export function queueExchangeCancelled(exchangeId: string): void {
  background(
    (async () =>
      fanOut(exchangeId, {
        type: NOTIFICATION_TYPES.EXCHANGE_CANCELLED,
        userIds: await participantIds(exchangeId, PARTICIPANT_STATUS.IN),
        buildPayload: (e) => ({
          exchangeId: e.id,
          exchangeTitle: e.title,
          organizerUserId: e.organizerId,
          organizerDisplayName: e.organizerDisplayName,
        }),
      }))(),
    { exchangeId, moment: 'cancelled' },
  );
}
