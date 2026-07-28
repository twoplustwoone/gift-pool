/**
 * @vitest-environment node
 */
import { type AppLoadContext } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import { getSessionExpirationDate } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

const queueLogEvent = vi.fn();
vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: (...args: Array<unknown>) => queueLogEvent(...args),
}));

import { action } from './purchase.ts';

const context = {
  cspNonce: undefined,
  serverBuild: undefined,
} as unknown as AppLoadContext;

const ensureUserRole = () =>
  prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: { name: 'user' },
  });

async function createUserWithSession() {
  await ensureUserRole();

  const user = await prisma.user.create({
    data: {
      ...createUser(),
      password: { create: createPassword() },
      roles: { connect: { name: 'user' } },
    },
  });

  const session = await prisma.session.create({
    select: { id: true },
    data: { userId: user.id, expirationDate: getSessionExpirationDate() },
  });

  const cookie = await getSessionCookieHeader(session);
  return { user, cookie };
}

async function makeFriends(aId: string, bId: string) {
  const [userAId, userBId] = aId < bId ? [aId, bId] : [bId, aId];
  await prisma.friendship.create({ data: { userAId, userBId } });
}

function createWishlistItem({
  ownerId,
  status,
}: {
  ownerId: string;
  status?: string;
}) {
  return prisma.wishlistItem.create({
    data: {
      ownerId,
      sortOrder: 0,
      title: 'Espresso machine',
      type: 'text',
      ...(status ? { status } : {}),
    },
  });
}

function invoke({
  cookie,
  form,
}: {
  cookie: string;
  form: Record<string, string>;
}) {
  return action(
    toActionArgs({
      context,
      params: {},
      request: new Request('https://www.giftpool.app/wishlist/purchase', {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(form),
      }),
    }),
  );
}

beforeEach(() => {
  queueLogEvent.mockReset();
  queueLogEvent.mockReturnValue({ eventId: 'evt-1' });
});

test('rejects an invalid submission with a 400 and a generic error', async () => {
  const { cookie } = await createUserWithSession();

  const response = await invoke({
    cookie,
    form: { wishlistItemId: 'missing-intent' },
  });

  expect(getRouteResultStatus(response)).toBe(400);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    ok: false,
    error: 'Invalid purchase request.',
  });
});

test('rejects an invalid submission with a missing wishlistItemId field', async () => {
  const { cookie } = await createUserWithSession();

  const response = await invoke({
    cookie,
    form: { intent: 'purchase' },
  });

  expect(getRouteResultStatus(response)).toBe(400);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    ok: false,
    wishlistItemId: '',
    error: 'Invalid purchase request.',
  });
});

test('returns 404 for an unknown wishlist item', async () => {
  const { cookie } = await createUserWithSession();

  const response = await invoke({
    cookie,
    form: { wishlistItemId: 'does-not-exist', intent: 'purchase' },
  });

  expect(getRouteResultStatus(response)).toBe(404);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    ok: false,
    error: 'Wishlist item not found.',
  });
});

test('rejects the owner claiming their own wishlist item', async () => {
  const { user, cookie } = await createUserWithSession();
  const item = await createWishlistItem({ ownerId: user.id });

  const response = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'purchase' },
  });

  expect(getRouteResultStatus(response)).toBe(400);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    ok: false,
    error: 'You cannot mark your own wishlist item as purchased.',
  });
});

test('rejects claiming an item that is no longer ACTIVE', async () => {
  const { user: owner } = await createUserWithSession();
  const { user: viewer, cookie } = await createUserWithSession();
  await makeFriends(owner.id, viewer.id);
  const item = await createWishlistItem({
    ownerId: owner.id,
    status: 'ARCHIVED',
  });

  const response = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'purchase' },
  });

  expect(getRouteResultStatus(response)).toBe(400);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    ok: false,
    error: 'This item is no longer available on the wishlist.',
  });
});

test('rejects a viewer without wishlist access (not a friend, no shared group)', async () => {
  const { user: owner } = await createUserWithSession();
  const { cookie } = await createUserWithSession();
  const item = await createWishlistItem({ ownerId: owner.id });

  const response = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'purchase' },
  });

  expect(getRouteResultStatus(response)).toBe(403);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    ok: false,
    error: 'You no longer have access to this wishlist.',
  });
});

test('rejects claiming an item already claimed by another user', async () => {
  const { user: owner } = await createUserWithSession();
  const { user: firstClaimant } = await createUserWithSession();
  const { user: secondClaimant, cookie } = await createUserWithSession();
  await makeFriends(owner.id, firstClaimant.id);
  await makeFriends(owner.id, secondClaimant.id);
  const item = await createWishlistItem({ ownerId: owner.id });
  await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, claimedByUserId: firstClaimant.id },
  });

  const response = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'purchase' },
  });

  expect(getRouteResultStatus(response)).toBe(400);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    ok: false,
    error: 'Someone already grabbed this one.',
    claim: { claimedByUserId: firstClaimant.id },
  });
});

