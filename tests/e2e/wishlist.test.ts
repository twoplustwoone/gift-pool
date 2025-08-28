import { expect, test } from '#tests/playwright-utils.ts';

const toastText = 'Wishlist item added.';

test('users can add wishlist items', async ({ page, login }) => {
  await login();
  await page.goto('/wishlist');

  await page.getByRole('button', { name: /add wishlist item/i }).click();
  await page.getByLabel('Title').fill('First Item');
  await page.getByRole('button', { name: /^save idle$/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('First Item').first()).toBeVisible();

  await page.getByRole('button', { name: /add wishlist item/i }).click();
  await page.getByLabel('Title').fill('Second Item');
  await page.getByRole('button', { name: /save & add another/i }).click();
  await expect(page.getByText(toastText)).toHaveCount(3);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('');
  await expect(
    page.getByText('Second Item').filter({ visible: true }),
  ).toBeVisible();
});
