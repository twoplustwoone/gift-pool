/**
 * The exchange core loop through a real browser, and the secrecy boundary at
 * the server boundary: what each role's loader payload actually contains.
 */
import { getPasswordHash } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  createExchange,
  setParticipation,
} from '#app/utils/exchanges.server.ts';
import { createUser } from '#tests/db-utils.ts';
import { expect, loginWithPassword, test } from '#tests/playwright-utils.ts';

type SeededUser = {
  id: string;
  username: string;
  name: string;
  password: string;
};

async function seedUser(name: string): Promise<SeededUser> {
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
  return { ...user, name, password };
}

test.describe('exchanges', () => {
  let organizer: SeededUser;
  let a: SeededUser;
  let b: SeededUser;
  let bystander: SeededUser;
  let groupId: string;
  let exchangeId: string;

  test.beforeAll(async () => {
    [organizer, a, b, bystander] = await Promise.all([
      seedUser('Francisco Organizer'),
      seedUser('Nicolas Posse'),
      seedUser('Agustin Luque'),
      seedUser('Juan Bystander'),
    ]);
    const group = await prisma.giftGroup.create({
      select: { id: true },
      data: {
        name: 'The Painted e2e',
        groupMembers: {
          create: [
            { userId: organizer.id, role: 'OWNER' },
            { userId: a.id, role: 'MEMBER' },
            { userId: b.id, role: 'MEMBER' },
            { userId: bystander.id, role: 'MEMBER' },
          ],
        },
      },
    });
    groupId = group.id;
    const exchange = await createExchange({
      organizerId: organizer.id,
      title: 'The Painted e2e 2026',
      eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      giftGroupId: groupId,
    });
    exchangeId = exchange.id;
    await setParticipation({ exchangeId, userId: a.id, status: 'IN' });
    await setParticipation({ exchangeId, userId: b.id, status: 'IN' });
  });

  test.afterAll(async () => {
    await prisma.exchange.delete({ where: { id: exchangeId } }).catch(() => {});
    await prisma.giftGroup.delete({ where: { id: groupId } }).catch(() => {});
    await prisma.user
      .deleteMany({
        where: {
          id: { in: [organizer.id, a.id, b.id, bystander.id].filter(Boolean) },
        },
      })
      .catch(() => {});
  });

  test('the organizer draws names and sees only their own person', async ({
    page,
  }) => {
    await loginWithPassword(page, {
      username: organizer.username,
      password: organizer.password,
    });
    await page.goto(`/exchanges/${exchangeId}`);
    await expect(page.getByTestId('exchange-stage')).toHaveText(
      'Gathering people',
    );
    await expect(page.getByRole('list', { name: "Who's in" })).toContainText(
      'Nicolas Posse',
    );

    await page.getByTestId('draw-names').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Draw names for 3 people?');
    await expect(dialog).toContainText("You'll draw a name too");
    await dialog.getByRole('button', { name: 'Draw names' }).click();

    // The covered card appears; the name is not on screen until tapped.
    const cover = page.getByRole('button', { name: 'Tap to see who you drew' });
    await expect(cover).toBeVisible();
    await expect(page.getByTestId('exchange-stage')).toHaveText('Drawn');
    // The roster behind the dialog legitimately names everyone; the covered
    // card itself must not.
    await expect(page.getByTestId('you-drew-result')).toHaveCount(0);
    const coverDialog = page.getByRole('dialog');
    for (const other of [a.name, b.name]) {
      await expect(coverDialog.getByText(other, { exact: true })).toHaveCount(
        0,
      );
    }
    await cover.click();
    const result = page.getByTestId('you-drew-result');
    await expect(result).toBeVisible();
    const revealedText = (await result.textContent()) ?? '';
    const drewA = revealedText.includes(a.name);
    const drewB = revealedText.includes(b.name);
    expect(drewA).not.toBe(drewB);

    // The organizer's page carries totals only.
    await page.getByRole('link', { name: 'Go to the exchange' }).click();
    await expect(page.getByTestId('organizer-progress')).toContainText(
      'Have their gift',
    );
    await expect(page.getByTestId('organizer-progress')).toContainText(
      "You can't see who has who",
    );
  });

  test("loader payloads never carry another person's pairing", async ({
    page,
  }) => {
    // Runs after the draw above (tests in this file run serially).
    const assignments = await prisma.exchangeAssignment.findMany({
      where: { exchangeId, supersededAt: null },
    });
    expect(assignments).toHaveLength(3);

    for (const viewer of [organizer, a, b]) {
      await loginWithPassword(page, {
        username: viewer.username,
        password: viewer.password,
      });
      const response = await page.request.get(`/exchanges/${exchangeId}.data`);
      expect(response.ok()).toBe(true);
      const body = await response.text();
      expect(body).not.toContain('"assignments"');
      expect(body).not.toContain('gifterId');
      // The only giftee that may appear is the viewer's own.
      const own = assignments.find((x) => x.gifterId === viewer.id)!;
      for (const other of assignments.filter((x) => x.gifterId !== viewer.id)) {
        if (other.gifteeId === own.gifteeId) continue;
        // Another person's giftee may legitimately appear as a roster name, so
        // check for the pairing-shaped structure instead: giftee objects.
        expect(body.match(/"giftee"/g)?.length ?? 0).toBeLessThanOrEqual(1);
      }
      await page.context().clearCookies();
    }

    // The non-participant sees roster and state only.
    await loginWithPassword(page, {
      username: bystander.username,
      password: bystander.password,
    });
    await page.goto(`/exchanges/${exchangeId}`);
    await expect(page.getByText('Names are drawn')).toBeVisible();
    await expect(page.getByTestId('organizer-progress')).toHaveCount(0);
    await expect(page.getByTestId('your-person')).toHaveCount(0);
    const bystanderBody = await (
      await page.request.get(`/exchanges/${exchangeId}.data`)
    ).text();
    expect(bystanderBody).not.toContain('"giftee"');
    expect(bystanderBody).not.toContain('"progress":{');
  });

  test('the Gifting tab is active on the exchanges list and shows both segments', async ({
    page,
  }) => {
    await loginWithPassword(page, {
      username: a.username,
      password: a.password,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/exchanges');
    await expect(
      page.getByTestId('bottom-nav').getByRole('link', { name: 'Gifting' }),
    ).toHaveClass(/text-primary/);
    const segments = page.getByRole('navigation', { name: 'Gifting' });
    await expect(
      segments.getByRole('link', { name: 'Exchanges' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('The Painted e2e 2026')).toBeVisible();
  });
});
