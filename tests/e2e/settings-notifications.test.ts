import type { Page } from '@playwright/test';
import { prisma } from '#app/utils/db.server.ts';
import { NOTIFICATION_TYPES } from '#app/utils/notification-registry.ts';
import { expect, test, waitFor } from '#tests/playwright-utils.ts';

const dismissInstallPrompt = async (page: Page) => {
  const notNow = page.getByRole('button', { name: /not now/i });
  if ((await notNow.count()) > 0) {
    await notNow.click();
  }
};

const friendRequestReceivedType = NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED;
const friendRequestAcceptedType = NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED;

test('users can toggle individual notification channels', async ({
  page,
  login,
}) => {
  const user = await login();
  await page.goto('/settings/notifications');
   await dismissInstallPrompt(page);

  const receivedRow = page.getByRole('row', {
    name: /friend request received/i,
  });
  const receivedEmailToggle = receivedRow.getByRole('checkbox', {
    name: /enable email/i,
  });

  await expect(receivedEmailToggle).toBeChecked();
  await receivedEmailToggle.click();
  await page.reload();

  await waitFor(
    async () => {
      const updatedPreference =
        await prisma.userNotificationPreference.findUnique({
          where: {
            userId_type: {
              userId: user.id,
              type: friendRequestReceivedType,
            },
          },
          select: { emailEnabled: true },
        });
      if (updatedPreference?.emailEnabled !== false) {
        throw new Error('Preference not updated yet');
      }
      return updatedPreference;
    },
    { timeout: 8000 },
  );

  await page.reload();
  const finalRow = page.getByRole('row', {
    name: /friend request received/i,
  });
  const finalToggle = finalRow.getByRole('checkbox', {
    name: /enable email/i,
  });
  await expect(finalToggle).not.toBeChecked({ timeout: 10000 });
});

test('users can disable all email notifications at once', async ({
  page,
  login,
}) => {
  const user = await login();
  await page.goto('/settings/notifications');
  await dismissInstallPrompt(page);

  const friendActivityEmailToggles = page
    .getByRole('row', { name: /friend request (received|accepted)/i })
    .getByRole('checkbox', { name: /enable email/i });

  await expect(friendActivityEmailToggles.first()).toBeChecked();
  await expect(friendActivityEmailToggles.nth(1)).toBeChecked();

  await page
    .getByRole('button', { name: /turn off all email notifications/i })
    .click();

  await expect(friendActivityEmailToggles.first()).not.toBeChecked();
  await expect(friendActivityEmailToggles.nth(1)).not.toBeChecked();

  const updatedPreferences = await prisma.userNotificationPreference.findMany({
    where: {
      userId: user.id,
      type: {
        in: [friendRequestReceivedType, friendRequestAcceptedType],
      },
    },
    select: { type: true, emailEnabled: true },
  });

  expect(updatedPreferences).toHaveLength(2);
  for (const pref of updatedPreferences) {
    expect(pref.emailEnabled).toBe(false);
  }
});
