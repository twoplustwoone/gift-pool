import type { Page } from '@playwright/test';
import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, test, waitFor } from '#tests/playwright-utils.ts';

const connectUserRole = { connect: { name: 'user' } };

const createFriendship = async (userOneId: string, userTwoId: string) => {
  const [userAId, userBId] =
    userOneId < userTwoId ? [userOneId, userTwoId] : [userTwoId, userOneId];
  await prisma.friendship.create({ data: { userAId, userBId } });
};

const dismissInstallPrompt = async (page: Page) => {
  const notNow = page.getByRole('button', { name: /not now/i });
  if ((await notNow.count()) > 0) {
    await notNow.click();
  }
};

test('friends can claim a gift and owner cannot see the claim', async ({
  page,
  login,
}) => {
  const createdUserIds: string[] = [];

  const ownerData = createUser();
  const claimerData = createUser();
  const viewerData = createUser();

  const [owner, claimer, viewer] = await Promise.all([
    prisma.user.create({
      select: { id: true, username: true },
      data: {
        ...ownerData,
        roles: connectUserRole,
        password: { create: createPassword(ownerData.username) },
      },
    }),
    prisma.user.create({
      select: { id: true, username: true },
      data: {
        ...claimerData,
        roles: connectUserRole,
        password: { create: createPassword(claimerData.username) },
      },
    }),
    prisma.user.create({
      select: { id: true, username: true },
      data: {
        ...viewerData,
        roles: connectUserRole,
        password: { create: createPassword(viewerData.username) },
      },
    }),
  ]);

  createdUserIds.push(owner.id, claimer.id, viewer.id);

  await createFriendship(owner.id, claimer.id);
  await createFriendship(owner.id, viewer.id);

  const wishlistItem = await prisma.wishlistItem.create({
    select: { id: true, title: true },
    data: {
      ownerId: owner.id,
      title: 'Coffee Grinder',
      type: 'text',
      note: 'Conical burr grinder',
      sortOrder: 0,
    },
  });

  try {
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
        prisma.wishlistPurchase.findUnique({
          where: { wishlistItemId: wishlistItem.id },
        }),
      { timeout: 8000 },
    );
    await page.reload();
    await dismissInstallPrompt(page);
    await expect(page.getByText(/gift duty for this one/i)).toBeVisible();

    await page.context().clearCookies();
    await login({ id: viewer.id });
    await page.goto(`/users/${owner.username}/wishlist`);
    await dismissInstallPrompt(page);
    await expect(page.getByText(/already grabbed this/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /grab this gift/i }),
    ).toHaveCount(0);

    await page.context().clearCookies();
    await login({ id: owner.id });
    await page.goto('/wishlist');
    await dismissInstallPrompt(page);
    await expect(page.getByText(wishlistItem.title).first()).toBeVisible();
    await expect(page.getByText(/gift duty/i)).toHaveCount(0);
    await expect(page.getByText(/already grabbed this/i)).toHaveCount(0);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
