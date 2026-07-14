import { randomUUID } from 'node:crypto';
import { prisma } from '#app/utils/db.server.ts';
import { expect, test } from '#tests/playwright-utils.ts';

test('a member can mute a group and see inherited pool awareness', async ({
  page,
  login,
}) => {
  const user = await login();
  const group = await prisma.giftGroup.create({
    data: {
      name: `Notification group ${randomUUID().slice(0, 8)}`,
      groupMembers: { create: { userId: user.id } },
    },
    select: { id: true, name: true },
  });
  const pool = await prisma.pool.create({
    data: {
      title: 'Inherited notification pool',
      organizerId: user.id,
      giftGroupId: group.id,
      contributors: { create: { userId: user.id } },
    },
    select: { id: true },
  });

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/groups/${group.id}`);
    await page
      .getByRole('button', {
        name: `Notifications for ${group.name}: Important`,
      })
      .click();
    await page.getByRole('radio', { name: /^Muted / }).click();
    await page.getByRole('button', { name: 'Close' }).click();

    await expect(page.getByText(`You muted ${group.name}`)).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: `Notifications for ${group.name}: Muted`,
      }),
    ).toBeVisible();

    await page.goto(`/pools/${pool.id}`);
    await expect(
      page.getByText('Notifications are muted by the group setting'),
    ).toBeVisible();
    await expect(
      page.getByText(
        `${group.name} is muted, so Inherited notification pool inherits that choice.`,
      ),
    ).toBeVisible();

    await page
      .getByRole('button', { name: 'Dismiss notification settings notice' })
      .click();
    await expect(
      page.getByText('Notifications are muted by the group setting'),
    ).toBeHidden();
    await page.reload();
    await expect(
      page.getByText('Notifications are muted by the group setting'),
    ).toBeHidden();
    await expect(
      page.getByRole('button', {
        name: 'Notifications for Inherited notification pool: Muted',
      }),
    ).toBeVisible();
  } finally {
    await prisma.pool.deleteMany({ where: { id: pool.id } });
    await prisma.giftGroup.deleteMany({ where: { id: group.id } });
  }
});
