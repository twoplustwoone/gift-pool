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

// Enters Organize mode (starts in item-reorder) and, when `mode` is
// 'categories', switches to the Categories tab where category CRUD lives.
const startReorderMode = async (page: Page, mode: 'items' | 'categories') => {
  await page.getByRole('button', { name: /^organize$/i }).click();
  if (mode === 'categories') {
    await page.getByRole('button', { name: /category reorder mode/i }).click();
  }
};

const finishOrganizing = async (page: Page) => {
  await page.getByRole('button', { name: /done organizing/i }).click();
};

// Category CRUD lives in Organize mode's Categories tab.
const createCategory = async (page: Page, categoryName: string) => {
  await page.getByPlaceholder('Category name').fill(categoryName);
  await page.getByRole('button', { name: /add category/i }).click();
};

const addItemToCategory = async (page: Page, categoryName: string) => {
  await page
    .getByRole('button', {
      name: new RegExp(`add item to ${categoryName}`, 'i'),
    })
    .click();
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

  // Create category "Books" via Organize mode's Categories tab.
  await startReorderMode(page, 'categories');
  await createCategory(page, 'Books');
  await expect(page.getByText('Category added', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Category name')).toHaveValue('');
  await expect(page.getByText('Books')).toBeVisible();
  await finishOrganizing(page);

  // Add an item directly into the Books category via its add-item control
  await addItemToCategory(page, 'Books');
  await expect(page.getByRole('combobox', { name: 'Category' })).toBeVisible();
  await page.getByLabel('Title').fill('Book One');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('Book One').first()).toBeVisible();

  // Collapse then expand the Books category. We assert on the header
  // button's `aria-expanded` state rather than `toBeVisible()` of the
  // child text because the animated collapse keeps the content in the
  // DOM (grid-rows 0fr) and Playwright's visibility check doesn't treat
  // grid-rows clipping as "hidden" the way display:none would.
  //
  // Filter out the "Add item to Books" control (which also matches
  // /books/) by scoping to the header's (count-bearing) accessible name.
  const booksHeader = page.getByRole('button', { name: /^Books\s*\(\d+\)/ });
  await expect(booksHeader).toHaveAttribute('aria-expanded', 'true');
  await booksHeader.click();
  await expect(booksHeader).toHaveAttribute('aria-expanded', 'false');
  await booksHeader.click();
  await expect(booksHeader).toHaveAttribute('aria-expanded', 'true');

  // Rename Books -> Novels (Organize mode's Categories tab)
  await startReorderMode(page, 'categories');
  await page.getByRole('button', { name: /rename category books/i }).click();
  // eslint-disable-next-line playwright/no-raw-locators
  await page.locator('input[value="Books"]').fill('Novels');
  await page.getByRole('button', { name: /save category/i }).click();
  await expect(page.getByText('Novels')).toBeVisible();

  // Delete the category and verify the item is still visible. With no
  // custom categories left, the wishlist renders a flat item list — there
  // is no longer a "Default (Uncategorized)" section to nest it inside.
  await page.getByRole('button', { name: /delete category novels/i }).click();
  await page
    .getByRole('dialog', { name: /delete category/i })
    .getByRole('button', { name: /^delete$/i })
    .click();
  await expect(page.getByText('Novels')).toHaveCount(0);
  await finishOrganizing(page);

  await expect(
    page.getByRole('heading', { name: /default \(uncategorized\)/i }),
  ).toHaveCount(0);
  await expect(page.getByText('Book One').first()).toBeVisible();

  // Sanity: open item editor
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
  await expect(page.getByText(itemTitle)).toHaveCount(1);

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

  await startReorderMode(page, 'categories');
  await createCategory(page, 'Books');
  await expect(page.getByText('Books')).toBeVisible();
  await createCategory(page, 'Games');
  await expect(page.getByText('Games')).toBeVisible();
  await finishOrganizing(page);

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

  // Click the row by its aria-label — the row button is an absolute
  // click-catcher that sits above the text span, so `getByText().click()`
  // fails Playwright's actionability check. `exact: true` keeps us from
  // matching the sibling "Item actions for Clearable Note Item" menu button.
  await page
    .getByRole('button', { name: 'Clearable Note Item', exact: true })
    .click();
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

  await page
    .getByRole('button', { name: 'Clearable Note Item', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: /description/i })).toHaveValue(
    '',
  );
});

// Regression: `toEditorWishlistItem` built the editor's item without
// priceCents/currency, so the Price field rendered empty on every edit and the
// save action's `priceCents: price ?? null` erased the stored price — no user
// action required beyond opening an item and saving it.
test('editing an item preserves its stored price', async ({ page, login }) => {
  const user = await login();
  const item = await prisma.wishlistItem.create({
    data: {
      ownerId: user.id,
      title: 'Priced Gloves',
      type: 'link',
      sortOrder: 0,
      priceCents: 5049,
      currency: 'USD',
      url: 'https://shop.example.com/gloves',
    },
    select: { id: true },
  });

  await page.goto('/wishlist');
  await dismissInstallPrompt(page);

  await page
    .getByRole('button', { name: /Item actions for Priced Gloves/i })
    .click();
  await page.getByRole('menuitem', { name: /edit item/i }).click();
  const editor = page.getByRole('dialog');
  await expect(editor).toBeVisible();

  // The stored price has to reach the form, or an untouched save wipes it.
  await expect(
    editor.getByRole('textbox', { name: 'Price (optional)' }),
  ).toHaveValue('50.49');

  await editor.getByRole('button', { name: /^save$/i }).click();
  await expect(editor).not.toBeVisible();

  await expect
    .poll(async () => {
      const after = await prisma.wishlistItem.findUnique({
        where: { id: item.id },
        select: { priceCents: true, currency: true },
      });
      return after;
    })
    .toEqual({ priceCents: 5049, currency: 'USD' });
});
