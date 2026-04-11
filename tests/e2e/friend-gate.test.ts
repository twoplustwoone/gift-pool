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
        `See ${target.name ?? target.username}'s profile`,
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
      name: new RegExp(`See ${target.name}'s profile`, 'i'),
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
      name: new RegExp(`See ${target.name}'s wishlist`, 'i'),
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

    // Optimistic PENDING_OUTGOING state: FriendActionButton now renders a
    // single "Cancel request" button (the old "Request sent" disabled
    // pseudo-button was removed). The assertion still verifies the same
    // thing: that the optimistic state was applied before the server
    // responded.
    await expect(
      page.getByRole('button', { name: /cancel request/i }),
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

// ── Helper: seed a pair of users + a pending FriendRequest in one direction.
// Returns the ids/usernames callers need to drive the test and the request id
// for cleanup. Keeps the state-branch tests below compact.
async function seedPendingRequest({
  direction,
}: {
  direction: 'incoming' | 'outgoing';
}) {
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

  const fromUserId = direction === 'incoming' ? target.id : viewer.id;
  const toUserId = direction === 'incoming' ? viewer.id : target.id;

  const request = await prisma.friendRequest.create({
    select: { id: true },
    data: { fromUserId, toUserId, status: 'PENDING' },
  });

  return { viewer, viewerData, target, request };
}

async function cleanupPair(viewerId: string, targetId: string) {
  await prisma.friendRequest.deleteMany({
    where: {
      OR: [
        { fromUserId: viewerId, toUserId: targetId },
        { fromUserId: targetId, toUserId: viewerId },
      ],
    },
  });
  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { userAId: viewerId, userBId: targetId },
        { userAId: targetId, userBId: viewerId },
      ],
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: [viewerId, targetId] } } });
}

test('incoming friend request: gate shows accept/reject copy and Accept creates a friendship', async ({
  page,
}) => {
  const { viewer, viewerData, target } = await seedPendingRequest({
    direction: 'incoming',
  });

  try {
    await loginWithPassword(page, {
      username: viewerData.username,
      password: viewerData.username,
    });
    await page.goto(`/users/${target.username}`);

    await expect(
      page.getByRole('heading', {
        name: new RegExp(`${target.name} wants to be friends`, 'i'),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: new RegExp(`Accept friend request from ${target.name}`, 'i'),
      }),
    ).toBeVisible();

    await page
      .getByRole('button', {
        name: new RegExp(`Accept friend request from ${target.name}`, 'i'),
      })
      .click();

    // Optimistic state: the button flips to the `FRIENDS` variant.
    await expect(
      page.getByRole('button', { name: /^friends$/i }).first(),
    ).toBeVisible();

    // Server-side: friendship row exists, pending request is gone.
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userAId: viewer.id, userBId: target.id },
          { userAId: target.id, userBId: viewer.id },
        ],
      },
    });
    expect(friendship).not.toBeNull();
  } finally {
    await cleanupPair(viewer.id, target.id);
  }
});

test('incoming friend request: Reject cancels the pending request', async ({
  page,
}) => {
  const { viewer, viewerData, target, request } = await seedPendingRequest({
    direction: 'incoming',
  });

  try {
    await loginWithPassword(page, {
      username: viewerData.username,
      password: viewerData.username,
    });
    await page.goto(`/users/${target.username}`);

    await page
      .getByRole('button', {
        name: new RegExp(`Reject friend request from ${target.name}`, 'i'),
      })
      .click();

    // Optimistic state: after reject the gate flips back to NONE, which
    // shows the "Send friend request" / "Add Friend" variant again.
    await expect(
      page.getByRole('button', { name: /add friend/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Server-side: the PENDING request is no longer pending.
    const row = await prisma.friendRequest.findUnique({
      where: { id: request.id },
    });
    expect(row?.status).not.toBe('PENDING');

    // No friendship was created.
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userAId: viewer.id, userBId: target.id },
          { userAId: target.id, userBId: viewer.id },
        ],
      },
    });
    expect(friendship).toBeNull();
  } finally {
    await cleanupPair(viewer.id, target.id);
  }
});

test('outgoing friend request: gate shows waiting copy and Cancel returns to NONE', async ({
  page,
}) => {
  const { viewer, viewerData, target, request } = await seedPendingRequest({
    direction: 'outgoing',
  });

  try {
    await loginWithPassword(page, {
      username: viewerData.username,
      password: viewerData.username,
    });
    await page.goto(`/users/${target.username}`);

    await expect(
      page.getByRole('heading', {
        name: new RegExp(`Waiting for ${target.name} to accept`, 'i'),
      }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: /cancel request/i })
      .click();

    // Optimistic state: gate flips to the NONE branch.
    await expect(
      page.getByRole('button', { name: /add friend/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Server-side: the PENDING row is no longer pending.
    const row = await prisma.friendRequest.findUnique({
      where: { id: request.id },
    });
    expect(row?.status).not.toBe('PENDING');
  } finally {
    await cleanupPair(viewer.id, target.id);
  }
});
