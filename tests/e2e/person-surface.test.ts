/**
 * Person-surface action-flow coverage.
 *
 * The person surface (`/users/:username`) had 1174 unit tests covering server
 * actions and loaders, yet shipped a bug where "Propose to pool" rendered but
 * did nothing — the click-to-action wiring was never exercised. These tests
 * drive the real buttons and assert each one *visibly does something*
 * (navigation or a rendered/persisted result), never merely "no error".
 *
 * Levers the surface exposes (see app/routes/users+/$username_+/index.tsx):
 *  - unlock: FRIENDS or ≥1 shared active group (removedAt: null on both).
 *  - occasion-near (ActionRow: Organize / Just me / Save idea / Not this time):
 *    birthday visible AND 0 ≤ daysUntil ≤ 60.
 *  - post-occasion (PostOccasionFlow): birthday within 14 days past AND an
 *    unconfirmed solo intent (pool-of-one, outcomeFeedback: null).
 *  - IdeationBlock (wishlist source + saved ideas, each carrying ProposeControl)
 *    renders in every state except post-occasion.
 */

import { type Page } from '@playwright/test';
import { prisma } from '#app/utils/db.server.ts';
import { createPool } from '#app/utils/pool.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { expect, loginWithPassword, test, waitFor } from '#tests/playwright-utils.ts';

type SeededUser = {
  id: string;
  username: string;
  name: string;
  email: string;
  password: string;
};

/** Create a user with a known password (password === username). */
async function seedUser(overrides?: { birthday?: Date }): Promise<SeededUser> {
  const userData = createUser();
  const user = await prisma.user.create({
    select: { id: true, username: true, name: true, email: true },
    data: {
      ...userData,
      birthday: overrides?.birthday,
      roles: { connect: { name: 'user' } },
      password: { create: createPassword(userData.username) },
    },
  });
  return { ...user, name: user.name ?? userData.name, password: userData.username };
}

/** viewer ↔ target friendship (canonical sorted pair for the @@unique). */
async function makeFriendship(aId: string, bId: string) {
  const pair =
    aId < bId ? { userAId: aId, userBId: bId } : { userAId: bId, userBId: aId };
  await prisma.friendship.create({ data: pair });
}

/** An active group whose members are all the given user ids (first is OWNER). */
async function makeGroup(name: string, memberIds: string[]): Promise<string> {
  const group = await prisma.giftGroup.create({
    select: { id: true },
    data: {
      name,
      groupMembers: {
        create: memberIds.map((userId, i) => ({
          userId,
          role: i === 0 ? 'OWNER' : 'MEMBER',
        })),
      },
    },
  });
  return group.id;
}

