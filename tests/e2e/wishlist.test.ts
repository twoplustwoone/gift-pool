import { expect, test } from '#tests/playwright-utils.ts';

const toastText = 'Wishlist item added.';

test('users can add wishlist items', async ({ page, login }) => {
  await login();
  await page.goto('/wishlist');

  // Add first item and close (disambiguate from category add and hidden FAB)
  await page
    .getByRole('button', { name: /^Add Item$/ })
    .filter({ hasText: 'Add Item' })
    .click();
  await page.getByLabel('Title').fill('First Item');
  await page.getByRole('button', { name: /^save idle$/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('First Item').first()).toBeVisible();

  // Add second item and keep dialog open
  await page
    .getByRole('button', { name: /^Add Item$/ })
    .filter({ hasText: 'Add Item' })
    .click();
  await page.getByLabel('Title').fill('Second Item');
  await page.getByRole('button', { name: /save & add another/i }).click();
  await expect(page.getByText(toastText).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('');
  await expect(page.getByText('Second Item').first()).toBeVisible();
});

test('users can create, edit, and delete categories; items follow correctly', async ({
  page,
  login,
}) => {
  await login();
  await page.goto('/wishlist');

  // Create category "Books"
  await page.getByRole('button', { name: /add category/i }).click();
  await page.getByPlaceholder('Category name').fill('Books');
  await page.getByRole('button', { name: /create category/i }).click();
  await expect(page.getByText('Category added')).toBeVisible();
  await expect(page.getByPlaceholder('Category name')).toHaveValue('');
  await expect(page.getByText('Books')).toBeVisible();
  await page.keyboard.press('Escape'); // close manager

  // Add an item directly into the Books category via its header button
  await page.getByRole('button', { name: /add item to books/i }).click();
  await expect(
    page.getByRole('option', { name: 'Books', selected: true }),
  ).toBeVisible();
  await page.getByLabel('Title').fill('Book One');
  await page.getByRole('button', { name: /^save idle$/i }).click();
  await expect(page.getByText('Book One')).toBeVisible();

  // Collapse then expand the Books category by clicking its header text
  await page.getByText('Books').first().click();
  await expect(page.getByText('Book One')).not.toBeVisible();
  await page.getByText('Books').first().click();
  await expect(page.getByText('Book One')).toBeVisible();

  // Rename Books -> Novels (inline header editor)
  await page.getByRole('button', { name: /edit category/i }).click();
  await page.locator('input[value="Books"]').fill('Novels');
  await page.getByRole('button', { name: /save category/i }).click();
  await expect(page.getByText('Novels')).toBeVisible();

  // Delete the category and verify item moved to Default (Uncategorized)
  await page.getByRole('button', { name: /delete category/i }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Novels')).toHaveCount(0);
  // Verify the default category section now contains the item
  await expect(
    page
      .locator('div:has-text("Default (Uncategorized)")')
      .locator('text=Book One'),
  ).toBeVisible();

  // Sanity: open item editor
  await page.getByText('Book One').first().hover();
  await page.getByLabel('Edit item').click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
