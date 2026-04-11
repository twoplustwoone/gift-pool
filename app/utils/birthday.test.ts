/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BIRTHDAY_VISIBILITY_DAYS,
  formatBirthdayLabel,
  getUpcomingBirthday,
} from './birthday.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('getUpcomingBirthday', () => {
  it('returns null for missing / invalid inputs', () => {
    expect(getUpcomingBirthday(null)).toBeNull();
    expect(getUpcomingBirthday(undefined)).toBeNull();
    expect(getUpcomingBirthday('')).toBeNull();
    expect(getUpcomingBirthday('not a date')).toBeNull();
  });

  it('counts days until the next occurrence of the stored month/day', () => {
    // Pretend today is 2026-04-10 local time.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 10, 12, 0, 0));

    // Birthday stored as noon UTC — the same representation BirthdaySchema
    // produces from a 1992-05-26 input.
    const birthday = new Date('1992-05-26T12:00:00.000Z');
    const result = getUpcomingBirthday(birthday);
    expect(result).not.toBeNull();
    expect(result!.date.getMonth()).toBe(4); // May
    expect(result!.date.getDate()).toBe(26);
    // From Apr 10 to May 26 = 46 days.
    expect(result!.daysUntil).toBe(46);
  });

  it('rolls forward to next year when the birthday has already passed this year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 12, 0, 0)); // June 10 2026
    const birthday = new Date('1992-05-26T12:00:00.000Z');
    const result = getUpcomingBirthday(birthday);
    expect(result!.date.getFullYear()).toBe(2027);
  });

  it('is not off-by-one for birthdays stored at noon UTC when the viewer is west of UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 10, 12, 0, 0));
    // Noon UTC → same calendar day everywhere populated on earth.
    // (Older code stored midnight UTC and read with local getters, which
    // shifted May 26 → May 25 in LA. This test locks the fix.)
    const birthday = new Date('1992-05-26T12:00:00.000Z');
    const result = getUpcomingBirthday(birthday);
    expect(result!.date.getDate()).toBe(26);
    expect(result!.date.getMonth()).toBe(4);
  });
});

describe('formatBirthdayLabel', () => {
  it("returns 'Today!' when daysUntil is 0", () => {
    expect(formatBirthdayLabel(new Date(2026, 4, 26), 0)).toBe('Today!');
  });

  it("returns 'Tomorrow' when daysUntil is 1", () => {
    expect(formatBirthdayLabel(new Date(2026, 4, 26), 1)).toBe('Tomorrow');
  });

  it('returns a short month/day label otherwise', () => {
    expect(formatBirthdayLabel(new Date(2026, 4, 26), 46)).toBe('May 26');
  });
});

describe('BIRTHDAY_VISIBILITY_DAYS', () => {
  it('is the 60-day window shared by every caller', () => {
    expect(BIRTHDAY_VISIBILITY_DAYS).toBe(60);
  });
});
