import { invariant } from '@epic-web/invariant';
import { faker } from '@faker-js/faker';
import  { type Page } from '@playwright/test';
import { verifyUserPassword } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { readEmail } from '#tests/mocks/utils.ts';
import { expect, test, createUser, waitFor } from '#tests/playwright-utils.ts';

const CODE_REGEX = /Here's your verification code: (?<code>\d+)/;

const dismissInstallPrompt = async (page: Page) => {
  const notNow = page.getByRole('button', { name: /not now/i });
  if ((await notNow.count()) > 0) {
    await notNow.click();
  }
};

test('Users can update their basic info', async ({ page, login }) => {
  await login();
  await page.goto('/settings/profile');
  await dismissInstallPrompt(page);

  const newUserData = createUser();

  await page.getByRole('textbox', { name: /^name/i }).fill(newUserData.name);
  await page
    .getByRole('textbox', { name: /^username/i })
    .fill(newUserData.username);

  await page.getByRole('button', { name: /^save/i }).click();
});

test('Users can update their password', async ({ page, login }) => {
  const oldPassword = faker.internet.password();
  const newPassword = faker.internet.password();
  const user = await login({ password: oldPassword });
  await page.goto('/settings/profile');
  await dismissInstallPrompt(page);

  await page.getByRole('link', { name: /change password/i }).click();

  await page
    .getByRole('textbox', { name: /^current password/i })
    .fill(oldPassword);
  await page.getByRole('textbox', { name: /^new password/i }).fill(newPassword);
  await page
    .getByRole('textbox', { name: /^confirm new password/i })
    .fill(newPassword);

  await page.getByRole('button', { name: /^change password/i }).click();

  await expect(page).toHaveURL(`/settings/profile`);

  const { username } = user;
  expect(
    await verifyUserPassword({ username }, oldPassword),
    'Old password still works',
  ).toBeNull();
  expect(
    await verifyUserPassword({ username }, newPassword),
    'New password does not work',
  ).toEqual({ id: user.id });
});

test('Profile photo sheet opens inline from the avatar', async ({
  page,
  login,
}) => {
  await login();
  await page.goto('/settings/profile');
  await dismissInstallPrompt(page);

  // Open the photo sheet from the avatar button in the Profile card.
  await page.getByRole('button', { name: /change profile photo/i }).click();

  const dialog = page.getByRole('dialog', { name: /profile photo/i });
  await expect(dialog).toBeVisible();

  // Save is disabled until a file is picked.
  await expect(
    dialog.getByRole('button', { name: /save photo/i }),
  ).toBeDisabled();

  // The file picker input is labeled and in the DOM so users can pick an
  // image. We deliberately don't exercise the full upload round-trip here —
  // the actual write is covered by the action-only resource route tests.
  await expect(dialog.getByLabel(/change photo/i)).toBeAttached();

  // Cancel closes the sheet.
  await dialog.getByRole('button', { name: /cancel/i }).click();
  await expect(dialog).not.toBeVisible();
});

test('Delete data dialog requires typing the username to enable the button', async ({
  page,
  login,
}) => {
  const user = await login();
  await page.goto('/settings/profile');
  await dismissInstallPrompt(page);

  await page.getByRole('button', { name: /delete all your data/i }).click();

  const dialog = page.getByRole('dialog', { name: /delete your account/i });
  await expect(dialog).toBeVisible();

  const confirmButton = dialog.getByRole('button', {
    name: /delete my account/i,
  });
  await expect(confirmButton).toBeDisabled();

  // Wrong value leaves button disabled.
  const input = dialog.getByRole('textbox');
  await input.fill('not-the-username');
  await expect(confirmButton).toBeDisabled();

  // Correct username enables it.
  await input.fill(user.username);
  await expect(confirmButton).toBeEnabled();

  // Don't actually submit — verifying the gate is enough. Cancel out.
  await dialog.getByRole('button', { name: /cancel/i }).click();
  await expect(dialog).not.toBeVisible();
});

test('Users can change their email address', async ({ page, login }) => {
  const preUpdateUser = await login();
  const newEmailAddress = faker.internet.email().toLowerCase();
  expect(preUpdateUser.email).not.toEqual(newEmailAddress);
  await page.goto('/settings/profile');
  await page.getByRole('link', { name: /change email/i }).click();
  await page.getByRole('textbox', { name: /new email/i }).fill(newEmailAddress);
  await page.getByRole('button', { name: /send confirmation/i }).click();
  await expect(page.getByText(/check your email/i)).toBeVisible();
  const email = await waitFor(() => readEmail(newEmailAddress), {
    errorMessage: 'Confirmation email was not sent',
  });
  invariant(email, 'Email was not sent');
  const codeMatch = email.text.match(CODE_REGEX);
  const code = codeMatch?.groups?.code;
  invariant(code, 'Onboarding code not found');
  // The verify form auto-submits once the sixth digit lands — no Submit click.
  await page.getByRole('textbox', { name: /code/i }).fill(code);
  await expect(page.getByText(/email changed/i)).toBeVisible();

  const updatedUser = await prisma.user.findUnique({
    where: { id: preUpdateUser.id },
    select: { email: true },
  });
  invariant(updatedUser, 'Updated user not found');
  expect(updatedUser.email).toBe(newEmailAddress);
  const noticeEmail = await waitFor(() => readEmail(preUpdateUser.email), {
    errorMessage: 'Notice email was not sent',
  });
  expect(noticeEmail.subject).toContain('changed');
});
