import { expect, test } from '@playwright/test';

test.describe('Home page', () => {
  test('hero headline visible on mobile and desktop', async ({
    page,
    browserName: _browserName,
  }) => {
    await page.goto('/');

    const hero = page.getByRole('heading', {
      name: /Plan a gift together without spoiling the surprise\./i,
    });
    await expect(hero).toBeVisible();

    // Mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(hero).toBeInViewport();

    // Desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(hero).toBeInViewport();
  });

  test('CTAs render organizer-first and point to correct routes', async ({
    page,
  }) => {
    await page.goto('/');
    const startPool = page.getByTestId('home-cta-pool');
    const makeWishlist = page.getByTestId('home-cta-wishlist');
    await expect(startPool).toBeVisible();
    await expect(makeWishlist).toBeVisible();

    // Verify target hrefs without requiring auth for navigation — the
    // auth gates on these routes carry the intent through redirectTo.
    await expect(startPool).toHaveAttribute('href', '/pools/new');
    await expect(makeWishlist).toHaveAttribute('href', '/wishlist');
  });

  test('how-it-works steps and maker note render', async ({ page }) => {
    await page.goto('/');
    for (const title of ['Start a pool', 'Invite the group', 'Give the gift']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
    await expect(page.getByText('— A note from the maker')).toBeVisible();
  });

  test('empty states when mocking no data', async ({ page }) => {
    await page.goto('/?mock=empty');
    await expect(
      page.getByRole('heading', { name: /Your wishlist is empty/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /No groups yet/i }),
    ).toBeVisible();
    await expect(page.getByTestId('empty-wishlist-cta')).toHaveAttribute(
      'href',
      '/wishlist',
    );
    await expect(page.getByTestId('empty-groups-cta')).toHaveAttribute(
      'href',
      '/groups/new',
    );
  });

  test('panels render with data when mocked', async ({ page }) => {
    await page.goto('/?mock=data');
    const birthdaysPanel = page.getByTestId('panel-birthdays');
    const activityPanel = page.getByTestId('panel-activity');
    await expect(birthdaysPanel).toBeVisible();
    await expect(activityPanel).toBeVisible();
    await expect(birthdaysPanel.getByRole('listitem').first()).toBeVisible();
    await expect(activityPanel.getByRole('listitem').first()).toBeVisible();
  });

  test('keyboard navigation focuses CTAs and footer links', async ({
    page,
  }) => {
    await page.goto('/');
    await page.keyboard.press('Tab'); // focus first focusable in page (likely logo)
    // Advance until primary CTA
    let attempts = 0;
    while (attempts++ < 10) {
      const active = await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.textContent || '',
      );
      if (active?.includes('Start a pool')) break;
      await page.keyboard.press('Tab');
    }
    const primaryActive = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.textContent || '',
    );
    expect(primaryActive).toContain('Start a pool');

    // Tab to a footer link (features section has no interactive links)
    while (attempts++ < 20) {
      const activeText = await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.textContent || '',
      );
      if (activeText?.includes('About')) break;
      await page.keyboard.press('Tab');
    }
    const linkActive = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.textContent || '',
    );
    expect(linkActive).toContain('About');
  });

  // Snapshot tests can be enabled later once baselines are established
  test.skip(
    true,
    'snapshots of hero at mobile and desktop (baselines not yet committed)',
  );
});

test.describe('Root route resilience', () => {
  test('POST / returns 405, not a 500', async ({ request }) => {
    // Bots and stale forms sometimes POST to `/`. The root action should
    // return a graceful 405 instead of letting React Router throw an
    // unhandled "no action" error (GIFTPOOL-UI-18, GIFTPOOL-UI-12).
    const response = await request.post('/');
    expect(response.status()).toBe(405);
  });

  test('GET / still returns 200', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);
  });
});
