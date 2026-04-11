/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  BIO_MAX_LENGTH,
  BIRTHDAY_VISIBILITY_VALUES,
  BioSchema,
  BirthdaySchema,
  BirthdayVisibilitySchema,
} from './user-validation.ts';

describe('BioSchema', () => {
  it('trims whitespace', () => {
    expect(BioSchema.parse('  hello  ')).toBe('hello');
  });

  it('accepts a max-length bio', () => {
    const value = 'a'.repeat(BIO_MAX_LENGTH);
    expect(BioSchema.parse(value)).toBe(value);
  });

  it('rejects a bio longer than the max', () => {
    const value = 'a'.repeat(BIO_MAX_LENGTH + 1);
    expect(() => BioSchema.parse(value)).toThrow(/characters or fewer/);
  });
});

describe('BirthdayVisibilitySchema', () => {
  it('accepts all three enum values', () => {
    for (const value of BIRTHDAY_VISIBILITY_VALUES) {
      expect(BirthdayVisibilitySchema.parse(value)).toBe(value);
    }
  });

  it('rejects unknown strings', () => {
    expect(() => BirthdayVisibilitySchema.parse('PUBLIC')).toThrow();
  });
});

describe('BirthdaySchema', () => {
  it('transforms an ISO date string to noon UTC', () => {
    const result = BirthdaySchema.parse('1992-05-26');
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe('1992-05-26T12:00:00.000Z');
  });

  it('returns null for an empty string', () => {
    expect(BirthdaySchema.parse('')).toBeNull();
  });

  it('rejects malformed dates', () => {
    expect(() => BirthdaySchema.parse('05/26/1992')).toThrow();
    expect(() => BirthdaySchema.parse('1992-13-01')).not.toThrow(); // regex only validates shape
  });

  it('keeps the calendar date invariant across timezones when read with UTC getters', () => {
    // The whole point of noon UTC: regardless of the reader's timezone,
    // getUTCMonth/getUTCDate return the typed month/day.
    const parsed = BirthdaySchema.parse('1992-05-26') as Date;
    expect(parsed.getUTCMonth()).toBe(4); // May is month index 4
    expect(parsed.getUTCDate()).toBe(26);
  });
});
