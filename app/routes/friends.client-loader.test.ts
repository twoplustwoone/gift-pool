import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPrefetchCache,
  primePrefetchCache,
} from '#app/utils/prefetch-cache.client.ts';
import { clientLoader } from './friends.tsx';

afterEach(() => {
  clearPrefetchCache();
});

describe('/friends clientLoader', () => {
  it('reuses cached data across UI-only search params', async () => {
    const cachedData = {
      friends: [{ friendshipId: 'friendship-1', user: { username: 'alex' } }],
      incoming: [],
      outgoing: [],
    };
    const serverLoader = vi.fn().mockResolvedValue({
      friends: [],
      incoming: [],
      outgoing: [],
    });

    primePrefetchCache('/friends', cachedData);

    const result = await clientLoader({
      context: {} as never,
      params: {},
      request: new Request(
        'http://localhost/friends.data?tab=requests&q=alex&_routes=routes%2Ffriends',
      ),
      serverLoader,
    } as unknown as Parameters<typeof clientLoader>[0]);

    expect(result).toEqual(cachedData);
    expect(serverLoader).not.toHaveBeenCalled();
  });

  it('falls back to the server loader when cache is empty', async () => {
    const serverData = {
      friends: [],
      incoming: [{ id: 'incoming-1' }],
      outgoing: [],
    };
    const serverLoader = vi.fn().mockResolvedValue(serverData);

    const result = await clientLoader({
      context: {} as never,
      params: {},
      request: new Request('http://localhost/friends'),
      serverLoader,
    } as unknown as Parameters<typeof clientLoader>[0]);

    expect(result).toEqual(serverData);
    expect(serverLoader).toHaveBeenCalledTimes(1);
  });
});
