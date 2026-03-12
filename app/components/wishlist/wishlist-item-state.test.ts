import { describe, expect, it } from 'vitest';

import {
  applyCategoryItemOrder,
  applyPendingItemMutations,
  compareItemsBySortOrder,
  getNextSortOrder,
  moveItemIdBetweenLists,
  normalizeFormActionPath,
  normalizeNullableFormValue,
  redensifyCategorySortOrder,
  reorderItemIdsInList,
  type WishlistItem,
} from './wishlist-item-state';

const makeItem = (
  overrides: Partial<WishlistItem> & { id: string },
): WishlistItem => ({
  id: overrides.id,
  title: overrides.title ?? `Item ${overrides.id}`,
  ownerId: overrides.ownerId ?? 'owner1',
  note: overrides.note ?? null,
  url: overrides.url ?? null,
  type: overrides.type ?? 'text',
  categoryId: overrides.categoryId ?? null,
  sortOrder: overrides.sortOrder ?? 0,
  updatedAt: overrides.updatedAt ?? new Date('2024-01-01'),
  status: overrides.status ?? 'ACTIVE',
  hasImage: overrides.hasImage ?? false,
  imageSource: overrides.imageSource ?? null,
});

describe('compareItemsBySortOrder', () => {
  it('sorts by sortOrder ascending', () => {
    const a = makeItem({ id: 'a', sortOrder: 5 });
    const b = makeItem({ id: 'b', sortOrder: 2 });
    expect(compareItemsBySortOrder(a, b)).toBeGreaterThan(0);
    expect(compareItemsBySortOrder(b, a)).toBeLessThan(0);
  });

  it('tie-breaks by updatedAt then id', () => {
    const a = makeItem({
      id: 'a',
      sortOrder: 1,
      updatedAt: new Date('2024-01-02'),
    });
    const b = makeItem({
      id: 'b',
      sortOrder: 1,
      updatedAt: new Date('2024-01-01'),
    });
    expect(compareItemsBySortOrder(a, b)).toBeGreaterThan(0);

    const c = makeItem({
      id: 'c',
      sortOrder: 1,
      updatedAt: new Date('2024-01-01'),
    });
    const d = makeItem({
      id: 'd',
      sortOrder: 1,
      updatedAt: new Date('2024-01-01'),
    });
    expect(compareItemsBySortOrder(c, d)).toBeLessThan(0);
  });
});

describe('reorderItemIdsInList', () => {
  it('moves item within list', () => {
    const result = reorderItemIdsInList({
      orderedIds: ['a', 'b', 'c'],
      activeId: 'a',
      overId: 'c',
    });
    expect(result).toEqual(['b', 'c', 'a']);
  });

  it('is a no-op when activeIndex equals overIndex', () => {
    const ids = ['a', 'b', 'c'];
    const result = reorderItemIdsInList({
      orderedIds: ids,
      activeId: 'b',
      overId: 'b',
    });
    expect(result).toBe(ids);
  });

  it('is a no-op when id not found', () => {
    const ids = ['a', 'b'];
    const result = reorderItemIdsInList({
      orderedIds: ids,
      activeId: 'x',
      overId: 'a',
    });
    expect(result).toBe(ids);
  });
});

describe('moveItemIdBetweenLists', () => {
  it('removes from source and inserts at target index', () => {
    const result = moveItemIdBetweenLists({
      sourceIds: ['a', 'b', 'c'],
      targetIds: ['d', 'e'],
      movedId: 'b',
      targetIndex: 1,
    });
    expect(result.sourceIds).toEqual(['a', 'c']);
    expect(result.targetIds).toEqual(['d', 'b', 'e']);
  });

  it('handles edge case: insert at start', () => {
    const result = moveItemIdBetweenLists({
      sourceIds: ['a', 'b'],
      targetIds: ['c', 'd'],
      movedId: 'a',
      targetIndex: 0,
    });
    expect(result.sourceIds).toEqual(['b']);
    expect(result.targetIds).toEqual(['a', 'c', 'd']);
  });

  it('handles edge case: insert at end', () => {
    const result = moveItemIdBetweenLists({
      sourceIds: ['a', 'b'],
      targetIds: ['c'],
      movedId: 'a',
      targetIndex: 99,
    });
    expect(result.sourceIds).toEqual(['b']);
    expect(result.targetIds).toEqual(['c', 'a']);
  });
});

describe('applyCategoryItemOrder', () => {
  it('reassigns sortOrder by position in orderedIds', () => {
    const items = [
      makeItem({ id: 'a', categoryId: 'cat1', sortOrder: 10 }),
      makeItem({ id: 'b', categoryId: 'cat1', sortOrder: 5 }),
      makeItem({ id: 'c', categoryId: 'cat2', sortOrder: 0 }),
    ];
    const result = applyCategoryItemOrder({
      prevItems: items,
      categoryId: 'cat1',
      orderedIds: ['b', 'a'],
    });
    const b = result.find((i) => i.id === 'b')!;
    const a = result.find((i) => i.id === 'a')!;
    expect(b.sortOrder).toBe(0);
    expect(a.sortOrder).toBe(1);
  });

  it('skips items not in orderedIds', () => {
    const items = [
      makeItem({ id: 'a', categoryId: 'cat1', sortOrder: 0 }),
      makeItem({ id: 'b', categoryId: 'cat2', sortOrder: 0 }),
    ];
    const result = applyCategoryItemOrder({
      prevItems: items,
      categoryId: 'cat1',
      orderedIds: ['a'],
    });
    const b = result.find((i) => i.id === 'b')!;
    expect(b.sortOrder).toBe(0);
  });
});

