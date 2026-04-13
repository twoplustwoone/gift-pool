/**
 * Formats an absolute date where the year is meaningful.
 * Output: "April 4, 2026"
 */
export function formatAbsoluteDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

