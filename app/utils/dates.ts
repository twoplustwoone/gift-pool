const CALENDAR_DATE_TIME_ZONE = 'UTC';

/**
 * Formats a date-only value without allowing the runtime timezone to shift it.
 * Output: "Apr 4"
 */
export function formatMonthDay(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: CALENDAR_DATE_TIME_ZONE,
  });
}

/**
 * Formats an absolute date where the year is meaningful.
 * Output: "April 4, 2026"
 */
export function formatAbsoluteDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: CALENDAR_DATE_TIME_ZONE,
  });
}
