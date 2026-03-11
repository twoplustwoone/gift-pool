import { type Page, type Locator } from '@playwright/test';
import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, test, waitFor } from '#tests/playwright-utils.ts';

const dismissInstallPrompt = async (page: Page) => {
  const notNow = page.getByRole('button', { name: /not now/i });
  if ((await notNow.count()) > 0) {
    await notNow.click();
  }
};

async function dragHandleToTarget(
  page: Page,
  handle: Locator,
  target: Locator,
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

const openCategoryActions = async (page: Page, categoryName: string) => {
  await page
    .getByRole('button', {
      name: new RegExp(`category actions for ${categoryName}`, 'i'),
    })
    .click();
};

const startReorderMode = async (page: Page, mode: 'items' | 'categories') => {
  await page.getByRole('button', { name: /categories/i }).click();
  await page
    .getByRole('button', {
      name: mode === 'items' ? /reorder items/i : /reorder categories/i,
    })
    .click();
};

const addItemToCategory = async (page: Page, categoryName: string) => {
  await openCategoryActions(page, categoryName);
  await page.getByRole('menuitem', { name: /add item/i }).click();
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
  await expect(editor).not.toBeVisible();
};

const openItemActions = async (page: Page, itemTitle: string) => {
  await page
    .getByRole('button', {
      name: new RegExp(`item actions for ${itemTitle}`, 'i'),
    })
    .first()
    .click();
};

const createFriendship = async (userOneId: string, userTwoId: string) => {
  const [userAId, userBId] =
    userOneId < userTwoId ? [userOneId, userTwoId] : [userTwoId, userOneId];
  await prisma.friendship.create({ data: { userAId, userBId } });
};

const ensureUserRoleCanDeleteWishlistItems = async () => {
  const deletePermission = await prisma.permission.upsert({
    where: {
      action_entity_access: {
        action: 'delete',
        entity: 'wishlistItem',
        access: 'own',
      },
    },
    update: {},
    create: {
      action: 'delete',
      entity: 'wishlistItem',
      access: 'own',
    },
  });

  await prisma.role.update({
    where: { name: 'user' },
    data: {
      permissions: {
        connect: { id: deletePermission.id },
      },
    },
  });
};

const assertNoHorizontalOverflow = async (page: Page) => {
  const metrics = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const appScrollArea = document.querySelector(
      '[data-testid="app-scroll-area"]',
    ) as HTMLElement | null;

    return {
      documentScrollWidth: documentElement.scrollWidth,
      documentClientWidth: documentElement.clientWidth,
      appScrollWidth: appScrollArea?.scrollWidth ?? null,
      appClientWidth: appScrollArea?.clientWidth ?? null,
    };
  });

  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(
    metrics.documentClientWidth + 1,
  );
  expect(metrics.appScrollWidth).not.toBeNull();
  expect(metrics.appClientWidth).not.toBeNull();
  expect(metrics.appScrollWidth ?? 0).toBeLessThanOrEqual(
    (metrics.appClientWidth ?? 0) + 1,
  );
};

