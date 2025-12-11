import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, test } from '#tests/playwright-utils.ts';

test('profile loader does not expose details to non-friends', async ({ page, login }) => {
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
      select: { id: true, username: true },
      data: {
        ...targetData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(targetData.username) },
      },
    }),
  ]);

  createdUserIds.push(viewer.id, target.id);

  try {
    await login({ id: viewer.id });
    await page.goto('/');

    const payload = await page.evaluate<
      {
        status: number;
        data: {
          canViewProfile: boolean;
          user: { id: string; name: string | null; username: string; createdAt?: unknown; image?: unknown };
          relationship: { state: string };
        };
      },
      string
    >(async (username) => {
      const response = await fetch(`/users/${username}`, {
        headers: { Accept: 'application/json' },
      });
      const data = (await response.json()) as {
        canViewProfile: boolean;
        user: { id: string; name: string | null; username: string; createdAt?: unknown; image?: unknown };
        relationship: { state: string };
      };
      return { status: response.status, data };
    }, target.username);

    expect(payload.status).toBe(200);
    expect(payload.data.canViewProfile).toBe(false);
    expect(payload.data.user.createdAt).toBeUndefined();
    expect(payload.data.user.image).toBeUndefined();
    expect(payload.data.relationship.state).toBe('NONE');
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

test('non-friend profile prompts request and sends invite', async ({ page, login }) => {
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
    await login({ id: viewer.id });

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

test('non-friend wishlist prompts request and sends invite', async ({ page, login }) => {
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
    await login({ id: viewer.id });

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
