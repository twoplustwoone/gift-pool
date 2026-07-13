// Shared birthday formatting helpers. Used by the friends list, the profile
// page header, and the Upcoming Birthdays card on Home. All three must
// agree on the visibility window so we don't show "Sep 12" in one place and
// hide it in another.

export const BIRTHDAY_VISIBILITY_DAYS = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type UpcomingBirthday = {
  date: Date;
  daysUntil: number;
};

// Next occurrence of this birthday's month/day, and how far it is from today.
// Returns null when the input is missing or unparseable.
//
// Reads month/day in UTC, not local time. Birthdays are stored as noon UTC
// (see `BirthdaySchema`) so that the calendar date is invariant across
// viewer timezones. Reading via `getUTCMonth` / `getUTCDate` closes the
// loop: a user in LA who picks May 26 sees May 26 on every client, not the
// shifted-by-one date that local-time getters would produce.
export function getUpcomingBirthday(
  birthday: Date | string | null | undefined,
): UpcomingBirthday | null {
  if (!birthday) return null;
  const parsed = birthday instanceof Date ? birthday : new Date(birthday);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const candidate = new Date(
    today.getFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
  );
  if (candidate.getTime() < today.getTime()) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }
  const daysUntil = Math.round(
    (candidate.getTime() - today.getTime()) / MS_PER_DAY,
  );
  return { date: candidate, daysUntil };
}

export type RecentBirthday = {
  date: Date;
  daysSince: number;
};

// The most recent PAST occurrence of this birthday's month/day, if it fell
// within the last `withinDays` days. Mirror of `getUpcomingBirthday` for the
// post-occasion window. Returns null when missing/unparseable or outside the
// window. Uses the same UTC month/day reading so the calendar date is
// timezone-invariant. `daysSince === 0` means the birthday is today.
export function getRecentBirthday(
  birthday: Date | string | null | undefined,
  withinDays: number,
): RecentBirthday | null {
  if (!birthday) return null;
  const parsed = birthday instanceof Date ? birthday : new Date(birthday);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const candidate = new Date(
    today.getFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
  );
  // If this year's occurrence hasn't happened yet, step back to last year's.
  if (candidate.getTime() > today.getTime()) {
    candidate.setFullYear(candidate.getFullYear() - 1);
  }
  const daysSince = Math.round(
    (today.getTime() - candidate.getTime()) / MS_PER_DAY,
  );
  if (daysSince < 0 || daysSince > withinDays) return null;
  return { date: candidate, daysSince };
}

// Short human label — "Today!", "Tomorrow", or "Sep 12". The Date passed
// in is already the local-timezone candidate constructed by
// `getUpcomingBirthday`, so local-time formatting is correct here.
// Sibling of `formatBirthdayWhen` below: this is the capitalized badge
// style, that one is the mid-sentence phrase style. Keep the two in step if
// the copy ever changes.
export function formatBirthdayLabel(date: Date, daysUntil: number) {
  if (daysUntil === 0) return 'Today!';
  if (daysUntil === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

// Mid-sentence phrase — 'today' | 'tomorrow' | 'on Jul 18'. Date-based
// beyond tomorrow so persistent surfaces (the notification bell, an email
// read days later) can't go stale the way "in 7 days" would. Used by the
// UPCOMING_BIRTHDAY notification message and email.
export function formatBirthdayWhen(daysUntil: number, birthdayDate: Date) {
  if (daysUntil === 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  const dateLabel = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(birthdayDate);
  return `on ${dateLabel}`;
}
