import { expect, test } from '@playwright/test';

test.describe('Home page', () => {
  test('hero headline visible on mobile and desktop', async ({ page, browserName: _browserName }) => {
    await page.goto('/');

    const hero = page.getByRole('heading', { name: /Group gifting, simplified\./i });
    await expect(hero).toBeVisible();

    // Mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(hero).toBeInViewport();

    // Desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(hero).toBeInViewport();
  });

  test('CTAs render and point to correct routes', async ({ page }) => {
    await page.goto('/');
    const createWishlist = page.getByTestId('home-cta-wishlist');
    const startGroup = page.getByTestId('home-cta-group');
    await expect(createWishlist).toBeVisible();
    await expect(startGroup).toBeVisible();

    // Verify target hrefs without requiring auth for navigation
    await expect(createWishlist).toHaveAttribute('href', '/wishlist');
    await expect(startGroup).toHaveAttribute('href', '/groups/new');
  });

  test('features render 3–4 items', async ({ page }) => {
    await page.goto('/');
    const features = [
      'Wishlists made simple',
      'Gift groups',
      'Contribution limits',
      'Reminders',
    ];
    for (const title of features) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
  });

  test('panels render empty messages when mocked without data', async ({ page }) => {
    await page.goto('/?mock=empty');
    const birthdaysPanel = page.getByTestId('panel-birthdays');
    const activityPanel = page.getByTestId('panel-activity');
    await expect(birthdaysPanel).toBeVisible();
    await expect(activityPanel).toBeVisible();
    await expect(birthdaysPanel.getByText(/No upcoming birthdays/i)).toBeVisible();
    await expect(activityPanel.getByText(/Nothing new yet/i)).toBeVisible();
  });

  test('panels render with data when mocked', async ({ page }) => {
    await page.goto('/?mock=data');
    const birthdaysPanel = page.getByTestId('panel-birthdays');
    const activityPanel = page.getByTestId('panel-activity');
    await expect(birthdaysPanel).toBeVisible();
    await expect(activityPanel).toBeVisible();
    await expect(birthdaysPanel.getByRole('listitem').first()).toBeVisible();
    await expect(activityPanel.getByRole('listitem').first()).toBeVisible();
    await expect(page.getByTestId('plan-gift-u_mock_1')).toHaveAttribute('href', '/groups/g_mock_1');
  });

  test('keyboard navigation focuses CTAs and plan gift', async ({ page }) => {
    await page.goto('/?mock=data');
    await page.keyboard.press('Tab'); // focus first focusable in page (likely logo)
    // Advance until primary CTA
    let attempts = 0;
    while (attempts++ < 20) {
      const active = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent || '');
      if (active?.includes('Create Your Wishlist')) break;
      await page.keyboard.press('Tab');
    }
    const primaryActive = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent || '');
    expect(primaryActive).toContain('Create Your Wishlist');

    // Tab to plan gift button
    while (attempts++ < 40) {
      const activeText = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent || '');
      if (activeText?.includes('Plan gift')) break;
      await page.keyboard.press('Tab');
    }
    const linkActive = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent || '');
    expect(linkActive).toContain('Plan gift');
  });

  // Snapshot tests can be enabled later once baselines are established
  test.skip(true, 'snapshots of hero at mobile and desktop (baselines not yet committed)');
});
