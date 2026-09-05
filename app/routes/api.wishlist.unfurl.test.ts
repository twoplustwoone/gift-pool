/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

const { extractUrlMetadata, queueLogEvent } = vi.hoisted(() => ({
  extractUrlMetadata: vi.fn(),
  queueLogEvent: vi.fn(() => ({ eventId: 'test-event' })),
}));

vi.mock('#app/utils/wishlist-metadata.server.ts', () => ({
  extractUrlMetadata,
}));
vi.mock('#app/utils/analytics.server.ts', () => ({ queueLogEvent }));

import { lruCache } from '#app/utils/cache.server.ts';
import { action, unfurlCacheKey } from './api.wishlist.unfurl.ts';

const DAY_MS = 1000 * 60 * 60 * 24;

const SUCCESS_METADATA = {
  title: 'Acme Widget',
  imageUrl: 'https://cdn.example.com/widget.jpg',
  priceCents: 4999,
  currency: 'USD',
  source: 'structured' as const,
};

function createRequest(
  body: Record<string, string>,
  { cookie }: { cookie?: string } = {},
) {
  return new Request('https://giftpool.app/api/wishlist/unfurl', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(body).toString(),
  });
}

async function loginCookie() {
  const user = await prisma.user.create({ data: createUser() });
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expirationDate: new Date(Date.now() + DAY_MS),
    },
  });
  return { user, cookie: await getSessionCookieHeader(session) };
}

const CACHED_URLS = [
  'https://example.com/p',
  'https://shop.example.com/products/widget',
  'https://example.com/empty',
  'https://slow.example.com/p',
  'https://cache.example.com/widget',
  'https://ttl.example.com/widget',
];

beforeEach(() => {
  extractUrlMetadata.mockReset();
  queueLogEvent.mockClear();
  vi.useRealTimers();
  // The unfurl cache is process-wide, so a key set by one case would otherwise
  // answer the next one (same pattern as the admin cache tests).
  for (const url of CACHED_URLS) lruCache.delete(unfurlCacheKey(url));
});

describe('/api/wishlist/unfurl action', () => {
  it('rejects anonymous callers with 401 and never fetches', async () => {
    const result = await action(
      toActionArgs({
        request: createRequest({ url: 'https://example.com/p' }),
        params: {},
        context: {} as any,
      }),
    );
    expect(getRouteResultStatus(result)).toBe(401);
    expect(extractUrlMetadata).not.toHaveBeenCalled();
    expect(queueLogEvent).not.toHaveBeenCalled();
  });

  it.each(['not-a-url', 'ftp://example.com/file', 'javascript:alert(1)'])(
    'rejects invalid URL %s with 400',
    async (url) => {
      const { cookie } = await loginCookie();
      const result = await action(
        toActionArgs({
          request: createRequest({ url }, { cookie }),
          params: {},
          context: {} as any,
        }),
      );
      expect(getRouteResultStatus(result)).toBe(400);
      expect(extractUrlMetadata).not.toHaveBeenCalled();
    },
  );

  it('returns metadata and logs a success outcome', async () => {
    const { user, cookie } = await loginCookie();
    extractUrlMetadata.mockResolvedValue({
      ok: true,
      metadata: SUCCESS_METADATA,
      llmAttempted: false,
      llmFailed: false,
    });

    const result = await action(
      toActionArgs({
        request: createRequest(
          { url: 'https://shop.example.com/products/widget' },
          { cookie },
        ),
        params: {},
        context: {} as any,
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    await expect(getRouteResultData(result)).resolves.toMatchObject({
      result: SUCCESS_METADATA,
    });
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'wishlist_unfurl_completed',
        userId: user.id,
        source: 'server',
        properties: expect.objectContaining({
          host: 'shop.example.com',
          outcome: 'success',
          foundTitle: true,
          foundPrice: true,
          foundImage: true,
          source: 'structured',
          durationMs: expect.any(Number),
        }),
      }),
    );
  });

  it('logs nothing_found when the page parses but yields no fields', async () => {
    const { cookie } = await loginCookie();
    extractUrlMetadata.mockResolvedValue({
      ok: true,
      metadata: {
        title: null,
        imageUrl: null,
        priceCents: null,
        currency: null,
        source: 'none',
      },
      llmAttempted: false,
      llmFailed: false,
    });

    const result = await action(
      toActionArgs({
        request: createRequest(
          { url: 'https://example.com/empty' },
          { cookie },
        ),
        params: {},
        context: {} as any,
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    await expect(getRouteResultData(result)).resolves.toMatchObject({
      result: null,
    });
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({ outcome: 'nothing_found' }),
      }),
    );
  });

  it('serves a repeated URL from cache instead of fetching twice', async () => {
    const { cookie } = await loginCookie();
    extractUrlMetadata.mockResolvedValue({
      ok: true,
      metadata: SUCCESS_METADATA,
      llmAttempted: false,
      llmFailed: false,
    });

    const call = () =>
      action(
        toActionArgs({
          request: createRequest(
            { url: 'https://cache.example.com/widget' },
            { cookie },
          ),
          params: {},
          context: {} as any,
        }),
      );

    await expect(getRouteResultData(await call())).resolves.toMatchObject({
      result: SUCCESS_METADATA,
    });
    await expect(getRouteResultData(await call())).resolves.toMatchObject({
      result: SUCCESS_METADATA,
    });

    // One outbound fetch (and at most one LLM call) for two presses.
    expect(extractUrlMetadata).toHaveBeenCalledTimes(1);
    expect(queueLogEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        properties: expect.objectContaining({ cached: false }),
      }),
    );
    expect(queueLogEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        properties: expect.objectContaining({ cached: true }),
      }),
    );
  });

  it('fetches again once the cached result has expired', async () => {
    const { cookie } = await loginCookie();
    extractUrlMetadata.mockResolvedValue({
      ok: true,
      metadata: SUCCESS_METADATA,
      llmAttempted: false,
      llmFailed: false,
    });

    const call = () =>
      action(
        toActionArgs({
          request: createRequest(
            { url: 'https://ttl.example.com/widget' },
            { cookie },
          ),
          params: {},
          context: {} as any,
        }),
      );

    await call();
    expect(extractUrlMetadata).toHaveBeenCalledTimes(1);

    // Past the 5-minute success TTL, the next press pays for a fresh lookup.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 6 * 60 * 1000));
    await call();
    expect(extractUrlMetadata).toHaveBeenCalledTimes(2);
  });

  it('returns 200 with null result on fetch failure and logs the outcome', async () => {
    const { cookie } = await loginCookie();
    extractUrlMetadata.mockResolvedValue({ ok: false, outcome: 'timeout' });

    const result = await action(
      toActionArgs({
        request: createRequest(
          { url: 'https://slow.example.com/p' },
          { cookie },
        ),
        params: {},
        context: {} as any,
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    await expect(getRouteResultData(result)).resolves.toMatchObject({
      result: null,
    });
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          outcome: 'timeout',
          foundTitle: false,
          foundPrice: false,
          foundImage: false,
          source: 'none',
        }),
      }),
    );
  });
});
