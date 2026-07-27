import  { type Page } from '@playwright/test';
import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, test } from '#tests/playwright-utils.ts';

const connectUserRole = { connect: { name: 'user' } };

const createFriendship = async (userOneId: string, userTwoId: string) => {
  const [userAId, userBId] =
    userOneId < userTwoId ? [userOneId, userTwoId] : [userTwoId, userOneId];
  await prisma.friendship.create({ data: { userAId, userBId } });
};

const dismissInstallPrompt = async (page: Page) => {
  const notNow = page.getByRole('button', { name: /not now/i });
  if ((await notNow.count()) > 0) {
    await notNow.click();
  }
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
      sortOrder: 0,
    },
  });
  const openItem = await prisma.wishlistItem.create({
    select: { id: true, title: true },
    data: {
      ownerId: owner.id,
      title: 'Public Open Item',
      type: 'text',
      note: 'Should remain open',
      sortOrder: 1,
    },
  });

  try {
    await prisma.wishlistClaim.create({
      data: { wishlistItemId: claimedItem.id, claimedByUserId: friend.id },
    });

    // Owner generates public link
    await login({ id: owner.id });
    await page.goto('/wishlist');
    await dismissInstallPrompt(page);
    await page.getByRole('button', { name: /share wishlist/i }).click();
    await page.getByRole('button', { name: /generate public link/i }).click();
    const publicLink = await page.getByRole('textbox').inputValue();

    // Anonymous viewer sees read-only list with accurate claimed status
    await page.context().clearCookies();
    await page.goto(publicLink);
    await expect(
      page.getByText(`${owner.name ?? owner.username}'s Wishlist`),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /add item/i })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: /grab this gift/i }),
    ).toHaveCount(0);

    // Scope by the outer card testid — the row "button" is an empty
    // absolute click-catcher (aria-label only), so getByText inside it
    // can't find the claim pill.
    const claimedCard = page
      .getByTestId('wishlist-item-card')
      .filter({ hasText: claimedItem.title });
    await expect(claimedCard.getByText('Claimed').first()).toBeVisible();

    const openCard = page
      .getByTestId('wishlist-item-card')
      .filter({ hasText: openItem.title });
    await expect(openCard.getByText('Claimed')).toHaveCount(0);
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
        create: [
          {
            title: 'Rotate Link Item',
            type: 'text',
            note: 'Public view',
            sortOrder: 0,
          },
        ],
      },
    },
  });
  createdUserIds.push(owner.id);

  try {
    await login({ id: owner.id });
    await page.goto('/wishlist', { waitUntil: 'domcontentloaded' });
    await dismissInstallPrompt(page);
    const base = new URL(page.url()).origin;
    const firstResponse = await page.request.post('/wishlist/share', {
      form: { intent: 'generate-public-link' },
    });
    const firstData = await firstResponse.json();
    const firstToken = firstData.publicShare?.token as string | undefined;
    expect(firstToken).toBeTruthy();
    const firstLink = `${base}/w/public/${firstToken}`;

    await page.request.post('/wishlist/share', {
      form: { intent: 'revoke-public-link' },
    });

    await page.context().clearCookies();
    await page.goto(firstLink);
    await expect(
      page.getByText(/public wishlist link not found or revoked/i),
    ).toBeVisible();

    await login({ id: owner.id });
    await page.goto('/wishlist', { waitUntil: 'domcontentloaded' });
    await dismissInstallPrompt(page);
    const secondResponse = await page.request.post('/wishlist/share', {
      form: { intent: 'generate-public-link' },
    });
    const secondData = await secondResponse.json();
    const secondToken = secondData.publicShare?.token as string | undefined;
    expect(secondToken).toBeTruthy();
    expect(secondToken).not.toEqual(firstToken);
    const secondLink = `${base}/w/public/${secondToken}`;

    await page.context().clearCookies();
    await page.goto(secondLink);
    await expect(page.getByText(/rotate link item/i)).toBeVisible();
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
