/**
 * @vitest-environment node
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatAbsoluteDate, formatMonthDay } from './dates.ts';

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

  it('formats long dates in UTC as well', () => {
    expect(formatAbsoluteDate('2026-05-03T00:00:00.000Z')).toBe('May 3, 2026');
  });
});
