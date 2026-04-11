import { describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import { logEvent, queueLogEvent } from './analytics.server.ts';

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
