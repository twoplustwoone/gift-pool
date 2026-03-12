/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWishlistCategoryMutations } from './use-wishlist-category-mutations';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useFetchers: () => [],
  };
});

// Stable references — avoids new array/fn references on each renderHook re-render,
// which would cause the server-sync effect to fire on every render → infinite loop
const NO_CATEGORIES: never[] = [];
const noop = vi.fn();

describe('useWishlistCategoryMutations', () => {
  it('returns empty pendingCategoryMutations when no matching fetchers', () => {
    const { result } = renderHook(() =>
      useWishlistCategoryMutations({
        orderedCategories: NO_CATEGORIES,
        setOrderedCategories: noop,
        serverCategories: NO_CATEGORIES,
      }),
    );
    expect(result.current.pendingCategoryMutations).toEqual([]);
  });

  it('returns optimisticCategories equal to orderedCategories when no mutations', () => {
    const categories = [{ id: 'cat1', name: 'Books', order: 0 }];
    const { result } = renderHook(() =>
      useWishlistCategoryMutations({
        orderedCategories: categories,
        setOrderedCategories: noop,
        serverCategories: categories,
      }),
    );
    expect(result.current.optimisticCategories).toEqual(categories);
  });

  it('handleCategoryMutationResult ignores mutations without ok or clientMutationId', () => {
    const { result } = renderHook(() =>
      useWishlistCategoryMutations({
        orderedCategories: NO_CATEGORIES,
        setOrderedCategories: noop,
        serverCategories: NO_CATEGORIES,
      }),
    );
    // Should not throw
    result.current.handleCategoryMutationResult({ ok: false });
    result.current.handleCategoryMutationResult({ ok: true });
  });
});
