import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, loginWithPassword, test } from '#tests/playwright-utils.ts';

test.describe('navigation chrome', () => {
  test('top bar hides on downward scroll, returns on upward scroll, and bottom nav stays above content', async ({
    page,
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
      await loginWithPassword(page, {
        username: viewerData.username,
        password: viewerData.username,
      });
      await page.goto('/friends');

      const scrollArea = page.getByTestId('app-scroll-area');
      const topBar = page.getByTestId('top-bar');
      const friendRows = page.getByTestId('friend-row');

      await expect(topBar).toHaveAttribute('data-hidden', 'false');
      await expect(friendRows.first()).toBeVisible({ timeout: 10000 });

      // The hide/show listener attaches in a client useEffect — a single
      // scrollTo fired before hydration completes is lost forever (the
      // CI-only line-65 timeout). Re-drive the scroll gesture inside the
      // poll so a late listener catches a later iteration. Two rAFs between
      // positions force two distinct scroll events (a lone jump can coalesce
      // into a delta-0 no-op against the previous iteration's position).
      const scrollGesture = (from: number, to: number) =>
        scrollArea.evaluate(
          async (el, positions) => {
            el.scrollTop = positions.from;
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            el.scrollTop = positions.to;
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
          },
          { from, to },
        );

      await expect
        .poll(
          async () => {
            await scrollGesture(700, 900); // downward delta → hide
            return topBar.evaluate((node) => node.dataset.hidden);
          },
          { message: 'top bar should hide after scrolling down' },
        )
        .toBe('true');

      await expect
        .poll(
          async () => {
            await scrollGesture(900, 50); // upward delta → reveal
            return topBar.evaluate((node) => node.dataset.hidden);
          },
          { message: 'top bar should reappear after scrolling up' },
        )
        .toBe('false');

      // Measure both rects in ONE evaluate (project rule: separate awaited
      // boundingBox() calls get invalidated by hydration-driven layout
      // shifts like the PWA install banner) — and poll it, since the banner
      // can land mid-assertion.
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const rows = Array.from(
                document.querySelectorAll('[data-testid="friend-row"]'),
              );
              const last = rows[rows.length - 1] as HTMLElement | undefined;
              const nav = document.querySelector(
                '[data-testid="bottom-nav"]',
              ) as HTMLElement | null;
              if (!last || !nav) return Number.POSITIVE_INFINITY;
              last.scrollIntoView({ block: 'end' });
              return (
                last.getBoundingClientRect().bottom -
                nav.getBoundingClientRect().top
              );
            }),
          { message: 'bottom nav should sit below the last friend row' },
        )
        .toBeLessThanOrEqual(1);

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
