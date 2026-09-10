// Notes, clues and thank-yous: the preset catalogue and the delivery-slot
// maths. Pure — no database, no request — so the rules can be tested directly
// and shared by the composer and the server.
import { localTimeToUtc } from './exchange-dates.ts';

// Shared between notes and clues, per exchange, per day. Shown as remaining
// and only once the composer is open (board §15): a badge on the page would
// turn a secrecy feature into a scoreboard.
export const NOTE_DAILY_ALLOWANCE = 3;

// Everything a gifter sends lands in one batch the next morning, in the
// RECIPIENT's zone. A 2am note is itself a clue, so the delay is the feature.
export const NOTE_DELIVERY_LOCAL_HOUR = 9;

export const NOTE_DIRECTION = {
  TO_GIFTEE: 'TO_GIFTEE',
  TO_GIFTER: 'TO_GIFTER',
} as const;
export type NoteDirection =
  (typeof NOTE_DIRECTION)[keyof typeof NOTE_DIRECTION];

export const NOTE_KIND = {
  NOTE: 'NOTE',
  CLUE: 'CLUE',
  THANKS: 'THANKS',
} as const;
export type NoteKind = (typeof NOTE_KIND)[keyof typeof NOTE_KIND];

export type NotePreset = { key: string; text: string };

// Preset-only, both directions, one tap to pick and one to send. Free text
// would leak handwriting, in-jokes and tone — the whole reason notes are
// preset in the first place.
export const GIFTER_NOTE_PRESETS: NotePreset[] = [
  { key: 'got-it', text: "I've got your gift." },
  { key: 'add-wishlist', text: 'Add a few more things to your wishlist.' },
  { key: 'breadbox', text: "It's bigger than a breadbox." },
  { key: 'insufferable', text: "You're going to be insufferable about this." },
  { key: 'nearly-gave-away', text: 'Nearly gave the game away yesterday.' },
];

export const GIFTEE_NOTE_PRESETS: NotePreset[] = [
  { key: 'thanks-for-note', text: 'Thanks for the note.' },
  { key: 'no-idea', text: "I've got no idea who you are." },
  { key: 'getting-closer', text: "I think I'm getting closer." },
  { key: 'wishlist-updated', text: "I've added more to my wishlist." },
  { key: 'excited', text: "Whoever you are, I'm excited." },
];

// The only note that carries a name (board §4, revealed frame).
export const THANKS_PRESETS: NotePreset[] = [
  { key: 'loved-it', text: 'Thank you — I loved it.' },
  { key: 'spot-on', text: 'Thank you, it was spot on.' },
  { key: 'made-my-day', text: 'Thank you, it made my day.' },
];

export function presetsFor(
  direction: NoteDirection,
  kind: NoteKind,
): NotePreset[] {
  if (kind === NOTE_KIND.THANKS) return THANKS_PRESETS;
  return direction === NOTE_DIRECTION.TO_GIFTEE
    ? GIFTER_NOTE_PRESETS
    : GIFTEE_NOTE_PRESETS;
}

export function findPreset(
  direction: NoteDirection,
  kind: NoteKind,
  key: string,
): NotePreset | null {
  return presetsFor(direction, kind).find((p) => p.key === key) ?? null;
}

// `User.timeZone` is whatever the browser hint said, so an unusable value has
// to degrade to UTC rather than throw — a junk zone on one recipient must not
// take down the delivery sweep for everyone else.
function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

function zonedParts(instant: Date, requestedZone: string) {
  const timeZone = safeZone(requestedZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    weekday: 'long',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour') === '24' ? '0' : get('hour')),
    weekday: get('weekday'),
  };
}

// The next 09:00 in the recipient's zone, strictly after `now`: later today
// for anything written overnight, tomorrow otherwise. The batch is what makes
// a note anonymous — everything in it arrives together, so a 2am note and a
// 10am note are indistinguishable once they land.
export function nextMorningSlot(now: Date, timeZone: string): Date {
  const here = zonedParts(now, timeZone);
  const today = localTimeToUtc(here, NOTE_DELIVERY_LOCAL_HOUR, timeZone);
  if (today.getTime() > now.getTime()) return today;
  const tomorrow = zonedParts(
    new Date(now.getTime() + 24 * 60 * 60 * 1000),
    timeZone,
  );
  return localTimeToUtc(tomorrow, NOTE_DELIVERY_LOCAL_HOUR, timeZone);
}

// Timestamps are coarsened to the slot everywhere they appear — in the thread,
// in notifications and in email. "2:04am" would say more about the sender than
// the note does.
export function coarsenToSlot(
  deliveredAt: Date,
  now: Date,
  timeZone: string,
): string {
  const then = zonedParts(deliveredAt, timeZone);
  const today = zonedParts(now, timeZone);
  const dayOf = (p: { year: number; month: number; day: number }) =>
    Date.UTC(p.year, p.month - 1, p.day);
  const daysAgo = Math.round(
    (dayOf(today) - dayOf(then)) / (24 * 60 * 60 * 1000),
  );
  if (daysAgo <= 0) return 'This morning';
  if (daysAgo === 1) return 'Yesterday morning';
  if (daysAgo < 7) return `${then.weekday} morning`;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: safeZone(timeZone),
    day: 'numeric',
    month: 'short',
  }).format(deliveredAt);
}

// What the composer says about a note that hasn't been delivered yet.
export function pendingSlotLabel(
  scheduledFor: Date,
  now: Date,
  timeZone: string,
): string {
  const slot = zonedParts(scheduledFor, timeZone);
  const today = zonedParts(now, timeZone);
  const sameDay =
    slot.year === today.year &&
    slot.month === today.month &&
    slot.day === today.day;
  return sameDay ? 'arrives this morning' : 'arrives tomorrow morning';
}