/** A birthday `days` in the future (negative = past), à la user-profile.test.ts. */
function birthdayOffset(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Remove everything the seeded users own, in FK-safe order. The e2e DB is
 * shared and never reset between tests, so each test cleans up exactly what it
 * created.
 */
async function cleanup(userIds: string[]) {
  const inUsers = { in: userIds };
  // Pools (cascade ideas / contributors / votes) referencing these users.
  await prisma.pool.deleteMany({
    where: { OR: [{ organizerId: inUsers }, { recipientUserId: inUsers }] },
  });
  await prisma.giftListItem.deleteMany({
    where: { OR: [{ ownerId: inUsers }, { targetUserId: inUsers }] },
  });
  await prisma.wishlistItem.deleteMany({ where: { ownerId: inUsers } });
  await prisma.occasionDecline.deleteMany({
    where: { OR: [{ userId: inUsers }, { targetUserId: inUsers }] },
  });
  await prisma.friendship.deleteMany({
    where: { OR: [{ userAId: inUsers }, { userBId: inUsers }] },
  });
  await prisma.giftGroup.deleteMany({
    where: { groupMembers: { some: { userId: inUsers } } },
  });
  await prisma.user.deleteMany({ where: { id: inUsers } });
}

/**
 * Log in, clearing any prior session first. A persisted cookie makes /login
 * redirect straight past the form, so user-switches within a test need a clean
 * slate before loginWithPassword.
 */
async function login(page: Page, user: { username: string; password: string }) {
  await page.context().clearCookies();
  await loginWithPassword(page, {
    username: user.username,
    password: user.password,
  });
}

// ─── 1. Organize routing ─────────────────────────────────────────────────────

test.describe('Organize routing', () => {
  test('exactly 1 shared group → prefilled group creation', async ({ page }) => {
    const viewer = await seedUser();
    const target = await seedUser({ birthday: birthdayOffset(30) });
    const groupId = await makeGroup('Weekend Crew', [viewer.id, target.id]);
    try {
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);

      // No picker for a single group — the button names the circle directly.
      await page
        .getByRole('button', { name: 'Organize with Weekend Crew' })
        .click();

      await expect(page).toHaveURL(/\/pools\/new/);
      const url = new URL(page.url());
      expect(url.searchParams.get('groupId')).toBe(groupId);
      expect(url.searchParams.get('recipientId')).toBe(target.id);
      // The group-context creation page renders with group + recipient prefilled.
      // ("Weekend Crew" appears in both the back-link and this card, so anchor
      // on the card's unambiguous sentence.)
      await expect(page.getByText(/Creating a pool in/)).toBeVisible();
      await expect(page.getByText(target.name)).toBeVisible();
    } finally {
      await cleanup([viewer.id, target.id]);
    }
  });

  test('2+ shared groups → picker (never a default), then prefilled creation', async ({
    page,
  }) => {
    const viewer = await seedUser();
    const target = await seedUser({ birthday: birthdayOffset(30) });
    const groupA = await makeGroup('Book Club', [viewer.id, target.id]);
    await makeGroup('Hiking Buddies', [viewer.id, target.id]);
    try {
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);

      // Generic label — clicking must NOT auto-navigate; it opens a chooser.
      await page.getByRole('button', { name: 'Organize a gift' }).click();
      await expect(
        page.getByRole('heading', { name: 'Organize with which circle?' }),
      ).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/users/${target.username}`));

      await page.getByRole('button', { name: /Book Club/ }).click();

      await expect(page).toHaveURL(/\/pools\/new/);
      const url = new URL(page.url());
      expect(url.searchParams.get('groupId')).toBe(groupA);
      expect(url.searchParams.get('recipientId')).toBe(target.id);
      await expect(page.getByText(/Creating a pool in/)).toBeVisible();
    } finally {
      await cleanup([viewer.id, target.id]);
    }
  });

  test('friend with no shared group → standalone creation (recipientId, no group)', async ({
    page,
  }) => {
    const viewer = await seedUser();
    const target = await seedUser({ birthday: birthdayOffset(30) });
    await makeFriendship(viewer.id, target.id);
    try {
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);

      await page.getByRole('button', { name: 'Organize a gift' }).click();

      await expect(page).toHaveURL(/\/pools\/new/);
      const url = new URL(page.url());
      expect(url.searchParams.get('recipientId')).toBe(target.id);
      expect(url.searchParams.get('groupId')).toBeNull();
      // Standalone flow: recipient preselected, share-link copy reachable.
      await expect(page.getByText('Who is this for?')).toBeVisible();
      await expect(page.getByText(target.name)).toBeVisible();
      await expect(
        page.getByText(/They'll never see this pool/i),
      ).toBeVisible();
    } finally {
      await cleanup([viewer.id, target.id]);
    }
  });

  test('neither friend nor shared group never reaches the surface (gate stub)', async ({
    page,
  }) => {
    const viewer = await seedUser();
    const target = await seedUser({ birthday: birthdayOffset(30) });
    try {
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);

      // FriendGateCard, not the person surface.
      await expect(
        page.getByRole('heading', {
          name: new RegExp(`See ${target.name}'s profile`, 'i'),
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /Organize/ }),
      ).toHaveCount(0);
    } finally {
      await cleanup([viewer.id, target.id]);
    }
  });
});

// ─── 2. Propose-to-pool resolver ─────────────────────────────────────────────

