import type { Page } from '@playwright/test';
import { expect, test } from '#tests/playwright-utils.ts';

const dismissInstallPrompt = async (page: Page) => {
  const notNow = page.getByRole('button', { name: /not now/i });
  if ((await notNow.count()) > 0) {
    await notNow.click();
  }
};

test('owners can archive and unarchive wishlist items', async ({ page, login }) => {
  await login();
  await page.goto('/wishlist');
  await dismissInstallPrompt(page);

  // Create an item to archive
  await page.getByRole('button', { name: /^Add Item$/ }).click();
  const editor = page.getByRole('dialog');
  await expect(editor).toBeVisible();
  await editor.getByLabel('Title').fill('Archivable Item');
  await page.getByRole('button', { name: /^save$/i }).click();

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
