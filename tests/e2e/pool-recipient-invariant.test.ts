/**
 * Server-boundary audit for the pool secrecy invariant.
 *
 * Contract: `createPool` — the domain write path behind `POST /pools/new` —
 * must never seed the recipient as a contributor on their own pool. This is
 * enforced at write time regardless of what the route caller passes:
 *   - recipient === organizer is rejected outright (no Pool row).
 *   - a recipient smuggled into the contributor list is silently dropped.
 *
 * These hit the real action over HTTP (not the mocked route unit tests) so a
 * tampered, direct POST is what's being verified.
 */

import { getPasswordHash } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import { expect, loginWithPassword, test } from '#tests/playwright-utils.ts';

type SeededUser = { id: string; username: string; password: string };

async function seedUser(): Promise<SeededUser> {
  const userData = createUser();
  const password = userData.username;
  const user = await prisma.user.create({
    select: { id: true, username: true },
    data: {
      ...userData,
      roles: { connect: { name: 'user' } },
      password: { create: { hash: await getPasswordHash(password) } },
    },
  });
  return { ...user, password };
}

test.describe('pool recipient invariant (server boundary)', () => {
  let organizer: SeededUser;
  let recipient: SeededUser;
  let member3: SeededUser;
  let groupId: string;
  const createdPoolIds: string[] = [];

  test.beforeAll(async () => {
    [organizer, recipient, member3] = await Promise.all([
      seedUser(),
      seedUser(),
      seedUser(),
    ]);

    const group = await prisma.giftGroup.create({
      select: { id: true },
      data: {
        name: 'Recipient-invariant Crew',
        description: 'boundary test',
        groupMembers: {
          create: [
            { userId: organizer.id, role: 'OWNER' },
            { userId: recipient.id, role: 'MEMBER' },
            { userId: member3.id, role: 'MEMBER' },
          ],
        },
      },
    });
    groupId = group.id;
  });

  test.afterAll(async () => {
    // Pools reference the organizer with no cascade — delete them first, then
    // the group (cascades memberships), then the seeded users.
    for (const id of createdPoolIds) {
      await prisma.pool.delete({ where: { id } }).catch(() => {});
    }
    await prisma.giftGroup.delete({ where: { id: groupId } }).catch(() => {});
    await prisma.user
      .deleteMany({
        where: { id: { in: [organizer.id, recipient.id, member3.id] } },
      })
      .catch(() => {});
  });

  test('rejects a group-backed pool whose recipient is the organizer', async ({
    page,
  }) => {
    await loginWithPassword(page, {
      username: organizer.username,
      password: organizer.password,
    });
    const title = `Self Pool ${Date.now()}`;

    const response = await page.request.post('/pools/new', {
      form: {
        title,
        occasionType: 'BIRTHDAY',
        decisionMode: 'ORGANIZER_PICKS',
        giftGroupId: groupId,
        // recipient === organizer: the group-backed path lets this through to
        // createPool, which must reject it.
        recipientUserId: organizer.id,
        contributorIds: organizer.id,
      },
      maxRedirects: 0,
    });

    // Rejected as a 400 at the route (not a 302 redirect, not a 500 crash).
    expect(response.status()).toBe(400);

    // The strong assertion: nothing was persisted.
    const pool = await prisma.pool.findFirst({
      where: { organizerId: organizer.id, title },
      select: { id: true },
    });
    expect(pool).toBeNull();

    const contributor = await prisma.poolContributor.findFirst({
      where: { userId: organizer.id, pool: { title } },
      select: { poolId: true },
    });
    expect(contributor).toBeNull();
  });

  test('excludes the recipient from contributors even when smuggled into contributorIds', async ({
    page,
  }) => {
    await loginWithPassword(page, {
      username: organizer.username,
      password: organizer.password,
    });
    const title = `Privacy-safe Pool ${Date.now()}`;

    const response = await page.request.post('/pools/new', {
      form: {
        title,
        occasionType: 'BIRTHDAY',
        decisionMode: 'ORGANIZER_PICKS',
        giftGroupId: groupId,
        recipientUserId: recipient.id,
        // Recipient smuggled into the contributor list alongside real members.
        contributorIds: [organizer.id, recipient.id, member3.id].join(','),
      },
      maxRedirects: 0,
    });

    // Pool was created — the action redirects to the new pool.
    expect(response.status()).toBe(302);

    const pool = await prisma.pool.findFirst({
      where: { organizerId: organizer.id, title },
      select: {
        id: true,
        contributors: { select: { userId: true } },
      },
    });
    expect(pool).not.toBeNull();
    createdPoolIds.push(pool!.id);

    const contributorIds = pool!.contributors.map((c) => c.userId);
    // Recipient must NOT be a contributor; organizer + member3 must be.
    expect(contributorIds).not.toContain(recipient.id);
    expect(contributorIds).toContain(organizer.id);
    expect(contributorIds).toContain(member3.id);
  });
});
