/**
 * Notes, guessing and the standalone invite link through a real browser.
 *
 * The unit suite covers these rules thoroughly; what a browser adds is the
 * thing that actually matters here — that a note is invisible to its
 * recipient until its morning batch lands, and that the loader payload behind
 * the page carries no sender. A leak is this feature's worst failure mode, so
 * it gets the same payload assertion the draw flow already has.
 */
import { getPasswordHash } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  createExchange,
  drawNames,
  generateExchangeInviteCode,
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

test.describe.serial('exchange notes and guessing', () => {
  let organizer: SeededUser;
  let a: SeededUser;
  let b: SeededUser;
  let groupId: string;
  let exchangeId: string;
  // Who drew whom, read straight from the database so the test knows the
  // answer the UI is meant to be hiding.
  let gifteeOfA: SeededUser;

  test.beforeAll(async () => {
    [organizer, a, b] = await Promise.all([
      seedUser('Francisco Organizer'),
      seedUser('Nicolas Poste'),
      seedUser('Agustin Luqueta'),
    ]);
    const group = await prisma.giftGroup.create({
      select: { id: true },
      data: {
        name: 'The Painted notes e2e',
        groupMembers: {
          create: [
            { userId: organizer.id, role: 'OWNER' },
            { userId: a.id, role: 'MEMBER' },
            { userId: b.id, role: 'MEMBER' },
          ],
        },
      },
    });
    groupId = group.id;
    const exchange = await createExchange({
      organizerId: organizer.id,
      title: 'Notes e2e 2026',
      eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      giftGroupId: groupId,
    });
    exchangeId = exchange.id;
    await setParticipation({ exchangeId, userId: a.id, status: 'IN' });
    await setParticipation({ exchangeId, userId: b.id, status: 'IN' });
    await drawNames({ exchangeId, actorId: organizer.id });

    const assignment = await prisma.exchangeAssignment.findFirstOrThrow({
      where: { exchangeId, gifterId: a.id, supersededAt: null },
      select: { gifteeId: true },
    });
    gifteeOfA = [organizer, b].find((u) => u.id === assignment.gifteeId)!;
    // Everyone has to open their covered card before the page will show them
    // anything, including the note threads.
    await prisma.exchangeParticipant.updateMany({
      where: { exchangeId },
      data: { assignmentViewedAt: new Date() },
    });
  });

  test.afterAll(async () => {
    await prisma.exchange.delete({ where: { id: exchangeId } }).catch(() => {});
    await prisma.giftGroup.delete({ where: { id: groupId } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: { in: [organizer.id, a.id, b.id] } } })
      .catch(() => {});
  });

  test('a note is invisible to its recipient until its morning arrives', async ({
    page,
  }) => {
    await loginWithPassword(page, {
      username: a.username,
      password: a.password,
    });
    await page.goto(`/exchanges/${exchangeId}`);

    await page.getByRole('button', { name: 'Send a note' }).click();
    await page.getByRole('radio', { name: /got your gift/i }).click();
    await page
      .getByRole('button', { name: /^Send (tomorrow|this) morning$/ })
      .click();

    // The sender sees their own note straight away, in their thread with the
    // person they drew, marked as on its way. Scoped to the thread: the same
    // words also live in the picker and the live region.
    const outbound = page.getByRole('region', { name: /^To / });
    await expect(outbound).toContainText("I've got your gift.");
    await expect(outbound).toContainText(/Sending · arrives/);

    // The recipient sees nothing at all: the note has not been delivered, and
    // an undelivered note would say when it was written.
    await page.context().clearCookies();
    await loginWithPassword(page, {
      username: gifteeOfA.username,
      password: gifteeOfA.password,
    });
    await page.goto(`/exchanges/${exchangeId}`);
    await expect(
      page.getByRole('region', { name: 'From your secret gifter' }),
    ).toContainText('Nothing yet');
    await expect(
      page.getByRole('region', { name: 'From your secret gifter' }),
    ).not.toContainText("I've got your gift.");

    // And the payload behind the page carries neither the note nor any
    // sender. (Participant ids ARE in there — the roster is shared within an
    // exchange — so the thing to assert is that no note and no sender field
    // reached the client, not that a particular id is absent.)
    const payload = await page.request.get(`/exchanges/${exchangeId}.data`);
    const body = await payload.text();
    expect(body).not.toContain("I've got your gift.");
    expect(body).not.toContain('senderId');
  });

  test('a guess is kept, changeable, and told to nobody', async ({ page }) => {
    await loginWithPassword(page, {
      username: a.username,
      password: a.password,
    });
    await page.goto(`/exchanges/${exchangeId}`);

    await page.getByRole('button', { name: 'Make a guess' }).click();
    await page.getByRole('radio', { name: organizer.name }).click();
    await page.getByRole('button', { name: /^Lock in/ }).click();
    await expect(page.getByText('Your guess')).toBeVisible();

    // Changing it keeps the last answer.
    await page.getByRole('button', { name: 'Change' }).click();
    await page.getByRole('radio', { name: b.name }).click();
    await page.getByRole('button', { name: /^Lock in/ }).click();
    await expect(
      page.getByRole('region', { name: 'Who has you?' }),
    ).toContainText(b.name);

    // The person who was guessed is told nothing, on the page or behind it.
    await page.context().clearCookies();
    await loginWithPassword(page, {
      username: b.username,
      password: b.password,
    });
    await page.goto(`/exchanges/${exchangeId}`);
    await expect(
      page.getByRole('region', { name: 'Who has you?' }),
    ).not.toContainText('Your guess');
    const payload = await page.request.get(`/exchanges/${exchangeId}.data`);
    expect(await payload.text()).not.toContain('changeCount');
  });
});

test.describe('standalone exchange invite links', () => {
  let organizer: SeededUser;
  let exchangeId: string;
  let code: string;

  test.beforeAll(async () => {
    organizer = await seedUser('Francisco Standalone');
    const exchange = await createExchange({
      organizerId: organizer.id,
      title: 'Studio Christmas e2e',
      eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      giftGroupId: null,
    });
    exchangeId = exchange.id;
    code = await generateExchangeInviteCode({
      exchangeId,
      actorId: organizer.id,
    });
  });

  test.afterAll(async () => {
    await prisma.exchange.delete({ where: { id: exchangeId } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: organizer.id } })
      .catch(() => {});
  });

  test('a stranger sees the invitation before being asked to sign up', async ({
    page,
  }) => {
    // No account: most people following one of these links have none yet.
    await page.context().clearCookies();
    await page.goto(`/exchanges/join/${code}`);

    await expect(
      page.getByText("You're invited to a gift exchange 🎁"),
    ).toBeVisible();
    await expect(page.getByText('Studio Christmas e2e')).toBeVisible();
    // Create account is the primary way in, not a login wall.
    await expect(
      page.getByRole('link', { name: /create account|sign ?up/i }).first(),
    ).toBeVisible();
  });

  test('a replaced link says nothing about why it stopped working', async ({
    page,
  }) => {
    const replacement = await generateExchangeInviteCode({
      exchangeId,
      actorId: organizer.id,
    });
    expect(replacement).not.toBe(code);

    await page.context().clearCookies();
    await page.goto(`/exchanges/join/${code}`);

    await expect(
      page.getByText(/may have expired, been replaced, or the names/i),
    ).toBeVisible();
    // Never which of them it actually was — that would confirm the exchange
    // exists.
    await expect(
      page.getByText(/(was|has been) (replaced|revoked|drawn)/i),
    ).toHaveCount(0);
  });
});
