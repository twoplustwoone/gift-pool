/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import  { type WishlistItem } from '../wishlist-item-state';
import { useWishlistReorder } from './use-wishlist-reorder';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useFetcher: () => ({
      state: 'idle',
      data: undefined,
      submit: vi.fn(),
    }),
  };
});

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual('@dnd-kit/core');
  return {
    ...actual,
    useSensor: vi.fn(),
    useSensors: vi.fn(() => []),
    PointerSensor: class {},
    TouchSensor: class {},
    KeyboardSensor: class {},
  };
});

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual('@dnd-kit/sortable');
  return {
    ...actual,
    sortableKeyboardCoordinates: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
  }),
}));

vi.mock('#app/utils/client-mutation-id.ts', () => ({
  createClientMutationId: () => 'test-id',
}));

const defaultProps = {
  items: [],
  setItems: vi.fn(),
  orderedCategories: [],
  setOrderedCategories: vi.fn(),
  activeItems: [],
  itemIdsByCategoryKey: {},
  itemById: new Map<string, WishlistItem>(),
  isOwner: true,
  isPublicView: false,
  view: 'wishlist' as const,
};

describe('useWishlistReorder', () => {
  it('starts with reorderMode off', () => {
    const { result } = renderHook(() => useWishlistReorder(defaultProps));
    expect(result.current.reorderMode).toBe('off');
  });

  it('startItemReorderMode sets mode to items', () => {
    const { result } = renderHook(() => useWishlistReorder(defaultProps));
    act(() => {
      result.current.startItemReorderMode();
    });
    expect(result.current.reorderMode).toBe('items');
    expect(result.current.isItemReorderMode).toBe(true);
    expect(result.current.isCategoryReorderMode).toBe(false);
  });

  it('startCategoryReorderMode sets mode to categories', () => {
    const { result } = renderHook(() => useWishlistReorder(defaultProps));
    act(() => {
      result.current.startCategoryReorderMode();
    });
    expect(result.current.reorderMode).toBe('categories');
    expect(result.current.isCategoryReorderMode).toBe(true);
    expect(result.current.isItemReorderMode).toBe(false);
  });

  it('finishReorderMode resets mode to off', () => {
    const { result } = renderHook(() => useWishlistReorder(defaultProps));
    act(() => {
      result.current.startItemReorderMode();
    });
    act(() => {
      result.current.finishReorderMode();
    });
    expect(result.current.reorderMode).toBe('off');
  });

  it('canReorder is false when not owner', () => {
    const { result } = renderHook(() =>
      useWishlistReorder({ ...defaultProps, isOwner: false }),
    );
    expect(result.current.canReorder).toBe(false);
  });

  it('canReorder is false when view is past', () => {
    const { result } = renderHook(() =>
      useWishlistReorder({ ...defaultProps, view: 'past' }),
    );
    expect(result.current.canReorder).toBe(false);
  });

  it('canReorder is false in public view', () => {
    const { result } = renderHook(() =>
      useWishlistReorder({ ...defaultProps, isPublicView: true }),
    );
    expect(result.current.canReorder).toBe(false);
  });

  it('startItemReorderMode does nothing when canReorder is false', () => {
    const { result } = renderHook(() =>
      useWishlistReorder({ ...defaultProps, isOwner: false }),
    );
    act(() => {
      result.current.startItemReorderMode();
    });
    expect(result.current.reorderMode).toBe('off');
  });

  it('dragState is idle when dragging is null', () => {
    const { result } = renderHook(() => useWishlistReorder(defaultProps));
    expect(result.current.dragState).toBe('idle');
  });
});
