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

test('the loser of a concurrent claim race is told the winner, not a stale "unclaimed"', async () => {
  // Regression for the P2 finding: the route used to return `currentClaim`,
  // the claim state read *before* calling claimForUser — null for a free
  // item. A loser of a genuine concurrent race would then have its UI
  // reconciled back to "unclaimed" even though the winner's row already
  // existed. The route must now report the actual post-race claim.
  const { user: owner } = await createUserWithSession();
  const { user: firstViewer, cookie: firstCookie } = await createUserWithSession();
  const { user: secondViewer, cookie: secondCookie } = await createUserWithSession();
  await makeFriends(owner.id, firstViewer.id);
  await makeFriends(owner.id, secondViewer.id);
  const item = await createWishlistItem({ ownerId: owner.id });

  const [firstResponse, secondResponse] = await Promise.all([
    invoke({ cookie: firstCookie, form: { wishlistItemId: item.id, intent: 'purchase' } }),
    invoke({ cookie: secondCookie, form: { wishlistItemId: item.id, intent: 'purchase' } }),
  ]);

  type RaceResult = { ok: boolean; claim: { claimedByUserId: string | null } | null };
  const [firstData, secondData] = await Promise.all([
    getRouteResultData<RaceResult>(firstResponse),
    getRouteResultData<RaceResult>(secondResponse),
  ]);

  const winner = firstData.ok ? firstData : secondData;
  const loser = firstData.ok ? secondData : firstData;
  expect(firstData.ok).not.toBe(secondData.ok);
  expect(loser.claim).not.toBeNull();
  expect(loser.claim?.claimedByUserId).not.toBeNull();
  expect(loser.claim?.claimedByUserId).toBe(winner.claim?.claimedByUserId);

  const claim = await prisma.wishlistClaim.findUniqueOrThrow({
    where: { wishlistItemId: item.id },
  });
  expect(loser.claim?.claimedByUserId).toBe(claim.claimedByUserId);
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

test('a release bound to a stale claim id does not destroy the current claim', async () => {
  // Regression for the most serious finding: the notification's Release
  // action now carries the WishlistClaim.id it was raised about. Reachable
  // sequence — the claimant releases from the wishlist UI (no claimId, the
  // notification row survives), re-claims the same item (a brand new claim
  // row), then clicks Release on the now-stale notification. That must fail
  // safely rather than silently dropping the user's current claim.
  const { user: owner } = await createUserWithSession();
  const { user: viewer, cookie } = await createUserWithSession();
  await makeFriends(owner.id, viewer.id);
  const item = await createWishlistItem({ ownerId: owner.id });

  const originalClaim = await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, claimedByUserId: viewer.id },
  });

  // Released directly from the wishlist UI — no claimId, always allowed.
  const firstRelease = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'unpurchase' },
  });
  expect(getRouteResultStatus(firstRelease)).toBe(200);

  // Re-claims the same item: a brand new WishlistClaim row.
  const reclaim = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'purchase' },
  });
  expect(getRouteResultStatus(reclaim)).toBe(200);
  const currentClaim = await prisma.wishlistClaim.findUniqueOrThrow({
    where: { wishlistItemId: item.id },
  });
  expect(currentClaim.id).not.toBe(originalClaim.id);

  // Clicks Release on the stale notification, which still carries the
  // original claim's id.
  const staleRelease = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'unpurchase', claimId: originalClaim.id },
  });

  expect(getRouteResultStatus(staleRelease)).toBe(400);
  await expect(getRouteResultData(staleRelease)).resolves.toMatchObject({
    ok: false,
    claim: { claimedByUserId: viewer.id },
  });

  const claimAfter = await prisma.wishlistClaim.findUniqueOrThrow({
    where: { wishlistItemId: item.id },
  });
  expect(claimAfter.id).toBe(currentClaim.id);
  expect(claimAfter.claimedByUserId).toBe(viewer.id);
});

