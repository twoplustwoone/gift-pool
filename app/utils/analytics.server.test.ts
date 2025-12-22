import { describe, expect, it } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { logEvent } from './analytics.server.ts';
import { createUser } from '#tests/db-utils.ts';

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
});
