/**
 * @vitest-environment node
 */
import { type AppLoadContext } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { getSessionExpirationDate } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { createPassword, createUser } from '#tests/db-utils.ts';
import { toLoaderArgs } from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: vi.fn(() => ({ eventId: 'evt-1' })),
}));

import { loader } from './index.tsx';

const context = {
  cspNonce: undefined,
  serverBuild: undefined,
} as unknown as AppLoadContext;

const ensureUserRole = () =>
  prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: { name: 'user' },
  });

async function createUserRecord(
  overrides: {
    birthday?: Date | null;
    birthdayVisibility?: string;
    wishlistVisibility?: string;
  } = {},
) {
  await ensureUserRole();
  return prisma.user.create({
    data: {
      ...createUser(),
      birthday: overrides.birthday ?? null,
      birthdayVisibility: overrides.birthdayVisibility ?? 'FRIENDS',
      wishlistVisibility: overrides.wishlistVisibility ?? 'FRIENDS',
      password: { create: createPassword() },
      roles: { connect: { name: 'user' } },
    },
  });
}

async function makeFriends(aId: string, bId: string) {
  const [userAId, userBId] = aId < bId ? [aId, bId] : [bId, aId];
  await prisma.friendship.create({ data: { userAId, userBId } });
}

async function createSharedGroup(
  viewerId: string,
  targetId: string,
  targetFlags: { shareWishlist: boolean; shareBirthday: boolean },
) {
  const group = await prisma.giftGroup.create({ data: { name: 'The Crew' } });
  await prisma.usersInGiftGroups.create({
    data: { userId: viewerId, giftGroupId: group.id },
  });
  await prisma.usersInGiftGroups.create({
    data: {
      userId: targetId,
      giftGroupId: group.id,
      shareWishlist: targetFlags.shareWishlist,
      shareBirthday: targetFlags.shareBirthday,
    },
  });
  return group;
}

async function withSession(userId: string) {
  const session = await prisma.session.create({
    data: { userId, expirationDate: getSessionExpirationDate() },
    select: { id: true },
  });
  return getSessionCookieHeader(session);
}

async function runLoader(viewerId: string, username: string) {
  const cookie = await withSession(viewerId);
  const request = new Request('https://giftpool.app/users/' + username, {
    headers: { cookie },
  });
  return loader(toLoaderArgs({ context, params: { username }, request }));
}

const soon = () => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
};

describe('person surface loader — access gate & visibility', () => {
  it('gates a stranger (neither friend nor groupmate): identity only, no data', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord({ birthday: soon() });

    const result = (await runLoader(viewer.id, target.username)) as any;
    expect(result.unlocked).toBe(false);
    // Payload carries identity only — no birthday, wishlist, or mutual data.
    expect(result.user.username).toBe(target.username);
    expect(result).not.toHaveProperty('birthdayVisible');
    expect(result).not.toHaveProperty('mutualFriends');
    expect(result).not.toHaveProperty('wishlistPreview');
  });

  it('groupmate-not-friend: wishlist visible only when the group shareWishlist grant is on', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord({
      wishlistVisibility: 'FRIENDS',
      birthday: soon(),
    });
    await createSharedGroup(viewer.id, target.id, {
      shareWishlist: true,
      shareBirthday: false,
    });

    const result = (await runLoader(viewer.id, target.username)) as any;
    expect(result.unlocked).toBe(true);
    expect(result.isFriend).toBe(false);
    expect(result.canViewWishlist).toBe(true);
  });

  it('groupmate-not-friend: wishlist hidden when shareWishlist is off and not friends', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord({ wishlistVisibility: 'FRIENDS' });
    await createSharedGroup(viewer.id, target.id, {
      shareWishlist: false,
      shareBirthday: true,
    });

    const result = (await runLoader(viewer.id, target.username)) as any;
    expect(result.unlocked).toBe(true);
    expect(result.canViewWishlist).toBe(false);
  });

  it('groupmate-not-friend: birthday visible when shareBirthday is on, honoring canViewBirthday', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord({
      birthday: soon(),
      birthdayVisibility: 'FRIENDS', // not visible to non-friends by global rule
    });
    await createSharedGroup(viewer.id, target.id, {
      shareWishlist: false,
      shareBirthday: true, // ...but the group grant makes it visible
    });

    const result = (await runLoader(viewer.id, target.username)) as any;
    expect(result.birthdayVisible).toBe(true);
  });

  it('groupmate-not-friend: NOBODY birthday stays hidden even with a group grant', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord({
      birthday: soon(),
      birthdayVisibility: 'NOBODY',
    });
    await createSharedGroup(viewer.id, target.id, {
      shareWishlist: false,
      shareBirthday: true,
    });

    const result = (await runLoader(viewer.id, target.username)) as any;
    expect(result.birthdayVisible).toBe(false);
  });

  it('groupmate-not-friend: mutual friends are never in the payload', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord();
    const shared = await createUserRecord();
    await createSharedGroup(viewer.id, target.id, {
      shareWishlist: true,
      shareBirthday: true,
    });
    // viewer and target share a mutual friend, but they aren't friends with
    // each other — the friend graph must stay friends-only.
    await makeFriends(viewer.id, shared.id);
    await makeFriends(target.id, shared.id);

    const result = (await runLoader(viewer.id, target.username)) as any;
    expect(result.mutualFriends).toEqual([]);
  });

  it('friend with NOBODY birthday: hidden despite friendship (single canViewBirthday source)', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord({
      birthday: soon(),
      birthdayVisibility: 'NOBODY',
    });
    await makeFriends(viewer.id, target.id);

    const result = (await runLoader(viewer.id, target.username)) as any;
    expect(result.unlocked).toBe(true);
    expect(result.isFriend).toBe(true);
    expect(result.birthdayVisible).toBe(false);
  });

  it('friend with default birthday visibility: birthday shown', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord({
      birthday: soon(),
      birthdayVisibility: 'FRIENDS',
    });
    await makeFriends(viewer.id, target.id);

    const result = (await runLoader(viewer.id, target.username)) as any;
    expect(result.birthdayVisible).toBe(true);
  });
});

