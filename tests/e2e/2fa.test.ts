import { faker } from '@faker-js/faker';
import { prisma } from '#app/utils/db.server.ts';
import { generateTOTP } from '#app/utils/totp.server.ts';
import { expect, test } from '#tests/playwright-utils.ts';

test('Users can add 2FA to their account and use it when logging in', async ({
  page,
  login,
}) => {
  const password = faker.internet.password();
  const user = await login({ password });
  await page.goto('/settings/profile');

  await page.getByRole('link', { name: /enable 2fa/i }).click();

  await expect(page).toHaveURL(`/settings/profile/two-factor`);
  const main = page.getByRole('main');
  await main.getByRole('button', { name: /enable 2fa/i }).click();
  const otpUriString = await main
    .getByLabel(/One-Time Password URI/i)
    .innerText();

  const otpUri = new URL(otpUriString);
  const options = Object.fromEntries(otpUri.searchParams);

  await main
    .getByRole('textbox', { name: /code/i })
    .fill(generateTOTP(options).otp);
  await main.getByRole('button', { name: /submit/i }).click();

  await expect(main).toHaveText(/You have enabled two-factor authentication./i);
  await expect(main.getByRole('link', { name: /disable 2fa/i })).toBeVisible();

  await page.getByRole('link', { name: user.name ?? user.username }).click();
  await page.getByRole('menuitem', { name: /log out/i }).click();
  await expect(page).toHaveURL(`/`);

  await page.goto('/login');
  await expect(page).toHaveURL(`/login`);
  await page.getByRole('textbox', { name: /username/i }).fill(user.username);
  await page.getByRole('textbox', { name: /password/i }).fill(password);
  await page.getByRole('button', { name: /log in/i }).click();

  // The /verify 2FA challenge auto-submits once the sixth digit lands.
  await page
    .getByRole('textbox', { name: /code/i })
    .fill(generateTOTP(options).otp);

  await expect(
    page.getByRole('link', { name: user.name ?? user.username }),
  ).toBeVisible();
});

test('Users can disable 2FA after enabling it', async ({ page, login }) => {
  const password = faker.internet.password();
  const user = await login({ password });

  // ── Enable 2FA first so we have something to disable. We don't re-verify
  // the whole enable flow here — that's what the sibling test is for — so
  // the assertions only cover the disable path.
  await page.goto('/settings/profile/two-factor');
  const main = page.getByRole('main');
  await main.getByRole('button', { name: /enable 2fa/i }).click();
  const otpUriString = await main
    .getByLabel(/One-Time Password URI/i)
    .innerText();
  const options = Object.fromEntries(new URL(otpUriString).searchParams);
  await main
    .getByRole('textbox', { name: /code/i })
    .fill(generateTOTP(options).otp);
  await main.getByRole('button', { name: /submit/i }).click();
  await expect(main).toHaveText(/You have enabled two-factor authentication./i);

  // ── Navigate to the disable sub-route via the visible link on the 2FA
  // landing page, exercising the real entry point users take.
  await main.getByRole('link', { name: /disable 2fa/i }).click();

  // ── Disabling 2FA requires a recent verification — the initial enable
  // verify doesn't count, so we get bounced to /verify first. Re-enter the
  // TOTP, then the disable page loads for real.
  await expect(page).toHaveURL(/\/verify\?type=2fa/);
  // The /verify 2FA challenge auto-submits once the sixth digit lands.
  await page
    .getByRole('textbox', { name: /code/i })
    .fill(generateTOTP(options).otp);
  await expect(page).toHaveURL(/\/settings\/profile\/two-factor\/disable$/);

  // ── useDoubleCheck gates the action button: first click flips the label
  // to "Are you sure?", second click submits. Verify both transitions.
  const disableButton = main.getByRole('button', { name: /disable 2fa/i });
  await expect(disableButton).toBeVisible();
  await disableButton.click();

  const confirmButton = main.getByRole('button', { name: /are you sure/i });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();

  // ── On success we get redirected back to the 2FA landing page with a
  // toast, and the main content should flip back to the "not enabled" copy.
  await expect(page).toHaveURL(/\/settings\/profile\/two-factor$/);
  await expect(
    main.getByRole('button', { name: /enable 2fa/i }),
  ).toBeVisible();
  await expect(
    main.getByRole('link', { name: /disable 2fa/i }),
  ).toHaveCount(0);

  // ── Double-check at the data layer: the verification row should be gone.
  const verificationRow = await prisma.verification.findUnique({
    where: {
      target_type: { type: '2fa', target: user.id },
    },
  });
  expect(verificationRow).toBeNull();
});
