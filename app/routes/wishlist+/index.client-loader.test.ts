import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPrefetchCache,
  primePrefetchCache,
} from '#app/utils/prefetch-cache.client.ts';
import { clientLoader } from './index.tsx';

afterEach(() => {
  clearPrefetchCache();
});

describe('/wishlist clientLoader', () => {
  it('uses prefetched route data when available', async () => {
    const cachedData = {
      user: {
        id: 'user-1',
        username: 'jane',
        name: 'Jane',
        image: null,
        wishlistItems: [],
        wishlistCategories: [],
      },
      analytics: {
        requestId: null,
        viewEventId: null,
      },
      publicShare: null,
      origin: 'http://localhost',
    };
    const serverLoader = vi.fn().mockResolvedValue({
      user: {
        id: 'user-2',
      },
    });

    primePrefetchCache('/wishlist', cachedData);

    const result = await clientLoader({
      context: {} as never,
      params: {},
      request: new Request(
        'http://localhost/wishlist.data?_routes=routes%2Fwishlist%2B%2Findex',
      ),
      serverLoader,
    } as unknown as Parameters<typeof clientLoader>[0]);

    expect(result).toEqual(cachedData);
    expect(serverLoader).not.toHaveBeenCalled();
  });

  it('calls the server loader on cache miss', async () => {
    const serverData = {
      user: {
        id: 'user-3',
      },
    };
    const serverLoader = vi.fn().mockResolvedValue(serverData);

    const result = await clientLoader({
      context: {} as never,
      params: {},
      request: new Request('http://localhost/wishlist'),
      serverLoader,
    } as unknown as Parameters<typeof clientLoader>[0]);

    expect(result).toEqual(serverData);
    expect(serverLoader).toHaveBeenCalledTimes(1);
  });
});
