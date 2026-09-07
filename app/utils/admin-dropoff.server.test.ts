/**
 * @vitest-environment node
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getDropOffFunnels } from '#app/utils/admin.server.ts';
import { logEvent } from '#app/utils/analytics.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';

// Each test passes a distinct `days` window: getDropOffFunnels caches per
// window, so reusing one would serve a previous test's aggregate against
// this test's freshly-seeded rows.

async function seedUser() {
  return prisma.user.create({ data: createUser(), select: { id: true } });
}

describe('getDropOffFunnels', () => {
  it('builds the signup funnel from distinct visitors per step', async () => {
    const [v1, v2, v3] = [randomUUID(), randomUUID(), randomUUID()];
    const user = await seedUser();
    await Promise.all([
      // v1 completes all three steps (submitted twice — dedupe by visitor).
      logEvent({ name: 'signup_submitted', source: 'server', visitorId: v1 }),
      logEvent({ name: 'signup_submitted', source: 'server', visitorId: v1 }),
      logEvent({
        name: 'signup_email_verified',
        source: 'server',
        visitorId: v1,
      }),
      logEvent({
        name: 'user_registered',
        source: 'server',
        visitorId: v1,
        userId: user.id,
      }),
      // v2 stalls at email verification, v3 never verifies.
      logEvent({ name: 'signup_submitted', source: 'server', visitorId: v2 }),
      logEvent({
        name: 'signup_email_verified',
        source: 'server',
        visitorId: v2,
      }),
      logEvent({ name: 'signup_submitted', source: 'server', visitorId: v3 }),
    ]);

    const result = await getDropOffFunnels({ days: 11 });

    expect(result.signup).toEqual([
      { step: 'Signup submitted', count: 3, percent: 100 },
      { step: 'Email verified', count: 2, percent: 67 },
      { step: 'Onboarding completed', count: 1, percent: 33 },
    ]);
  });

  it('splits invite landings by type and validity and pairs completions', async () => {
    const user = await seedUser();
    await Promise.all([
      logEvent({
        name: 'invite_landed',
        source: 'server',
        visitorId: randomUUID(),
        properties: { inviteType: 'group', valid: true, giftGroupId: 'g1' },
      }),
      logEvent({
        name: 'invite_landed',
        source: 'server',
        visitorId: randomUUID(),
        properties: { inviteType: 'group', valid: false },
      }),
      logEvent({
        name: 'invite_landed',
        source: 'server',
        visitorId: randomUUID(),
        properties: { inviteType: 'pool', valid: true, poolId: 'p1' },
      }),
      logEvent({
        name: 'group_joined',
        source: 'server',
        userId: user.id,
        properties: { giftGroupId: 'g1', via: 'invite' },
      }),
      logEvent({
        name: 'pool_contributor_joined',
        source: 'server',
        userId: user.id,
        properties: { poolId: 'p1' },
      }),
      // Direct friend-request accept must NOT count as an invite conversion.
      logEvent({
        name: 'friend_request_accepted',
        source: 'server',
        userId: user.id,
        properties: { friendRequestId: 'fr1' },
      }),
    ]);

    const result = await getDropOffFunnels({ days: 12 });

    expect(result.invites).toEqual([
      { inviteType: 'group', landed: 1, deadLinkLandings: 1, completed: 1 },
      { inviteType: 'pool', landed: 1, deadLinkLandings: 0, completed: 1 },
      { inviteType: 'friend', landed: 0, deadLinkLandings: 0, completed: 0 },
    ]);
  });

  it('counts invite-link friend accepts via the via property', async () => {
    const user = await seedUser();
    await Promise.all([
      logEvent({
        name: 'invite_landed',
        source: 'server',
        visitorId: randomUUID(),
        properties: { inviteType: 'friend', valid: true, inviterId: 'u1' },
      }),
      logEvent({
        name: 'friend_request_accepted',
        source: 'server',
        userId: user.id,
        properties: { via: 'invite_link', inviterId: 'u1' },
      }),
    ]);

    const result = await getDropOffFunnels({ days: 13 });
    const friend = result.invites.find((row) => row.inviteType === 'friend');
    expect(friend).toEqual({
      inviteType: 'friend',
      landed: 1,
      deadLinkLandings: 0,
      completed: 1,
    });
  });

  it('reports editor conversion and share reach', async () => {
    const [user, other] = await Promise.all([seedUser(), seedUser()]);
    const visitor = randomUUID();
    await Promise.all([
      logEvent({
        name: 'wishlist_editor_opened',
        source: 'client',
        userId: user.id,
        properties: { mode: 'create' },
      }),
      logEvent({
        name: 'wishlist_editor_opened',
        source: 'client',
        userId: other.id,
        properties: { mode: 'create' },
      }),
      logEvent({
        name: 'wishlist_item_added',
        source: 'server',
        userId: user.id,
      }),
      // Same anonymous visitor views the share page twice: 2 views, 1 unique.
      logEvent({
        name: 'wishlist_share_viewed',
        source: 'server',
        visitorId: visitor,
        properties: { wishlistOwnerId: user.id },
      }),
      logEvent({
        name: 'wishlist_share_viewed',
        source: 'server',
        visitorId: visitor,
        properties: { wishlistOwnerId: user.id },
      }),
      logEvent({
        name: 'wishlist_link_clicked',
        source: 'server',
        visitorId: visitor,
        properties: { entity: 'item', id: 'i1', host: 'shop.example.com' },
      }),
    ]);

    const result = await getDropOffFunnels({ days: 14 });

    expect(result.editor).toEqual({ opened: 2, added: 1 });
    expect(result.share).toEqual({
      views: 2,
      uniqueVisitors: 1,
      outboundClicks: 1,
    });
  });

  it('counts the exchange lifecycle per exchange, not per event', async () => {
    const user = await seedUser();
    const ev = (
      name: 'exchange_created' | 'exchange_drawn' | 'exchange_revealed',
      exchangeId: string,
    ) =>
      logEvent({
        name,
        source: 'server',
        userId: user.id,
        properties: { exchangeId },
      });
    await Promise.all([
      ev('exchange_created', 'x1'),
      ev('exchange_created', 'x2'),
      ev('exchange_created', 'x3'),
      ev('exchange_drawn', 'x1'),
      ev('exchange_drawn', 'x2'),
      // A second drawn row for x1 (e.g. a retried log) must not double count.
      ev('exchange_drawn', 'x1'),
      ev('exchange_revealed', 'x1'),
    ]);

    const result = await getDropOffFunnels({ days: 17 });

    expect(result.exchanges).toEqual([
      { step: 'Exchange created', count: 3, percent: 100 },
      { step: 'Names drawn', count: 2, percent: 67 },
      { step: 'Pairings revealed', count: 1, percent: 33 },
    ]);
  });
});
