import { describe, expect, it } from 'vitest';
import {
  applyPendingCategoryMutations,
  applySettledCategoryMutations,
  pruneSatisfiedSettledCategoryMutations,
  type CategoryMutationResult,
  type WishlistCategory,
} from './wishlist-category-state';

const booksCategory: WishlistCategory = {
  id: 'cat-books',
  name: 'Books',
  order: 0,
};

const gamesCategory: WishlistCategory = {
  id: 'cat-games',
  name: 'Games',
  order: 1,
};

describe('wishlist category state', () => {
  it('create success survives stale loader snapshot', () => {
    const categories = applySettledCategoryMutations({
      categories: [booksCategory],
      settledMutations: [
        {
          ok: true,
          intent: 'create',
          clientMutationId: 'create-games',
          category: gamesCategory,
        },
      ],
    });

    expect(categories.map((category) => category.name)).toEqual([
      'Books',
      'Games',
    ]);
  });

  it('create success is pruned once loader includes real category', () => {
    const settledMutations: CategoryMutationResult[] = [
      {
        ok: true,
        intent: 'create',
        clientMutationId: 'create-games',
        category: gamesCategory,
      },
    ];

    const remainingMutations = pruneSatisfiedSettledCategoryMutations({
      serverCategories: [booksCategory, gamesCategory],
      settledMutations,
    });

    expect(remainingMutations).toEqual([]);
  });

  it('rename success survives stale loader snapshot', () => {
    const categories = applySettledCategoryMutations({
      categories: [booksCategory],
      settledMutations: [
        {
          ok: true,
          intent: 'rename',
          clientMutationId: 'rename-books',
          category: { ...booksCategory, name: 'Novels' },
        },
      ],
    });

    expect(categories).toEqual([
      {
        id: 'cat-books',
        name: 'Novels',
        order: 0,
      },
    ]);
  });

  it('delete success survives stale loader snapshot', () => {
    const categories = applySettledCategoryMutations({
      categories: [booksCategory, gamesCategory],
      settledMutations: [
        {
          ok: true,
          intent: 'delete',
          clientMutationId: 'delete-games',
          deletedCategoryId: gamesCategory.id,
        },
      ],
    });

    expect(categories).toEqual([booksCategory]);
  });

  it('pending optimistic create overrides older settled and server state', () => {
    const settledCategories = applySettledCategoryMutations({
      categories: [booksCategory],
      settledMutations: [
        {
          ok: true,
          intent: 'create',
          clientMutationId: 'create-games',
          category: gamesCategory,
        },
      ],
    });

    const categories = applyPendingCategoryMutations({
      categories: settledCategories,
      pendingMutations: [
        {
          type: 'create',
          clientMutationId: 'create-movies',
          name: 'Movies',
          order: 2,
        },
      ],
    });

    expect(categories.map((category) => category.name)).toEqual([
      'Books',
      'Games',
      'Movies',
    ]);
  });

  it('overlapping successful creates do not collapse to the earlier result', () => {
    const categories = applySettledCategoryMutations({
      categories: [],
      settledMutations: [
        {
          ok: true,
          intent: 'create',
          clientMutationId: 'create-books',
          category: booksCategory,
        },
        {
          ok: true,
          intent: 'create',
          clientMutationId: 'create-games',
          category: gamesCategory,
        },
      ],
    });

    expect(categories.map((category) => category.name)).toEqual([
      'Books',
      'Games',
    ]);
  });
});
