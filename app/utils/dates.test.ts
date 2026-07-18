/**
 * @vitest-environment node
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  formatCalendarDate,
  formatMonthDay,
  formatTimestampDate,
} from './dates.ts';

const originalTimeZone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'America/New_York';
});

afterAll(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

describe('UTC calendar-date formatting', () => {
  it('keeps a midnight-UTC date on its stored month and day', () => {
    expect(formatMonthDay('2026-05-03T00:00:00.000Z')).toBe('May 3');
  });

  it('keeps a noon-UTC birthday on its stored month and day', () => {
    expect(formatMonthDay('1992-07-04T12:00:00.000Z')).toBe('Jul 4');
  });

  it('formats long calendar dates in UTC as well', () => {
    expect(formatCalendarDate('2026-05-03T00:00:00.000Z')).toBe('May 3, 2026');
  });
});

describe('viewer-local timestamp formatting', () => {
  it('uses the explicit viewer timezone near midnight UTC', () => {
    expect(
      formatTimestampDate('2026-05-03T01:00:00.000Z', 'America/New_York'),
    ).toBe('May 2, 2026');
  });

  it('does not depend on the runtime timezone', () => {
    expect(
      formatTimestampDate('2026-05-03T01:00:00.000Z', 'Europe/Paris'),
    ).toBe('May 3, 2026');
  });

  it('falls back to UTC for a malformed timezone hint', () => {
    expect(
      formatTimestampDate('2026-05-03T01:00:00.000Z', 'Not/A_Time_Zone'),
    ).toBe('May 3, 2026');
  });
});
