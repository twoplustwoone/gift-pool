import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, test } from '#tests/playwright-utils.ts';

test('friend summary links navigate to the wishlist', async ({ page, login }) => {
  const createdUserIds: string[] = [];
  const viewerData = createUser();
  const friendData = createUser();

  const [viewer, friend] = await Promise.all([
    prisma.user.create({
      select: { id: true, username: true, name: true },
      data: {
        ...viewerData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(viewerData.username) },
      },
    }),
    prisma.user.create({
      select: { id: true, username: true, name: true },
      data: {
        ...friendData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(friendData.username) },
      },
    }),
  ]);

  createdUserIds.push(viewer.id, friend.id);

  const pair =
    viewer.id < friend.id
      ? { userAId: viewer.id, userBId: friend.id }
      : { userAId: friend.id, userBId: viewer.id };

  await prisma.friendship.create({ data: pair });

  try {
    await login({ id: viewer.id });
    await page.goto('/friends');

    const friendSummaryButton = page.getByRole('button', {
      name: new RegExp(friend.name!, 'i'),
    });
    await expect(friendSummaryButton).toBeVisible();
    await friendSummaryButton.click();

    await expect(page).toHaveURL(`/users/${friend.username}/wishlist`);
  } finally {
    await prisma.friendship.deleteMany({ where: { userAId: pair.userAId, userBId: pair.userBId } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
