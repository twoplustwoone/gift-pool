/**
 * @vitest-environment node
 *
 * Regression for the P1 finding: `WishlistClaim.claimedByUserId` has
 * `onDelete: Cascade`, so a bare `prisma.user.delete` in `deleteDataAction`
 * removed a claimant's solo claims at the database level with no
 * `.wishlistClaim` call in sight — the write-guard test stayed green, but
 * `settleItem` never ran, so a decided pool waiting behind that claim was
 * left with nothing while the item sat free for anyone to take. The fix
 * routes the deletion through `releaseSoloClaimsMatching` first, while the
 * claim rows still exist, so a waiting pool inherits before the cascade
 * would have quietly erased the evidence.
 */
import { type AppLoadContext } from 'react-router';
import { expect, test } from 'vitest';
import { getSessionExpirationDate } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import {
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

import { action } from './profile.index.tsx';

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

function invokeDeleteData(cookie: string) {
  return action(
    toActionArgs({
      context,
      params: {},
      request: new Request('https://www.giftpool.app/settings/profile', {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ intent: 'delete-data' }),
      }),
    }),
  );
}

test('hands a solo claim to a decided pool waiting behind it when the claimant deletes their account', async () => {
  const owner = await prisma.user.create({ data: createUser() });
  const organizer = await prisma.user.create({ data: createUser() });
  const { user: claimant, cookie } = await createUserWithSession();

  const item = await prisma.wishlistItem.create({
    data: {
      ownerId: owner.id,
      title: 'Espresso machine',
      type: 'text',
      sortOrder: 0,
    },
  });
  await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, claimedByUserId: claimant.id },
  });

  const pool = await prisma.pool.create({
    data: {
      title: 'Espresso machine pool',
      organizerId: organizer.id,
      recipientUserId: owner.id,
    },
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

  const response = await invokeDeleteData(cookie);
  expect(getRouteResultStatus(response)).toBe(302);

  const deletedUser = await prisma.user.findUnique({
    where: { id: claimant.id },
  });
  expect(deletedUser).toBeNull();

  // The account is gone, but the pool that had already decided on the item
  // inherited the claim instead of the item being silently freed.
  const claim = await prisma.wishlistClaim.findUniqueOrThrow({
    where: { wishlistItemId: item.id },
  });
  expect(claim.poolId).toBe(pool.id);
  expect(claim.claimedByUserId).toBeNull();
});

test('deletes the account with no error when the user holds no wishlist claims', async () => {
  const { user, cookie } = await createUserWithSession();

  const response = await invokeDeleteData(cookie);
  expect(getRouteResultStatus(response)).toBe(302);

  const deletedUser = await prisma.user.findUnique({ where: { id: user.id } });
  expect(deletedUser).toBeNull();
});

test('deletes the account of someone who belongs to a group', async () => {
  // `UsersInGiftGroups.userId` is ON DELETE RESTRICT, and eight other foreign
  // keys to User are too, so before `prepareAccountForDeletion` this action
  // threw for every user who had ever joined a group — which is every real
  // user. The delete button simply did not work.
  const { user, cookie } = await createUserWithSession();
  const other = await prisma.user.create({ data: createUser() });
  const group = await prisma.giftGroup.create({
    data: {
      name: 'The Painted',
      groupMembers: {
        create: [
          { userId: user.id, role: 'OWNER' },
          { userId: other.id, role: 'MEMBER' },
        ],
      },
    },
  });

  const response = await invokeDeleteData(cookie);
  expect(getRouteResultStatus(response)).toBe(302);
  expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();

  // The group survives with its remaining member promoted to owner.
  const rows = await prisma.usersInGiftGroups.findMany({
    where: { giftGroupId: group.id },
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]?.role).toBe('OWNER');
});

test('returns the refusal as data when a live pool still needs their idea', async () => {
  // The form posts with a fetcher, so a thrown response would replace the
  // settings page with the error boundary and the person would never read
  // what to do about it.
  const { user, cookie } = await createUserWithSession();
  const organizer = await prisma.user.create({ data: createUser() });
  const owner = await prisma.user.create({ data: createUser() });

  // A solo claim with a decided pool waiting behind it: deletion normally
  // hands this over, in its own transaction, before the account is touched.
  const item = await prisma.wishlistItem.create({
    data: {
      ownerId: owner.id,
      title: 'Espresso machine',
      type: 'text',
      sortOrder: 0,
    },
  });
  await prisma.wishlistClaim.create({
    data: { wishlistItemId: item.id, claimedByUserId: user.id },
  });
  const waiting = await prisma.pool.create({
    data: {
      title: 'Espresso machine pool',
      organizerId: organizer.id,
      recipientUserId: owner.id,
    },
  });
  const waitingIdea = await prisma.giftIdea.create({
    data: {
      poolId: waiting.id,
      proposedById: organizer.id,
      name: 'Espresso machine',
      wishlistItemId: item.id,
    },
  });
  await prisma.pool.update({
    where: { id: waiting.id },
    data: {
      status: 'DECIDED',
      chosenIdeaId: waitingIdea.id,
      decidedAt: new Date(),
    },
  });

  // And a second pool that decided on an idea this user proposed — the one
  // thing deletion refuses over.
  const blocked = await prisma.pool.create({
    data: { title: 'A telescope pool', organizerId: organizer.id },
  });
  const idea = await prisma.giftIdea.create({
    data: { poolId: blocked.id, proposedById: user.id, name: 'A telescope' },
  });
  await prisma.pool.update({
    where: { id: blocked.id },
    data: { status: 'DECIDED', chosenIdeaId: idea.id, decidedAt: new Date() },
  });

  const result = (await invokeDeleteData(cookie)) as {
    status: string;
    error: string;
  };
  expect(result.status).toBe('error');
  expect(result.error).toContain('A telescope');

  // Nothing was taken apart on the way to refusing. The claim releases run in
  // their own transactions, so refusing after them would have handed this
  // claim to the waiting pool for a deletion that never happened.
  expect(
    await prisma.user.findUnique({ where: { id: user.id } }),
  ).not.toBeNull();
  const claim = await prisma.wishlistClaim.findUniqueOrThrow({
    where: { wishlistItemId: item.id },
  });
  expect(claim.claimedByUserId).toBe(user.id);
  expect(claim.poolId).toBeNull();
  expect(
    (await prisma.pool.findUniqueOrThrow({ where: { id: blocked.id } }))
      .chosenIdeaId,
  ).toBe(idea.id);
});