test('releases when the claimId matches the current claim exactly', async () => {
  const { user: owner } = await createUserWithSession();
  const { user: viewer, cookie } = await createUserWithSession();
  await makeFriends(owner.id, viewer.id);
  const item = await createWishlistItem({ ownerId: owner.id });
  const claim = await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, claimedByUserId: viewer.id },
  });

  const response = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'unpurchase', claimId: claim.id },
  });

  expect(getRouteResultStatus(response)).toBe(200);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    ok: true,
    claim: null,
  });
  await expect(
    prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } }),
  ).resolves.toBeNull();
});

test('resolves the matching WISHLIST_CLAIM_CONFLICT notification when the release commits, so a reload cannot offer Release again', async () => {
  // Regression for the P2 finding: resolving the notification used to
  // depend entirely on a second client request (the bell's separate dismiss
  // call) succeeding. If that request failed, the notification stayed
  // UNREAD server-side and a refresh re-offered a Release button bound to a
  // claim that no longer existed — one that would fail every time it was
  // clicked. The release path now resolves it directly, with no client
  // follow-up required.
  const { user: owner } = await createUserWithSession();
  const { user: viewer, cookie } = await createUserWithSession();
  await makeFriends(owner.id, viewer.id);
  const item = await createWishlistItem({ ownerId: owner.id });
  const claim = await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, claimedByUserId: viewer.id },
  });
  const notification = await prisma.notification.create({
    data: {
      userId: viewer.id,
      type: 'WISHLIST_CLAIM_CONFLICT',
      status: 'UNREAD',
      messageKey: 'notifications.wishlistClaimConflict.message',
      metadata: JSON.stringify({ wishlistItemId: item.id, claimId: claim.id }),
      actions: JSON.stringify([
        { kind: 'WISHLIST_CLAIM_KEEP', labelKey: 'notifications.wishlistClaimConflict.keep' },
        { kind: 'WISHLIST_CLAIM_RELEASE', labelKey: 'notifications.wishlistClaimConflict.release' },
      ]),
    },
  });

  const response = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'unpurchase', claimId: claim.id },
  });

  expect(getRouteResultStatus(response)).toBe(200);
  await expect(getRouteResultData(response)).resolves.toMatchObject({ ok: true });

  // Gone outright — not merely marked read — so a subsequent notifications
  // list load (what "a reload" means server-side) has nothing left that
  // could render a Release action for this claim.
  await expect(
    prisma.notification.findUnique({ where: { id: notification.id } }),
  ).resolves.toBeNull();
});

test('leaves a WISHLIST_CLAIM_CONFLICT notification for a different claim occurrence untouched', async () => {
  // Matching must be scoped to the exact claim occurrence (metadata.claimId),
  // not just the wishlist item — otherwise resolving this release could wipe
  // out a still-live conflict notification raised later about a fresh claim
  // the same user takes out on the same item.
  const { user: owner } = await createUserWithSession();
  const { user: viewer, cookie } = await createUserWithSession();
  await makeFriends(owner.id, viewer.id);
  const item = await createWishlistItem({ ownerId: owner.id });
  const claim = await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, claimedByUserId: viewer.id },
  });
  const unrelatedNotification = await prisma.notification.create({
    data: {
      userId: viewer.id,
      type: 'WISHLIST_CLAIM_CONFLICT',
      status: 'UNREAD',
      messageKey: 'notifications.wishlistClaimConflict.message',
      metadata: JSON.stringify({ wishlistItemId: item.id, claimId: 'claim-does-not-match' }),
      actions: JSON.stringify([]),
    },
  });

  const response = await invoke({
    cookie,
    form: { wishlistItemId: item.id, intent: 'unpurchase', claimId: claim.id },
  });

  expect(getRouteResultStatus(response)).toBe(200);
  await expect(
    prisma.notification.findUnique({ where: { id: unrelatedNotification.id } }),
  ).resolves.not.toBeNull();
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
