import { type Page } from '@playwright/test';
import { prisma } from '#app/utils/db.server.ts';
import { addContributor, createPool } from '#app/utils/pool.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, test, waitFor } from '#tests/playwright-utils.ts';

const connectUserRole = { connect: { name: 'user' } };

const createFriendship = async (userOneId: string, userTwoId: string) => {
  const [userAId, userBId] =
    userOneId < userTwoId ? [userOneId, userTwoId] : [userTwoId, userOneId];
  await prisma.friendship.create({ data: { userAId, userBId } });
};

async function createAppUser() {
  const userData = createUser();
  return prisma.user.create({
    select: { id: true, username: true, name: true },
    data: {
      ...userData,
      roles: connectUserRole,
      password: { create: createPassword(userData.username) },
    },
  });
}

const dismissInstallPrompt = async (page: Page) => {
  const notNow = page.getByRole('button', { name: /not now/i });
  if ((await notNow.count()) > 0) {
    await notNow.click();
  }
};

// Covers the headline journey this feature exists for: a friend claims an
// item, a pool decides on it anyway (conflict warning, no claim taken), the
// friend is asked to keep or release, releases, and the pool inherits the
// claim while its contributors are told. Closes with a third, unrelated
// viewer seeing the item as claimed with zero attribution — the privacy
// ladder holding even after the claim has changed hands twice.
test('a pool inherits a released claim after a conflicted decision, and contributors are told', async ({
  page,
  login,
}) => {
  const createdUserIds: string[] = [];
  const createdPoolIds: string[] = [];

  const [owner, claimer, organizer, contributor, thirdViewer] =
    await Promise.all([
      createAppUser(),
      createAppUser(),
      createAppUser(),
      createAppUser(),
      createAppUser(),
    ]);
  createdUserIds.push(
    owner.id,
    claimer.id,
    organizer.id,
    contributor.id,
    thirdViewer.id,
  );
  await Promise.all([
    createFriendship(owner.id, claimer.id),
    createFriendship(owner.id, thirdViewer.id),
  ]);

  const wishlistItem = await prisma.wishlistItem.create({
    select: { id: true, title: true },
    data: {
      ownerId: owner.id,
      title: 'Espresso Machine',
      type: 'text',
      sortOrder: 0,
    },
  });

  try {
    // ── Step 1: a friend claims the item ──────────────────────────────────
    await page.context().clearCookies();
    await login({ id: claimer.id });
    await page.goto(`/users/${owner.username}/wishlist`);
    await dismissInstallPrompt(page);
    await expect(page.getByText(wishlistItem.title)).toBeVisible();
    await page
      .getByRole('button', { name: "I'll grab this gift", exact: true })
      .click();
    await waitFor(
      () =>
        prisma.wishlistClaim.findUnique({
          where: { wishlistItemId: wishlistItem.id },
        }),
      { timeout: 8000 },
    );

    const claimAfterStep1 = await prisma.wishlistClaim.findUniqueOrThrow({
      where: { wishlistItemId: wishlistItem.id },
    });
    expect(claimAfterStep1.claimedByUserId).toBe(claimer.id);
    expect(claimAfterStep1.poolId).toBeNull();

    // ── Step 2: a pool decides on the same item — conflict warning, no claim ──
    const pool = await createPool({
      organizerId: organizer.id,
      recipientUserId: owner.id,
      recipientName: owner.name ?? owner.username,
      title: 'Housewarming Pool',
    });
    createdPoolIds.push(pool.id);
    await addContributor(pool.id, contributor.id);
    const idea = await prisma.giftIdea.create({
      select: { id: true },
      data: {
        poolId: pool.id,
        proposedById: organizer.id,
        name: wishlistItem.title,
        wishlistItemId: wishlistItem.id,
      },
    });

    await page.context().clearCookies();
    await login({ id: organizer.id });
    await page.goto(`/pools/${pool.id}`);
    await dismissInstallPrompt(page);

    const ideaCard = page
      .getByTestId('idea-card')
      .filter({ hasText: wishlistItem.title });
    await expect(ideaCard.getByText('Already claimed')).toBeVisible();

    await ideaCard.getByRole('button', { name: 'Choose', exact: true }).click();
    await expect(page.getByText("This one's already claimed")).toBeVisible();
    await page
      .getByRole('button', { name: 'Choose it anyway', exact: true })
      .click();

    // Decision lands, the pool's own conflict badge persists post-decision,
    // and the organizer is warned rather than told it succeeded.
    await expect(page.getByTestId('chosen-gift-conflict')).toBeVisible();
    await expect(page.getByText(/your pool didn't get it/i)).toBeVisible();

    await expect(
      prisma.pool.findUniqueOrThrow({
        where: { id: pool.id },
        select: { status: true, chosenIdeaId: true },
      }),
    ).resolves.toEqual({ status: 'DECIDED', chosenIdeaId: idea.id });

    // The pool took no claim — it's still the friend's.
    const claimAfterConflict = await prisma.wishlistClaim.findUniqueOrThrow({
      where: { wishlistItemId: wishlistItem.id },
    });
    expect(claimAfterConflict.claimedByUserId).toBe(claimer.id);
    expect(claimAfterConflict.poolId).toBeNull();

    // ── Step 3: the friend is asked whether they're still getting it ───────
    await waitFor(
      () =>
        prisma.notification.findFirst({
          where: { userId: claimer.id, type: 'WISHLIST_CLAIM_CONFLICT' },
        }),
      { timeout: 8000 },
    );

    await page.context().clearCookies();
    await login({ id: claimer.id });
    await page.goto(`/users/${owner.username}/wishlist`);
    await dismissInstallPrompt(page);
    await page
      .getByRole('button', { name: 'Notifications', exact: true })
      .click();
    await expect(
      page.getByText(/Are you still getting it yourself/i),
    ).toBeVisible();
    const keepButton = page.getByRole('button', {
      name: 'Keep it',
      exact: true,
    });
    const releaseButton = page.getByRole('button', {
      name: 'Release it',
      exact: true,
    });
    await expect(keepButton).toBeVisible();
    await expect(releaseButton).toBeVisible();

    // ── Step 4: the friend releases ─────────────────────────────────────────
    await releaseButton.click();
    await expect(
      page.getByText(/Released.*group's got it from here/i),
    ).toBeVisible();

    // ── Step 5: the pool inherits the claim, and contributors are told ─────
    const claimAfterRelease = await waitFor(
      async () => {
        const claim = await prisma.wishlistClaim.findUnique({
          where: { wishlistItemId: wishlistItem.id },
        });
        return claim?.poolId === pool.id ? claim : null;
      },
      { timeout: 8000 },
    );
    expect(claimAfterRelease.claimedByUserId).toBeNull();
    expect(claimAfterRelease.poolId).toBe(pool.id);

    // Every contributor is told, not just the one who chose the idea.
    await waitFor(
      () =>
        prisma.notification.findFirst({
          where: { userId: organizer.id, type: 'WISHLIST_CLAIM_TRANSFERRED' },
        }),
      { timeout: 8000 },
    );
    await waitFor(
      () =>
        prisma.notification.findFirst({
          where: {
            userId: contributor.id,
            type: 'WISHLIST_CLAIM_TRANSFERRED',
          },
        }),
      { timeout: 8000 },
    );

    await page.context().clearCookies();
    await login({ id: organizer.id });
    await page.goto(`/pools/${pool.id}`);
    await dismissInstallPrompt(page);
    await page
      .getByRole('button', { name: 'Notifications', exact: true })
      .click();
    await expect(
      page.getByText(/no more duplicate risk from that claim/i),
    ).toBeVisible();

    // ── Bonus: a third, unrelated viewer sees it as claimed, unattributed ──
    await page.context().clearCookies();
    await login({ id: thirdViewer.id });
    await page.goto(`/users/${owner.username}/wishlist`);
    await dismissInstallPrompt(page);
    const thirdViewerCard = page
      .getByTestId('wishlist-item-card')
      .filter({ hasText: wishlistItem.title });
    await expect(thirdViewerCard.getByText('Claimed').first()).toBeVisible();
    await expect(page.getByText(pool.title)).toHaveCount(0);
  } finally {
    await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
