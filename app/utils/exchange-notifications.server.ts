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
      // `removedAt` matters: membership is soft-removed, so without it
      // somebody who left the group still gets told about its exchange.
      user: { giftGroups: { some: { giftGroupId, removedAt: null } } },
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

// `includePending` is set when the exchange is cancelled before the draw:
// everyone who was told it started deserves to hear it is off, and pre-draw
// there are no pairings, so a wider audience discloses nothing. After the draw
// only live participants hear — a broadcast then would tell bystanders which
// people were affected.
export function queueExchangeCancelled(
  exchangeId: string,
  { includePending = false }: { includePending?: boolean } = {},
): void {
  background(
    (async () => {
      const exchange = await loadExchangeForNotification(exchangeId);
      const live = await participantIds(exchangeId, PARTICIPANT_STATUS.IN);
      const pending =
        includePending && exchange?.giftGroupId
          ? await pendingCurrentMemberIds(exchangeId, exchange.giftGroupId)
          : [];
      return fanOut(exchangeId, {
        type: NOTIFICATION_TYPES.EXCHANGE_CANCELLED,
        userIds: [...new Set([...live, ...pending])],
        buildPayload: (e) => ({
          exchangeId: e.id,
          exchangeTitle: e.title,
          organizerUserId: e.organizerId,
          organizerDisplayName: e.organizerDisplayName,
        }),
      });
    })(),
    { exchangeId, moment: 'cancelled' },
  );
}

export type DeliveredNoteBatch = {
  recipientId: string;
  exchangeId: string;
  /** The newest note in the batch — the ledger key, so a re-sweep is silent. */
  noteId: string;
  thread: 'FROM_YOUR_GIFTER' | 'FROM_YOUR_PERSON';
  noteCount: number;
};

// One line per person per thread per morning, not one per note: the batch is
// the delivery, so three notes must not buzz three times. The payload carries
// no text and no sender — a push preview is read by whoever is standing next
// to them, and not knowing who wrote it is the entire game.
export function queueExchangeNotesDelivered(
  batches: DeliveredNoteBatch[],
): void {
  if (batches.length === 0) return;
  background(
    (async () => {
      const byExchange = new Map<string, DeliveredNoteBatch[]>();
      for (const batch of batches) {
        const list = byExchange.get(batch.exchangeId) ?? [];
        list.push(batch);
        byExchange.set(batch.exchangeId, list);
      }

      for (const [exchangeId, group] of byExchange) {
        const exchange = await loadExchangeForNotification(exchangeId);
        if (!exchange) continue;
        // One policy resolution for the whole exchange, not one per note.
        const policies = await resolveNotificationPoliciesForUsers({
          userIds: [...new Set(group.map((b) => b.recipientId))],
          type: NOTIFICATION_TYPES.EXCHANGE_NOTE_RECEIVED,
        });
        for (const batch of group) {
          const policy = policies.get(batch.recipientId);
          queueNotification(
            {
              userId: batch.recipientId,
              type: NOTIFICATION_TYPES.EXCHANGE_NOTE_RECEIVED,
              payload: {
                exchangeId: exchange.id,
                exchangeTitle: exchange.title,
                organizerUserId: exchange.organizerId,
                organizerDisplayName: exchange.organizerDisplayName,
                noteId: batch.noteId,
                thread: batch.thread,
                noteCount: batch.noteCount,
              },
              sourceIdentifier: `exchange-note:${batch.noteId}`,
            },
            policy ? { policy } : undefined,
          );
        }
      }
      return batches.length;
    })(),
    { moment: 'notes-delivered', batches: batches.length },
  );
}

// Reminds the people who have not answered yet. The organizer is told how
// many, never which — so this takes no recipient list from the caller and
// returns no names.
export function queueExchangeReminder(
  exchangeId: string,
  {
    senderId,
    giftGroupId,
    now = new Date(),
  }: { senderId: string; giftGroupId: string | null; now?: Date },
): void {
  background(
    (async () => {
      const pending = giftGroupId
        ? await pendingCurrentMemberIds(exchangeId, giftGroupId)
        : (
            await prisma.exchangeParticipant.findMany({
              where: { exchangeId, status: PARTICIPANT_STATUS.PENDING },
              select: { userId: true },
            })
          ).map((p) => p.userId);
      return fanOut(exchangeId, {
        type: NOTIFICATION_TYPES.EXCHANGE_ANSWER_REMINDER,
        userIds: pending.filter((id) => id !== senderId),
        // GROUP-scoped, like EXCHANGE_STARTED and for the same reason: the
        // recipient has NOT opted into this exchange, so a group they muted
        // is exactly the preference that should govern whether they hear
        // about it. The key moments are context: 'NONE' because those go to
        // people who did opt in.
        ...(giftGroupId
          ? { context: { kind: 'GROUP' as const, groupId: giftGroupId } }
          : {}),
        buildPayload: (e) => ({
          exchangeId: e.id,
          exchangeTitle: e.title,
          organizerUserId: e.organizerId,
          organizerDisplayName: e.organizerDisplayName,
          reminderAt: now,
        }),
      });
    })(),
    { exchangeId, moment: 'reminder' },
  );
}

// The two people a splice affects, told asymmetrically (board §18): the
// gifter who inherited someone gets their NAME, because they have to shop for
// them; the person whose gifter changed gets no name anywhere, because who
// has them is the thing the exchange exists to keep.
export function queueExchangeSpliceNotices({
  exchangeId,
  gifterId,
  displacedGifteeId,
  now = new Date(),
}: {
  exchangeId: string;
  gifterId: string;
  displacedGifteeId: string;
  now?: Date;
}): void {
  background(
    (async () => {
      const exchange = await loadExchangeForNotification(exchangeId);
      if (!exchange) return 0;

      // Read from the gifter's own live assignment rather than taking a name
      // from the caller: the notification must say what the loop actually
      // says, even if something changed between the splice and this fan-out.
      const assignment = await prisma.exchangeAssignment.findFirst({
        where: { exchangeId, gifterId, supersededAt: null },
        select: {
          giftee: { select: { name: true, username: true } },
        },
      });
      if (!assignment) return 0;

      const [gifterPolicy, gifteePolicy] = await Promise.all([
        resolveNotificationPoliciesForUsers({
          userIds: [gifterId],
          type: NOTIFICATION_TYPES.EXCHANGE_YOUR_PERSON_CHANGED,
        }),
        resolveNotificationPoliciesForUsers({
          userIds: [displacedGifteeId],
          type: NOTIFICATION_TYPES.EXCHANGE_NEW_GIFTER,
        }),
      ]);

      const base = {
        exchangeId: exchange.id,
        exchangeTitle: exchange.title,
        organizerUserId: exchange.organizerId,
        organizerDisplayName: exchange.organizerDisplayName,
        changedAt: now,
      };

      queueNotification(
        {
          userId: gifterId,
          type: NOTIFICATION_TYPES.EXCHANGE_YOUR_PERSON_CHANGED,
          payload: {
            ...base,
            gifteeDisplayName:
              assignment.giftee.name ?? assignment.giftee.username,
          },
        },
        gifterPolicy.get(gifterId)
          ? { policy: gifterPolicy.get(gifterId)! }
          : undefined,
      );
      queueNotification(
        {
          userId: displacedGifteeId,
          type: NOTIFICATION_TYPES.EXCHANGE_NEW_GIFTER,
          payload: base,
        },
        gifteePolicy.get(displacedGifteeId)
          ? { policy: gifteePolicy.get(displacedGifteeId)! }
          : undefined,
      );
      return 2;
    })(),
    { exchangeId, moment: 'splice' },
  );
}
