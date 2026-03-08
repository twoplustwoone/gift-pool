import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, loginWithPassword, test } from '#tests/playwright-utils.ts';

test('profile page does not expose details to non-friends', async ({ page }) => {
  const createdUserIds: string[] = [];
  const viewerData = createUser();
  const targetData = createUser();

  const [viewer, target] = await Promise.all([
    prisma.user.create({
      select: { id: true, username: true },
      data: {
        ...viewerData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(viewerData.username) },
      },
    }),
    prisma.user.create({
      select: { id: true, username: true, name: true },
      data: {
        ...targetData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(targetData.username) },
      },
    }),
  ]);

  createdUserIds.push(viewer.id, target.id);

  try {
    await loginWithPassword(page, {
      username: viewerData.username,
      password: viewerData.username,
    });
    await page.goto(`/users/${target.username}`);

    const gateHeading = page.getByRole('heading', {
      name: new RegExp(
        `Add ${target.name ?? target.username} as a friend to continue`,
        'i',
      ),
    });
    await expect(gateHeading).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Friend' })).toBeVisible();
    await expect(
      page.getByText(/^Joined\s+/i).or(page.getByText(/\bJoined\b/i)),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', {
        name: new RegExp(`${target.name ?? target.username}.*wishlist`, 'i'),
      }),
    ).toHaveCount(0);
  } finally {
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { fromUserId: viewer.id, toUserId: target.id },
          { fromUserId: target.id, toUserId: viewer.id },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

test('non-friend profile prompts request and sends invite', async ({
  page,
}) => {
  const createdUserIds: string[] = [];
  const viewerData = createUser();
  const targetData = createUser();

  const [viewer, target] = await Promise.all([
    prisma.user.create({
      select: { id: true, username: true, name: true },
      data: {
        ...viewerData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(viewerData.username) },
      },
    }),
    prisma.user.create({
      select: { id: true, username: true, name: true },
      data: {
        ...targetData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(targetData.username) },
      },
    }),
  ]);

  createdUserIds.push(viewer.id, target.id);

  try {
    await loginWithPassword(page, {
      username: viewerData.username,
      password: viewerData.username,
    });

    await page.goto(`/users/${target.username}`);

    const gateHeading = page.getByRole('heading', {
      name: new RegExp(`Add ${target.name} as a friend to continue`, 'i'),
    });
    await expect(gateHeading).toBeVisible();

    const addButton = page.getByRole('button', { name: 'Add Friend' });
    await expect(addButton).toBeVisible();
    await addButton.click();

    await expect(page.getByText('Friend request sent.')).toBeVisible();

    const request = await prisma.friendRequest.findFirst({
      where: { fromUserId: viewer.id, toUserId: target.id },
    });
    expect(request).not.toBeNull();
  } finally {
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { fromUserId: viewer.id, toUserId: target.id },
          { fromUserId: target.id, toUserId: viewer.id },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

test('non-friend wishlist prompts request and sends invite', async ({
  page,
}) => {
  const createdUserIds: string[] = [];
  const viewerData = createUser();
  const targetData = createUser();

  const [viewer, target] = await Promise.all([
    prisma.user.create({
      select: { id: true, username: true, name: true },
      data: {
        ...viewerData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(viewerData.username) },
      },
    }),
    prisma.user.create({
      select: { id: true, username: true, name: true },
      data: {
        ...targetData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(targetData.username) },
      },
    }),
  ]);

  createdUserIds.push(viewer.id, target.id);

  try {
    await loginWithPassword(page, {
      username: viewerData.username,
      password: viewerData.username,
    });

    await page.goto(`/users/${target.username}/wishlist`);

    const gateHeading = page.getByRole('heading', {
      name: new RegExp(`Add ${target.name} as a friend to continue`, 'i'),
    });
    await expect(gateHeading).toBeVisible();

    const addButton = page.getByRole('button', { name: 'Add Friend' });
    await expect(addButton).toBeVisible();
    await addButton.click();

    await expect(page.getByText('Friend request sent.')).toBeVisible();

    const request = await prisma.friendRequest.findFirst({
      where: { fromUserId: viewer.id, toUserId: target.id },
    });
    expect(request).not.toBeNull();
  } finally {
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { fromUserId: viewer.id, toUserId: target.id },
          { fromUserId: target.id, toUserId: viewer.id },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

test('non-friend wishlist request is optimistic and rolls back on failure', async ({
  page,
}) => {
  const createdUserIds: string[] = [];
  const viewerData = createUser();
  const targetData = createUser();

  const [viewer, target] = await Promise.all([
    prisma.user.create({
      select: { id: true, username: true, name: true },
      data: {
        ...viewerData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(viewerData.username) },
      },
    }),
    prisma.user.create({
      select: { id: true, username: true, name: true },
      data: {
        ...targetData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(targetData.username) },
      },
    }),
  ]);

  createdUserIds.push(viewer.id, target.id);

  try {
    await loginWithPassword(page, {
      username: viewerData.username,
      password: viewerData.username,
    });
    await page.goto(`/users/${target.username}/wishlist`);

    await page.route('**/api/friends/requests', async (route) => {
      await page.waitForTimeout(500);
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'forced failure' }),
      });
    });

    const addButton = page.getByRole('button', { name: /add friend/i });
    await expect(addButton).toBeVisible();
    await addButton.click();

    await expect(
      page.getByRole('button', { name: /request sent/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /add friend/i })).toBeVisible(
      {
        timeout: 10000,
      },
    );

    const request = await prisma.friendRequest.findFirst({
      where: { fromUserId: viewer.id, toUserId: target.id },
    });
    expect(request).toBeNull();
  } finally {
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { fromUserId: viewer.id, toUserId: target.id },
          { fromUserId: target.id, toUserId: viewer.id },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
