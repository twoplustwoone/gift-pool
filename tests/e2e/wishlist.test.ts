import { expect, test } from '#tests/playwright-utils.ts';

test('users can add wishlist items', async ({ page, login }) => {
  await login();
  await page.goto('/wishlist');
  await page.waitForLoadState('networkidle');

  const addItemButton = page.getByRole('button', { name: /^Add Item$/ });
  await expect(addItemButton).toBeVisible();
  await addItemButton.click();

  // Wait for the dialog rather than jumping straight to Save
  await expect(page.getByRole('dialog')).toBeVisible();

  // Create first item
  await page.getByLabel('Title').fill('First Item');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('First Item').first()).toBeVisible();

  // Add second item and keep dialog open
  await page.getByRole('button', { name: /^Add Item$/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Title').fill('Second Item');
  await page.getByRole('button', { name: /save & add another/i }).click();

  const successToast = page.getByText('Wishlist item added.', { exact: true });
  await expect(successToast.first()).toBeVisible();
  await expect(successToast).toHaveCount(1);
  await expect(page.getByRole('dialog')).toBeVisible(); // still open
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
  await expect(page.getByText('Category added', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Category name')).toHaveValue('');
  await expect(page.getByRole('dialog').getByText('Books')).toBeVisible();
  await page.keyboard.press('Escape'); // close manager

  // Add an item directly into the Books category via its header button
  await page.getByRole('button', { name: /add item to books/i }).click();
  await expect(page.getByRole('combobox', { name: 'Category' })).toBeVisible();
  await page.getByLabel('Title').fill('Book One');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('Book One').first()).toBeVisible();

  // Collapse then expand the Books category by clicking its header text
  await page.getByText('Books').first().click();
  await expect(page.getByText('Book One')).not.toBeVisible();
  await page.getByText('Books').first().click();
  await expect(page.getByText('Book One').first()).toBeVisible();

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
  const bookOne = page
    .locator('div') // or a more specific container selector
    .filter({
      has: page.getByText('Default (Uncategorized)'),
      hasText: 'Book One',
    })
    .first();
  await expect(bookOne).toBeVisible();

  // Sanity: open item editor
  await page.locator('.rounded-xl.border.border-card-border').first();
  await page.getByRole('button', { name: 'Edit item' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
