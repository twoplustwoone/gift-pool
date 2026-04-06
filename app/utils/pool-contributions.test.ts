/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';

import { calculateContributions, formatCents } from './pool-contributions.ts';

describe('pool contribution calculations', () => {
  it('splits an equal contribution evenly', () => {
    const result = calculateContributions(
      [
        { userId: 'a', maxCents: 3000 },
        { userId: 'b', maxCents: 3000 },
        { userId: 'c', maxCents: 3000 },
      ],
      6000,
    );

    expect(result).toEqual({
      breakdown: [
        { userId: 'a', owedCents: 2000 },
        { userId: 'b', owedCents: 2000 },
        { userId: 'c', owedCents: 2000 },
      ],
      shortfallCents: 0,
      surplusCents: 3000,
      totalAvailableCents: 9000,
    });
  });

  it('caps lower budgets before pushing the remainder upward', () => {
    const result = calculateContributions(
      [
        { userId: 'a', maxCents: 3000 },
        { userId: 'b', maxCents: 2000 },
        { userId: 'c', maxCents: 1000 },
      ],
      5500,
    );

    expect(result.breakdown).toEqual([
      { userId: 'c', owedCents: 1000 },
      { userId: 'b', owedCents: 2000 },
      { userId: 'a', owedCents: 2500 },
    ]);
    expect(result.shortfallCents).toBe(0);
    expect(result.surplusCents).toBe(500);
  });

  it('leaves the final cent with the last contributor for rounding', () => {
    const result = calculateContributions(
      [
        { userId: 'a', maxCents: 1000 },
        { userId: 'b', maxCents: 1000 },
        { userId: 'c', maxCents: 1000 },
      ],
      2500,
    );

    expect(result.breakdown).toEqual([
      { userId: 'a', owedCents: 833 },
      { userId: 'b', owedCents: 833 },
      { userId: 'c', owedCents: 834 },
    ]);
  });

  it('reports shortfall when the price exceeds total available budget', () => {
    const result = calculateContributions(
      [
        { userId: 'a', maxCents: 1000 },
        { userId: 'b', maxCents: 1000 },
      ],
      3000,
    );

    expect(result.breakdown).toEqual([
      { userId: 'a', owedCents: 1000 },
      { userId: 'b', owedCents: 1000 },
    ]);
    expect(result.shortfallCents).toBe(1000);
    expect(result.surplusCents).toBe(0);
  });

  it('returns the full remaining room as surplus when the price is lower', () => {
    const result = calculateContributions(
      [
        { userId: 'a', maxCents: 4000 },
        { userId: 'b', maxCents: 1000 },
      ],
      1000,
    );

    expect(result.surplusCents).toBe(4000);
    expect(result.totalAvailableCents).toBe(5000);
  });

  it('formats cents as a usd string', () => {
    expect(formatCents(2500)).toBe('$25.00');
  });
});
