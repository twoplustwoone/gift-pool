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
    parsed.getMonth(),
    parsed.getDate(),
  );
  if (candidate.getTime() < today.getTime()) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }
  const daysUntil = Math.round(
    (candidate.getTime() - today.getTime()) / MS_PER_DAY,
  );
  return { date: candidate, daysUntil };
}

// Short human label — "Today!", "Tomorrow", or "Sep 12".
export function formatBirthdayLabel(date: Date, daysUntil: number) {
  if (daysUntil === 0) return 'Today!';
  if (daysUntil === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}
