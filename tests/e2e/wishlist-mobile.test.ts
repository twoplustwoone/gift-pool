import { expect, test } from '#tests/playwright-utils.ts';

test.describe('wishlist mobile experience', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('body scroll is restored after closing the add-item sheet', async ({
    page,
    login,
  }) => {
    await login();

    await page.goto('/wishlist');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /^Add Item$/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel('Title').fill('Mobile Overflow Check');
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);

    const inlineOverflow = await page.evaluate(() => document.body.style.overflow);
    const inlinePaddingRight = await page.evaluate(
      () => document.body.style.paddingRight,
    );

    expect(inlineOverflow).toBe('');
    expect(inlinePaddingRight).toBe('');

    const { reachedBottom, mainOverflowY } = await page.evaluate(() => {
      const main = document.querySelector('main');
      const overflowY = main ? getComputedStyle(main).overflowY : '';

      window.scrollTo(0, document.documentElement.scrollHeight);
      const atBottom =
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 1;

      return { reachedBottom: atBottom, mainOverflowY: overflowY };
    });

    expect(reachedBottom).toBe(true);
    expect(mainOverflowY).not.toBe('auto');
  });
});
