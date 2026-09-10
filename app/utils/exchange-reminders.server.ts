// Organizer reminders for an exchange. One preset, one send button, aggregate
// counts — and the organizer never learns who received it.
//
// Deliberately NOT built on `organizer-nudges.server.ts`: that module is
// pool-shaped down to a required `poolId` and 687 lines of limits around it.
// Widening it for one exchange preset would have meant rebuilding its table
// and rewriting every limit query in a working, money-adjacent flow. What is
// shared instead is the thing that matters — the notification plumbing, and
// the rule that the sender sees a count and never a list.
import { data } from 'react-router';
import { prisma } from '#app/utils/db.server.ts';
import {
  EXCHANGE_STATUS,
  PARTICIPANT_STATUS,
} from '#app/utils/exchange-constants.ts';
import { queueExchangeReminder } from '#app/utils/exchange-notifications.server.ts';
import { requireExchangeOrganizer } from '#app/utils/exchanges.server.ts';

import { requireExchangeVisible } from './exchange-access.server.ts';

export const EXCHANGE_REMINDER_KIND = {
  /** "Answer before the draw" — the only preset the board asks for. */
  ANSWER: 'ANSWER',
} as const;
export type ExchangeReminderKind =
  (typeof EXCHANGE_REMINDER_KIND)[keyof typeof EXCHANGE_REMINDER_KIND];

// One per kind per day, three per exchange per week. Same shape as the pool
// limits, and for the same reason: a reminder is a thing other people receive.
export const REMINDER_KIND_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const REMINDER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const REMINDER_WINDOW_LIMIT = 3;

export type ExchangeReminderAvailability =
  | { status: 'AVAILABLE'; kind: ExchangeReminderKind; eligibleCount: number }
  | { status: 'NO_ELIGIBLE'; kind: ExchangeReminderKind }
  | { status: 'NOT_APPLICABLE'; kind: ExchangeReminderKind }
  | {
      status: 'COOLDOWN' | 'WEEKLY_LIMIT';
      kind: ExchangeReminderKind;
      availableAt: Date;
    };

// Who a reminder would reach: members who haven't answered yet and are still
// in the group. Never returned to the caller — only its size is.
async function eligibleRecipientIds(
  exchangeId: string,
  giftGroupId: string | null,
  senderId: string,
): Promise<string[]> {
  const pending = await prisma.exchangeParticipant.findMany({
    where: {
      exchangeId,
      status: PARTICIPANT_STATUS.PENDING,
      userId: { not: senderId },
    },
    select: { userId: true },
  });
  if (!giftGroupId) return pending.map((p) => p.userId);
  const stillMembers = await prisma.usersInGiftGroups.findMany({
    where: {
      giftGroupId,
      removedAt: null,
      userId: { in: pending.map((p) => p.userId) },
    },
    select: { userId: true },
  });
  return stillMembers.map((m) => m.userId);
}

