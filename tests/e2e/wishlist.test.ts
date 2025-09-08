import { expect, test } from '#tests/playwright-utils.ts';

const toastText = 'Wishlist item added.';

test('users can add wishlist items', async ({ page, login }) => {
  await login();
  await page.goto('/wishlist');

  await page.getByRole('button', { name: /add item/i }).click();
  await page.getByLabel('Title').fill('First Item');
  await page.getByRole('button', { name: /^save idle$/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('First Item').first()).toBeVisible();

  await page.getByRole('button', { name: /add item/i }).click();
  await page.getByLabel('Title').fill('Second Item');
  await page.getByRole('button', { name: /save & add another/i }).click();
  await expect(page.getByText(toastText)).toHaveCount(3);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('');
  await expect(
    page.getByText('Second Item').filter({ visible: true }),
  ).toBeVisible();
});

test('users can manage categories and items', async ({ page, login }) => {
  await login();
  await page.goto('/wishlist');

  await page.getByRole('button', { name: /add category/i }).click();
  await page.getByPlaceholder('Category name').fill('Books');
  await page.getByRole('button', { name: /create category/i }).click();
  await expect(page.getByText('Category added')).toBeVisible();
  await expect(page.getByPlaceholder('Category name')).toHaveValue('');
  await expect(page.getByText('Books')).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('heading', { name: /books \(0\)/i })).toBeVisible();

  await page.getByRole('button', { name: /add item to books/i }).click();
  await expect(
    page.getByRole('option', { name: 'Books', selected: true }),
  ).toBeVisible();
  await page.getByLabel('Title').fill('Book One');
  await page.getByRole('button', { name: /^save idle$/i }).click();
  await expect(page.getByRole('heading', { name: /books \(1\)/i })).toBeVisible();
  await expect(page.getByText('Book One')).toBeVisible();

  await page.getByRole('heading', { name: /books \(1\)/i }).click();
  await expect(page.getByText('Book One')).not.toBeVisible();
  await page.getByRole('heading', { name: /books \(1\)/i }).click();
  await expect(page.getByText('Book One')).toBeVisible();

  await page.getByRole('button', { name: /edit category/i }).click();
  await page.locator('input[value="Books"]').fill('Novels');
  await page.getByRole('button', { name: /save category/i }).click();
  await expect(page.getByRole('heading', { name: /novels \(1\)/i })).toBeVisible();

  await page.getByRole('button', { name: /delete category/i }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { name: /novels \(1\)/i })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: /default \(uncategorized\).*\(1\)/i }),
  ).toBeVisible();

  await page.getByText('Book One').first().hover();
  await page.getByLabel('Edit item').click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
