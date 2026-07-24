import { prisma } from '#app/utils/db.server.ts';
import {
  createPassword,
  createUser,
  expect,
  test,
  waitFor,
} from '#tests/playwright-utils.ts';

async function createUserWithRole(userData: ReturnType<typeof createUser>) {
  return prisma.user.create({
    select: { id: true, username: true, name: true },
    data: {
      ...userData,
      roles: { connect: { name: 'user' } },
      password: { create: createPassword(userData.username) },
    },
  });
}

function normalizeFriendship(userAId: string, userBId: string) {
  return userAId < userBId
    ? { userAId, userBId }
    : { userAId: userBId, userBId: userAId };
}

test('home page prefetches wishlist and friends in the background for authenticated users', async ({
  page,
  login,
}) => {
  await login();

  let wishlistPrefetchCount = 0;
  let friendsPrefetchCount = 0;

  await page.route('**/resources/prefetch/wishlist', async (route) => {
    wishlistPrefetchCount += 1;
    await route.continue();
  });
  await page.route('**/resources/prefetch/friends', async (route) => {
    friendsPrefetchCount += 1;
    await route.continue();
  });

  try {
    await page.goto('/');

    await waitFor(
      () =>
        wishlistPrefetchCount >= 1 && friendsPrefetchCount >= 1 ? true : null,
      {
        timeout: 5_000,
        errorMessage: 'Expected home route prefetch requests to fire.',
      },
    );
  } finally {
    await page.unroute('**/resources/prefetch/wishlist');
    await page.unroute('**/resources/prefetch/friends');
  }
});

