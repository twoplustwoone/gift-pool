import { prisma } from '#app/utils/db.server.ts';
import { addContributor, createPool } from '#app/utils/pool.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, loginWithPassword, test } from '#tests/playwright-utils.ts';

const connectUserRole = { connect: { name: 'user' } };

async function createAppUser() {
  const userData = createUser();
  const user = await prisma.user.create({
    select: { id: true, username: true },
    data: {
      ...userData,
      roles: connectUserRole,
      password: { create: createPassword(userData.username) },
    },
  });

  return { ...user, ...userData };
}

async function seedPool({
  organizerId,
  contributorIds = [],
  eventDate = null,
  recipientName = 'Jordan',
  status = 'OPEN',
  title,
}: {
  organizerId: string;
  contributorIds?: string[];
  eventDate?: Date | null;
  recipientName?: string | null;
  status?: string;
  title: string;
}) {
  const pool = await createPool({
    title,
    organizerId,
    recipientName,
    eventDate,
  });

  await Promise.all(contributorIds.map((userId) => addContributor(pool.id, userId)));

  if (status !== 'OPEN') {
    await prisma.pool.update({
      where: { id: pool.id },
      data: { status },
    });
  }

  return pool;
}

test.describe('dashboard', () => {
  test('logged-in user sees dashboard, not marketing content', async ({
    page,
  }) => {
    const createdUserIds: string[] = [];
    const createdPoolIds: string[] = [];
    const viewer = await createAppUser();
    createdUserIds.push(viewer.id);

    const [poolOne, poolTwo] = await Promise.all([
      seedPool({ organizerId: viewer.id, title: 'Alex Birthday Gift' }),
      seedPool({ organizerId: viewer.id, title: 'Jordan Wedding Gift' }),
    ]);
    createdPoolIds.push(poolOne.id, poolTwo.id);

    try {
      await loginWithPassword(page, {
        username: viewer.username,
        password: viewer.username,
      });
      await page.goto('/');

      await expect(page.getByRole('heading', { name: 'Your pools' })).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Group gifting, simplified.' }),
      ).toHaveCount(0);
    } finally {
      await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('dashboard shows pool cards with title, status badge, and event date', async ({
    page,
  }) => {
    const createdUserIds: string[] = [];
    const createdPoolIds: string[] = [];
    const viewer = await createAppUser();
    createdUserIds.push(viewer.id);

    const pool = await seedPool({
      organizerId: viewer.id,
      title: 'Summer Pool',
      eventDate: new Date('2026-06-14T00:00:00.000Z'),
    });
    createdPoolIds.push(pool.id);

    try {
      await loginWithPassword(page, {
        username: viewer.username,
        password: viewer.username,
      });
      await page.goto('/');

      await expect(page.getByRole('link', { name: /Summer Pool/i })).toBeVisible();
      await expect(page.getByText('Open')).toBeVisible();
      await expect(page.getByText('Jun 14')).toBeVisible();
    } finally {
      await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('dashboard shows "No active pools yet" when user has no pools', async ({
    page,
  }) => {
    const createdUserIds: string[] = [];
    const viewer = await createAppUser();
    createdUserIds.push(viewer.id);

    try {
      await loginWithPassword(page, {
        username: viewer.username,
        password: viewer.username,
      });
      await page.goto('/');

      await expect(page.getByText('No active pools yet')).toBeVisible();
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('"View all pools" link navigates to /pools', async ({ page }) => {
    const createdUserIds: string[] = [];
    const createdPoolIds: string[] = [];
    const viewer = await createAppUser();
    createdUserIds.push(viewer.id);

    const pool = await seedPool({
      organizerId: viewer.id,
      title: 'Alex Birthday Gift',
    });
    createdPoolIds.push(pool.id);

    try {
      await loginWithPassword(page, {
        username: viewer.username,
        password: viewer.username,
      });
      await page.goto('/');
      await page.getByRole('link', { name: 'View all pools →' }).click();

      await expect(page).toHaveURL(/\/pools$/);
    } finally {
      await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('birthdays panel empty state links to /friends', async ({ page }) => {
    const createdUserIds: string[] = [];
    const viewer = await createAppUser();
    createdUserIds.push(viewer.id);

    try {
      await loginWithPassword(page, {
        username: viewer.username,
        password: viewer.username,
      });
      await page.goto('/');

      await expect(page.getByRole('link', { name: 'Add friends' })).toHaveAttribute(
        'href',
        '/friends',
      );
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('activity panel empty state links to /pools/new', async ({ page }) => {
    const createdUserIds: string[] = [];
    const viewer = await createAppUser();
    createdUserIds.push(viewer.id);

    try {
      await loginWithPassword(page, {
        username: viewer.username,
        password: viewer.username,
      });
      await page.goto('/');

      await expect(page.getByRole('link', { name: 'Start a pool' })).toHaveAttribute(
        'href',
        '/pools/new',
      );
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('logged-out user sees marketing page, not dashboard', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Group gifting, simplified.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your pools' })).toHaveCount(0);
  });
});