test.describe('Propose-to-pool resolver', () => {
  test('0 open pools, from a saved idea → routes into Organize carrying the idea', async ({
    page,
  }) => {
    const viewer = await seedUser();
    const target = await seedUser();
    await makeFriendship(viewer.id, target.id);
    await prisma.giftListItem.create({
      data: { ownerId: viewer.id, targetUserId: target.id, name: 'Ceramics class' },
    });
    try {
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);

      await expect(
        page.getByText('Your saved ideas · private'),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Propose to pool' }).click();

      await expect(page).toHaveURL(/\/pools\/new/);
      const url = new URL(page.url());
      expect(url.searchParams.get('recipientId')).toBe(target.id);
      expect(url.searchParams.get('title')).toBe('Ceramics class');
      // The idea name arrives prefilled in the pool title field.
      await expect(page.getByLabel('Pool title')).toHaveValue('Ceramics class');
    } finally {
      await cleanup([viewer.id, target.id]);
    }
  });

  test('0 open pools, from a wishlist item → routes into Organize carrying the idea', async ({
    page,
  }) => {
    const viewer = await seedUser();
    const target = await seedUser();
    await makeFriendship(viewer.id, target.id);
    await prisma.wishlistItem.create({
      data: {
        ownerId: target.id,
        title: 'Cast iron skillet',
        type: 'ITEM',
        status: 'ACTIVE',
        sortOrder: 0,
      },
    });
    try {
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);

      await expect(page.getByText('Cast iron skillet')).toBeVisible();
      await page.getByRole('button', { name: 'Propose to pool' }).click();

      await expect(page).toHaveURL(/\/pools\/new/);
      const url = new URL(page.url());
      expect(url.searchParams.get('recipientId')).toBe(target.id);
      expect(url.searchParams.get('title')).toBe('Cast iron skillet');
      await expect(page.getByLabel('Pool title')).toHaveValue('Cast iron skillet');
    } finally {
      await cleanup([viewer.id, target.id]);
    }
  });

  test('exactly 1 open pool, from a saved idea → proposes directly + links giftListItemId', async ({
    page,
  }) => {
    const viewer = await seedUser();
    const target = await seedUser();
    await makeFriendship(viewer.id, target.id);
    const savedIdea = await prisma.giftListItem.create({
      select: { id: true },
      data: { ownerId: viewer.id, targetUserId: target.id, name: 'Trail shoes' },
    });
    const pool = await createPool({
      title: 'Open Pool',
      organizerId: viewer.id,
      recipientUserId: target.id,
    });
    try {
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);

      await page.getByRole('button', { name: 'Propose to pool' }).click();

      // Lands the viewer in the pool (a bare reply reads as "nothing happened").
      await expect(page).toHaveURL(new RegExp(`/pools/${pool.id}`));

      const idea = await waitFor(async () => {
        const row = await prisma.giftIdea.findFirst({
          where: { poolId: pool.id, name: 'Trail shoes' },
          select: { id: true, giftListItemId: true },
        });
        expect(row).not.toBeNull();
        return row;
      });
      // Promoting a saved idea LINKS it, not copies it.
      expect(idea?.giftListItemId).toBe(savedIdea.id);
    } finally {
      await cleanup([viewer.id, target.id]);
    }
  });

  test('exactly 1 open pool, from a wishlist item → proposes directly + links wishlistItemId', async ({
    page,
  }) => {
    const viewer = await seedUser();
    const target = await seedUser();
    await makeFriendship(viewer.id, target.id);
    const item = await prisma.wishlistItem.create({
      select: { id: true },
      data: {
        ownerId: target.id,
        title: 'Immersion blender',
        type: 'ITEM',
        status: 'ACTIVE',
        sortOrder: 0,
      },
    });
    const pool = await createPool({
      title: 'Open Pool',
      organizerId: viewer.id,
      recipientUserId: target.id,
    });
    try {
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);

      await page.getByRole('button', { name: 'Propose to pool' }).click();

      await expect(page).toHaveURL(new RegExp(`/pools/${pool.id}`));

      const idea = await waitFor(async () => {
        const row = await prisma.giftIdea.findFirst({
          where: { poolId: pool.id, name: 'Immersion blender' },
          select: { id: true, wishlistItemId: true },
        });
        expect(row).not.toBeNull();
        return row;
      });
      expect(idea?.wishlistItemId).toBe(item.id);
    } finally {
      await cleanup([viewer.id, target.id]);
    }
  });

  test('2+ open pools → picker, and the chosen pool receives the idea', async ({
    page,
  }) => {
    const viewer = await seedUser();
    const target = await seedUser();
    await makeFriendship(viewer.id, target.id);
    await prisma.giftListItem.create({
      data: { ownerId: viewer.id, targetUserId: target.id, name: 'Camera strap' },
    });
    await createPool({
      title: 'Pool One',
      organizerId: viewer.id,
      recipientUserId: target.id,
    });
    const poolTwo = await createPool({
      title: 'Pool Two',
      organizerId: viewer.id,
      recipientUserId: target.id,
    });
    try {
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);

      await page.getByRole('button', { name: 'Propose to pool' }).click();
      await expect(
        page.getByRole('heading', { name: 'Propose to which pool?' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Pool Two' }).click();

      await expect(page).toHaveURL(new RegExp(`/pools/${poolTwo.id}`));
      await waitFor(async () => {
        const row = await prisma.giftIdea.findFirst({
          where: { poolId: poolTwo.id, name: 'Camera strap' },
          select: { id: true },
        });
        expect(row).not.toBeNull();
        return row;
      });
    } finally {
      await cleanup([viewer.id, target.id]);
    }
  });
});