test('rejects claiming an item already held by a pool, without implying it was purchased', async () => {
  const { user: owner } = await createUserWithSession();
  const { user: organizer } = await createUserWithSession();
  const { user: viewer, cookie } = await createUserWithSession();
  await makeFriends(owner.id, viewer.id);
  const item = await createWishlistItem({ ownerId: owner.id });
  const pool = await prisma.pool.create({
    data: { title: 'Pool', organizerId: organizer.id, recipientUserId: owner.id },
  });
  await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, poolId: pool.id },
  });

  const response = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'purchase' },
  });

  expect(getRouteResultStatus(response)).toBe(400);
  const payload = await getRouteResultData(response);
  expect(payload).toMatchObject({
    ok: false,
    error: 'A group is already getting this one.',
  });
  expect((payload as { error: string }).error).not.toMatch(/purchased/i);
});

test('claims an item on the happy path and logs the purchase event', async () => {
  const { user: owner } = await createUserWithSession();
  const { user: viewer, cookie } = await createUserWithSession();
  await makeFriends(owner.id, viewer.id);
  const item = await createWishlistItem({ ownerId: owner.id });

  const response = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'purchase' },
  });

  expect(getRouteResultStatus(response)).toBe(200);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    ok: true,
    wishlistItemId: item.id,
    claim: { claimedByUserId: viewer.id },
  });

  const claim = await prisma.wishlistClaim.findUniqueOrThrow({
    where: { wishlistItemId: item.id },
  });
  expect(claim.claimedByUserId).toBe(viewer.id);

  expect(queueLogEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'wishlist_purchase_recorded',
      userId: viewer.id,
      source: 'server',
      properties: expect.objectContaining({
        wishlistItemId: item.id,
        ownerId: owner.id,
      }),
    }),
  );
});

test('re-claiming an item you already hold succeeds idempotently', async () => {
  const { user: owner } = await createUserWithSession();
  const { user: viewer, cookie } = await createUserWithSession();
  await makeFriends(owner.id, viewer.id);
  const item = await createWishlistItem({ ownerId: owner.id });
  await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, claimedByUserId: viewer.id },
  });

  const response = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'purchase' },
  });

  expect(getRouteResultStatus(response)).toBe(200);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    ok: true,
    wishlistItemId: item.id,
    claim: { claimedByUserId: viewer.id },
  });
  await expect(prisma.wishlistClaim.count()).resolves.toBe(1);
});

test('releases a claim held by the requester and returns claim: null', async () => {
  const { user: owner } = await createUserWithSession();
  const { user: viewer, cookie } = await createUserWithSession();
  await makeFriends(owner.id, viewer.id);
  const item = await createWishlistItem({ ownerId: owner.id });
  await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, claimedByUserId: viewer.id },
  });

  const response = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'unpurchase' },
  });

  expect(getRouteResultStatus(response)).toBe(200);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    ok: true,
    wishlistItemId: item.id,
    claim: null,
  });
  await expect(
    prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } }),
  ).resolves.toBeNull();
});

test('releasing a claim that transfers to a waiting pool reports the item as pool-held, not free', async () => {
  const { user: owner } = await createUserWithSession();
  const { user: organizer } = await createUserWithSession();
  const { user: viewer, cookie } = await createUserWithSession();
  await makeFriends(owner.id, viewer.id);
  const item = await createWishlistItem({ ownerId: owner.id });

  // The friend claims the item first.
  await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, claimedByUserId: viewer.id },
  });

  // A pool decides on the same item afterward. It conflicts with the
  // existing solo claim, so it takes nothing yet — but it now has intent
  // and is waiting.
  const pool = await prisma.pool.create({
    data: { title: 'Pool', organizerId: organizer.id, recipientUserId: owner.id },
  });
  const idea = await prisma.giftIdea.create({
    data: {
      poolId: pool.id,
      proposedById: organizer.id,
      name: 'Espresso machine',
      wishlistItemId: item.id,
    },
  });
  await prisma.pool.update({
    where: { id: pool.id },
    data: { status: 'DECIDED', chosenIdeaId: idea.id, decidedAt: new Date() },
  });

  const response = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'unpurchase' },
  });

  expect(getRouteResultStatus(response)).toBe(200);
  const payload = await getRouteResultData(response);
  expect(payload).toMatchObject({
    ok: true,
    wishlistItemId: item.id,
    // Not `claim: null` — the pool immediately took the claim on release, so
    // the item must not be reported as free to grab.
    claim: { claimedByUserId: null },
  });

  const claim = await prisma.wishlistClaim.findUniqueOrThrow({
    where: { wishlistItemId: item.id },
  });
  expect(claim.poolId).toBe(pool.id);
  expect(claim.claimedByUserId).toBeNull();

  expect(queueLogEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'wishlist_claim_transferred',
      userId: viewer.id,
      properties: expect.objectContaining({
        wishlistItemId: item.id,
        toPoolId: pool.id,
      }),
    }),
  );
});

test('rejects releasing a claim held by someone else', async () => {
  const { user: owner } = await createUserWithSession();
  const { user: holder } = await createUserWithSession();
  const { user: nonHolder, cookie } = await createUserWithSession();
  await makeFriends(owner.id, holder.id);
  await makeFriends(owner.id, nonHolder.id);
  const item = await createWishlistItem({ ownerId: owner.id });
  await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, claimedByUserId: holder.id },
  });

  const response = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'unpurchase' },
  });

  expect(getRouteResultStatus(response)).toBe(400);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    ok: false,
    error: 'You can only unmark items you marked as purchased.',
    claim: { claimedByUserId: holder.id },
  });
  await expect(
    prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } }),
  ).resolves.not.toBeNull();
});
