import { prisma } from '#app/utils/db.server.ts';
import { expect, test, waitFor } from '#tests/playwright-utils.ts';

async function dragHandleToTarget(
  page: import('@playwright/test').Page,
  handle: ReturnType<import('@playwright/test').Page['getByRole']>,
  target: ReturnType<import('@playwright/test').Page['getByRole']>,
) {
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) {
    throw new Error('Unable to find drag bounds for source or target element');
  }

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
}

const openCategoryActions = async (
  page: import('@playwright/test').Page,
  categoryName: string,
) => {
  await page
    .getByRole('button', { name: new RegExp(`category actions for ${categoryName}`, 'i') })
    .click();
};

const startReorderMode = async (
  page: import('@playwright/test').Page,
  mode: 'items' | 'categories',
) => {
  await page.getByRole('button', { name: /categories/i }).click();
  await page
    .getByRole('button', {
      name: mode === 'items' ? /reorder items/i : /reorder categories/i,
    })
    .click();
};

const addItemToCategory = async (
  page: import('@playwright/test').Page,
  categoryName: string,
) => {
  await openCategoryActions(page, categoryName);
  await page.getByRole('menuitem', { name: /add item/i }).click();
};

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
  await page.getByRole('button', { name: /categories/i }).click();
  await page.getByPlaceholder('Category name').fill('Books');
  await page.getByRole('button', { name: /create category/i }).click();
  await expect(page.getByText('Category added', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Category name')).toHaveValue('');
  await expect(page.getByRole('dialog').getByText('Books')).toBeVisible();
  await page.keyboard.press('Escape'); // close manager

  // Add an item directly into the Books category via its action menu
  await addItemToCategory(page, 'Books');
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
  await openCategoryActions(page, 'Books');
  await page.getByRole('menuitem', { name: /rename category/i }).click();
  await page.locator('input[value="Books"]').fill('Novels');
  await page.getByRole('button', { name: /save category/i }).click();
  await expect(page.getByText('Novels')).toBeVisible();

  // Delete the category and verify item moved to Default (Uncategorized)
  await openCategoryActions(page, 'Novels');
  await page.getByRole('menuitem', { name: /delete category/i }).click();
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
  await page.getByRole('button', { name: /item actions for book one/i }).click();
  await page.getByRole('menuitem', { name: /edit item/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('owners can drag reorder categories and items across categories', async ({
  page,
  login,
}) => {
  const user = await login();
  await page.goto('/wishlist');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /categories/i }).click();
  await page.getByPlaceholder('Category name').fill('Books');
  await page.getByRole('button', { name: /create category/i }).click();
  await expect(page.getByRole('dialog').getByText('Books')).toBeVisible();
  await page.getByPlaceholder('Category name').fill('Games');
  await page.getByRole('button', { name: /create category/i }).click();
  await expect(page.getByRole('dialog').getByText('Games')).toBeVisible();
  await page.keyboard.press('Escape');

  await addItemToCategory(page, 'Books');
  await page.getByLabel('Title').fill('Book Alpha');
  await page.getByRole('button', { name: /^save$/i }).click();

  await addItemToCategory(page, 'Books');
  await page.getByLabel('Title').fill('Book Beta');
  await page.getByRole('button', { name: /^save$/i }).click();

  await addItemToCategory(page, 'Games');
  await page.getByLabel('Title').fill('Game Alpha');
  await page.getByRole('button', { name: /^save$/i }).click();

  await expect(
    page.getByRole('button', { name: 'Drag category Games' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Drag item Book Beta' }),
  ).toHaveCount(0);

  await startReorderMode(page, 'categories');
  await expect(
    page.getByRole('button', { name: 'Drag category Games' }),
  ).toBeVisible();

  await dragHandleToTarget(
    page,
    page.getByRole('button', { name: 'Drag category Games' }),
    page.getByRole('button', { name: 'Drag category Books' }),
  );

  await waitFor(async () => {
    const orderedCategories = await prisma.wishlistCategory.findMany({
      where: { ownerId: user.id },
      orderBy: { order: 'asc' },
      select: { name: true },
    });

    if (
      orderedCategories[0]?.name !== 'Games' ||
      orderedCategories[1]?.name !== 'Books'
    ) {
      throw new Error('Categories have not been reordered yet');
    }

    return orderedCategories;
  }, { timeout: 8000 });

  await page.getByRole('button', { name: /item reorder mode/i }).click();
  await expect(
    page.getByRole('button', { name: 'Drag item Book Beta' }),
  ).toBeVisible();

  await dragHandleToTarget(
    page,
    page.getByRole('button', { name: 'Drag item Book Beta' }),
    page.getByRole('button', { name: 'Drag item Book Alpha' }),
  );

  await waitFor(async () => {
    const booksCategory = await prisma.wishlistCategory.findFirst({
      where: { ownerId: user.id, name: 'Books' },
      select: { id: true },
    });

    if (!booksCategory) {
      throw new Error('Books category missing');
    }

    const bookItems = await prisma.wishlistItem.findMany({
      where: { ownerId: user.id, categoryId: booksCategory.id },
      select: { title: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (
      bookItems[0]?.title !== 'Book Beta' ||
      bookItems[1]?.title !== 'Book Alpha'
    ) {
      throw new Error('Books items have not been reordered yet');
    }

    return bookItems;
  }, { timeout: 8000 });

  await dragHandleToTarget(
    page,
    page.getByRole('button', { name: 'Drag item Book Alpha' }),
    page.getByRole('heading', { name: /games \(1\)/i }),
  );

  await waitFor(async () => {
    const [booksCategory, gamesCategory] = await Promise.all([
      prisma.wishlistCategory.findFirst({
        where: { ownerId: user.id, name: 'Books' },
        select: { id: true },
      }),
      prisma.wishlistCategory.findFirst({
        where: { ownerId: user.id, name: 'Games' },
        select: { id: true },
      }),
    ]);

    if (!booksCategory || !gamesCategory) {
      throw new Error('Required categories are missing');
    }

    const movedItem = await prisma.wishlistItem.findFirst({
      where: { ownerId: user.id, title: 'Book Alpha' },
      select: { categoryId: true, sortOrder: true },
    });

    const gamesItems = await prisma.wishlistItem.findMany({
      where: { ownerId: user.id, categoryId: gamesCategory.id },
      select: { title: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (
      movedItem?.categoryId !== gamesCategory.id ||
      gamesItems[gamesItems.length - 1]?.title !== 'Book Alpha'
    ) {
      throw new Error('Item has not moved to Games yet');
    }

    return gamesItems;
  }, { timeout: 8000 });

  await page.getByRole('button', { name: /done reordering/i }).click();
  await expect(
    page.getByRole('button', { name: 'Drag category Games' }),
  ).toHaveCount(0);
});

test('owners can clear a wishlist item description', async ({ page, login }) => {
  await login();
  await page.goto('/wishlist');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /^Add Item$/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Title').fill('Clearable Note Item');
  await page.getByRole('textbox', { name: /description/i }).fill('Remove me');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page.getByText('Clearable Note Item').first()).toBeVisible();
  await expect(page.getByText('Remove me').first()).toBeVisible();

  await page.getByText('Clearable Note Item').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('textbox', { name: /description/i }).fill('');
  await page.getByRole('button', { name: /^save$/i }).click();

  await waitFor(async () => {
    const saved = await prisma.wishlistItem.findFirst({
      where: { title: 'Clearable Note Item' },
      select: { note: true },
    });
    if (saved?.note !== null) {
      throw new Error('Note not cleared yet');
    }
    return saved;
  }, { timeout: 8000 });

  await page.reload();
  await expect(page.getByText('Clearable Note Item').first()).toBeVisible();
  await expect(page.getByText('Remove me')).toHaveCount(0);

  await page.getByText('Clearable Note Item').first().click();
  await expect(page.getByRole('textbox', { name: /description/i })).toHaveValue('');
});
