/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  assertExactIdSet,
  buildDenseSortOrder,
  moveIdBetweenLists,
  normalizeCategoryId,
  reorderIdsInList,
} from './wishlist-reorder.server';

describe('wishlist reorder helpers', () => {
  it('builds dense sort order updates', () => {
    expect(buildDenseSortOrder(['a', 'b', 'c'])).toEqual([
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
      { id: 'c', sortOrder: 2 },
    ]);
  });

  it('reorders ids in the same category list', () => {
    expect(
      reorderIdsInList({
        orderedIds: ['i1', 'i2', 'i3'],
        activeId: 'i3',
        overId: 'i1',
      }),
    ).toEqual(['i3', 'i1', 'i2']);
  });

  it('moves an id across categories and appends correctly', () => {
    const moved = moveIdBetweenLists({
      sourceIds: ['a', 'b', 'c'],
      targetIds: ['d', 'e'],
      movedId: 'b',
      targetIndex: 2,
    });

    expect(moved.sourceIds).toEqual(['a', 'c']);
    expect(moved.targetIds).toEqual(['d', 'e', 'b']);
  });

  it('normalizes null/default category ids', () => {
    expect(normalizeCategoryId('')).toBeNull();
    expect(normalizeCategoryId('default')).toBeNull();
    expect(normalizeCategoryId('null')).toBeNull();
    expect(normalizeCategoryId('cat_1')).toBe('cat_1');
  });

  it('rejects mismatched id sets', () => {
    expect(() =>
      assertExactIdSet({
        actualIds: ['a', 'b'],
        submittedIds: ['a', 'c'],
        fieldName: 'sourceOrderedItemIds',
      }),
    ).toThrow();
  });
});
