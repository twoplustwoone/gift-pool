/**
 * The app's layout invariants at phone width.
 *
 * Three structural defects produced the reported symptoms, and each one is
 * pinned here because none of them is visible in a unit test:
 *
 *  1. Section layouts put the page in a grid/flex child at its default
 *     `min-width: auto`, so a `truncate` page header's min-content width
 *     propagated all the way up and made the page 644px wide in a 390px
 *     viewport. The header text ran off the screen and the page scrolled
 *     sideways — and `truncate` never truncated, because its container was
 *     free to grow.
 *  2. Section and detail layouts each declared their own
 *     `h-full … overflow-y-auto`, nesting up to three scroll containers
 *     inside the app's single scroll area. Where that percentage height
 *     resolved, the page became a short box that scrolled internally, which
 *     is what clipped the form.
 *  3. Root's own wrapper used `min-h-full` against a padded flex parent,
 *     where it never resolved, so the footer floated mid-screen on any page
 *     shorter than the viewport.
 */
import { getPasswordHash } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createExchange } from '#app/utils/exchanges.server.ts';
import { createUser } from '#tests/db-utils.ts';
import { expect, loginWithPassword, test } from '#tests/playwright-utils.ts';

const PHONE = { width: 390, height: 844 };

// Seeds its own user rather than using the `login` fixture: that fixture
// deletes its user in teardown, and a user who owns a group cannot be deleted
// while the membership row exists (see account-deletion.server.ts). Same
// approach as tests/e2e/exchanges.test.ts.
async function seedUser(name: string) {
  const userData = createUser();
  const password = userData.username;
  const user = await prisma.user.create({
    select: { id: true, username: true },
    data: {
      ...userData,
      name,
      roles: { connect: { name: 'user' } },
      password: { create: { hash: await getPasswordHash(password) } },
    },
  });
  return { ...user, password };
}

type Probe = {
  mains: number;
  overflowsX: boolean;
  widest: number;
  nestedScrollers: number;
};

async function probe(page: import('@playwright/test').Page): Promise<Probe> {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('main')!;
    const widest = [...document.querySelectorAll<HTMLElement>('main *')]
      .map((el) => el.getBoundingClientRect().width)
      .reduce((a, b) => Math.max(a, b), 0);
    const nested = [...document.querySelectorAll<HTMLElement>('main *')].filter(
      (el) => {
        const cs = getComputedStyle(el);
        return ['auto', 'scroll'].includes(cs.overflowY);
      },
    );
    return {
      mains: document.querySelectorAll('main').length,
      overflowsX: main.scrollWidth > main.clientWidth,
      widest: Math.round(widest),
      nestedScrollers: nested.length,
    };
  });
}

test.describe('mobile layout', () => {
  let user: Awaited<ReturnType<typeof seedUser>>;
  let groupId: string;
  let exchangeId: string;

  test.beforeAll(async () => {
    user = await seedUser('Francisco Layout');
    const group = await prisma.giftGroup.create({
      select: { id: true },
      data: {
        name: 'Los pintados layout',
        groupMembers: { create: [{ userId: user.id, role: 'OWNER' }] },
      },
    });
    groupId = group.id;
    const exchange = await createExchange({
      organizerId: user.id,
      title: 'Los pintados layout 2026',
      eventDate: new Date(Date.now() + 30 * 864e5),
      giftGroupId: groupId,
    });
    exchangeId = exchange.id;
  });

  test.afterAll(async () => {
    await prisma.exchange.delete({ where: { id: exchangeId } }).catch(() => {});
    await prisma.giftGroup.delete({ where: { id: groupId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: user.id } }).catch(() => {});
  });

  test('no page is wider than the phone, and none scrolls inside itself', async ({
    page,
  }) => {
    await loginWithPassword(page, {
      username: user.username,
      password: user.password,
    });
    await page.setViewportSize(PHONE);

    // One page from each section layout, plus the detail layouts, plus the
    // page that actually broke: a long header subtitle with no group.
    const urls = [
      '/exchanges/new?standalone=1',
      '/exchanges/new',
      `/exchanges/${exchangeId}`,
      '/exchanges',
      '/pools',
      '/groups',
      `/groups/${groupId}`,
      '/wishlist',
    ];

    for (const url of urls) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const result = await probe(page);
      expect(result, `${url} should have one main`).toMatchObject({ mains: 1 });
      expect(result.overflowsX, `${url} overflows horizontally`).toBe(false);
      expect(
        result.widest,
        `${url} has an element wider than the phone`,
      ).toBeLessThanOrEqual(PHONE.width);
      expect(
        result.nestedScrollers,
        `${url} nests a scroll container inside main`,
      ).toBe(0);
    }
  });

  test('a long form is reachable to its last control', async ({ page }) => {
    await loginWithPassword(page, {
      username: user.username,
      password: user.password,
    });
    await page.setViewportSize(PHONE);
    await page.goto('/exchanges/new?standalone=1');
    await page.waitForLoadState('networkidle');

    // The symptom was a form clipped partway down with no way to reach the
    // rest of it.
    const submit = page.getByRole('button', { name: /Save and get a link/i });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeVisible();
  });

  test('the footer sits at the bottom on a page shorter than the screen', async ({
    page,
  }) => {
    await loginWithPassword(page, {
      username: user.username,
      password: user.password,
    });
    await page.setViewportSize(PHONE);
    await page.goto('/exchanges');
    await page.waitForLoadState('networkidle');

    const { footerBottom, contentBottom, scrolls } = await page.evaluate(() => {
      const area = document.querySelector<HTMLElement>(
        '[data-testid="app-scroll-area"]',
      )!;
      const footer = document.querySelector('footer')!;
      const rect = area.getBoundingClientRect();
      // The area reserves room for the bottom nav, so the footer belongs at
      // the bottom of its CONTENT box, not of its border box.
      const padBottom = parseFloat(getComputedStyle(area).paddingBottom) || 0;
      return {
        footerBottom: Math.round(footer.getBoundingClientRect().bottom),
        contentBottom: Math.round(rect.bottom - padBottom),
        scrolls: area.scrollHeight > area.clientHeight,
      };
    });
    expect(scrolls, 'this page should be shorter than the screen').toBe(false);
    // At the bottom, rather than floating directly under the content.
    expect(Math.abs(footerBottom - contentBottom)).toBeLessThanOrEqual(1);
  });
});
