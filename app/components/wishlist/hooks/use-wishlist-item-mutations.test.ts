/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useWishlistItemMutations } from './use-wishlist-item-mutations';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useFetchers: () => [],
    useNavigation: () => ({ state: 'idle', formData: null, formAction: null }),
  };
});

vi.mock('#app/utils/wishlist.ts', () => ({
  isWishlistItemActive: (status: string) => status === 'ACTIVE',
}));

describe('useWishlistItemMutations', () => {
  it('returns empty arrays when no items and no mutations', () => {
    const { result } = renderHook(() =>
      useWishlistItemMutations({ items: [], userId: 'user1' }),
    );
    expect(result.current.optimisticItems).toEqual([]);
    expect(result.current.activeItems).toEqual([]);
    expect(result.current.archivedItems).toEqual([]);
  });

  it('separates active and archived items correctly', () => {
    const items = [
      {
        id: 'a',
        title: 'Active',
        ownerId: 'user1',
        note: null,
        url: null,
        type: 'text',
        categoryId: null,
        sortOrder: 0,
        updatedAt: new Date(),
        status: 'ACTIVE' as const,
        hasImage: false,
        imageSource: null,
      },
      {
        id: 'b',
        title: 'Archived',
        ownerId: 'user1',
        note: null,
        url: null,
        type: 'text',
        categoryId: null,
        sortOrder: 1,
        updatedAt: new Date(),
        status: 'ARCHIVED' as const,
        hasImage: false,
        imageSource: null,
      },
    ];
    const { result } = renderHook(() =>
      useWishlistItemMutations({ items, userId: 'user1' }),
    );
    expect(result.current.activeItems).toHaveLength(1);
    expect(result.current.activeItems[0]!.id).toBe('a');
    expect(result.current.archivedItems).toHaveLength(1);
    expect(result.current.archivedItems[0]!.id).toBe('b');
  });
});
