/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useWishlistStatusUpdate } from './use-wishlist-status-update';

// Stable fetcher reference — avoids triggering effects across re-renders
const fakeFetcher = {
  state: 'idle' as const,
  data: undefined as any,
  submit: vi.fn(),
};

// Stable empty array — avoids new reference on each renderHook re-render
// (a new [] each time would make the server-sync effect fire on every render → infinite loop)
const NO_ITEMS: never[] = [];

vi.mock('react-router', () => ({
  useFetcher: () => fakeFetcher,
}));

vi.mock('sonner', () => {
  const t: any = () => 'toast-id';
  t.success = vi.fn();
  t.error = vi.fn();
  t.dismiss = vi.fn();
  return { toast: t };
});

vi.mock('#app/utils/analytics.client.ts', () => ({
  track: vi.fn(),
}));

vi.mock('#app/utils/client-mutation-id.ts', () => ({
  createClientMutationId: () => 'test-mutation-id',
}));

describe('useWishlistStatusUpdate', () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('initialises educationSeen from localStorage', () => {
    localStorage.setItem('past_items_edu_seen_user1', '1');
    const { result } = renderHook(() =>
      useWishlistStatusUpdate({
        serverItems: NO_ITEMS,
        userId: 'user1',
        onViewChange: vi.fn(),
      }),
    );
    expect(result.current.educationSeen).toBe(true);
  });

  it('initialises educationSeen as false when not in localStorage', () => {
    const { result } = renderHook(() =>
      useWishlistStatusUpdate({
        serverItems: NO_ITEMS,
        userId: 'user1',
        onViewChange: vi.fn(),
      }),
    );
    expect(result.current.educationSeen).toBe(false);
  });

  it('markEducationSeen sets flags and writes localStorage', () => {
    const { result } = renderHook(() =>
      useWishlistStatusUpdate({
        serverItems: NO_ITEMS,
        userId: 'user1',
        onViewChange: vi.fn(),
      }),
    );
    act(() => {
      result.current.markEducationSeen();
    });
    expect(result.current.educationSeen).toBe(true);
    expect(result.current.showEducation).toBe(false);
    expect(localStorage.getItem('past_items_edu_seen_user1')).toBe('1');
  });

  it('initialises items from serverItems via useState', () => {
    // Sorting is tested in wishlist-item-state.test.ts (compareItemsBySortOrder).
    // Here we just verify the hook starts with the provided items.
    const { result } = renderHook(() =>
      useWishlistStatusUpdate({
        serverItems: NO_ITEMS,
        userId: 'user1',
        onViewChange: vi.fn(),
      }),
    );
    expect(result.current.items).toEqual([]);
  });

  it('handleStatusChange to ARCHIVED: optimistically updates status', () => {
    const { result } = renderHook(() =>
      useWishlistStatusUpdate({
        serverItems: NO_ITEMS,
        userId: 'user1',
        onViewChange: vi.fn(),
      }),
    );

    // Seed an item via setItems (exposed for reorder hook to use)
    act(() => {
      result.current.setItems([
        {
          id: 'item1',
          title: 'Test',
          ownerId: 'user1',
          note: null,
          url: null,
          type: 'text',
          categoryId: null,
          sortOrder: 0,
          updatedAt: new Date('2024-01-01'),
          status: 'ACTIVE',
          hasImage: false,
          imageSource: null,
        },
      ]);
    });

    act(() => {
      result.current.handleStatusChange('item1', 'ARCHIVED');
    });

    expect(result.current.items[0]!.status).toBe('ARCHIVED');
  });

  it('handleStatusChange to ARCHIVED when education not seen: sets showEducation', () => {
    const { result } = renderHook(() =>
      useWishlistStatusUpdate({
        serverItems: NO_ITEMS,
        userId: 'user1',
        onViewChange: vi.fn(),
      }),
    );

    act(() => {
      result.current.setItems([
        {
          id: 'item1',
          title: 'Test',
          ownerId: 'user1',
          note: null,
          url: null,
          type: 'text',
          categoryId: null,
          sortOrder: 0,
          updatedAt: new Date('2024-01-01'),
          status: 'ACTIVE',
          hasImage: false,
          imageSource: null,
        },
      ]);
    });

    act(() => {
      result.current.handleStatusChange('item1', 'ARCHIVED');
    });

    expect(result.current.showEducation).toBe(true);
  });

  it('handleStatusChange to ARCHIVED when education already seen: no showEducation', () => {
    localStorage.setItem('past_items_edu_seen_user1', '1');
    const { result } = renderHook(() =>
      useWishlistStatusUpdate({
        serverItems: NO_ITEMS,
        userId: 'user1',
        onViewChange: vi.fn(),
      }),
    );

    act(() => {
      result.current.setItems([
        {
          id: 'item1',
          title: 'Test',
          ownerId: 'user1',
          note: null,
          url: null,
          type: 'text',
          categoryId: null,
          sortOrder: 0,
          updatedAt: new Date('2024-01-01'),
          status: 'ACTIVE',
          hasImage: false,
          imageSource: null,
        },
      ]);
    });

    act(() => {
      result.current.handleStatusChange('item1', 'ARCHIVED');
    });

    expect(result.current.showEducation).toBe(false);
  });
});
