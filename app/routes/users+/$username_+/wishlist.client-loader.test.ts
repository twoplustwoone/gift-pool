import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPrefetchCache,
  primePrefetchCache,
} from '#app/utils/prefetch-cache.client.ts';
import { clientLoader } from './wishlist.tsx';

afterEach(() => {
  clearPrefetchCache();
});

describe('/users/:username/wishlist clientLoader', () => {
  it('returns cached friend wishlist data when available', async () => {
    const cachedData = {
      canViewWishlist: true,
      user: {
        id: 'user-1',
        username: 'alex',
        name: 'Alex',
        image: null,
        wishlistItems: [],
        wishlistCategories: [],
      },
      relationship: {
        state: 'FRIENDS',
        friendshipId: 'friendship-1',
        incomingRequestId: null,
        outgoingRequestId: null,
      },
      analytics: {
        requestId: null,
        viewEventId: null,
      },
    };
    const serverLoader = vi.fn().mockResolvedValue({
      canViewWishlist: false,
    });

    primePrefetchCache('/users/alex/wishlist', cachedData);

    const result = await clientLoader({
      context: {} as never,
      params: { username: 'alex' },
      request: new Request(
        'http://localhost/users/alex/wishlist.data?_routes=routes%2Fusers%2B%2F%24username_%2B%2Fwishlist',
      ),
      serverLoader,
    } as unknown as Parameters<typeof clientLoader>[0]);

    expect(result).toEqual(cachedData);
    expect(serverLoader).not.toHaveBeenCalled();
  });

  it('falls back to the server loader without cached data', async () => {
    const serverData = {
      canViewWishlist: false,
      analytics: {
        requestId: 'req-1',
        viewEventId: null,
      },
    };
    const serverLoader = vi.fn().mockResolvedValue(serverData);

    const result = await clientLoader({
      context: {} as never,
      params: { username: 'alex' },
      request: new Request('http://localhost/users/alex/wishlist'),
      serverLoader,
    } as unknown as Parameters<typeof clientLoader>[0]);

    expect(result).toEqual(serverData);
    expect(serverLoader).toHaveBeenCalledTimes(1);
  });
});
