import { describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import {
  getAnalyticsExplorer,
  getClientEnvironmentEventId,
  getEnvironmentAnalytics,
  logClientEnvironmentObservation,
  logEvent,
  queueLogEvent,
} from './analytics.server.ts';

describe('logEvent deduplication', () => {
  it('dedupes identical eventIds', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const eventId = 'shared-event-id';

    const first = await logEvent({
      name: 'wishlist_viewed',
      userId: user.id,
      source: 'server',
      requestId: 'req-1',
      sessionId: 'session-1',
      eventId,
    });
    const second = await logEvent({
      name: 'wishlist_viewed',
      userId: user.id,
      source: 'client',
      requestId: 'req-1',
      sessionId: 'session-1',
      eventId,
    });

    const count = await prisma.analyticsEvent.count();
    expect(count).toBe(1);
    expect(second.id).toBe(first.id);
  });

  it('dedupes using requestId and name when eventId is missing', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const requestId = 'req-fallback';

    const first = await logEvent({
      name: 'wishlist_item_added',
      userId: user.id,
      source: 'server',
      requestId,
    });
    const second = await logEvent({
      name: 'wishlist_item_added',
      userId: user.id,
      source: 'client',
      requestId,
    });

    const count = await prisma.analyticsEvent.count();
    expect(count).toBe(1);
    expect(second.id).toBe(first.id);
  });

  it('server writes upgrade a pre-existing client row on conflict', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const eventId = 'race-event-id';

    // Simulate the race: the client echo (from `/api/analytics`) lands
    // before the server's fire-and-forget write from `queueLogEvent`.
    const clientRow = await logEvent({
      name: 'wishlist_viewed',
      userId: user.id,
      source: 'client',
      requestId: 'req-client',
      sessionId: 'session-client',
      eventId,
      properties: undefined,
    });
    expect(clientRow.source).toBe('client');

    // Now the later server write arrives with its richer properties.
    const serverRow = await logEvent({
      name: 'wishlist_viewed',
      userId: user.id,
      source: 'server',
      requestId: 'req-server',
      sessionId: 'session-server',
      eventId,
      properties: { wishlistOwnerId: user.id, itemCount: 7 },
    });

    // Still a single row — and it's the upgraded one.
    const count = await prisma.analyticsEvent.count();
    expect(count).toBe(1);
    expect(serverRow.id).toBe(clientRow.id);
    expect(serverRow.source).toBe('server');
    expect(serverRow.requestId).toBe('req-server');
    const persistedProps = JSON.parse(serverRow.properties ?? '{}');
    expect(persistedProps).toMatchObject({
      wishlistOwnerId: user.id,
      itemCount: 7,
    });
  });

  it('queueLogEvent returns a pre-generated eventId and schedules logEvent', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const before = await prisma.analyticsEvent.count({
      where: { userId: user.id },
    });

    const { eventId } = queueLogEvent({
      name: 'wishlist_viewed',
      userId: user.id,
      source: 'server',
      requestId: 'req-queued',
      sessionId: 'session-queued',
      properties: { wishlistOwnerId: user.id, itemCount: 3 },
    });
    expect(eventId).toMatch(/^[0-9a-f-]+$/i);

    // Let the detached promise resolve.
    await vi.waitFor(async () => {
      const row = await prisma.analyticsEvent.findUnique({
        where: { eventId },
      });
      if (!row) throw new Error('queued row not persisted yet');
      expect(row.source).toBe('server');
    });
    const after = await prisma.analyticsEvent.count({
      where: { userId: user.id },
    });
    expect(after).toBe(before + 1);
  });

  it('queueLogEvent throws synchronously for an unknown event name', () => {
    expect(() =>
      queueLogEvent({
        name: 'not_a_real_event' as never,
        source: 'server',
      }),
    ).toThrow(/Invalid analytics event name/);
  });

  it('queueLogEvent throws synchronously when a user-required event has no userId', () => {
    expect(() =>
      queueLogEvent({
        name: 'wishlist_viewed',
        source: 'server',
      }),
    ).toThrow(/userId is required/);
  });

  it('logEvent propagates non-unique Prisma errors from the create path', async () => {
    // Passing a userId that does not exist triggers a foreign-key (P2003)
    // violation on AnalyticsEvent.userId. That is NOT a unique-conflict
    // error, so the catch branch should rethrow rather than swallow it.
    await expect(
      logEvent({
        name: 'wishlist_viewed',
        userId: 'user-that-does-not-exist',
        source: 'server',
        requestId: 'req-fk',
        eventId: 'event-fk',
      }),
    ).rejects.toThrow();
  });
});

