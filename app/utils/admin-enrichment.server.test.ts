/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  getEnrichmentFailures,
  getEnrichmentFunnel,
  getLinkClickStats,
  getSmartLinkAdoption,
} from '#app/utils/admin.server.ts';
import { logEvent } from '#app/utils/analytics.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';

// Each test passes a distinct `days` window: the helpers cache per-window in
// the process-wide lruCache, so reusing a window would serve a previous
// test's aggregate against this test's freshly-seeded rows.

async function seedUser() {
  return prisma.user.create({ data: createUser(), select: { id: true } });
}

function unfurlEvent(
  userId: string,
  properties: Record<string, unknown>,
): Parameters<typeof logEvent>[0] {
  return {
    name: 'wishlist_unfurl_completed',
    userId,
    source: 'server',
    properties: {
      host: 'shop.example.com',
      outcome: 'success',
      foundTitle: false,
      foundPrice: false,
      foundImage: false,
      source: 'none',
      llmAttempted: false,
      llmFailed: false,
      durationMs: 100,
      ...properties,
    },
  };
}

describe('admin enrichment health helpers', () => {
  it('aggregates the enrichment funnel from unfurl + item-added events', async () => {
    const user = await seedUser();
    await Promise.all([
      logEvent(
        unfurlEvent(user.id, {
          outcome: 'success',
          foundTitle: true,
          foundPrice: true,
          foundImage: true,
          source: 'structured',
          durationMs: 200,
        }),
      ),
      logEvent(
        unfurlEvent(user.id, {
          outcome: 'success',
          foundTitle: true,
          source: 'llm',
          llmAttempted: true,
          durationMs: 400,
        }),
      ),
      logEvent(unfurlEvent(user.id, { outcome: 'fetch_failed' })),
      logEvent({
        name: 'wishlist_item_added',
        userId: user.id,
        source: 'server',
        properties: {
          hasPrice: true,
          enriched: true,
          enrichedFields: ['title', 'price'],
          enrichmentEdited: false,
        },
      }),
      logEvent({
        name: 'wishlist_item_added',
        userId: user.id,
        source: 'server',
        properties: { hasPrice: false, enriched: false },
      }),
    ]);

    const funnel = await getEnrichmentFunnel({ days: 29 });
    expect(funnel).toEqual({
      attempts: 3,
      successes: 2,
      foundTitle: 2,
      foundPrice: 1,
      foundImage: 1,
      llmAttempted: 1,
      llmRescued: 1,
      avgDurationMs: 233, // (200 + 400 + 100) / 3
      itemsSaved: 2,
      itemsSavedEnriched: 1,
      itemsSavedWithPrice: 1,
    });
  });

  it('breaks failures down by outcome and failing host', async () => {
    const user = await seedUser();
    await Promise.all([
      logEvent(unfurlEvent(user.id, { outcome: 'success' })),
      logEvent(
        unfurlEvent(user.id, { outcome: 'fetch_failed', host: 'amazon.com' }),
      ),
      logEvent(
        unfurlEvent(user.id, { outcome: 'fetch_failed', host: 'amazon.com' }),
      ),
      logEvent(
        unfurlEvent(user.id, { outcome: 'timeout', host: 'slow.example.com' }),
      ),
    ]);

    const failures = await getEnrichmentFailures({ days: 28 });
    expect(failures.byOutcome).toEqual([
      { outcome: 'fetch_failed', count: 2 },
      { outcome: 'timeout', count: 1 },
    ]);
    expect(failures.topFailingHosts).toEqual([
      { host: 'amazon.com', count: 2 },
      { host: 'slow.example.com', count: 1 },
    ]);
  });

  it('aggregates outbound clicks with tagged + entity splits per day', async () => {
    await Promise.all([
      logEvent({
        name: 'wishlist_link_clicked',
        userId: null,
        source: 'server',
        properties: {
          entity: 'item',
          id: 'i1',
          host: 'amazon.com',
          affiliate: 'amazon',
          tagged: true,
        },
      }),
      logEvent({
        name: 'wishlist_link_clicked',
        userId: null,
        source: 'server',
        properties: {
          entity: 'item',
          id: 'i2',
          host: 'shop.example.com',
          affiliate: null,
          tagged: false,
        },
      }),
      logEvent({
        name: 'wishlist_link_clicked',
        userId: null,
        source: 'server',
        properties: {
          entity: 'idea',
          id: 'g1',
          host: 'amazon.com',
          affiliate: 'amazon',
          tagged: true,
        },
      }),
    ]);

    const stats = await getLinkClickStats({ days: 27 });
    expect(stats.totalClicks).toBe(3);
    expect(stats.taggedClicks).toBe(2);
    expect(stats.itemClicks).toBe(2);
    expect(stats.ideaClicks).toBe(1);
    expect(stats.perDay).toHaveLength(1);
    expect(stats.perDay[0]).toMatchObject({ clicks: 3, tagged: 2 });
  });

  it('measures smart-link adoption from pool_idea_proposed events', async () => {
    const user = await seedUser();
    await Promise.all([
      logEvent({
        name: 'pool_idea_proposed',
        userId: user.id,
        source: 'server',
        properties: { poolId: 'p1', fromWishlist: true, hasPrice: true },
      }),
      logEvent({
        name: 'pool_idea_proposed',
        userId: user.id,
        source: 'server',
        properties: { poolId: 'p1', fromWishlist: false, hasPrice: false },
      }),
    ]);

    await expect(getSmartLinkAdoption({ days: 26 })).resolves.toEqual({
      proposed: 2,
      fromWishlist: 1,
      withPrice: 1,
    });
  });

  it('returns zeroed aggregates when no events exist', async () => {
    await expect(getEnrichmentFunnel({ days: 25 })).resolves.toMatchObject({
      attempts: 0,
      successes: 0,
      itemsSaved: 0,
      avgDurationMs: null,
    });
    await expect(getEnrichmentFailures({ days: 24 })).resolves.toEqual({
      byOutcome: [],
      topFailingHosts: [],
    });
    await expect(getLinkClickStats({ days: 23 })).resolves.toMatchObject({
      totalClicks: 0,
      perDay: [],
    });
  });
});
