import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, test } from '#tests/playwright-utils.ts';

test('friend cards open the profile, and the actions menu opens the wishlist', async ({
  page,
  login,
}) => {
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

    // The card itself goes to the profile.
    const friendCardLink = page.getByRole('link', {
      name: new RegExp(`View ${friend.name!}'s profile`, 'i'),
    });
    await expect(friendCardLink).toBeVisible();
    await expect(friendCardLink).toHaveAttribute(
      'href',
      `/users/${friend.username}`,
    );

    // The wishlist keeps a one-click path through the actions menu.
    await page
      .getByRole('button', { name: `Actions for ${friend.name}` })
      .click();
    await page.getByRole('menuitem', { name: /view wishlist/i }).click();
    await expect(page).toHaveURL(`/users/${friend.username}/wishlist`);

    await page.goto('/friends');
    await friendCardLink.click();
    await expect(page).toHaveURL(`/users/${friend.username}`);
  } finally {
    await prisma.friendship.deleteMany({
      where: { userAId: pair.userAId, userBId: pair.userBId },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
