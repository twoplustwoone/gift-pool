/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getNavigatorConnection = vi.fn();
const prefetchRouteData = vi.fn();
const scheduleIdleTask = vi.fn();
const shouldPauseConservativePrefetch = vi.fn();

vi.mock('#app/utils/route-prefetch.client.ts', () => ({
  getNavigatorConnection: (...args: Array<unknown>) =>
    getNavigatorConnection(...args),
  prefetchRouteData: (...args: Array<unknown>) => prefetchRouteData(...args),
  scheduleIdleTask: (...args: Array<unknown>) => scheduleIdleTask(...args),
  shouldPauseConservativePrefetch: (...args: Array<unknown>) =>
    shouldPauseConservativePrefetch(...args),
}));

import { useFriendWishlistPrefetch } from './use-background-route-prefetch.ts';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, reject, resolve };
}

describe('useFriendWishlistPrefetch', () => {
  let connection: {
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  let idleTasks: Array<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();

    idleTasks = [];
    connection = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    getNavigatorConnection.mockReset().mockReturnValue(connection);
    prefetchRouteData.mockReset();
    shouldPauseConservativePrefetch.mockReset().mockReturnValue(false);
    scheduleIdleTask.mockReset().mockImplementation((task: () => void) => {
      idleTasks.push(task);
      return vi.fn(() => {
        idleTasks = idleTasks.filter((queuedTask) => queuedTask !== task);
      });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the initial delay before scheduling any friend wishlist prefetch', () => {
    renderHook(() => useFriendWishlistPrefetch(['alex']));

    act(() => {
      vi.advanceTimersByTime(1_999);
    });

    expect(scheduleIdleTask).not.toHaveBeenCalled();
    expect(prefetchRouteData).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(scheduleIdleTask).toHaveBeenCalledTimes(1);
    expect(prefetchRouteData).not.toHaveBeenCalled();
  });

  it('prefetches friend wishlists one at a time after the delay', async () => {
    const firstPrefetch = createDeferred<void>();
    const secondPrefetch = createDeferred<void>();

    prefetchRouteData
      .mockReturnValueOnce(firstPrefetch.promise)
      .mockReturnValueOnce(secondPrefetch.promise);

    renderHook(() => useFriendWishlistPrefetch(['alex', 'sam']));

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    await act(async () => {
      idleTasks.shift()?.();
      await Promise.resolve();
    });

    expect(prefetchRouteData).toHaveBeenCalledTimes(1);
    expect(prefetchRouteData.mock.calls[0]![0]).toMatchObject({
      cacheKey: '/users/alex/wishlist',
      resourcePath: '/resources/prefetch/users/alex/wishlist',
    });

    await act(async () => {
      firstPrefetch.resolve(undefined);
      await firstPrefetch.promise;
      await Promise.resolve();
    });

    expect(prefetchRouteData).toHaveBeenCalledTimes(1);
    expect(scheduleIdleTask).toHaveBeenCalledTimes(2);

    await act(async () => {
      idleTasks.shift()?.();
      await Promise.resolve();
    });

    expect(prefetchRouteData).toHaveBeenCalledTimes(2);
    expect(prefetchRouteData.mock.calls[1]![0]).toMatchObject({
      cacheKey: '/users/sam/wishlist',
      resourcePath: '/resources/prefetch/users/sam/wishlist',
    });

    secondPrefetch.resolve(undefined);
    await secondPrefetch.promise;
  });

  it('aborts in-flight prefetches and clears queued idle work on unmount', async () => {
    const firstPrefetch = createDeferred<void>();

    prefetchRouteData.mockReturnValueOnce(firstPrefetch.promise);

    const { unmount } = renderHook(() => useFriendWishlistPrefetch(['alex']));

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    await act(async () => {
      idleTasks.shift()?.();
      await Promise.resolve();
    });

    const firstCall = prefetchRouteData.mock.calls[0]![0] as {
      signal: AbortSignal;
    };

    expect(firstCall.signal.aborted).toBe(false);

    act(() => {
      unmount();
    });

    expect(firstCall.signal.aborted).toBe(true);
    expect(connection.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
    expect(connection.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );

    firstPrefetch.resolve(undefined);
    await firstPrefetch.promise;
    expect(scheduleIdleTask).toHaveBeenCalledTimes(1);
  });

  it('cancels the initial delay on unmount before any idle task is scheduled', () => {
    const { unmount } = renderHook(() => useFriendWishlistPrefetch(['alex']));

    act(() => {
      unmount();
      vi.advanceTimersByTime(2_000);
    });

    expect(scheduleIdleTask).not.toHaveBeenCalled();
    expect(prefetchRouteData).not.toHaveBeenCalled();
  });
});
