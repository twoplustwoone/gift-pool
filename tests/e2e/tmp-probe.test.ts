import { expect, test } from '#tests/playwright-utils.ts';
test.use({ launchOptions: { executablePath: '/opt/pw-browsers/chromium' } });

test('probe resource-route response shapes', async ({ page, login }) => {
  await login();
  await page.goto('/wishlist');
  const out = await page.evaluate(async () => {
    const body = new URLSearchParams({ url: 'https://shop.example.com/widget' });
    const results: Record<string, unknown> = {};
    for (const path of ['/api/wishlist/unfurl', '/api/wishlist/unfurl.data']) {
      try {
        const res = await fetch(path, {
          method: 'POST',
          body,
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        });
        results[path] = {
          status: res.status,
          ct: res.headers.get('content-type'),
          text: (await res.text()).slice(0, 200),
        };
      } catch (e) {
        results[path] = { error: String(e) };
      }
    }
    return results;
  });
  console.log('PROBE=' + JSON.stringify(out));
  expect(true).toBe(true);
});
