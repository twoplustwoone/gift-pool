/**
 * @vitest-environment node
 */
import { type AppLoadContext } from 'react-router';
import { expect, test } from 'vitest';
import { getSessionExpirationDate } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

import { action } from './status.ts';

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

function createWishlistItem({ ownerId }: { ownerId: string }) {
  return prisma.wishlistItem.create({
    data: {
      ownerId,
      sortOrder: 0,
      title: 'Espresso machine',
      type: 'text',
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
      request: new Request('https://www.giftpool.app/wishlist/status', {
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

test('archiving an item releases a solo claim', async () => {
  const { user: owner, cookie } = await createUserWithSession();
  const { user: claimant } = await createUserWithSession();
  const item = await createWishlistItem({ ownerId: owner.id });
  await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, claimedByUserId: claimant.id },
  });

  const response = await invoke({
    cookie,
    form: {
      intent: 'update-wishlist-item-status',
      wishlistItemId: item.id,
      status: 'ARCHIVED',
    },
  });

  expect(getRouteResultStatus(response)).toBe(200);
  await expect(getRouteResultData(response)).resolves.toMatchObject({
    ok: true,
    status: 'ARCHIVED',
  });
  await expect(
    prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } }),
  ).resolves.toBeNull();
});

test('archiving a solo-claimed item a decided pool wants hands the pool the claim', async () => {
  // Regression: archiving used to bare-delete the solo claim without
  // settling it, so a pool that had already decided on the item was left
  // with no claim at all — the exact opposite of "the pool inherits."
  const { user: owner, cookie } = await createUserWithSession();
  const { user: claimant } = await createUserWithSession();
  const { user: organizer } = await createUserWithSession();
  const item = await createWishlistItem({ ownerId: owner.id });
  await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, claimedByUserId: claimant.id },
  });
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
    form: {
      intent: 'update-wishlist-item-status',
      wishlistItemId: item.id,
      status: 'ARCHIVED',
    },
  });

  expect(getRouteResultStatus(response)).toBe(200);
  const claim = await prisma.wishlistClaim.findUniqueOrThrow({
    where: { wishlistItemId: item.id },
  });
  expect(claim.poolId).toBe(pool.id);
  expect(claim.claimedByUserId).toBeNull();
});

test('a pool-held claim survives an archive/restore cycle', async () => {
  const { user: owner, cookie } = await createUserWithSession();
  const { user: organizer } = await createUserWithSession();
  const item = await createWishlistItem({ ownerId: owner.id });
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
  await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, poolId: pool.id },
  });

  // Archive.
  const archiveResponse = await invoke({
    cookie,
    form: {
      intent: 'update-wishlist-item-status',
      wishlistItemId: item.id,
      status: 'ARCHIVED',
    },
  });
  expect(getRouteResultStatus(archiveResponse)).toBe(200);

  const claimAfterArchive = await prisma.wishlistClaim.findUniqueOrThrow({
    where: { wishlistItemId: item.id },
  });
  expect(claimAfterArchive.poolId).toBe(pool.id);
  expect(claimAfterArchive.claimedByUserId).toBeNull();

  // Restore.
  const restoreResponse = await invoke({
    cookie,
    form: {
      intent: 'update-wishlist-item-status',
      wishlistItemId: item.id,
      status: 'ACTIVE',
    },
  });
  expect(getRouteResultStatus(restoreResponse)).toBe(200);

  const claimAfterRestore = await prisma.wishlistClaim.findUniqueOrThrow({
    where: { wishlistItemId: item.id },
  });
  expect(claimAfterRestore.poolId).toBe(pool.id);
  expect(claimAfterRestore.claimedByUserId).toBeNull();
});
