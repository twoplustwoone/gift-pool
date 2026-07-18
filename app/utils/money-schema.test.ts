/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { optionalContributionCentsSchema } from './money-schema.ts';

describe('optionalContributionCentsSchema', () => {
  it('maps empty / missing input to undefined (partial update)', () => {
    expect(optionalContributionCentsSchema.parse('')).toBeUndefined();
    expect(optionalContributionCentsSchema.parse(undefined)).toBeUndefined();
  });

  it('coerces a valid integer string to a number', () => {
    expect(optionalContributionCentsSchema.parse('3500')).toBe(3500);
  });

  it('rejects non-numeric input instead of producing NaN', () => {
    expect(() => optionalContributionCentsSchema.parse('abc')).toThrow();
  });

  it('rejects negative values', () => {
    expect(() => optionalContributionCentsSchema.parse('-100')).toThrow();
  });

  it('rejects values above the ceiling', () => {
    expect(() => optionalContributionCentsSchema.parse('99999999')).toThrow();
  });
});