export async function previewExchangeReminder({
  exchangeId,
  actorId,
  kind = EXCHANGE_REMINDER_KIND.ANSWER,
  now = new Date(),
}: {
  exchangeId: string;
  actorId: string;
  kind?: ExchangeReminderKind;
  now?: Date;
}): Promise<ExchangeReminderAvailability> {
  const exchange = await requireExchangeVisible(actorId, exchangeId);
  requireExchangeOrganizer(actorId, exchange);

  // Answering only means anything before the draw.
  if (exchange.status !== EXCHANGE_STATUS.GATHERING) {
    return { status: 'NOT_APPLICABLE', kind };
  }

  const [lastOfKind, recentAll] = await Promise.all([
    prisma.exchangeReminder.findFirst({
      where: { exchangeId, kind },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.exchangeReminder.findMany({
      where: {
        exchangeId,
        createdAt: { gte: new Date(now.getTime() - REMINDER_WINDOW_MS) },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ]);

  if (
    lastOfKind &&
    now.getTime() - lastOfKind.createdAt.getTime() < REMINDER_KIND_COOLDOWN_MS
  ) {
    return {
      status: 'COOLDOWN',
      kind,
      availableAt: new Date(
        lastOfKind.createdAt.getTime() + REMINDER_KIND_COOLDOWN_MS,
      ),
    };
  }
  if (recentAll.length >= REMINDER_WINDOW_LIMIT) {
    return {
      status: 'WEEKLY_LIMIT',
      kind,
      availableAt: new Date(
        recentAll[0]!.createdAt.getTime() + REMINDER_WINDOW_MS,
      ),
    };
  }

  const eligible = await eligibleRecipientIds(
    exchangeId,
    exchange.giftGroupId,
    actorId,
  );
  if (eligible.length === 0) return { status: 'NO_ELIGIBLE', kind };
  return { status: 'AVAILABLE', kind, eligibleCount: eligible.length };
}

export type ExchangeReminderSendResult =
  | { status: 'QUEUED'; kind: ExchangeReminderKind; targetCount: number }
  | ExchangeReminderAvailability;

export async function sendExchangeReminder({
  exchangeId,
  actorId,
  idempotencyKey,
  kind = EXCHANGE_REMINDER_KIND.ANSWER,
  now = new Date(),
}: {
  exchangeId: string;
  actorId: string;
  idempotencyKey: string;
  kind?: ExchangeReminderKind;
  now?: Date;
}): Promise<ExchangeReminderSendResult> {
  const exchange = await requireExchangeVisible(actorId, exchangeId);
  requireExchangeOrganizer(actorId, exchange);

  // The replay check comes FIRST. A double tap carries the same key, and the
  // reminder it already sent is exactly what puts the cooldown in the way —
  // so checking availability first would answer "you did this today" to the
  // very tap that did it.
  const replayed = await prisma.exchangeReminder.findUnique({
    where: { senderId_idempotencyKey: { senderId: actorId, idempotencyKey } },
    select: { targetCount: true, kind: true },
  });
  if (replayed) {
    return {
      status: 'QUEUED',
      kind: replayed.kind as ExchangeReminderKind,
      targetCount: replayed.targetCount,
    };
  }

  const availability = await previewExchangeReminder({
    exchangeId,
    actorId,
    kind,
    now,
  });
  if (availability.status !== 'AVAILABLE') return availability;

  const outcome = await prisma.$transaction(async (tx) => {
    // A double tap must not become two reminders. The unique key on
    // (senderId, idempotencyKey) is what actually enforces it; this read just
    // makes the second tap quiet rather than an error.
    const existing = await tx.exchangeReminder.findUnique({
      where: { senderId_idempotencyKey: { senderId: actorId, idempotencyKey } },
      select: { targetCount: true },
    });
    if (existing) {
      // Two taps in the same tick: the unique key is what makes this safe,
      // and this read makes the loser quiet rather than an error.
      return { replayed: true as const, targetCount: existing.targetCount };
    }

    // Rechecked inside the transaction: the limits are the whole point, and
    // two taps in the same tick would otherwise both see room.
    const sinceCooldown = await tx.exchangeReminder.count({
      where: {
        exchangeId,
        kind,
        createdAt: { gte: new Date(now.getTime() - REMINDER_KIND_COOLDOWN_MS) },
      },
    });
    const inWindow = await tx.exchangeReminder.count({
      where: {
        exchangeId,
        createdAt: { gte: new Date(now.getTime() - REMINDER_WINDOW_MS) },
      },
    });
    if (sinceCooldown > 0 || inWindow >= REMINDER_WINDOW_LIMIT) {
      return { blocked: true as const };
    }

    const status = await tx.exchange.findUnique({
      where: { id: exchangeId },
      select: { status: true },
    });
    if (status?.status !== EXCHANGE_STATUS.GATHERING) {
      return { blocked: true as const };
    }

    await tx.exchangeReminder.create({
      data: {
        exchangeId,
        senderId: actorId,
        kind,
        idempotencyKey,
        // Explicit rather than the database default: the cooldown is counted
        // from when the reminder was sent, which is what `now` means.
        createdAt: now,
        targetCount: availability.eligibleCount,
      },
    });
    return { created: true as const, targetCount: availability.eligibleCount };
  });

  if ('blocked' in outcome) {
    throw data(
      { error: 'That reminder has already gone out. Try again tomorrow.' },
      { status: 429 },
    );
  }
  if ('replayed' in outcome) {
    return { status: 'QUEUED', kind, targetCount: outcome.targetCount };
  }
  if ('created' in outcome) {
    // After the commit, and fire-and-forget: a fan-out failure must not turn
    // a sent reminder into a 500.
    queueExchangeReminder(exchangeId, {
      senderId: actorId,
      giftGroupId: exchange.giftGroupId,
    });
  }
  return { status: 'QUEUED', kind, targetCount: outcome.targetCount };
}
