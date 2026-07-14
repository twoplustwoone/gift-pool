import { type Locator, type Page } from '@playwright/test';
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

const getSwitchGeometry = async (toggle: Locator) => {
  return toggle.evaluate((element) => {
    const track = element.querySelector(':scope > span');
    const thumb = track?.querySelector(':scope > span');

    if (!(track instanceof HTMLElement) || !(thumb instanceof HTMLElement)) {
      throw new Error('Expected switch track and thumb elements');
    }

    const trackRect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();

    return {
      leftGap: thumbRect.left - trackRect.left,
      rightGap: trackRect.right - thumbRect.right,
    };
  });
};

test('notification switch thumb stays contained and reflects both states', async ({
  page,
  login,
}) => {
  await login();
  await page.goto('/settings/profile/notifications');
  await dismissInstallPrompt(page);

  const emailChannel = page.getByRole('switch', {
    name: 'Email notifications',
  });
  await expect(emailChannel).toBeChecked();

  const checkedGeometry = await getSwitchGeometry(emailChannel);
  expect(checkedGeometry.leftGap).toBeGreaterThan(0);
  expect(checkedGeometry.rightGap).toBeGreaterThan(0);
  expect(checkedGeometry.leftGap).toBeGreaterThan(checkedGeometry.rightGap);

  await emailChannel.click();
  await expect(emailChannel).not.toBeChecked();

  await expect
    .poll(async () => {
      const geometry = await getSwitchGeometry(emailChannel);
      return geometry.leftGap < geometry.rightGap;
    })
    .toBe(true);

  const uncheckedGeometry = await getSwitchGeometry(emailChannel);
  expect(uncheckedGeometry.leftGap).toBeGreaterThan(0);
  expect(uncheckedGeometry.rightGap).toBeGreaterThan(0);
  expect(uncheckedGeometry.leftGap).toBeLessThan(uncheckedGeometry.rightGap);
});

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
    if (!body.includes('intent=topic-channel')) {
      await route.continue();
      return;
    }
    await wait(1200);
    await route.continue();
  });

  const receivedEmailToggle = page.getByRole('switch', {
    name: 'Friend requests: Email',
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
  const finalToggle = page.getByRole('switch', {
    name: 'Friend requests: Email',
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
    if (params.get('intent') !== 'topic-channel') {
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

  const receivedEmailToggle = page.getByRole('switch', {
    name: 'Friend requests: Email',
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

test('users can disable the global email delivery channel', async ({
  page,
  login,
}) => {
  const user = await login();
  await page.goto('/settings/profile/notifications');
  await dismissInstallPrompt(page);

  const emailChannel = page.getByRole('switch', {
    name: 'Email notifications',
  });
  await expect(emailChannel).toBeChecked();
  await emailChannel.click();
  await expect(emailChannel).not.toBeChecked();

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
