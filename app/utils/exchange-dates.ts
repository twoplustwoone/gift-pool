// Date plumbing for the exchange forms. Exchange dates are date-only values
// stored as UTC midnight (the same convention as pool event dates); the
// auto-reveal instant is a real moment, chosen as 09:00 in the organizer's
// time zone so "reveals on 27 Dec" means their morning, not a UTC boundary.

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateInput(
  value: string | null | undefined,
): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const match = DATE_INPUT.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

// "2026-12-24" → 2026-12-24T00:00:00Z
export function dateInputToUtcMidnight(value: string): Date | null {
  const parts = parseDateInput(value);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

// Date → "2026-12-24" (UTC calendar parts)
export function toDateInput(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function zonedParts(instant: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const get = (type: string) =>
    Number(fmt.formatToParts(instant).find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// The UTC instant at which a wall-clock time occurs in `timeZone`. Two-pass
// offset correction handles DST; an unknown zone falls back to UTC.
export function localTimeToUtc(
  { year, month, day }: { year: number; month: number; day: number },
  hour: number,
  timeZone: string,
): Date {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  let guess = Date.UTC(year, month - 1, day, hour);
  for (let i = 0; i < 2; i++) {
    const parts = zonedParts(new Date(guess), zone);
    const asIfUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
    );
    guess -= asIfUtc - Date.UTC(year, month - 1, day, hour);
  }
  return new Date(guess);
}

export const AUTO_REVEAL_LOCAL_HOUR = 9;

// The auto-reveal moment for a given calendar date in the organizer's zone.
export function autoRevealInstant(
  dateInput: string,
  timeZone: string,
): Date | null {
  const parts = parseDateInput(dateInput);
  if (!parts) return null;
  return localTimeToUtc(parts, AUTO_REVEAL_LOCAL_HOUR, timeZone);
}

// Default auto-reveal: three days after the exchange date, 09:00 local.
export function defaultAutoRevealInstant(
  eventDate: Date,
  timeZone: string,
  days = 3,
): Date {
  const shifted = new Date(eventDate.getTime() + days * 24 * 60 * 60 * 1000);
  return localTimeToUtc(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
    },
    AUTO_REVEAL_LOCAL_HOUR,
    timeZone,
  );
}
