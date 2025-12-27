import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, test } from '#tests/playwright-utils.ts';

const connectUserRole = { connect: { name: 'user' } };

const createFriendship = async (userOneId: string, userTwoId: string) => {
  const [userAId, userBId] =
    userOneId < userTwoId ? [userOneId, userTwoId] : [userTwoId, userOneId];
  await prisma.friendship.create({ data: { userAId, userBId } });
};

test('public link renders read-only wishlist with claimed state visible', async ({
  page,
  login,
}) => {
  const createdUserIds: string[] = [];

  const ownerData = createUser();
  const friendData = createUser();

  const [owner, friend] = await Promise.all([
    prisma.user.create({
      select: { id: true, username: true, name: true },
      data: {
        ...ownerData,
        roles: connectUserRole,
        password: { create: createPassword(ownerData.username) },
      },
    }),
    prisma.user.create({
      select: { id: true, username: true },
      data: {
        ...friendData,
        roles: connectUserRole,
        password: { create: createPassword(friendData.username) },
      },
    }),
  ]);
  createdUserIds.push(owner.id, friend.id);

  await createFriendship(owner.id, friend.id);

  const claimedItem = await prisma.wishlistItem.create({
    select: { id: true, title: true },
    data: {
      ownerId: owner.id,
      title: 'Public Claimed Item',
      type: 'text',
      note: 'Should show claimed badge',
    },
  });
  const openItem = await prisma.wishlistItem.create({
    select: { id: true, title: true },
    data: {
      ownerId: owner.id,
      title: 'Public Open Item',
      type: 'text',
      note: 'Should remain open',
    },
  });

  try {
    await prisma.wishlistPurchase.create({
      data: { wishlistItemId: claimedItem.id, purchasedById: friend.id },
    });

    // Owner generates public link
    await login({ id: owner.id });
    await page.goto('/wishlist');
    await page.getByRole('button', { name: /share wishlist/i }).click();
    await page.getByRole('button', { name: /generate public link/i }).click();
    const publicLink = await page.getByRole('textbox').inputValue();

    // Anonymous viewer sees read-only list with accurate claimed status
    await page.context().clearCookies();
    await page.goto(publicLink);
    await expect(
      page.getByText(`${owner.name ?? owner.username}'s Wishlist`),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /add item/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /grab this gift/i }),
    ).toHaveCount(0);

    const claimedCard = page.getByRole('button', { name: claimedItem.title });
    await expect(claimedCard.getByText(/claimed/i).first()).toBeVisible();
    await expect(claimedCard.getByText(/already claimed/i).first()).toBeVisible();

    const openCard = page.getByRole('button', { name: openItem.title });
    await expect(openCard.getByText(/already claimed/i)).toHaveCount(0);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

test('revoking and regenerating public link rotates token and invalidates old link', async ({
  page,
  login,
}) => {
  const createdUserIds: string[] = [];
  const ownerData = createUser();
  const owner = await prisma.user.create({
    select: { id: true, username: true, name: true },
    data: {
      ...ownerData,
      roles: connectUserRole,
      password: { create: createPassword(ownerData.username) },
      wishlistItems: {
        create: [{ title: 'Rotate Link Item', type: 'text', note: 'Public view' }],
      },
    },
  });
  createdUserIds.push(owner.id);

  try {
    await login({ id: owner.id });
    await page.goto('/wishlist');
    await page.getByRole('button', { name: /share wishlist/i }).click();
    await page.getByRole('button', { name: /generate public link/i }).click();
    const firstLink = await page.getByRole('textbox').inputValue();

    await page.getByRole('button', { name: /^Revoke$/i }).click();
    await page.getByRole('button', { name: /revoke link/i }).click();
    await expect(page.getByText(/public link revoked/i)).toBeVisible();

    await page.context().clearCookies();
    await page.goto(firstLink);
    await expect(
      page.getByText(/public wishlist link not found or revoked/i),
    ).toBeVisible();

    await login({ id: owner.id });
    await page.goto('/wishlist');
    await page.getByRole('button', { name: /share wishlist/i }).click();
    await page.getByRole('button', { name: /generate public link/i }).click();
    const secondLinkField = page.getByRole('textbox');
    await expect(secondLinkField).not.toHaveValue(firstLink);
    const secondLink = await secondLinkField.inputValue();

    await page.context().clearCookies();
    await page.goto(secondLink);
    await expect(page.getByText(/rotate link item/i)).toBeVisible();
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
