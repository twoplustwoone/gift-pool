import { expect, test } from '#tests/playwright-utils.ts';

// GIFTPOOL-UI-37. With future.v8_passThroughRequests, a loader hit by a
// client-side navigation sees the raw single-fetch URL (`/wishlist.data?…`).
// requireUserId used to copy that into the login redirectTo, so logging back
// in sent the user to an internal data URL and the router crashed with
// "No result found for routeId root".

test('a session lost mid-visit returns the user to the page they were opening', async ({
  page,
  login,
}) => {
  const user = await login();
  await page.goto('/settings/profile');
  const wishlistLink = page
    .getByRole('link', { name: 'Wishlist', exact: true })
    .first();
  await expect(wishlistLink).toBeVisible();

  // Only a client-side navigation goes through single fetch; a document
  // request never had the bug. Wait until the app has hydrated.
  await page.waitForFunction(() => '__reactRouterRouteModules' in window);
  await page.context().clearCookies({ name: 'en_session' });

  const dataRequest = page.waitForRequest((request) =>
    new URL(request.url()).pathname.startsWith('/wishlist.data'),
  );
  await wishlistLink.click();
  await dataRequest;

  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get('redirectTo')).toBe('/wishlist');

  await page.getByRole('textbox', { name: /username/i }).fill(user.username);
  await page.getByRole('textbox', { name: /password/i }).fill(user.username);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/wishlist$/);
});

test('a data URL that already leaked into redirectTo still lands on the page', async ({
  page,
  insertNewUser,
}) => {
  const user = await insertNewUser();
  await page.goto(
    `/login?redirectTo=${encodeURIComponent('/wishlist.data?_routes=routes/wishlist+/index')}`,
  );

  await page.getByRole('textbox', { name: /username/i }).fill(user.username);
  await page.getByRole('textbox', { name: /password/i }).fill(user.username);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/wishlist$/);
});
