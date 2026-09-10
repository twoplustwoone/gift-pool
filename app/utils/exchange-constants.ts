// Exchange vocabulary — the single mapping from stored strings to user-facing
// labels. Client-safe: no Prisma, no server imports.
//
// Flow: GATHERING → DRAWN → REVEALED (revealMode ORGANIZER)
//                         → FINISHED (revealMode SECRET_FOREVER)
//                 ↘ CANCELLED (from GATHERING or DRAWN)
export const EXCHANGE_STATUS = {
  GATHERING: 'GATHERING',
  DRAWN: 'DRAWN',
  REVEALED: 'REVEALED',
  FINISHED: 'FINISHED',
  CANCELLED: 'CANCELLED',
} as const;

export type ExchangeStatus =
  (typeof EXCHANGE_STATUS)[keyof typeof EXCHANGE_STATUS];

export const EXCHANGE_STATUS_VALUES = Object.values(
  EXCHANGE_STATUS,
) as ExchangeStatus[];

// Derived, user-facing stage. DRAWN splits into three labels by date: before
// the exchange date it is simply "Drawn"; on the day it is "Today"; afterwards
// the organizer's reveal button is live and the pill reads "Ready to reveal".
export const EXCHANGE_STAGE = {
  GATHERING: 'GATHERING',
  DRAWN: 'DRAWN',
  TODAY: 'TODAY',
  READY_TO_REVEAL: 'READY_TO_REVEAL',
  REVEALED: 'REVEALED',
  FINISHED: 'FINISHED',
  CANCELLED: 'CANCELLED',
} as const;

export type ExchangeStage =
  (typeof EXCHANGE_STAGE)[keyof typeof EXCHANGE_STAGE];

export const EXCHANGE_STAGE_LABELS: Record<ExchangeStage, string> = {
  GATHERING: 'Gathering people',
  DRAWN: 'Drawn',
  TODAY: 'Today',
  READY_TO_REVEAL: 'Ready to reveal',
  REVEALED: 'Revealed',
  FINISHED: 'Finished',
  CANCELLED: 'Cancelled',
};

// Compares calendar dates in the given IANA time zone so "today" means the
// viewer's today, not the server's UTC day.
export function isSameCalendarDay(
  a: Date,
  b: Date,
  timeZone: string = 'UTC',
): boolean {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(a) === fmt.format(b);
}

export function getExchangeStage(
  exchange: { status: string; eventDate: Date },
  now: Date = new Date(),
  timeZone: string = 'UTC',
): ExchangeStage {
  switch (exchange.status) {
    case EXCHANGE_STATUS.GATHERING:
      return EXCHANGE_STAGE.GATHERING;
    case EXCHANGE_STATUS.DRAWN:
      if (isSameCalendarDay(exchange.eventDate, now, timeZone)) {
        return EXCHANGE_STAGE.TODAY;
      }
      return now > exchange.eventDate
        ? EXCHANGE_STAGE.READY_TO_REVEAL
        : EXCHANGE_STAGE.DRAWN;
    case EXCHANGE_STATUS.REVEALED:
      return EXCHANGE_STAGE.REVEALED;
    case EXCHANGE_STATUS.FINISHED:
      return EXCHANGE_STAGE.FINISHED;
    default:
      return EXCHANGE_STAGE.CANCELLED;
  }
}

export function getExchangeStageLabel(
  exchange: { status: string; eventDate: Date },
  now: Date = new Date(),
  timeZone: string = 'UTC',
): string {
  return EXCHANGE_STAGE_LABELS[getExchangeStage(exchange, now, timeZone)];
}

export const REVEAL_MODE = {
  ORGANIZER: 'ORGANIZER',
  SECRET_FOREVER: 'SECRET_FOREVER',
} as const;

export type RevealMode = (typeof REVEAL_MODE)[keyof typeof REVEAL_MODE];

export const PARTICIPANT_STATUS = {
  IN: 'IN',
  OUT: 'OUT',
  PENDING: 'PENDING',
} as const;

export type ParticipantStatus =
  (typeof PARTICIPANT_STATUS)[keyof typeof PARTICIPANT_STATUS];

// Gifter-owned progress. Received is the giftee's, tracked separately so it
// never becomes a nag on the gifter's stepper.
export const GIFT_STAGE = {
  NONE: 'NONE',
  GOT_IT: 'GOT_IT',
  WRAPPED: 'WRAPPED',
  GIVEN: 'GIVEN',
} as const;

export type GiftStage = (typeof GIFT_STAGE)[keyof typeof GIFT_STAGE];

export const GIFT_STAGE_ORDER: GiftStage[] = [
  GIFT_STAGE.NONE,
  GIFT_STAGE.GOT_IT,
  GIFT_STAGE.WRAPPED,
  GIFT_STAGE.GIVEN,
];

export const GIFT_STAGE_LABELS: Record<GiftStage, string> = {
  NONE: 'Not got it yet',
  GOT_IT: 'Got it',
  WRAPPED: 'Wrapped',
  GIVEN: 'Given',
};

// Two options, both kind. No stars, no free text.
export const GIFT_OUTCOME = {
  LOVED: 'LOVED',
  OKAY: 'OKAY',
} as const;

export type GiftOutcome = (typeof GIFT_OUTCOME)[keyof typeof GIFT_OUTCOME];

export const GIFT_OUTCOME_LABELS: Record<GiftOutcome, string> = {
  LOVED: 'Loved it',
  OKAY: "It's good",
};

export const CANCEL_REASON = {
  ORGANIZER: 'ORGANIZER',
  TOO_FEW_AFTER_LEAVE: 'TOO_FEW_AFTER_LEAVE',
  // Removing someone from a drawn loop would have joined two people who are
  // excluded from each other. Exclusions are hard, so the exchange stops
  // rather than quietly pairing a couple who asked not to be paired.
  EXCLUSIONS_AFTER_LEAVE: 'EXCLUSIONS_AFTER_LEAVE',
} as const;

export type CancelReason = (typeof CANCEL_REASON)[keyof typeof CANCEL_REASON];

// Rules that change the maths.
export const EXCHANGE_MIN_PARTICIPANTS = 3;
export const DEFAULT_LOOKBACK = 2;
export const AUTO_REVEAL_DEFAULT_DAYS = 3;
export const SPENDING_GUIDELINE_MAX_LENGTH = 80;
export const EXCHANGE_TITLE_MAX_LENGTH = 100;
