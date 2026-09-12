// Date-only value plumbing shared by every date field in the app — the
// canonical value everywhere is a `yyyy-mm-dd` string (or `''` for none),
// the same contract the native `<input type="date">` used before `DateField`
// replaced it.

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

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// "24 Dec" — matches the app's existing day-before-month display convention
// (see exchange-copy.ts's formatExchangeDate, same rule).
export function formatDateInput(value: string, withYear = false): string {
  const parts = parseDateInput(value);
  if (!parts) return '';
  const short = `${parts.day} ${MONTHS[parts.month - 1]}`;
  return withYear ? `${short} ${parts.year}` : short;
}

function monthIndex(name: string): number {
  const key = name.slice(0, 3).toLowerCase();
  return MONTHS.findIndex((m) => m.toLowerCase() === key);
}

function makeDateInput(year: number, month: number, day: number): string | null {
  const probe = new Date(Date.UTC(year, month, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return toDateInput(probe);
}

function fullYear(twoOrFourDigit: number): number {
  return twoOrFourDigit < 100 ? 2000 + twoOrFourDigit : twoOrFourDigit;
}

// Free-text date entry, tried in order. Accepts the app's own "24 Dec 2026"
// output, plain ISO, and common typed shorthands. Ambiguous slash/dash
// numeric dates ("3/4") resolve day-before-month, matching how the app
// already displays every date elsewhere (formatExchangeDate's 'en-GB'
// convention) — not the US month-before-day order.
export function parseFlexibleDateInput(
  raw: string,
  referenceYear: number,
): string | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return makeDateInput(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m)
    return makeDateInput(
      fullYear(Number(m[3])),
      Number(m[2]) - 1,
      Number(m[1]),
    );

  m = /^(\d{1,2})[/.-](\d{1,2})$/.exec(s);
  if (m)
    return makeDateInput(referenceYear, Number(m[2]) - 1, Number(m[1]));

  m = /^(\d{1,2}) ?([A-Za-z]{3,})\.?,? ?(\d{2,4})?$/.exec(s);
  if (m) {
    const mo = monthIndex(m[2]!);
    if (mo < 0) return null;
    return makeDateInput(
      m[3] ? fullYear(Number(m[3])) : referenceYear,
      mo,
      Number(m[1]),
    );
  }

  m = /^([A-Za-z]{3,})\.? ?(\d{1,2}),? ?(\d{2,4})?$/.exec(s);
  if (m) {
    const mo = monthIndex(m[1]!);
    if (mo < 0) return null;
    return makeDateInput(
      m[3] ? fullYear(Number(m[3])) : referenceYear,
      mo,
      Number(m[2]),
    );
  }

  return null;
}
