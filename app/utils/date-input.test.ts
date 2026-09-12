import { describe, expect, it } from 'vitest';
import { formatDateInput, parseFlexibleDateInput } from './date-input.ts';

describe('formatDateInput', () => {
  it('formats a date-only value as "24 Dec", optionally with year', () => {
    expect(formatDateInput('2026-12-24')).toBe('24 Dec');
    expect(formatDateInput('2026-12-24', true)).toBe('24 Dec 2026');
  });

  it('returns empty string for an unparseable value', () => {
    expect(formatDateInput('')).toBe('');
    expect(formatDateInput('not a date')).toBe('');
  });
});

describe('parseFlexibleDateInput', () => {
  const ref = 2026;

  it('parses ISO', () => {
    expect(parseFlexibleDateInput('2026-12-24', ref)).toBe('2026-12-24');
  });

  it('resolves ambiguous numeric dates day-before-month, not US month-before-day', () => {
    expect(parseFlexibleDateInput('3/4/2026', ref)).toBe('2026-04-03');
    expect(parseFlexibleDateInput('24/12/2026', ref)).toBe('2026-12-24');
  });

  it('fills in the reference year for a partial numeric date', () => {
    expect(parseFlexibleDateInput('3/4', ref)).toBe(`${ref}-04-03`);
  });

  it('parses "24 Dec" and "24 Dec 2026" day-month forms', () => {
    expect(parseFlexibleDateInput('24 Dec', ref)).toBe(`${ref}-12-24`);
    expect(parseFlexibleDateInput('24 Dec 2026', ref)).toBe('2026-12-24');
    expect(parseFlexibleDateInput('24dec2026', ref)).toBe('2026-12-24');
  });

  it('parses "Dec 24" and "Dec 24, 2026" month-day forms', () => {
    expect(parseFlexibleDateInput('Dec 24', ref)).toBe(`${ref}-12-24`);
    expect(parseFlexibleDateInput('Dec 24, 2026', ref)).toBe('2026-12-24');
  });

  it('rejects an impossible calendar date', () => {
    expect(parseFlexibleDateInput('32 Dec 2026', ref)).toBeNull();
    expect(parseFlexibleDateInput('2026-02-30', ref)).toBeNull();
  });

  it('rejects an unrecognized month name', () => {
    expect(parseFlexibleDateInput('24 Foo 2026', ref)).toBeNull();
  });

  it('rejects empty and garbage input', () => {
    expect(parseFlexibleDateInput('', ref)).toBeNull();
    expect(parseFlexibleDateInput('   ', ref)).toBeNull();
    expect(parseFlexibleDateInput('hello world', ref)).toBeNull();
  });
});
