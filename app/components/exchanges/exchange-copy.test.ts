import { describe, expect, it } from 'vitest';
import {
  countdownLabel,
  formatExchangeDate,
  inDaysLabel,
  listNames,
  repeatsSentence,
  shortName,
} from './exchange-copy.ts';

const NOW = new Date('2026-12-12T15:00:00Z');

describe('exchange copy', () => {
  it('formats dates as "24 Dec" regardless of runtime timezone', () => {
    expect(formatExchangeDate('2026-12-24T00:00:00Z')).toBe('24 Dec');
    expect(formatExchangeDate(new Date('2026-01-05T23:30:00Z'))).toBe('5 Jan');
  });

  it('counts down calmly and reports past dates plainly', () => {
    expect(countdownLabel('2026-12-24T00:00:00Z', NOW)).toBe('12 days to go');
    expect(countdownLabel('2026-12-13T00:00:00Z', NOW)).toBe('tomorrow');
    expect(countdownLabel('2026-12-12T00:00:00Z', NOW)).toBe('today');
    expect(countdownLabel('2026-12-10T00:00:00Z', NOW)).toBe('was 10 Dec');
    expect(inDaysLabel('2026-12-14T00:00:00Z', NOW)).toBe('in 2 days');
  });

  it('lists names the way people say them', () => {
    expect(listNames(['A'])).toBe('A');
    expect(listNames(['A', 'B'])).toBe('A and B');
    expect(listNames(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('shortens surnames for the roster strip', () => {
    expect(
      shortName({ name: 'Francisco Di Giandomenico', username: 'fd' }),
    ).toBe('Francisco G.');
    expect(shortName({ name: null, username: 'np' })).toBe('np');
  });

  it('states the repeats outcome before the draw, never a guess', () => {
    expect(repeatsSentence('NONE', 5)).toBe(
      'Everyone gets someone new this year.',
    );
    expect(repeatsSentence('SOME', 4)).toBe(
      'With four people, some repeats are unavoidable.',
    );
    expect(repeatsSentence('NOT_APPLICABLE', 5)).toBeNull();
  });
});
