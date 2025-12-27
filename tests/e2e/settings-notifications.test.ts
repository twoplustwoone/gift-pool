import { prisma } from '#app/utils/db.server.ts';
import { NOTIFICATION_TYPES } from '#app/utils/notification-registry.ts';
import { expect, test } from '#tests/playwright-utils.ts';

const friendRequestReceivedType = NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED;
const friendRequestAcceptedType = NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED;

test('users can toggle individual notification channels', async ({
  page,
  login,
}) => {
  const user = await login();
  await page.goto('/settings/notifications');

  const receivedRow = page.getByRole('row', {
    name: /friend request received/i,
  });
  const receivedEmailToggle = receivedRow.getByRole('checkbox', {
    name: /enable email/i,
  });

  await expect(receivedEmailToggle).toBeChecked();
  await receivedEmailToggle.click();
  await expect(receivedEmailToggle).not.toBeChecked();

  const updatedPreference = await prisma.userNotificationPreference.findUnique({
    where: {
      userId_type: {
        userId: user.id,
        type: friendRequestReceivedType,
      },
    },
    select: { emailEnabled: true },
  });

  expect(updatedPreference?.emailEnabled).toBe(false);
});

test('users can disable all email notifications at once', async ({
  page,
  login,
}) => {
  const user = await login();
  await page.goto('/settings/notifications');

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
