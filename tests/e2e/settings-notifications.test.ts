import { type Page } from '@playwright/test';
import { prisma } from '#app/utils/db.server.ts';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TOPICS,
} from '#app/utils/notification-catalog.ts';
import {
  expect,
  singleFetchActionBody,
  test,
  waitFor,
} from '#tests/playwright-utils.ts';

const dismissInstallPrompt = async (page: Page) => {
  const notNow = page.getByRole('button', { name: /not now/i });
  if ((await notNow.count()) > 0) {
    await notNow.click();
  }
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('users can optimistically toggle notification channels while request is pending', async ({
  page,
  login,
}) => {
  const user = await login();
  await page.goto('/settings/profile/notifications');
  await dismissInstallPrompt(page);

  await page.route('**/settings/profile/notifications*', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    const body = request.postData() ?? '';
    if (!body.includes('intent=toggle')) {
      await route.continue();
      return;
    }
    await wait(1200);
    await route.continue();
  });

  const receivedRow = page.getByRole('row', {
    name: /friend request received/i,
  });
  const receivedEmailToggle = receivedRow.getByRole('checkbox', {
    name: /enable email/i,
  });

  await expect(receivedEmailToggle).toBeChecked();
  await receivedEmailToggle.click();
  await expect(receivedEmailToggle).not.toBeChecked({ timeout: 600 });
  await expect(receivedEmailToggle).toBeDisabled();

  await waitFor(
    async () => {
      const updatedPreference =
        await prisma.notificationTopicPreference.findUnique({
          where: {
            userId_topic_channel: {
              userId: user.id,
              topic: NOTIFICATION_TOPICS.FRIEND_REQUESTS,
              channel: NOTIFICATION_CHANNELS.EMAIL,
            },
          },
          select: { enabled: true },
        });
      if (updatedPreference?.enabled !== false) {
        throw new Error('Preference not updated yet');
      }
      return updatedPreference;
    },
    { timeout: 8000 },
  );

  await expect(receivedEmailToggle).not.toBeDisabled();
  await page.reload();
  const finalRow = page.getByRole('row', {
    name: /friend request received/i,
  });
  const finalToggle = finalRow.getByRole('checkbox', {
    name: /enable email/i,
  });
  await expect(finalToggle).not.toBeChecked({ timeout: 10000 });

  await page.unroute('**/settings/profile/notifications');
});

test('failed toggle requests rollback optimistic notification channel updates', async ({
  page,
  login,
}) => {
  const user = await login();
  await page.goto('/settings/profile/notifications');
  await dismissInstallPrompt(page);

  await page.route('**/settings/profile/notifications*', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    const params = new URLSearchParams(request.postData() ?? '');
    if (params.get('intent') !== 'toggle') {
      await route.continue();
      return;
    }

    await wait(800);
    const { body, contentType } = await singleFetchActionBody({
      ok: false,
      requestId: params.get('requestId'),
    });
    await route.fulfill({ status: 200, contentType, body });
  });

  const receivedRow = page.getByRole('row', {
    name: /friend request received/i,
  });
  const receivedEmailToggle = receivedRow.getByRole('checkbox', {
    name: /enable email/i,
  });

  const initiallyChecked =
    (await receivedEmailToggle.getAttribute('aria-checked')) === 'true';

  const toggleResponse = page.waitForResponse((response) => {
    return (
      response.url().includes('/settings/profile/notifications') &&
      response.request().method() === 'POST'
    );
  });

  await receivedEmailToggle.click();
  await expect(receivedEmailToggle).toHaveAttribute(
    'aria-checked',
    initiallyChecked ? 'false' : 'true',
    { timeout: 500 },
  );
  await toggleResponse;
  await expect(receivedEmailToggle).not.toBeDisabled();
  await expect(receivedEmailToggle).toHaveAttribute(
    'aria-checked',
    initiallyChecked ? 'true' : 'false',
    { timeout: 3000 },
  );

  const unchangedPreference =
    await prisma.notificationTopicPreference.findUnique({
      where: {
        userId_topic_channel: {
          userId: user.id,
          topic: NOTIFICATION_TOPICS.FRIEND_REQUESTS,
          channel: NOTIFICATION_CHANNELS.EMAIL,
        },
      },
      select: { enabled: true },
    });
  expect(unchangedPreference?.enabled ?? true).toBe(initiallyChecked);

  await page.unroute('**/settings/profile/notifications*');
});

test('users can disable all email notifications at once', async ({
  page,
  login,
}) => {
  const user = await login();
  await page.goto('/settings/profile/notifications');
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

  const updatedPreference = await waitFor(
    async () => {
      const preference = await prisma.notificationChannelPreference.findUnique({
        where: {
          userId_channel: {
            userId: user.id,
            channel: NOTIFICATION_CHANNELS.EMAIL,
          },
        },
        select: { enabled: true },
      });

      if (preference?.enabled !== false) {
        throw new Error('Email channel gate not disabled yet');
      }

      return preference;
    },
    { timeout: 8000 },
  );

  expect(updatedPreference.enabled).toBe(false);
});
