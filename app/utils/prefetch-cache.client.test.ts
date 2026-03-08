import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPrefetchCache,
  normalizePrefetchCacheKey,
  PREFETCH_CACHE_TTL_MS,
  primePrefetchCache,
  setPrefetchCacheScope,
  takePrefetchCache,
} from './prefetch-cache.client.ts';

afterEach(() => {
  clearPrefetchCache();
  setPrefetchCacheScope(null);
  vi.useRealTimers();
});

describe('prefetch cache', () => {
  it('stores and consumes entries once', () => {
    primePrefetchCache('/wishlist', { ok: true });

    expect(takePrefetchCache('/wishlist')).toEqual({ ok: true });
    expect(takePrefetchCache('/wishlist')).toBeUndefined();
  });

  it('normalizes friends UI params out of cache keys', () => {
    const normalized = normalizePrefetchCacheKey('/friends?tab=requests&q=ann');
    primePrefetchCache('/friends', { ok: true });

    expect(normalized).toBe('/friends');
    expect(takePrefetchCache('/friends?tab=requests&q=ann')).toEqual({
      ok: true,
    });
  });

  it('normalizes react-router single-fetch request URLs', () => {
    const normalized = normalizePrefetchCacheKey(
      'http://localhost/users/alex/wishlist.data?_routes=routes%2Fusers%2B%2F%24username_%2B%2Fwishlist',
    );
    primePrefetchCache('/users/alex/wishlist', { ok: true });

    expect(normalized).toBe('/users/alex/wishlist');
    expect(
      takePrefetchCache(
        'http://localhost/users/alex/wishlist.data?_routes=routes%2Fusers%2B%2F%24username_%2B%2Fwishlist',
      ),
    ).toEqual({
      ok: true,
    });
  });

  it('expires stale entries', () => {
    vi.useFakeTimers();
    primePrefetchCache('/wishlist', { ok: true }, PREFETCH_CACHE_TTL_MS);

    vi.advanceTimersByTime(PREFETCH_CACHE_TTL_MS + 1);

    expect(takePrefetchCache('/wishlist')).toBeUndefined();
  });

  it('clears cached entries when the auth scope changes', () => {
    setPrefetchCacheScope('user-a');
    primePrefetchCache('/wishlist', { ownerId: 'user-a' });

    setPrefetchCacheScope('user-b');

    expect(takePrefetchCache('/wishlist')).toBeUndefined();
  });
});
