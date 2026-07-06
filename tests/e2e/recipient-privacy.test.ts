/**
 * Recipient-privacy audit.
 *
 * Contract: when a group member is the recipient of a pool, that pool must
 * not exist for them anywhere in the product. Not in lists, not at a direct
 * URL, not in notifications, not in email, not hinted at in member rows or
 * activity feeds.
 *
 * Several of these assertions are expected to FAIL against the current
 * codebase — that is the audit's punchlist. See the report in the PR that
 * introduces this spec.
 */

import { getPasswordHash } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createPool, generatePoolInviteCode } from '#app/utils/pool.server.ts';
import { createUser } from '#tests/db-utils.ts';
import { readEmail } from '#tests/mocks/utils.ts';
import { expect, loginWithPassword, test } from '#tests/playwright-utils.ts';

type SeededUser = {
  id: string;
  username: string;
  email: string;
  password: string;
};

async function seedUser(): Promise<SeededUser> {
  const userData = createUser();
  const password = userData.username;
  const user = await prisma.user.create({
    select: { id: true, username: true, email: true },
    data: {
      ...userData,
      roles: { connect: { name: 'user' } },
      password: { create: { hash: await getPasswordHash(password) } },
    },
  });
  return { ...user, password };
}

test.describe('recipient privacy', () => {
  let organizer: SeededUser;
  let recipient: SeededUser;
  let other: SeededUser;
  let groupId: string;
  let poolId: string;
  const poolTitle = 'Surprise Birthday for Recipient';

  test.beforeAll(async () => {
    [organizer, recipient, other] = await Promise.all([
      seedUser(),
      seedUser(),
      seedUser(),
    ]);

    const group = await prisma.giftGroup.create({
      select: { id: true },
      data: {
        name: 'Privacy Test Crew',
        description: 'Seeded for recipient-privacy audit',
        groupMembers: {
          create: [
            { userId: organizer.id, role: 'OWNER' },
            { userId: recipient.id, role: 'MEMBER' },
            { userId: other.id, role: 'MEMBER' },
          ],
        },
      },
    });
    groupId = group.id;

    const pool = await createPool({
      title: poolTitle,
      organizerId: organizer.id,
      recipientUserId: recipient.id,
      giftGroupId: groupId,
      // contributors: organizer (auto) + other. Recipient MUST NOT be here.
      groupMemberDefaults: [{ userId: other.id, contributionCents: 0 }],
    });
    poolId = pool.id;
    // Give the pool a real invite code so the recipient-invite-link test can
    // actually navigate the join flow (createPool never sets one).
    await generatePoolInviteCode(poolId);
  });

  test.afterAll(async () => {
    await prisma.pool
      .delete({ where: { id: poolId } })
      .catch(() => {});
    await prisma.giftGroup
      .delete({ where: { id: groupId } })
      .catch(() => {});
    await prisma.user
      .deleteMany({
        where: { id: { in: [organizer.id, recipient.id, other.id] } },
      })
      .catch(() => {});
  });

  test('recipient is NOT a contributor on their own pool (seed sanity check)', async () => {
    const contributor = await prisma.poolContributor.findFirst({
      where: { poolId, userId: recipient.id },
      select: { id: true },
    });
    expect(contributor).toBeNull();
  });

  test('/pools list does not include a pool where viewer is the recipient', async ({
    page,
  }) => {
    await loginWithPassword(page, {
      username: recipient.username,
      password: recipient.password,
    });
    await page.goto('/pools');

    await expect(page.getByRole('link', { name: new RegExp(poolTitle, 'i') })).toHaveCount(0);
    await expect(page.getByText(poolTitle, { exact: false })).toHaveCount(0);
  });

  test('direct navigation to /pools/:id as recipient does not reveal the pool', async ({
    page,
  }) => {
    await loginWithPassword(page, {
      username: recipient.username,
      password: recipient.password,
    });
    const response = await page.goto(`/pools/${poolId}`);

    // The server must treat this as "does not exist" for the recipient —
    // indistinguishable from a nonexistent pool ID. No pool data, no
    // leaky error message that would confirm the pool's existence.
    expect(response?.status()).toBe(404);
    await expect(page.getByText(poolTitle, { exact: false })).toHaveCount(0);
    await expect(
      page.getByText(/you are not a contributor|forbidden|not allowed|no access/i),
    ).toHaveCount(0);
  });

  test('/groups/:id overview does not mention the pool when viewer is the recipient', async ({
    page,
  }) => {
    await loginWithPassword(page, {
      username: recipient.username,
      password: recipient.password,
    });
    await page.goto(`/groups/${groupId}`);

    await expect(page.getByText(poolTitle, { exact: false })).toHaveCount(0);
  });

  test('/groups/:id/members does not hint at a pool on the recipient row', async ({
    page,
  }) => {
    await loginWithPassword(page, {
      username: recipient.username,
      password: recipient.password,
    });
    await page.goto(`/groups/${groupId}/members`);

    // The recipient's own row must not carry pool-related chips/progress.
    await expect(page.getByText(poolTitle, { exact: false })).toHaveCount(0);
    await expect(page.getByText(/pool pending|gift in progress|contributors/i)).toHaveCount(0);
  });

  test('organizer CAN see the pool (negative control — proves seed is correct)', async ({
    page,
  }) => {
    await loginWithPassword(page, {
      username: organizer.username,
      password: organizer.password,
    });
    await page.goto('/pools');

    await expect(page.getByRole('link', { name: new RegExp(poolTitle, 'i') })).toBeVisible();
  });

  test('in-app notifications for recipient contain nothing about their own pool', async () => {
    const notifications = await prisma.notification.findMany({
      where: { userId: recipient.id },
      select: { type: true, messageKey: true, messageParams: true, metadata: true, targetUrl: true },
    });

    for (const n of notifications) {
      const blob = JSON.stringify(n);
      expect(blob).not.toContain(poolId);
      expect(blob.toLowerCase()).not.toContain(poolTitle.toLowerCase());
    }
  });

  test('no email is sent to the recipient about their own pool', async () => {
    // MSW email capture writes JSON to tests/fixtures/email/:address.json.
    // If no email was sent, readEmail returns null.
    const email = await readEmail(recipient.email).catch(() => null);
    if (email) {
      const blob = JSON.stringify(email).toLowerCase();
      expect(blob).not.toContain(poolTitle.toLowerCase());
      expect(blob).not.toContain(poolId);
    }
  });

  test('recipient clicking the pool invite link is not added as a contributor', async ({
    page,
  }) => {
    const invite = await prisma.pool.findUnique({
      where: { id: poolId },
      select: { inviteCode: true },
    });
    const inviteCode = invite?.inviteCode;
    expect(inviteCode).toBeTruthy();

    await loginWithPassword(page, {
      username: recipient.username,
      password: recipient.password,
    });
    await page.goto(`/pools/join/${inviteCode}`);

    // Landing on the pool detail would be a leak.
    await expect(page).not.toHaveURL(new RegExp(`/pools/${poolId}`));

    const contributor = await prisma.poolContributor.findFirst({
      where: { poolId, userId: recipient.id },
      select: { id: true },
    });
    expect(contributor).toBeNull();
  });
});
