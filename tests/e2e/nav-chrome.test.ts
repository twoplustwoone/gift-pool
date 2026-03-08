import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, test } from '#tests/playwright-utils.ts';

test.describe('navigation chrome', () => {
  test('top bar hides on downward scroll, returns on upward scroll, and bottom nav stays above content', async ({
    page,
    login,
  }) => {
    // Use a mobile-ish viewport so the bottom nav is visible
    await page.setViewportSize({ width: 430, height: 900 });

    const viewerData = createUser();
    const friendsData = Array.from({ length: 60 }, () => createUser());

    const viewer = await prisma.user.create({
      select: { id: true, username: true },
      data: {
        ...viewerData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(viewerData.username) },
      },
    });

    const friends = await Promise.all(
      friendsData.map((friend) =>
        prisma.user.create({
          select: { id: true, username: true },
          data: {
            ...friend,
            roles: { connect: { name: 'user' } },
            password: { create: createPassword(friend.username) },
          },
        }),
      ),
    );

    await prisma.friendship.createMany({
      data: friends.map((friend) =>
        viewer.id < friend.id
          ? { userAId: viewer.id, userBId: friend.id }
          : { userAId: friend.id, userBId: viewer.id },
      ),
    });

    try {
      await login({ id: viewer.id });
      await page.goto('/friends');

      const scrollArea = page.getByTestId('app-scroll-area');
      const topBar = page.getByTestId('top-bar');

      await expect(topBar).toHaveAttribute('data-hidden', 'false');

      await scrollArea.evaluate((el) =>
        el.scrollTo({ top: 900, behavior: 'auto' }),
      );
      await expect
        .poll(async () => topBar.getAttribute('data-hidden'), {
          message: 'top bar should hide after scrolling down',
        })
        .toBe('true');

      await scrollArea.evaluate((el) =>
        el.scrollTo({ top: 50, behavior: 'auto' }),
      );
      await expect
        .poll(async () => topBar.getAttribute('data-hidden'), {
          message: 'top bar should reappear after scrolling up',
        })
        .toBe('false');

      const friendRows = page.getByTestId('friend-row');
      await expect(friendRows.first()).toBeVisible({ timeout: 10000 });
      await friendRows.last().scrollIntoViewIfNeeded();

      const nav = page.getByTestId('bottom-nav');
      const [navBox, lastFriendBox] = await Promise.all([
        nav.boundingBox(),
        friendRows.last().boundingBox(),
      ]);

      expect(navBox).not.toBeNull();
      expect(lastFriendBox).not.toBeNull();

      if (navBox && lastFriendBox) {
        const navTop = navBox.y;
        const friendBottom = lastFriendBox.y + lastFriendBox.height;
        expect(friendBottom - navTop).toBeLessThanOrEqual(1);
      }

      // Scroll deep, navigate away, and confirm scroll resets to top
      await scrollArea.evaluate((el) =>
        el.scrollTo({ top: 1200, behavior: 'auto' }),
      );
      const homeLink = page.getByRole('link', { name: /^home$/i });
      await homeLink.click();
      await expect(page).toHaveURL(/\/($|friends)/);
      await expect
        .poll(
          () =>
            page.getByTestId('app-scroll-area').evaluate((el) => {
              const anyEl = el as HTMLElement | null;
              return anyEl ? anyEl.scrollTop : 0;
            }),
          { message: 'scroll position should reset on navigation' },
        )
        .toBe(0);
    } finally {
      await prisma.friendship.deleteMany({
        where: {
          OR: [
            { userAId: viewer.id },
            { userBId: viewer.id },
            { userAId: { in: friends.map((f) => f.id) } },
            { userBId: { in: friends.map((f) => f.id) } },
          ],
        },
      });
      await prisma.user.deleteMany({
        where: { id: { in: friends.map((f) => f.id) } },
      });
      await prisma.user.delete({ where: { id: viewer.id } }).catch(() => {});
    }
  });
});
