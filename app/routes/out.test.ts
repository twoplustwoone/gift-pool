/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import { toLoaderArgs } from '#tests/route-module-test-utils.ts';

const { queueLogEvent } = vi.hoisted(() => ({
  queueLogEvent: vi.fn(() => ({ eventId: 'test-event' })),
}));

vi.mock('#app/utils/analytics.server.ts', () => ({ queueLogEvent }));

import { loader } from './out.ts';

function createRequest(query: string) {
  return new Request(`https://giftpool.app/out?${query}`);
}

async function createItemWithUrl(url: string | null) {
  const owner = await prisma.user.create({ data: createUser() });
  return prisma.wishlistItem.create({
    data: {
      ownerId: owner.id,
      sortOrder: 0,
      title: 'Linked item',
      type: 'text',
      url,
    },
    select: { id: true },
  });
}

beforeEach(() => {
  queueLogEvent.mockClear();
  vi.unstubAllEnvs();
});

describe('/out loader', () => {
  it('404s with no id, an unknown id, and an item without a URL', async () => {
    await expect(
      loader(toLoaderArgs({ request: createRequest(''), params: {}, context: {} as any })),
    ).rejects.toMatchObject({ init: { status: 404 } });

    await expect(
      loader(
        toLoaderArgs({
          request: createRequest('item=does-not-exist'),
          params: {},
          context: {} as any,
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 404 } });

    const noUrl = await createItemWithUrl(null);
    await expect(
      loader(
        toLoaderArgs({
          request: createRequest(`item=${noUrl.id}`),
          params: {},
          context: {} as any,
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 404 } });
    expect(queueLogEvent).not.toHaveBeenCalled();
  });

  it('404s when the stored URL is not http(s)', async () => {
    const item = await createItemWithUrl('javascript:alert(1)');
    await expect(
      loader(
        toLoaderArgs({
          request: createRequest(`item=${item.id}`),
          params: {},
          context: {} as any,
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 404 } });
  });

  it('redirects anonymously with the affiliate tag and logs a tagged click', async () => {
    vi.stubEnv('AMAZON_AFFILIATE_TAG', 'giftpool-20');
    const item = await createItemWithUrl('https://www.amazon.com/dp/B0ABC123');

    const response = (await loader(
      toLoaderArgs({
        request: createRequest(`item=${item.id}`),
        params: {},
        context: {} as any,
      }),
    )) as Response;

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.hostname).toBe('www.amazon.com');
    expect(location.searchParams.get('tag')).toBe('giftpool-20');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'wishlist_link_clicked',
        userId: null,
        source: 'server',
        properties: expect.objectContaining({
          entity: 'item',
          id: item.id,
          host: 'www.amazon.com',
          affiliate: 'amazon',
          tagged: true,
        }),
      }),
    );
  });

  it('redirects untagged for non-affiliate hosts and logs tagged: false', async () => {
    vi.stubEnv('AMAZON_AFFILIATE_TAG', 'giftpool-20');
    const item = await createItemWithUrl('https://shop.example.com/widget');

    const response = (await loader(
      toLoaderArgs({
        request: createRequest(`item=${item.id}`),
        params: {},
        context: {} as any,
      }),
    )) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://shop.example.com/widget',
    );
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          affiliate: null,
          tagged: false,
        }),
      }),
    );
  });

  it('resolves gift idea links via ?idea=', async () => {
    const owner = await prisma.user.create({ data: createUser() });
    const organizer = await prisma.user.create({ data: createUser() });
    const pool = await prisma.pool.create({
      data: {
        title: 'Test pool',
        organizerId: organizer.id,
        recipientUserId: owner.id,
      },
      select: { id: true },
    });
    const idea = await prisma.giftIdea.create({
      data: {
        poolId: pool.id,
        proposedById: organizer.id,
        name: 'Idea',
        url: 'https://shop.example.com/idea-product',
      },
      select: { id: true },
    });

    const response = (await loader(
      toLoaderArgs({
        request: createRequest(`idea=${idea.id}`),
        params: {},
        context: {} as any,
      }),
    )) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://shop.example.com/idea-product',
    );
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({ entity: 'idea', id: idea.id }),
      }),
    );
  });
});