describe('getNextSortOrder', () => {
  it('returns max + 1 for category', () => {
    const items = [
      makeItem({ id: 'a', categoryId: 'cat1', sortOrder: 3 }),
      makeItem({ id: 'b', categoryId: 'cat1', sortOrder: 7 }),
    ];
    expect(getNextSortOrder(items, 'cat1')).toBe(8);
  });

  it('returns 0 for empty category', () => {
    const items = [makeItem({ id: 'a', categoryId: 'cat2', sortOrder: 5 })];
    expect(getNextSortOrder(items, 'cat1')).toBe(0);
  });
});

describe('redensifyCategorySortOrder', () => {
  it('densifies gaps in sort order', () => {
    const items = [
      makeItem({ id: 'a', categoryId: 'cat1', sortOrder: 10 }),
      makeItem({ id: 'b', categoryId: 'cat1', sortOrder: 5 }),
      makeItem({ id: 'c', categoryId: 'cat1', sortOrder: 20 }),
    ];
    const result = redensifyCategorySortOrder(items, 'cat1');
    const sortOrders = result
      .filter((i) => i.categoryId === 'cat1')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => i.sortOrder);
    expect(sortOrders).toEqual([0, 1, 2]);
  });

  it('does not affect other categories', () => {
    const items = [
      makeItem({ id: 'a', categoryId: 'cat1', sortOrder: 10 }),
      makeItem({ id: 'b', categoryId: 'cat2', sortOrder: 50 }),
    ];
    const result = redensifyCategorySortOrder(items, 'cat1');
    const b = result.find((i) => i.id === 'b')!;
    expect(b.sortOrder).toBe(50);
  });
});

describe('applyPendingItemMutations', () => {
  it('inserts new item via upsert when itemId not found', () => {
    const items: WishlistItem[] = [];
    const result = applyPendingItemMutations({
      items,
      pendingMutations: [
        {
          type: 'upsert',
          clientMutationId: 'cid1',
          itemId: 'new1',
          title: 'New Item',
          note: null,
          url: null,
          itemType: 'text',
          categoryId: null,
          hasImage: false,
          imageSource: null,
          status: 'ACTIVE',
          updatedAt: new Date(),
        },
      ],
      ownerId: 'owner1',
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('new1');
    expect(result[0]!.title).toBe('New Item');
  });

  it('updates existing item in place', () => {
    const items = [makeItem({ id: 'a', title: 'Old', sortOrder: 0 })];
    const result = applyPendingItemMutations({
      items,
      pendingMutations: [
        {
          type: 'upsert',
          clientMutationId: 'cid1',
          itemId: 'a',
          title: 'Updated',
          note: null,
          url: null,
          itemType: 'text',
          categoryId: null,
          hasImage: false,
          imageSource: null,
          status: 'ACTIVE',
          updatedAt: new Date(),
        },
      ],
      ownerId: 'owner1',
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Updated');
  });

  it('removes item on delete', () => {
    const items = [makeItem({ id: 'a' })];
    const result = applyPendingItemMutations({
      items,
      pendingMutations: [
        { type: 'delete', clientMutationId: 'cid1', itemId: 'a' },
      ],
      ownerId: 'owner1',
    });
    expect(result).toHaveLength(0);
  });

  it('applies multiple mutations in order', () => {
    const items = [makeItem({ id: 'a' })];
    const result = applyPendingItemMutations({
      items,
      pendingMutations: [
        {
          type: 'upsert',
          clientMutationId: 'cid1',
          itemId: 'b',
          title: 'B',
          note: null,
          url: null,
          itemType: 'text',
          categoryId: null,
          hasImage: false,
          imageSource: null,
          status: 'ACTIVE',
          updatedAt: new Date(),
        },
        { type: 'delete', clientMutationId: 'cid2', itemId: 'a' },
      ],
      ownerId: 'owner1',
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('b');
  });
});

describe('normalizeFormActionPath', () => {
  it('strips .data suffix', () => {
    expect(normalizeFormActionPath('/wishlist.data')).toBe('/wishlist');
  });

  it('handles null/undefined', () => {
    expect(normalizeFormActionPath(null)).toBeNull();
    expect(normalizeFormActionPath(undefined)).toBeNull();
  });

  it('returns path unchanged when no .data suffix', () => {
    expect(normalizeFormActionPath('/wishlist/categories')).toBe(
      '/wishlist/categories',
    );
  });
});

describe('normalizeNullableFormValue', () => {
  it('trims whitespace', () => {
    expect(normalizeNullableFormValue('  hello  ')).toBe('hello');
  });

  it('returns null for empty string after trim', () => {
    expect(normalizeNullableFormValue('   ')).toBeNull();
    expect(normalizeNullableFormValue('')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(normalizeNullableFormValue(null)).toBeNull();
  });
});
