// Copy helpers for exchange surfaces. Naming rules from the design board:
// "Gift exchange" on first mention, "Exchange" once the page has established
// itself; people are referred to by name, never as "your person" outside the
// section label; dates read "24 Dec"; countdowns are calm ("12 days to go").

export type ExchangePersonLike = {
  name: string | null;
  username: string;
};

export function displayName(person: ExchangePersonLike): string {
  return person.name?.trim() || person.username;
}

export function firstName(person: ExchangePersonLike): string {
  return displayName(person).split(/\s+/)[0] ?? displayName(person);
}

// "Francisco D." — the roster strip shortens surnames so five people fit.
export function shortName(person: ExchangePersonLike): string {
  const parts = displayName(person).split(/\s+/);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}

const CALENDAR_TZ = 'UTC';

// "24 Dec" — a date-only value rendered without the runtime timezone shifting
// it (same rule as `formatMonthDay`, different order to match the board).
export function formatExchangeDate(date: Date | string): string {
  const d = new Date(date);
  const day = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    timeZone: CALENDAR_TZ,
  });
  const month = d.toLocaleDateString('en-GB', {
    month: 'short',
    timeZone: CALENDAR_TZ,
  });
  return `${day} ${month}`;
}

// "24 Dec 2026"
export function formatExchangeDateWithYear(date: Date | string): string {
  const d = new Date(date);
  return `${formatExchangeDate(d)} ${d.toLocaleDateString('en-GB', {
    year: 'numeric',
    timeZone: CALENDAR_TZ,
  })}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      DAY_MS,
  );
}

export function daysUntil(eventDate: Date | string, now: Date): number {
  return utcDayNumber(new Date(eventDate)) - utcDayNumber(now);
}

// "12 days to go" · "tomorrow" · "today" · "was 24 Dec"
export function countdownLabel(eventDate: Date | string, now: Date): string {
  const days = daysUntil(eventDate, now);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `${days} days to go`;
  return `was ${formatExchangeDate(eventDate)}`;
}

// "in 2 days" · "tomorrow" · "today"
export function inDaysLabel(date: Date | string, now: Date): string {
  const days = daysUntil(date, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

// "Francisco, Nicolas and Agustin"
export function listNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const COUNT_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

// The repeats sentence, computed before the draw, never after.
export function repeatsSentence(
  repeats: 'NONE' | 'SOME' | 'NOT_APPLICABLE',
  participantCount: number,
): string | null {
  switch (repeats) {
    case 'NONE':
      return 'Everyone gets someone new this year.';
    case 'SOME':
      return `With ${countWord(participantCount)} people, some repeats are unavoidable.`;
    default:
      return null;
  }
}
