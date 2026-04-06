import { prisma } from '#app/utils/db.server.ts';
import { createPool, updateContribution } from '#app/utils/pool.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, loginWithPassword, test, waitFor } from '#tests/playwright-utils.ts';

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

async function setupContributionPool() {
  const viewer = await createAppUser();
  const pool = await createPool({
    organizerId: viewer.id,
    recipientName: 'Jordan',
    title: 'Open Pool',
  });
  await updateContribution(pool.id, viewer.id, 3000);

  return { pool, viewer };
}

test.describe('pool contribution editor', () => {
  test('contribution editor pre-fills with dollar amount (e.g. "$30.00"), not cents', async ({
    page,
  }) => {
    const createdUserIds: string[] = [];
    const createdPoolIds: string[] = [];
    const { pool, viewer } = await setupContributionPool();
    createdUserIds.push(viewer.id);
    createdPoolIds.push(pool.id);

    try {
      await loginWithPassword(page, {
        username: viewer.username,
        password: viewer.username,
      });
      await page.goto(`/pools/${pool.id}`);

      await expect(page.getByTestId('contribution-input')).toHaveValue('30.00');
    } finally {
      await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('contribution editor Save button hidden when value unchanged', async ({
    page,
  }) => {
    const createdUserIds: string[] = [];
    const createdPoolIds: string[] = [];
    const { pool, viewer } = await setupContributionPool();
    createdUserIds.push(viewer.id);
    createdPoolIds.push(pool.id);

    try {
      await loginWithPassword(page, {
        username: viewer.username,
        password: viewer.username,
      });
      await page.goto(`/pools/${pool.id}`);

      await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    } finally {
      await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('contribution editor Save button appears when value is edited', async ({
    page,
  }) => {
    const createdUserIds: string[] = [];
    const createdPoolIds: string[] = [];
    const { pool, viewer } = await setupContributionPool();
    createdUserIds.push(viewer.id);
    createdPoolIds.push(pool.id);

    try {
      await loginWithPassword(page, {
        username: viewer.username,
        password: viewer.username,
      });
      await page.goto(`/pools/${pool.id}`);

      await page.getByTestId('contribution-input').fill('45.00');

      await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    } finally {
      await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('submitting contribution saves dollars, not cents', async ({ page }) => {
    const createdUserIds: string[] = [];
    const createdPoolIds: string[] = [];
    const { pool, viewer } = await setupContributionPool();
    createdUserIds.push(viewer.id);
    createdPoolIds.push(pool.id);

    try {
      await loginWithPassword(page, {
        username: viewer.username,
        password: viewer.username,
      });
      await page.goto(`/pools/${pool.id}`);

      await page.getByTestId('contribution-input').fill('45');
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            response.url().includes(`/pools/${pool.id}`),
        ),
        page.getByRole('button', { name: 'Save' }).click(),
      ]);

      await waitFor(
        async () => {
          const contributor = await prisma.poolContributor.findUnique({
            where: { poolId_userId: { poolId: pool.id, userId: viewer.id } },
            select: { contributionCents: true },
          });

          if (contributor?.contributionCents === 4500) return contributor;
          throw new Error('Contribution cents not updated yet');
        },
        { timeout: 8000 },
      );

      await page.reload();
      await expect(page.getByTestId('contribution-input')).toHaveValue('45.00');

      await expect(
        prisma.poolContributor.findUniqueOrThrow({
          where: { poolId_userId: { poolId: pool.id, userId: viewer.id } },
          select: { contributionCents: true },
        }),
      ).resolves.toEqual({ contributionCents: 4500 });
    } finally {
      await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('contribution editor treats "30" and "30.00" as equivalent (no dirty state)', async ({
    page,
  }) => {
    const createdUserIds: string[] = [];
    const createdPoolIds: string[] = [];
    const { pool, viewer } = await setupContributionPool();
    createdUserIds.push(viewer.id);
    createdPoolIds.push(pool.id);

    try {
      await loginWithPassword(page, {
        username: viewer.username,
        password: viewer.username,
      });
      await page.goto(`/pools/${pool.id}`);

      await page.getByTestId('contribution-input').fill('30');

      await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    } finally {
      await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });
});
