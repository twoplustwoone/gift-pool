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

test('claim updates optimistically while purchase request is delayed', async ({
  page,
  login,
}) => {
  const createdUserIds: string[] = [];

  const ownerData = createUser();
  const claimerData = createUser();

  const [owner, claimer] = await Promise.all([
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
  ]);

  createdUserIds.push(owner.id, claimer.id);
  await createFriendship(owner.id, claimer.id);

  const wishlistItem = await prisma.wishlistItem.create({
    select: { id: true },
    data: {
      ownerId: owner.id,
      title: 'Delayed claim item',
      type: 'text',
      sortOrder: 0,
    },
  });

  await page.route('**/wishlist/purchase*', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });

  try {
    await page.context().clearCookies();
    await login({ id: claimer.id });
    await page.goto(`/users/${owner.username}/wishlist`);
    await dismissInstallPrompt(page);

    const purchaseResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/wishlist/purchase') &&
        response.request().method() === 'POST',
    );

    await page
      .getByRole('button', { name: "I'll grab this gift", exact: true })
      .click();
    await expect(page.getByText(/gift duty for this one/i)).toBeVisible();

    await purchaseResponsePromise;
    await waitFor(
      () =>
        prisma.wishlistPurchase.findUnique({
          where: { wishlistItemId: wishlistItem.id },
        }),
      { timeout: 8000 },
    );
  } finally {
    await page.unroute('**/wishlist/purchase*');
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

test('claim rolls back when purchase mutation fails', async ({ page, login }) => {
  const createdUserIds: string[] = [];

  const ownerData = createUser();
  const claimerData = createUser();

  const [owner, claimer] = await Promise.all([
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
  ]);

  createdUserIds.push(owner.id, claimer.id);
  await createFriendship(owner.id, claimer.id);

  const wishlistItem = await prisma.wishlistItem.create({
    select: { id: true },
    data: {
      ownerId: owner.id,
      title: 'Rollback claim item',
      type: 'text',
      sortOrder: 0,
    },
  });

  await page.route('**/wishlist/purchase*', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    const payload = new URLSearchParams(route.request().postData() ?? '');
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        wishlistItemId: payload.get('wishlistItemId') ?? wishlistItem.id,
        purchase: null,
        error: 'This item has already been marked as purchased.',
      }),
    });
  });

  try {
    await page.context().clearCookies();
    await login({ id: claimer.id });
    await page.goto(`/users/${owner.username}/wishlist`);
    await dismissInstallPrompt(page);

    const purchaseResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/wishlist/purchase') &&
        response.request().method() === 'POST',
    );

    await page
      .getByRole('button', { name: "I'll grab this gift", exact: true })
      .click();
    await expect(page.getByText(/gift duty for this one/i)).toBeVisible();

    await purchaseResponsePromise;
    await expect(
      page.getByRole('button', { name: "I'll grab this gift", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/gift duty for this one/i)).toBeHidden();
    const purchase = await prisma.wishlistPurchase.findUnique({
      where: { wishlistItemId: wishlistItem.id },
    });
    expect(purchase).toBeNull();
  } finally {
    await page.unroute('**/wishlist/purchase*');
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
