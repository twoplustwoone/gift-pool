import { prisma } from '#app/utils/db.server.ts';
import { NOTIFICATION_TYPES } from '#app/utils/notification-catalog.ts';
import { DECISION_MODE, POOL_STATUS } from '#app/utils/pool-constants.ts';
import { createPool } from '#app/utils/pool.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import {
  expect,
  loginWithPassword,
  test,
  waitFor,
} from '#tests/playwright-utils.ts';

const connectUserRole = { connect: { name: 'user' } };

async function createAppUser(name: string) {
  const userData = createUser();
  const user = await prisma.user.create({
    select: { id: true, username: true },
    data: {
      ...userData,
      name,
      roles: connectUserRole,
      password: { create: createPassword(userData.username) },
    },
  });

  return { ...user, password: userData.username };
}

async function setupVotingPool() {
  const organizer = await createAppUser('Morgan Manager');
  const voter = await createAppUser('Private Recipient');
  const pool = await createPool({
    decisionMode: DECISION_MODE.VOTE,
    organizerId: organizer.id,
    recipientName: 'Riley',
    title: 'Riley Birthday Pool',
  });
  await prisma.pool.update({
    where: { id: pool.id },
    data: {
      status: POOL_STATUS.VOTING,
      contributors: { create: { userId: voter.id } },
    },
  });

  return { organizer, pool, voter };
}

test.describe('organizer reminders', () => {
  test('loads the eligible count on demand and queues a preset reminder', async ({
    page,
  }) => {
    const { organizer, pool, voter } = await setupVotingPool();
    let previewRequests = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'GET' &&
        request.url().includes(`/api/pools/${pool.id}/reminders`)
      ) {
        previewRequests += 1;
      }
    });

    try {
      await loginWithPassword(page, {
        username: organizer.username,
        password: organizer.password,
      });
      await page.goto(`/pools/${pool.id}`);

      const trigger = page.getByRole('button', { name: 'Remind voters' });
      await expect(trigger).toBeVisible();
      expect(previewRequests).toBe(0);

      await trigger.click();
      const dialog = page.getByRole('dialog');
      await expect(
        dialog.getByText('1 person can currently be notified.'),
      ).toBeVisible();
      expect(previewRequests).toBe(1);
      await expect(dialog).not.toContainText('Private Recipient');
      await expect(dialog).not.toContainText(voter.username);
      await expect(dialog).toContainText(
        'Individual notification preferences and delivery channels stay private.',
      );

      await dialog.getByRole('button', { name: 'Send reminder' }).click();
      await expect(
        dialog.getByRole('heading', { name: 'Reminder queued' }),
      ).toBeVisible();
      await expect(dialog).toContainText('Reminder queued for 1 person.');
      await dialog.getByRole('button', { name: 'Done' }).click();

      await expect(trigger).toBeDisabled();
      await expect(
        page.getByTestId('organizer-reminder-status-vote'),
      ).toContainText('Available again at');

      await waitFor(async () => {
        const notification = await prisma.notification.findFirst({
          where: {
            type: NOTIFICATION_TYPES.POOL_VOTE_REMINDER,
            userId: voter.id,
          },
          select: { id: true },
        });
        if (notification) return notification;
        throw new Error('Reminder notification has not been queued yet');
      });
    } finally {
      await prisma.pool.deleteMany({ where: { id: pool.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [organizer.id, voter.id] } },
      });
    }
  });

  test('uses a bottom sheet on a mobile viewport', async ({ page }) => {
    const { organizer, pool, voter } = await setupVotingPool();

    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await loginWithPassword(page, {
        username: organizer.username,
        password: organizer.password,
      });
      await page.goto(`/pools/${pool.id}`);
      await page.getByRole('button', { name: 'Remind voters' }).click();

      const dialog = page.getByRole('dialog');
      await expect(
        dialog.getByText('1 person can currently be notified.'),
      ).toBeVisible();
      await expect
        .poll(async () => {
          const box = await dialog.boundingBox();
          return Math.abs((box?.y ?? 0) + (box?.height ?? 0) - 844);
        })
        .toBeLessThan(3);
      const settledBox = await dialog.boundingBox();
      expect(settledBox?.width).toBeLessThanOrEqual(390);
    } finally {
      await prisma.pool.deleteMany({ where: { id: pool.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [organizer.id, voter.id] } },
      });
    }
  });
});