// ─── 3. Action row flows ─────────────────────────────────────────────────────

test.describe('Action row', () => {
  test('Save idea → appears under "Your saved ideas · private", private to owner', async ({
    page,
  }) => {
    const viewer = await seedUser();
    const target = await seedUser({ birthday: birthdayOffset(30) });
    const third = await seedUser();
    await makeFriendship(viewer.id, target.id);
    await makeFriendship(third.id, target.id);
    try {
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);

      await page.getByRole('button', { name: 'Save idea' }).click();
      const saveDialog = page.getByRole('dialog');
      await saveDialog.getByLabel('Idea').fill('Handmade journal');
      await saveDialog.getByRole('button', { name: 'Save idea' }).click();

      // Visible to the author on reload, under the private section.
      await waitFor(async () => {
        const row = await prisma.giftListItem.findFirst({
          where: { ownerId: viewer.id, targetUserId: target.id, name: 'Handmade journal' },
          select: { id: true },
        });
        expect(row).not.toBeNull();
        return row;
      });
      await page.goto(`/users/${target.username}`);
      await expect(page.getByText('Your saved ideas · private')).toBeVisible();
      await expect(page.getByText('Handmade journal')).toBeVisible();

      // NOT visible to a third viewer looking at the same target.
      await login(page, third);
      await page.goto(`/users/${target.username}`);
      await expect(page.getByText('Handmade journal')).toHaveCount(0);

      // NOT visible to the target viewing the author's profile.
      await login(page, target);
      await page.goto(`/users/${viewer.username}`);
      await expect(page.getByText('Handmade journal')).toHaveCount(0);
    } finally {
      await cleanup([viewer.id, target.id, third.id]);
    }
  });

  test('Not this time → declined header + Undo, invisible to another viewer', async ({
    page,
  }) => {
    const viewer = await seedUser();
    const target = await seedUser({ birthday: birthdayOffset(30) });
    const other = await seedUser();
    await makeFriendship(viewer.id, target.id);
    await makeFriendship(other.id, target.id);
    try {
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);

      await page.getByRole('button', { name: 'Not this time' }).click();
      await expect(
        page.getByText("You're sitting this one out"),
      ).toBeVisible();
      const undo = page.getByRole('button', { name: 'Undo' });
      await expect(undo).toBeVisible();

      // The decline is per-viewer — another viewer sees the normal occasion.
      await login(page, other);
      await page.goto(`/users/${target.username}`);
      await expect(page.getByText("You're sitting this one out")).toHaveCount(0);
      await expect(page.getByText(/Birthday ·/)).toBeVisible();

      // Undo restores the occasion header for the original viewer.
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(page.getByText("You're sitting this one out")).toHaveCount(0);
      await expect(page.getByText(/Birthday ·/)).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Not this time' }),
      ).toBeVisible();
    } finally {
      await cleanup([viewer.id, target.id, other.id]);
    }
  });

  test('Just me → requires a gift name, creates a pool-of-one without pool ceremony', async ({
    page,
  }) => {
    const viewer = await seedUser();
    const target = await seedUser({ birthday: birthdayOffset(30) });
    await makeFriendship(viewer.id, target.id);
    try {
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);

      await page.getByRole('button', { name: 'Just me' }).click();
      const dialogTitle = page.getByText("I've got this one");
      await expect(dialogTitle).toBeVisible();

      // Empty submit is blocked (name required) — dialog stays open, no pool.
      await page.getByRole('button', { name: "I've got this" }).click();
      await expect(dialogTitle).toBeVisible();

      await page.getByLabel('What are you getting them?').fill('Handmade mug');
      await page.getByRole('button', { name: "I've got this" }).click();

      const pool = await waitFor(async () => {
        const row = await prisma.pool.findFirst({
          where: { organizerId: viewer.id, recipientUserId: target.id, title: 'Handmade mug' },
          select: { id: true, _count: { select: { contributors: true } } },
        });
        expect(row).not.toBeNull();
        return row;
      });
      // Pool-of-one: exactly one contributor, and no pool page in the UI flow.
      expect(pool?._count.contributors).toBe(1);
      await expect(page).toHaveURL(new RegExp(`/users/${target.username}`));
    } finally {
      await cleanup([viewer.id, target.id]);
    }
  });
});

