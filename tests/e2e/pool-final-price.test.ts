import { prisma } from '#app/utils/db.server.ts';
import { addContributor, chooseIdea, createPool, proposeIdea, updateContribution } from '#app/utils/pool.server.ts';
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

async function setupDecidedPool() {
  const [organizer, contributorOne, contributorTwo] = await Promise.all([
    createAppUser(),
    createAppUser(),
    createAppUser(),
  ]);

  const pool = await createPool({
    organizerId: organizer.id,
    recipientName: 'Jordan',
    title: 'Decided Pool',
  });

  await addContributor(pool.id, contributorOne.id);
  await addContributor(pool.id, contributorTwo.id);
  await Promise.all([
    updateContribution(pool.id, organizer.id, 3000),
    updateContribution(pool.id, contributorOne.id, 3000),
    updateContribution(pool.id, contributorTwo.id, 3000),
  ]);

  const idea = await proposeIdea({
    poolId: pool.id,
    proposedById: organizer.id,
    name: 'KitchenAid Mixer',
    estimatedPriceCents: 8000,
  });
  await chooseIdea(pool.id, idea.id, organizer.id, 8000);

  return { contributorOne, contributorTwo, organizer, pool };
}

test.describe('pool final price editor', () => {
  test('final price field shows dollar value, not cents', async ({ page }) => {
    const createdUserIds: string[] = [];
    const createdPoolIds: string[] = [];
    const { contributorOne, contributorTwo, organizer, pool } =
      await setupDecidedPool();
    createdUserIds.push(organizer.id, contributorOne.id, contributorTwo.id);
    createdPoolIds.push(pool.id);

    try {
      await loginWithPassword(page, {
        username: organizer.username,
        password: organizer.username,
      });
      await page.goto(`/pools/${pool.id}`);

      await expect(page.getByTestId('final-price-input')).toHaveValue('80.00');
    } finally {
      await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('updating final price saves correctly', async ({ page }) => {
    const createdUserIds: string[] = [];
    const createdPoolIds: string[] = [];
    const { contributorOne, contributorTwo, organizer, pool } =
      await setupDecidedPool();
    createdUserIds.push(organizer.id, contributorOne.id, contributorTwo.id);
    createdPoolIds.push(pool.id);

    try {
      await loginWithPassword(page, {
        username: organizer.username,
        password: organizer.username,
      });
      await page.goto(`/pools/${pool.id}`);

      await page.getByTestId('final-price-input').fill('25.00');
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            response.url().includes(`/pools/${pool.id}`),
        ),
        page.getByRole('button', { name: 'Update' }).click(),
      ]);

      await waitFor(
        async () => {
          const updatedPool = await prisma.pool.findUnique({
            where: { id: pool.id },
            select: { finalPriceCents: true },
          });

          if (updatedPool?.finalPriceCents === 2500) return updatedPool;
          throw new Error('Final price not updated yet');
        },
        { timeout: 8000 },
      );

      await page.reload();
      await expect(page.getByTestId('final-price-display')).toHaveText('$25.00');
      await expect(
        prisma.pool.findUniqueOrThrow({
          where: { id: pool.id },
          select: { finalPriceCents: true },
        }),
      ).resolves.toEqual({ finalPriceCents: 2500 });
    } finally {
      await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('contribution breakdown amounts are correct after final price update', async ({
    page,
  }) => {
    const createdUserIds: string[] = [];
    const createdPoolIds: string[] = [];
    const { contributorOne, contributorTwo, organizer, pool } =
      await setupDecidedPool();
    createdUserIds.push(organizer.id, contributorOne.id, contributorTwo.id);
    createdPoolIds.push(pool.id);

    try {
      await loginWithPassword(page, {
        username: organizer.username,
        password: organizer.username,
      });
      await page.goto(`/pools/${pool.id}`);

      await page.getByTestId('final-price-input').fill('25.00');
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            response.url().includes(`/pools/${pool.id}`),
        ),
        page.getByRole('button', { name: 'Update' }).click(),
      ]);

      await page.reload();
      await expect(page.getByTestId('contribution-breakdown-row')).toHaveCount(3);
      await expect(page.getByText('$8.33')).toHaveCount(2);
      await expect(page.getByText('$8.34')).toHaveCount(1);
    } finally {
      await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });
});
