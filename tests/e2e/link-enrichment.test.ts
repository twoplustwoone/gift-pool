import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, test, waitFor } from '#tests/playwright-utils.ts';

test('item prices render on the wishlist card', async ({ page, login }) => {
  const user = await login();
  await prisma.wishlistItem.create({
    data: {
      ownerId: user.id,
      title: 'Priced Headphones',
      type: 'text',
      sortOrder: 0,
      priceCents: 12999,
      currency: 'USD',
      url: 'https://shop.example.com/headphones',
    },
  });

  await page.goto('/wishlist');

  const card = page
    .getByTestId('wishlist-item-card')
    .filter({ hasText: 'Priced Headphones' });
  await expect(card.getByTestId('wishlist-item-price')).toHaveText('$129.99');
  // The outbound chip routes through /out for tagging + click analytics.
  await expect(
    card.getByRole('link', { name: /shop\.example\.com/ }),
  ).toHaveAttribute('href', /^\/out\?item=/);
});

test('/out redirects to the stored product URL and records the click', async ({
  page,
}) => {
  const ownerData = createUser();
  const owner = await prisma.user.create({
    select: { id: true },
    data: {
      ...ownerData,
      roles: { connect: { name: 'user' } },
      password: { create: createPassword(ownerData.username) },
    },
  });

  try {
    const item = await prisma.wishlistItem.create({
      select: { id: true },
      data: {
        ownerId: owner.id,
        title: 'Redirect Target',
        type: 'text',
        sortOrder: 0,
        url: 'https://shop.example.com/redirect-target',
      },
    });

    // Anonymous click — /out requires no auth (public-share viewers use it).
    const response = await page.request.get(`/out?item=${item.id}`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toBe(
      'https://shop.example.com/redirect-target',
    );

    // The click lands as an analytics row (queued fire-and-forget).
    await waitFor(async () => {
      const row = await prisma.analyticsEvent.findFirst({
        where: { name: 'wishlist_link_clicked' },
        orderBy: { createdAt: 'desc' },
        select: { properties: true, userId: true },
      });
      expect(row).not.toBeNull();
      const properties = JSON.parse(row!.properties ?? '{}') as {
        id: string;
        entity: string;
        tagged: boolean;
      };
      expect(properties).toMatchObject({
        id: item.id,
        entity: 'item',
        tagged: false,
      });
      return row;
    });
  } finally {
    await prisma.user.deleteMany({ where: { id: owner.id } });
  }
});

// A 429 from the shared strictest rate-limit bucket used to propagate to the
// route error boundary: the editor closed and the page became "Something went
// wrong (429)", taking any unsaved edits with it.
test('a rate-limited unfurl leaves the editor open', async ({
  page,
  login,
}) => {
  const user = await login();
  await prisma.wishlistItem.create({
    data: {
      ownerId: user.id,
      title: 'Limited Gloves',
      type: 'link',
      sortOrder: 0,
      url: 'https://shop.example.com/gloves',
    },
  });

  await page.route(/\/api\/wishlist\/unfurl/, (route) =>
    route.fulfill({
      status: 429,
      contentType: 'text/html; charset=utf-8',
      body: 'Too many requests, please try again later.',
    }),
  );

  await page.goto('/wishlist');
  const notNow = page.getByRole('button', { name: /not now/i });
  if ((await notNow.count()) > 0) await notNow.click();

  await page
    .getByRole('button', { name: /Item actions for Limited Gloves/i })
    .click();
  await page.getByRole('menuitem', { name: /edit item/i }).click();
  const editor = page.getByRole('dialog');
  await expect(editor).toBeVisible();

  const title = editor.getByRole('textbox', { name: 'Title', exact: true });
  await title.fill('Edits the user would hate to lose');
  await editor.getByRole('textbox', { name: 'Link', exact: true }).click();
  await title.click(); // blur the link field -> lookup -> 429

  // The editor survives and keeps what was typed.
  await expect(editor).toBeVisible();
  await expect(title).toHaveValue('Edits the user would hate to lose');
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
});
