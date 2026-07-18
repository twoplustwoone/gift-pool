const CALENDAR_DATE_TIME_ZONE = 'UTC';

const LONG_DATE_OPTIONS = {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
} as const;

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

/** Formats a date-only value with its year. Output: "April 4, 2026" */
export function formatCalendarDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    ...LONG_DATE_OPTIONS,
    timeZone: CALENDAR_DATE_TIME_ZONE,
  });
}

/**
 * Formats a real timestamp on the viewer's local calendar.
 * The explicit timezone keeps server rendering and hydration deterministic.
 */
export function formatTimestampDate(
  date: Date | string,
  timeZone: string,
): string {
  const value = new Date(date);

  try {
    return value.toLocaleDateString('en-US', {
      ...LONG_DATE_OPTIONS,
      timeZone,
    });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;

    return value.toLocaleDateString('en-US', {
      ...LONG_DATE_OPTIONS,
      timeZone: CALENDAR_DATE_TIME_ZONE,
    });
  }
}
