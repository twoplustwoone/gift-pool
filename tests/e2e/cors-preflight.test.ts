import { expect, test } from '#tests/playwright-utils.ts';

/**
 * Regression guard: confirms that CORS preflight OPTIONS requests are handled
 * by Express before reaching React Router.
 *
 * React Router only handles GET/POST/PUT/PATCH/DELETE — an OPTIONS request
 * that reaches its handler throws `Error: Invalid request method "OPTIONS"`,
 * producing a 405 and Sentry noise (GIFTPOOL-UI-19, GIFTPOOL-UI-Z).
 *
 * The fix is an `app.options('*', ...)` handler registered in server/index.ts
 * before the `createRequestHandler` catch-all.
 */
test('OPTIONS / returns 204 and never reaches React Router', async ({
  page,
}) => {
  const response = await page.request.fetch('/', { method: 'OPTIONS' });
  expect(response.status()).toBe(204);
});