describe('client environment analytics', () => {
  it('upserts one environment observation per visitor per day', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const createdAt = new Date('2026-06-29T12:00:00.000Z');
    const visitorId = '11111111-1111-4111-8111-111111111111';

    const first = await logClientEnvironmentObservation({
      visitorId,
      requestId: 'req-anon',
      sessionId: null,
      properties: {
        browserFamily: 'Safari',
        browserMajor: 17,
        osFamily: 'iOS',
        deviceType: 'mobile',
        viewportBucket: 'mobile',
        displayMode: 'browser',
        isStandalone: false,
        serviceWorkerSupported: true,
        notificationPermission: 'default',
        observedAt: createdAt.toISOString(),
      },
      createdAt,
    });

    const second = await logClientEnvironmentObservation({
      userId: user.id,
      visitorId,
      requestId: 'req-user',
      sessionId: 'session-user',
      properties: {
        browserFamily: 'Safari',
        browserMajor: 17,
        osFamily: 'iOS',
        deviceType: 'mobile',
        viewportBucket: 'mobile',
        displayMode: 'standalone',
        isStandalone: true,
        serviceWorkerSupported: true,
        notificationPermission: 'granted',
        observedAt: createdAt.toISOString(),
      },
      createdAt,
    });

    expect(second.id).toBe(first.id);
    expect(second.userId).toBe(user.id);
    expect(second.requestId).toBe('req-user');
    expect(second.sessionId).toBe('session-user');
    expect(
      await prisma.analyticsEvent.count({
        where: { eventId: getClientEnvironmentEventId(visitorId, createdAt) },
      }),
    ).toBe(1);
    expect(JSON.parse(second.properties ?? '{}')).toMatchObject({
      displayMode: 'standalone',
      isStandalone: true,
    });
  });

  it('aggregates environment observations and PWA funnel events', async () => {
    const now = new Date('2026-06-29T12:00:00.000Z');
    await Promise.all([
      logClientEnvironmentObservation({
        visitorId: '11111111-1111-4111-8111-111111111111',
        properties: {
          browserFamily: 'Chrome',
          browserMajor: 126,
          osFamily: 'Windows',
          deviceType: 'desktop',
          viewportBucket: 'desktop',
          displayMode: 'browser',
          isStandalone: false,
          serviceWorkerSupported: true,
          notificationPermission: 'default',
          observedAt: now.toISOString(),
        },
        createdAt: now,
      }),
      logClientEnvironmentObservation({
        visitorId: '22222222-2222-4222-8222-222222222222',
        properties: {
          browserFamily: 'Safari',
          browserMajor: 17,
          osFamily: 'iOS',
          deviceType: 'mobile',
          viewportBucket: 'mobile',
          displayMode: 'standalone',
          isStandalone: true,
          serviceWorkerSupported: true,
          notificationPermission: 'granted',
          observedAt: now.toISOString(),
        },
        createdAt: now,
      }),
      logEvent({
        name: 'pwa_prompt_available',
        source: 'client',
        visitorId: '11111111-1111-4111-8111-111111111111',
        createdAt: now,
      }),
    ]);

    const analytics = await getEnvironmentAnalytics({ now });

    expect(analytics.totalObservations).toBe(2);
    expect(analytics.uniqueVisitors).toBe(2);
    expect(analytics.standaloneObservations).toBe(1);
    expect(analytics.standalonePercent).toBe(50);
    expect(analytics.browsers).toEqual(
      expect.arrayContaining([
        { label: 'Chrome 126', count: 1, percent: 50 },
        { label: 'Safari 17', count: 1, percent: 50 },
      ]),
    );
    expect(
      analytics.pwaFunnel.find((row) => row.label === 'Prompt available')
        ?.count,
    ).toBe(1);
  });
});

describe('analytics explorer', () => {
  it('aggregates matching events by source and date', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const now = new Date('2026-06-29T12:00:00.000Z');

    await logEvent({
      name: 'wishlist_viewed',
      userId: user.id,
      source: 'server',
      visitorId: 'visitor-one',
      createdAt: now,
    });
    await logEvent({
      name: 'wishlist_viewed',
      userId: user.id,
      source: 'client',
      visitorId: 'visitor-one',
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    });
    await logEvent({
      name: 'wishlist_item_added',
      userId: user.id,
      source: 'client',
      visitorId: 'visitor-two',
      createdAt: now,
    });

    const explorer = await getAnalyticsExplorer({
      now,
      days: 7,
      eventName: 'wishlist_viewed',
      groupBy: 'source',
    });

    expect(explorer.totalEvents).toBe(2);
    expect(explorer.uniqueUsers).toBe(1);
    expect(explorer.uniqueVisitors).toBe(1);
    expect(explorer.series).toHaveLength(7);
    expect(explorer.breakdown).toEqual(
      expect.arrayContaining([
        { label: 'client', count: 1, percent: 50 },
        { label: 'server', count: 1, percent: 50 },
      ]),
    );
    expect(
      explorer.series.find((row) => row.date === '2026-06-29')?.count,
    ).toBe(1);
  });

  it('groups environment observations by browser and tolerates malformed JSON', async () => {
    const now = new Date('2026-06-29T12:00:00.000Z');
    await logClientEnvironmentObservation({
      visitorId: '11111111-1111-4111-8111-111111111111',
      properties: {
        browserFamily: 'Chrome',
        browserMajor: 126,
        osFamily: 'Windows',
        deviceType: 'desktop',
        viewportBucket: 'desktop',
        displayMode: 'browser',
        isStandalone: false,
        serviceWorkerSupported: true,
        notificationPermission: 'default',
        observedAt: now.toISOString(),
      },
      createdAt: now,
    });
    await prisma.analyticsEvent.create({
      data: {
        eventId: 'malformed-properties-event',
        name: 'client_environment_observed',
        source: 'client',
        visitorId: '22222222-2222-4222-8222-222222222222',
        properties: '{not-json',
        createdAt: now,
      },
    });

    const explorer = await getAnalyticsExplorer({
      now,
      days: 7,
      eventName: 'client_environment_observed',
      groupBy: 'browser',
      limit: 5,
    });

    expect(explorer.totalEvents).toBe(2);
    expect(explorer.breakdown).toEqual(
      expect.arrayContaining([
        { label: 'Chrome 126', count: 1, percent: 50 },
        { label: 'Unknown', count: 1, percent: 50 },
      ]),
    );
    expect(
      explorer.recentEvents.some(
        (event) => event.propertiesPreview === 'Invalid JSON',
      ),
    ).toBe(true);
  });
});
