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

/**
 * Formats an upcoming or recurring date where the year isn't needed.
 * Output: "May 3"
 */
export function formatDisplayDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