test('owner wishlist does not horizontally overflow on mobile', async ({
  page,
  login,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login();
  await page.goto('/wishlist');
  await page.waitForLoadState('networkidle');

  await assertNoHorizontalOverflow(page);
});

test('friend wishlist does not horizontally overflow on mobile', async ({
  page,
  login,
}) => {
  const ownerData = createUser();
  const viewerData = createUser();
  const [owner, viewer] = await Promise.all([
    prisma.user.create({
      select: { id: true, username: true },
      data: {
        ...ownerData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(ownerData.username) },
      },
    }),
    prisma.user.create({
      select: { id: true, username: true },
      data: {
        ...viewerData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(viewerData.username) },
      },
    }),
  ]);

  await createFriendship(owner.id, viewer.id);

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await login({ id: viewer.id });
    await page.goto(`/users/${owner.username}/wishlist`);
    await page.waitForLoadState('networkidle');

    await assertNoHorizontalOverflow(page);
  } finally {
    await prisma.user
      .deleteMany({ where: { id: { in: [owner.id, viewer.id] } } })
      .catch(() => {});
  }
});

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
  await expect(page.getByText('Book One').first()).not.toBeVisible();
  await page.getByText('Books').first().click();
  await expect(page.getByText('Book One').first()).toBeVisible();

  // Rename Books -> Novels (inline header editor)
  await openCategoryActions(page, 'Books');
  await page.getByRole('menuitem', { name: /rename category/i }).click();
  await page.locator('input[value="Books"]').fill('Novels');
  await page.getByRole('button', { name: /save category/i }).click();
  await expect(page.getByText('Novels')).toBeVisible();

  // Delete the category and verify item moved to Default (Uncategorized)
  await page.getByRole('button', { name: /categories/i }).click();
  await page
    .getByRole('dialog')
    .locator('li', { hasText: 'Novels' })
    .getByRole('button', { name: /delete category/i })
    .click();
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
  await page
    .getByRole('button', { name: /item actions for book one/i })
    .click();
  await page.getByRole('menuitem', { name: /edit item/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('owners can delete wishlist items from row actions', async ({
  page,
  login,
}) => {
  await ensureUserRoleCanDeleteWishlistItems();
  const user = await login();
  await page.goto('/wishlist');
  await dismissInstallPrompt(page);

  const itemTitle = `Deleteable Item ${Date.now()}`;

  await createWishlistItem({ page, title: itemTitle });
  await expect(page.getByText(itemTitle)).toHaveCount(2);

  const createdItem = await waitFor(
    async () => {
      const item = await prisma.wishlistItem.findFirst({
        where: { ownerId: user.id, title: itemTitle },
        select: { id: true },
      });
      if (!item) {
        throw new Error('Wishlist item not created yet');
      }
      return item;
    },
    { timeout: 8000 },
  );

  await openItemActions(page, itemTitle);
  await page.getByRole('menuitem', { name: /^delete item$/i }).click();

  const deleteDialog = page.getByRole('dialog', {
    name: /delete wishlist item/i,
  });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole('button', { name: /^delete$/i }).click();

  await expect(page.getByText(itemTitle)).toHaveCount(0);

  await waitFor(
    async () => {
      const deleted = await prisma.wishlistItem.findUnique({
        where: { id: createdItem.id },
        select: { id: true },
      });
      if (deleted) {
        throw new Error('Wishlist item still exists');
      }
      return createdItem.id;
    },
    { timeout: 8000 },
  );

  await page.reload();
  await expect(page.getByText(itemTitle)).toHaveCount(0);
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

  await waitFor(
    async () => {
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
    },
    { timeout: 8000 },
  );

  await page.getByRole('button', { name: /item reorder mode/i }).click();
  await expect(
    page.getByRole('button', { name: 'Drag item Book Beta' }),
  ).toBeVisible();

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

  const booksItems = await prisma.wishlistItem.findMany({
    where: { ownerId: user.id, categoryId: booksCategory.id },
    select: { id: true, title: true },
    orderBy: { sortOrder: 'asc' },
  });

  const bookAlpha = booksItems.find((item) => item.title === 'Book Alpha');
  const bookBeta = booksItems.find((item) => item.title === 'Book Beta');

  if (!bookAlpha || !bookBeta) {
    throw new Error('Required books are missing');
  }

  const reorderResponse = await page.request.post('/wishlist/reorder', {
    form: {
      intent: 'reorder-items',
      sourceCategoryId: booksCategory.id,
      targetCategoryId: gamesCategory.id,
      sourceOrderedItemIds: JSON.stringify([bookBeta.id]),
      targetOrderedItemIds: JSON.stringify([bookAlpha.id]),
    },
  });

  expect(reorderResponse.ok()).toBeTruthy();

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(
    page.getByTestId('wishlist-category-row').filter({
      has: page.getByRole('heading', { name: /games \(1\)/i }),
    }),
  ).toBeVisible();

  await waitFor(
    async () => {
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
        gamesItems[0]?.title !== 'Book Alpha'
      ) {
        throw new Error('Item has not moved to Games yet');
      }

      return gamesItems;
    },
    { timeout: 8000 },
  );
});

test('owners can clear a wishlist item description', async ({
  page,
  login,
}) => {
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

  await waitFor(
    async () => {
      const saved = await prisma.wishlistItem.findFirst({
        where: { title: 'Clearable Note Item' },
        select: { note: true },
      });
      if (saved?.note !== null) {
        throw new Error('Note not cleared yet');
      }
      return saved;
    },
    { timeout: 8000 },
  );

  await page.reload();
  await expect(page.getByText('Clearable Note Item').first()).toBeVisible();
  await expect(page.getByText('Remove me')).toHaveCount(0);

  await page.getByText('Clearable Note Item').first().click();
  await expect(page.getByRole('textbox', { name: /description/i })).toHaveValue(
    '',
  );
});
