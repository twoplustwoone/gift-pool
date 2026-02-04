import type { Page } from '@playwright/test';
import { expect, test } from '#tests/playwright-utils.ts';

const dismissInstallPrompt = async (page: Page) => {
  const notNow = page.getByRole('button', { name: /not now/i });
  if ((await notNow.count()) > 0) {
    await notNow.click();
  }
};

const createWishlistItem = async ({
  page,
  title,
}: {
  page: Page;
  title: string;
}) => {
  await page.getByRole('button', { name: /^Add Item$/ }).click();
  const editor = page.getByRole('dialog');
  await expect(editor).toBeVisible();
  await editor.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: /^save$/i }).click();
};

test('owners can archive and unarchive wishlist items', async ({ page, login }) => {
  await login();
  await page.goto('/wishlist');
  await dismissInstallPrompt(page);

  await createWishlistItem({ page, title: 'Archivable Item' });

  // Two triggers render (desktop + mobile)
  await expect(page.getByText('Archivable Item')).toHaveCount(2);

  // Open the item editor
  await page.getByText('Archivable Item').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Archive the item
  await page.getByRole('button', { name: /remove from wishlist/i }).click();
  await expect(page.getByText(/moved to past items/i).first()).toBeVisible();

  // Close the editor
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: /^close$/i }).click();
  }

  // Item moves to archived section
  await page.getByRole('button', { name: /^Past items$/i, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Past items', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Archivable Item')).toHaveCount(1);

  // Unarchive the item
  await page.getByText('Archivable Item').click();
  await page.getByRole('button', { name: /restore to wishlist/i }).click();
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: /^close$/i }).click();
  }

  // Item returns to active list (two triggers again) and archived section disappears
  await page.getByRole('button', { name: /^Wishlist$/i, exact: true }).click();
  await expect(page.getByText('Archivable Item')).toHaveCount(2);
});

test('archive status is optimistic before delayed server response', async ({
  page,
  login,
}) => {
  await login();
  await page.goto('/wishlist');
  await dismissInstallPrompt(page);
  await createWishlistItem({ page, title: 'Delayed status item' });

  await page.route('**/wishlist/status', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });

  try {
    const itemRows = page
      .getByTestId('wishlist-item-row')
      .filter({ hasText: 'Delayed status item' });
    await expect(itemRows).toHaveCount(2);

    await page.getByText('Delayed status item').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const statusResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/wishlist/status') &&
        response.request().method() === 'POST',
    );

    await page.getByRole('button', { name: /remove from wishlist/i }).click();
    await expect(itemRows).toHaveCount(0);

    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible()) {
      await dialog.getByRole('button', { name: /^close$/i }).click();
    }

    await page.getByRole('button', { name: /^Past items$/i, exact: true }).click();
    await expect(page.getByText('Delayed status item')).toHaveCount(1);

    await statusResponsePromise;
  } finally {
    await page.unroute('**/wishlist/status');
  }
});

test('archive rollback restores item when status mutation fails', async ({
  page,
  login,
}) => {
  await login();
  await page.goto('/wishlist');
  await dismissInstallPrompt(page);
  await createWishlistItem({ page, title: 'Rollback status item' });

  await page.route('**/wishlist/status', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    const payload = new URLSearchParams(route.request().postData() ?? '');
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: 'Unable to update wishlist item status.',
        clientMutationId: payload.get('clientMutationId'),
      }),
    });
  });

  try {
    const itemRows = page
      .getByTestId('wishlist-item-row')
      .filter({ hasText: 'Rollback status item' });
    await expect(itemRows).toHaveCount(2);

    await page.getByText('Rollback status item').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const statusResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/wishlist/status') &&
        response.request().method() === 'POST',
    );

    await page.getByRole('button', { name: /remove from wishlist/i }).click();
    await expect(itemRows).toHaveCount(0);

    await statusResponsePromise;
    await expect(itemRows).toHaveCount(2);
  } finally {
    await page.unroute('**/wishlist/status');
  }
});