async function createDecidedPool(opts: {
  recipientId: string;
  contributorIds: string[];
  chosenName: string;
  eventDate: Date | null;
  status?: string;
  otherIdeas?: string[];
}) {
  const organizerId = opts.contributorIds[0]!;
  const pool = await prisma.pool.create({
    data: {
      title: opts.chosenName,
      organizerId,
      recipientUserId: opts.recipientId,
      status: opts.status ?? 'DECIDED',
      eventDate: opts.eventDate,
      contributors: {
        create: opts.contributorIds.map((userId) => ({ userId })),
      },
    },
  });
  const chosen = await prisma.giftIdea.create({
    data: { poolId: pool.id, proposedById: organizerId, name: opts.chosenName },
  });
  for (const name of opts.otherIdeas ?? []) {
    await prisma.giftIdea.create({
      data: { poolId: pool.id, proposedById: organizerId, name },
    });
  }
  await prisma.pool.update({
    where: { id: pool.id },
    data: { chosenIdeaId: chosen.id, finalPriceCents: 21000 },
  });
  return pool;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe('person surface loader — ideation reads (circle-keyed)', () => {
  it('gift history is empty for a viewer who was not a contributor', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord();
    const other = await createUserRecord();
    await makeFriends(viewer.id, target.id);
    // Pool the viewer was NOT part of.
    await createDecidedPool({
      recipientId: target.id,
      contributorIds: [other.id],
      chosenName: 'Weber grill',
      eventDate: daysAgo(30),
    });

    const result = (await runLoader(viewer.id, target.username)) as any;
    expect(result.ideation.giftHistory).toEqual([]);
    expect(result.ideation.proposedUnused).toEqual([]);
  });

  it('gift history includes a past decided pool the viewer contributed to', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord();
    await makeFriends(viewer.id, target.id);
    await createDecidedPool({
      recipientId: target.id,
      contributorIds: [viewer.id],
      chosenName: 'Weber grill',
      eventDate: daysAgo(30),
      otherIdeas: ['Espresso machine'],
    });

    const result = (await runLoader(viewer.id, target.username)) as any;
    expect(result.ideation.giftHistory).toHaveLength(1);
    expect(result.ideation.giftHistory[0].name).toBe('Weber grill');
    // Proposed-but-unused excludes the chosen idea.
    expect(result.ideation.proposedUnused.map((i: any) => i.name)).toEqual([
      'Espresso machine',
    ]);
  });

  it('excludes the active-cycle pool (future event date) from gift history', async () => {
    const viewer = await createUserRecord();
    const target = await createUserRecord();
    await makeFriends(viewer.id, target.id);
    await createDecidedPool({
      recipientId: target.id,
      contributorIds: [viewer.id],
      chosenName: 'This year gift',
      eventDate: soon(), // future → still mid-flight
    });

    const result = (await runLoader(viewer.id, target.username)) as any;
    expect(result.ideation.giftHistory).toEqual([]);
  });

  it('notes and saved ideas are private to their author/owner', async () => {
    const author = await createUserRecord();
    const other = await createUserRecord();
    const target = await createUserRecord();
    await makeFriends(author.id, target.id);
    await makeFriends(other.id, target.id);

    await prisma.personNote.create({
      data: { authorId: author.id, subjectUserId: target.id, body: 'secret' },
    });
    await prisma.giftListItem.create({
      data: { ownerId: author.id, targetUserId: target.id, name: 'Shoes' },
    });

    // The author sees their own note + saved idea.
    const authorResult = (await runLoader(author.id, target.username)) as any;
    expect(authorResult.ideation.notes).toHaveLength(1);
    expect(authorResult.ideation.savedIdeas).toHaveLength(1);

    // Another viewer (also a friend of the target) sees neither.
    const otherResult = (await runLoader(other.id, target.username)) as any;
    expect(otherResult.ideation.notes).toEqual([]);
    expect(otherResult.ideation.savedIdeas).toEqual([]);
  });
});