// ─── 4. Post-occasion UI wiring ──────────────────────────────────────────────

test.describe('Post-occasion "Did it land?"', () => {
  test('"They loved it" records the outcome and clears the prompt', async ({
    page,
  }) => {
    const viewer = await seedUser();
    const target = await seedUser({ birthday: birthdayOffset(-3) });
    await makeFriendship(viewer.id, target.id);
    // Unconfirmed solo intent = a pool-of-one for this recipient.
    const pool = await createPool({
      title: 'Vinyl record',
      organizerId: viewer.id,
      recipientUserId: target.id,
    });
    try {
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);

      await expect(page.getByText('Did it land?')).toBeVisible();
      await expect(page.getByText('Your gift · Vinyl record')).toBeVisible();

      await page.getByRole('button', { name: 'They loved it' }).click();

      await waitFor(async () => {
        const row = await prisma.pool.findUnique({
          where: { id: pool.id },
          select: { outcomeFeedback: true },
        });
        expect(row?.outcomeFeedback).toBe('LOVED');
        return row;
      });

      // Answered once → never re-nagged.
      await page.goto(`/users/${target.username}`);
      await expect(page.getByText('Did it land?')).toHaveCount(0);
    } finally {
      await cleanup([viewer.id, target.id]);
    }
  });

  test('"Skip for now" suppresses the prompt permanently', async ({ page }) => {
    const viewer = await seedUser();
    const target = await seedUser({ birthday: birthdayOffset(-3) });
    await makeFriendship(viewer.id, target.id);
    const pool = await createPool({
      title: 'Wool scarf',
      organizerId: viewer.id,
      recipientUserId: target.id,
    });
    try {
      await login(page, viewer);
      await page.goto(`/users/${target.username}`);

      await expect(page.getByText('Did it land?')).toBeVisible();
      await page.getByRole('button', { name: 'Skip for now' }).click();

      await waitFor(async () => {
        const row = await prisma.pool.findUnique({
          where: { id: pool.id },
          select: { outcomeFeedback: true },
        });
        expect(row?.outcomeFeedback).toBe('SKIPPED');
        return row;
      });

      await page.goto(`/users/${target.username}`);
      await expect(page.getByText('Did it land?')).toHaveCount(0);
    } finally {
      await cleanup([viewer.id, target.id]);
    }
  });
});
