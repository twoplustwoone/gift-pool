import { describe, expect, it } from 'vitest';
import {
  autoRevealInstant,
  dateInputToUtcMidnight,
  defaultAutoRevealInstant,
  localTimeToUtc,
  parseDateInput,
  toDateInput,
} from './exchange-dates.ts';

describe('exchange dates', () => {
  it('parses and round-trips date inputs as UTC calendar days', () => {
    expect(parseDateInput('2026-12-24')).toEqual({
      year: 2026,
      month: 12,
      day: 24,
    });
    expect(parseDateInput('2026-02-30')).toBeNull();
    expect(parseDateInput('24/12/2026')).toBeNull();
    expect(dateInputToUtcMidnight('2026-12-24')?.toISOString()).toBe(
      '2026-12-24T00:00:00.000Z',
    );
    expect(toDateInput(new Date('2026-12-24T23:59:00Z'))).toBe('2026-12-24');
  });

  it('turns a local wall-clock time into the right UTC instant across zones and DST', () => {
    // Buenos Aires is UTC-3 all year.
    expect(
      localTimeToUtc(
        { year: 2026, month: 12, day: 27 },
        9,
        'America/Argentina/Buenos_Aires',
      ).toISOString(),
    ).toBe('2026-12-27T12:00:00.000Z');
    // New York: EST in December (UTC-5), EDT in July (UTC-4).
    expect(
      localTimeToUtc(
        { year: 2026, month: 12, day: 27 },
        9,
        'America/New_York',
      ).toISOString(),
    ).toBe('2026-12-27T14:00:00.000Z');
    expect(
      localTimeToUtc(
        { year: 2026, month: 7, day: 4 },
        9,
        'America/New_York',
      ).toISOString(),
    ).toBe('2026-07-04T13:00:00.000Z');
    // Unknown zone falls back to UTC rather than throwing.
    expect(
      localTimeToUtc(
        { year: 2026, month: 12, day: 27 },
        9,
        'Mars/Olympus',
      ).toISOString(),
    ).toBe('2026-12-27T09:00:00.000Z');
  });

  it('derives the auto-reveal instant: chosen date or three days after, 09:00 local', () => {
    expect(
      autoRevealInstant('2026-12-27', 'Europe/Madrid')?.toISOString(),
    ).toBe('2026-12-27T08:00:00.000Z');
    expect(
      defaultAutoRevealInstant(
        new Date('2026-12-24T00:00:00Z'),
        'Europe/Madrid',
      ).toISOString(),
    ).toBe('2026-12-27T08:00:00.000Z');
  });
});
