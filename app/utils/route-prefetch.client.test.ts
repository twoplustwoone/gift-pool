import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPrefetchCache,
  setPrefetchCacheScope,
  takePrefetchCache,
} from './prefetch-cache.client.ts';
import { prefetchRouteData } from './route-prefetch.client.ts';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

afterEach(() => {
  clearPrefetchCache();
  setPrefetchCacheScope(null);
  vi.unstubAllGlobals();
});

describe('prefetchRouteData', () => {
  it('does not expose prefetched data across auth scope changes', async () => {
    const response = createDeferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal('fetch', fetchMock);

    setPrefetchCacheScope('user-a');
    const prefetchPromise = prefetchRouteData({
      cacheKey: '/wishlist',
      resourcePath: '/resources/prefetch/wishlist',
    });

    setPrefetchCacheScope('user-b');
    response.resolve(
      new Response(JSON.stringify({ ownerId: 'user-a' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await prefetchPromise;

    expect(takePrefetchCache('/wishlist')).toBeUndefined();
  });

  it('tracks in-flight requests per auth scope', async () => {
    const firstResponse = createDeferred<Response>();
    const secondResponse = createDeferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    vi.stubGlobal('fetch', fetchMock);

    setPrefetchCacheScope('user-a');
    const firstPrefetch = prefetchRouteData({
      cacheKey: '/friends',
      resourcePath: '/resources/prefetch/friends',
    });

    setPrefetchCacheScope('user-b');
    const secondPrefetch = prefetchRouteData({
      cacheKey: '/friends',
      resourcePath: '/resources/prefetch/friends',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    firstResponse.resolve(
      new Response(JSON.stringify({ ownerId: 'user-a' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
    secondResponse.resolve(
      new Response(JSON.stringify({ ownerId: 'user-b' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await Promise.all([firstPrefetch, secondPrefetch]);

    expect(takePrefetchCache('/friends')).toEqual({ ownerId: 'user-b' });
  });
});
