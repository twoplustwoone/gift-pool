import { type Page } from '@playwright/test';
import { prisma } from '#app/utils/db.server.ts';
import { expect, test, waitFor } from '#tests/playwright-utils.ts';

const dismissInstallPrompt = async (page: Page) => {
  const notNow = page.getByRole('button', { name: /not now/i });
  if ((await notNow.count()) > 0) {
    await notNow.click();
  }
};

test('an anonymous visitor can submit feedback from the support page', async ({
  page,
}) => {
  const message =
    'The invite link 404s when I open it on Safari — playwright check.';

  await page.goto('/support');
  await dismissInstallPrompt(page);

  // Default type is Bug; pick "Idea" to exercise the type control.
  await page.getByText('Idea', { exact: true }).click();
  await page.getByRole('textbox', { name: /your message/i }).fill(message);
  await page
    .getByRole('textbox', { name: /your email/i })
    .fill('visitor@example.com');

  await page.getByRole('button', { name: /send feedback/i }).click();

  await expect(page.getByText(/thanks for the feedback/i)).toBeVisible();

  await waitFor(async () => {
    const row = await prisma.feedback.findFirst({ where: { message } });
    expect(row).not.toBeNull();
    expect(row?.type).toBe('FEATURE');
    expect(row?.email).toBe('visitor@example.com');
    expect(row?.userId).toBeNull();
    return row;
  });
});

test('a logged-in user can submit feedback from the global widget', async ({
  page,
  login,
}) => {
  const user = await login();
  const message = 'Could we get dark mode on the pool page — playwright check.';

  await page.goto('/');
  await dismissInstallPrompt(page);

  await page.getByRole('button', { name: /give feedback/i }).click();

  // Widget dialog — no email field for authenticated users.
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: /your email/i }),
  ).toHaveCount(0);

  await page.getByRole('textbox', { name: /your message/i }).fill(message);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /send feedback/i })
    .click();

  await expect(page.getByText(/thanks for the feedback/i)).toBeVisible();

  // Scope the lookup to this attempt's freshly-created user, NOT the shared
  // message. On retry, the `login` fixture has deleted the prior attempt's
  // user, and Feedback.userId is onDelete:SetNull — so a message-based query
  // would match that prior row with its userId nulled out. Querying by userId
  // matches only this attempt's row.
  await waitFor(async () => {
    const row = await prisma.feedback.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).not.toBeNull();
    expect(row?.message).toBe(message);
    return row;
  });
});