test('friends page prefetches friend wishlists with a concurrency cap of 2', async ({
  page,
  login,
}) => {
  const createdUserIds: string[] = [];
  const friendships: Array<{ userAId: string; userBId: string }> = [];
  const viewerData = createUser();

  const viewer = await createUserWithRole(viewerData);
  createdUserIds.push(viewer.id);

  for (let index = 0; index < 5; index += 1) {
    const friend = await createUserWithRole(createUser());
    createdUserIds.push(friend.id);
    const pair = normalizeFriendship(viewer.id, friend.id);
    friendships.push(pair);
    await prisma.friendship.create({ data: pair });
  }

  let activeRequests = 0;
  let maxActiveRequests = 0;
  let seenRequests = 0;

  await page.route('**/resources/prefetch/users/*/wishlist*', async (route) => {
    seenRequests += 1;
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

    await new Promise((resolve) => setTimeout(resolve, 150));
    activeRequests -= 1;
    await route.continue();
  });

  try {
    await login({ id: viewer.id });
    await page.goto('/friends');

    await waitFor(() => (seenRequests === 5 ? true : null), {
      timeout: 10_000,
      errorMessage: 'Expected all friend wishlist prefetches to run.',
    });

    expect(maxActiveRequests).toBeLessThanOrEqual(2);
  } finally {
    await page.unroute('**/resources/prefetch/users/*/wishlist*');
    await prisma.friendship.deleteMany({
      where: {
        OR: friendships.map((pair) => ({
          userAId: pair.userAId,
          userBId: pair.userBId,
        })),
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

test('cached friend wishlist navigation avoids a fresh loader request and logs one client view', async ({
  page,
  login,
}) => {
  const createdUserIds: string[] = [];
  const viewerData = createUser();
  const friendData = createUser();

  const [viewer, friend] = await Promise.all([
    createUserWithRole(viewerData),
    createUserWithRole(friendData),
  ]);

  createdUserIds.push(viewer.id, friend.id);

  const friendship = normalizeFriendship(viewer.id, friend.id);
  await prisma.friendship.create({ data: friendship });
  await prisma.wishlistItem.create({
    data: {
      ownerId: friend.id,
      title: 'Prefetched item',
      type: 'text',
      sortOrder: 0,
      status: 'ACTIVE',
    },
  });

  try {
    await login({ id: viewer.id });

    const prefetchResponsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/resources/prefetch/users/${friend.username}/wishlist`) &&
        response.ok(),
    );

    await page.goto('/friends');
    await prefetchResponsePromise;

    const viewEventCount = await prisma.analyticsEvent.count({
      where: {
        userId: viewer.id,
        name: 'wishlist_viewed',
      },
    });
    if (viewEventCount !== 0) {
      throw new Error(
        `Expected no wishlist_viewed events before navigation, found ${viewEventCount}.`,
      );
    }

    let blockedWishlistLoaderRequests = 0;
    await page.route(`**/users/${friend.username}/wishlist*`, async (route) => {
      const url = new URL(route.request().url());
      const targetRoutes = url.searchParams.get('_routes') ?? '';

      if (targetRoutes.includes('routes/users+/$username_+/wishlist')) {
        blockedWishlistLoaderRequests += 1;
        await route.abort();
        return;
      }

      await route.continue();
    });

    const analyticsResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/analytics') &&
        response.request().method() === 'POST',
    );

    // The friend card routes to the profile now, so the wishlist is reached
    // through the actions menu — still a prefetched (`prefetch="intent"`)
    // link, which is what this test is actually about.
    await page
      .getByRole('button', { name: `Actions for ${friend.name}` })
      .click();
    await page.getByRole('menuitem', { name: /view wishlist/i }).click();

    await expect(page).toHaveURL(`/users/${friend.username}/wishlist`);
    await expect(page.getByText('Prefetched item')).toBeVisible();
    await analyticsResponsePromise;

    await waitFor(
      async () => {
        const events = await prisma.analyticsEvent.findMany({
          where: {
            userId: viewer.id,
            name: 'wishlist_viewed',
          },
        });
        return events.length === 1 ? events : null;
      },
      {
        timeout: 5_000,
        errorMessage:
          'Expected one client-side wishlist_viewed analytics event.',
      },
    );

    const events = await prisma.analyticsEvent.findMany({
      where: {
        userId: viewer.id,
        name: 'wishlist_viewed',
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.source).toBe('client');
    expect(blockedWishlistLoaderRequests).toBe(0);
  } finally {
    await page.unroute(`**/users/${friend.username}/wishlist*`).catch(() => {});
    await prisma.friendship.deleteMany({
      where: {
        userAId: friendship.userAId,
        userBId: friendship.userBId,
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

test('cached friend wishlist navigation revalidates access before using prefetched data', async ({
  page,
  login,
}) => {
  const createdUserIds: string[] = [];
  const viewerData = createUser();
  const friendData = createUser();

  const [viewer, friend] = await Promise.all([
    createUserWithRole(viewerData),
    createUserWithRole(friendData),
  ]);

  createdUserIds.push(viewer.id, friend.id);

  const friendship = normalizeFriendship(viewer.id, friend.id);
  await prisma.friendship.create({ data: friendship });
  await prisma.wishlistItem.create({
    data: {
      ownerId: friend.id,
      title: 'Should stay private',
      type: 'text',
      sortOrder: 0,
      status: 'ACTIVE',
    },
  });

  let accessValidationCount = 0;
  await page.route(
    `**/resources/prefetch/users/${friend.username}/wishlist-access`,
    async (route) => {
      accessValidationCount += 1;
      await route.continue();
    },
  );

  try {
    await login({ id: viewer.id });

    const prefetchResponsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/resources/prefetch/users/${friend.username}/wishlist`) &&
        response.ok(),
    );

    await page.goto('/friends');
    await prefetchResponsePromise;

    await prisma.friendship.deleteMany({
      where: {
        userAId: friendship.userAId,
        userBId: friendship.userBId,
      },
    });

    // The friend card routes to the profile now, so the wishlist is reached
    // through the actions menu — still a prefetched (`prefetch="intent"`)
    // link, which is what this test is actually about.
    await page
      .getByRole('button', { name: `Actions for ${friend.name}` })
      .click();
    await page.getByRole('menuitem', { name: /view wishlist/i }).click();

    await expect(page).toHaveURL(`/users/${friend.username}/wishlist`);
    await expect(
      page.getByRole('heading', {
        name: `See ${friend.name}'s wishlist`,
      }),
    ).toBeVisible();
    await expect(page.getByText('Should stay private')).toHaveCount(0);
    expect(accessValidationCount).toBe(1);
  } finally {
    await page
      .unroute(`**/resources/prefetch/users/${friend.username}/wishlist-access`)
      .catch(() => {});
    await prisma.friendship.deleteMany({
      where: {
        userAId: friendship.userAId,
        userBId: friendship.userBId,
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

test('friend profile and wishlist navigation share a stable route branch', async ({
  page,
  login,
}) => {
  const routeResultErrors: string[] = [];
  const createdUserIds: string[] = [];
  const viewerData = createUser();
  const friendData = createUser();

  const [viewer, friend] = await Promise.all([
    createUserWithRole(viewerData),
    createUserWithRole(friendData),
  ]);

  createdUserIds.push(viewer.id, friend.id);

  const friendship = normalizeFriendship(viewer.id, friend.id);
  await prisma.friendship.create({ data: friendship });
  await prisma.wishlistItem.create({
    data: {
      ownerId: friend.id,
      title: 'Stable route navigation',
      type: 'text',
      sortOrder: 0,
      status: 'ACTIVE',
    },
  });

  page.on('pageerror', (error) => {
    if (error.message.includes('No result found for routeId')) {
      routeResultErrors.push(error.message);
    }
  });

  try {
    await login({ id: viewer.id });

    await page.goto(`/users/${friend.username}`);
    await expect(
      page.getByRole('heading', { name: friend.name ?? friend.username }),
    ).toBeVisible();

    await page
      .getByRole('link', {
        name: `${friend.name ?? friend.username}'s wishlist`,
      })
      .click();

    await expect(page).toHaveURL(`/users/${friend.username}/wishlist`);
    await expect(page.getByText('Stable route navigation')).toBeVisible();

    await page
      .getByRole('link', { name: friend.name ?? friend.username })
      .click();

    await expect(page).toHaveURL(`/users/${friend.username}`);
    await expect(
      page.getByRole('heading', { name: friend.name ?? friend.username }),
    ).toBeVisible();
    expect(routeResultErrors).toEqual([]);
  } finally {
    await prisma.wishlistItem.deleteMany({
      where: { ownerId: friend.id },
    });
    await prisma.friendship.deleteMany({
      where: {
        userAId: friendship.userAId,
        userBId: friendship.userBId,
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
