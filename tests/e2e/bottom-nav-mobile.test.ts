import { prisma } from '#app/utils/db.server.ts';
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

test.describe('bottom nav mobile behavior', () => {
  test('bottom nav shows all 5 items at 390px mobile viewport', async ({
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
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');

      const nav = page.getByTestId('bottom-nav');
      await expect(nav).toBeVisible();
      await expect(nav.getByRole('link')).toHaveCount(5);

      for (const name of ['Home', 'Wishlist', 'Groups', 'Gifting', 'Friends']) {
        await expect(nav.getByRole('link', { name })).toBeVisible();
      }

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('active nav item is highlighted for current route', async ({ page }) => {
    const createdUserIds: string[] = [];
    const viewer = await createAppUser();
    createdUserIds.push(viewer.id);

    try {
      await loginWithPassword(page, {
        username: viewer.username,
        password: viewer.username,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/pools');

      const giftingLink = page
        .getByTestId('bottom-nav')
        .getByRole('link', { name: 'Gifting' });
      await expect(giftingLink).toHaveAttribute('aria-current', 'page');
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  test('bottom nav is hidden at desktop viewport', async ({ page }) => {
    const createdUserIds: string[] = [];
    const viewer = await createAppUser();
    createdUserIds.push(viewer.id);

    try {
      await loginWithPassword(page, {
        username: viewer.username,
        password: viewer.username,
      });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/');

      await expect(page.getByTestId('bottom-nav')).toBeHidden();
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });
});
