import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, loginWithPassword, test } from '#tests/playwright-utils.ts';

// Covers the Phase 1 profile revamp: when viewing a friend's profile, the
// header, wishlist preview, and (when present) mutual strip all render with
// the new copy. Also exercises birthday visibility — a friend inside the
// BIRTHDAY_VISIBILITY_DAYS window should see the pill.

test('friend profile view shows header, birthday pill, wishlist preview, and outgoing friend gate copy', async ({
  page,
}) => {
  const createdUserIds: string[] = [];
  const viewerData = createUser();
  const friendData = createUser();
  const strangerData = createUser();

  // Put the friend's birthday ~30 days out so the pill is inside the
  // BIRTHDAY_VISIBILITY_DAYS window (60) regardless of today's date.
  const now = new Date();
  const upcoming = new Date(now);
  upcoming.setDate(upcoming.getDate() + 30);

  const [viewer, friend, stranger] = await Promise.all([
    prisma.user.create({
      select: { id: true, username: true },
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
        birthday: upcoming,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(friendData.username) },
      },
    }),
    prisma.user.create({
      select: { id: true, username: true, name: true },
      data: {
        ...strangerData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(strangerData.username) },
      },
    }),
  ]);
  createdUserIds.push(viewer.id, friend.id, stranger.id);

  // Make viewer ↔ friend friends so the profile is accessible.
  const pair =
    viewer.id < friend.id
      ? { userAId: viewer.id, userBId: friend.id }
      : { userAId: friend.id, userBId: viewer.id };
  await prisma.friendship.create({ data: pair });

  // Seed one wishlist item so the preview has content to render.
  await prisma.wishlistItem.create({
    data: {
      ownerId: friend.id,
      title: 'Vintage espresso machine',
      url: 'https://example.com/espresso',
      type: 'ITEM',
      status: 'ACTIVE',
      sortOrder: 0,
    },
  });

  try {
    await loginWithPassword(page, {
      username: viewerData.username,
      password: viewerData.username,
    });

    await page.goto(`/users/${friend.username}`);

    // Header: friend's display name as the page h1.
    await expect(
      page.getByRole('heading', { name: friend.name ?? friend.username }),
    ).toBeVisible();
    await expect(page.getByText(`@${friend.username}`)).toBeVisible();

    // Birthday pill visible (we set it 30 days out, inside the window).
    await expect(page.getByLabel(/^Birthday /i).first()).toBeVisible();

    // Wishlist preview card renders the seeded item.
    await expect(page.getByText('Vintage espresso machine')).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: `${friend.name ?? friend.username}'s wishlist`,
      }),
    ).toBeVisible();

    // Stranger profile should show the new NONE-state gate copy.
    await page.goto(`/users/${stranger.username}`);
    await expect(
      page.getByRole('heading', {
        name: new RegExp(
          `See ${stranger.name ?? stranger.username}'s profile`,
          'i',
        ),
      }),
    ).toBeVisible();
  } finally {
    await prisma.wishlistItem.deleteMany({ where: { ownerId: friend.id } });
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { userAId: viewer.id, userBId: friend.id },
          { userAId: friend.id, userBId: viewer.id },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
