import { prisma } from '#app/utils/db.server.ts';
import { createPool } from '#app/utils/pool.server.ts';
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

async function setupOpenPool() {
  const organizer = await createAppUser();
  const pool = await createPool({
    organizerId: organizer.id,
    recipientName: 'Jordan',
    title: 'Open Pool',
  });

  return { organizer, pool };
}

test.describe('pool propose idea form', () => {
  test('propose idea with price stores correct cents in DB', async ({ page }) => {
    const createdUserIds: string[] = [];
    const createdPoolIds: string[] = [];
    const { organizer, pool } = await setupOpenPool();
    createdUserIds.push(organizer.id);
    createdPoolIds.push(pool.id);

    try {
      await loginWithPassword(page, {
        username: organizer.username,
        password: organizer.username,
      });
      await page.goto(`/pools/${pool.id}`);

      await page.getByPlaceholder('What should we get them?').fill('Wireless Speaker');
      await page.getByTestId('idea-price-input').fill('15.99');
      await page.getByRole('button', { name: 'Add idea' }).click();

      await waitFor(
        async () =>
          prisma.giftIdea.findFirst({
            where: { name: 'Wireless Speaker', poolId: pool.id },
            select: { estimatedPriceCents: true },
          }),
        { timeout: 8000 },
      );

      await page.reload();
      await expect(page.getByText('≈ $15.99')).toBeVisible();
      await expect(
        prisma.giftIdea.findFirstOrThrow({
          where: { name: 'Wireless Speaker', poolId: pool.id },
          select: { estimatedPriceCents: true },
        }),
      ).resolves.toEqual({ estimatedPriceCents: 1599 });
    } finally {
      await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('price field accepts decimal input (e.g. 9.99)', async ({ page }) => {
    const createdUserIds: string[] = [];
    const createdPoolIds: string[] = [];
    const { organizer, pool } = await setupOpenPool();
    createdUserIds.push(organizer.id);
    createdPoolIds.push(pool.id);

    try {
      await loginWithPassword(page, {
        username: organizer.username,
        password: organizer.username,
      });
      await page.goto(`/pools/${pool.id}`);

      await page.getByPlaceholder('What should we get them?').fill('Travel Mug');
      await page.getByTestId('idea-price-input').fill('9.99');
      await page.getByRole('button', { name: 'Add idea' }).click();

      await page.reload();
      await expect(page.getByText('≈ $9.99')).toBeVisible();
    } finally {
      await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('price field is optional — idea submits without price', async ({ page }) => {
    const createdUserIds: string[] = [];
    const createdPoolIds: string[] = [];
    const { organizer, pool } = await setupOpenPool();
    createdUserIds.push(organizer.id);
    createdPoolIds.push(pool.id);

    try {
      await loginWithPassword(page, {
        username: organizer.username,
        password: organizer.username,
      });
      await page.goto(`/pools/${pool.id}`);

      await page.getByPlaceholder('What should we get them?').fill('Idea Without Price');
      await page.getByRole('button', { name: 'Add idea' }).click();

      await waitFor(
        async () =>
          prisma.giftIdea.findFirst({
            where: { name: 'Idea Without Price', poolId: pool.id },
            select: { estimatedPriceCents: true },
          }),
        { timeout: 8000 },
      );

      await page.reload();
      const ideaCard = page
        .getByTestId('idea-card')
        .filter({ hasText: 'Idea Without Price' });
      await expect(ideaCard.getByTestId('idea-price-badge')).toHaveCount(0);
      await expect(
        prisma.giftIdea.findFirstOrThrow({
          where: { name: 'Idea Without Price', poolId: pool.id },
          select: { estimatedPriceCents: true },
        }),
      ).resolves.toEqual({ estimatedPriceCents: null });
    } finally {
      await prisma.pool.deleteMany({ where: { id: { in: createdPoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });
});
