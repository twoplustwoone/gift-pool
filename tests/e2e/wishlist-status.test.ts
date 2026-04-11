import  { type Page } from '@playwright/test';
import {
  expect,
  singleFetchActionBody,
  test,
} from '#tests/playwright-utils.ts';

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
  // Wait for the Remix navigation to fully complete (action + loader revalidation)
  // so the item has its real database ID, not an optimistic one
  await expect(editor).not.toBeVisible();
};

test('owners can archive and unarchive wishlist items', async ({
  page,
  login,
}) => {
  await login();
  await page.goto('/wishlist');
  await dismissInstallPrompt(page);

  await createWishlistItem({ page, title: 'Archivable Item' });

  // One row per item in the unified layout (used to be two — desktop + mobile).
  await expect(page.getByText('Archivable Item')).toHaveCount(1);

  // Open the item editor — click the row button by aria-label so we're not
  // clicking the text span (which sits under the pointer-events-none layer).
  await page.getByRole('button', { name: 'Archivable Item', exact: true }).click();
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
  await page
    .getByRole('button', { name: /^Past items$/i, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Past items', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Archivable Item')).toHaveCount(1);

  // Unarchive the item — past items are still a Card-as-DialogTrigger, so
  // clicking the text inside the card still works there.
  await page.getByText('Archivable Item').click();
  await page.getByRole('button', { name: /restore to wishlist/i }).click();
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: /^close$/i }).click();
  }

  // Item returns to the active list (one row, not two) and the archived
  // section now renders the empty state.
  await page.getByRole('button', { name: /^Wishlist$/i, exact: true }).click();
  await expect(page.getByText('Archivable Item')).toHaveCount(1);
});

test('archive status is optimistic before delayed server response', async ({
  page,
  login,
}) => {
  await login();
  await page.goto('/wishlist');
  await dismissInstallPrompt(page);
  await createWishlistItem({ page, title: 'Delayed status item' });

  await page.route('**/wishlist/status*', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });

  try {
    // Scope by the outer card testid: the row button is empty (it's an
    // absolute click-catcher), so filter({hasText}) has to look at the card
    // element which wraps the visible content.
    const itemCards = page
      .getByTestId('wishlist-item-card')
      .filter({ hasText: 'Delayed status item' });
    await expect(itemCards).toHaveCount(1);

    await page
      .getByRole('button', { name: 'Delayed status item', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const statusResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/wishlist/status') &&
        response.request().method() === 'POST',
    );

    await page.getByRole('button', { name: /remove from wishlist/i }).click();
    await expect(itemCards).toHaveCount(0);

    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible()) {
      await dialog.getByRole('button', { name: /^close$/i }).click();
    }

    await page
      .getByRole('button', { name: /^Past items$/i, exact: true })
      .click();
    await expect(page.getByText('Delayed status item')).toHaveCount(1);

    await statusResponsePromise;
  } finally {
    await page.unroute('**/wishlist/status*');
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

  await page.route('**/wishlist/status*', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    const payload = new URLSearchParams(route.request().postData() ?? '');
    await new Promise((resolve) => setTimeout(resolve, 800));
    const { body, contentType } = await singleFetchActionBody({
      ok: false,
      error: 'Unable to update wishlist item status.',
      clientMutationId: payload.get('clientMutationId'),
    });
    await route.fulfill({ status: 200, contentType, body });
  });

  try {
    const itemCards = page
      .getByTestId('wishlist-item-card')
      .filter({ hasText: 'Rollback status item' });
    await expect(itemCards).toHaveCount(1);

    await page
      .getByRole('button', { name: 'Rollback status item', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const statusResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/wishlist/status') &&
        response.request().method() === 'POST',
    );

    await page.getByRole('button', { name: /remove from wishlist/i }).click();
    await expect(itemCards).toHaveCount(0);

    await statusResponsePromise;
    await expect(itemCards).toHaveCount(1);
  } finally {
    await page.unroute('**/wishlist/status*');
  }
});
