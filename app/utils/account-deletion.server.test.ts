/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';

vi.mock('#app/utils/exchange-notifications.server.ts', () => ({
  queueExchangeStarted: vi.fn(),
  queueExchangeNamesDrawn: vi.fn(),
  queueExchangeRevealed: vi.fn(),
  queueExchangeCancelled: vi.fn(),
  queueExchangeNotesDelivered: vi.fn(),
}));

import { prepareAccountForDeletion } from './account-deletion.server.ts';

vi.setConfig({ testTimeout: 20_000 });

const makeUser = (name: string) =>
  prisma.user.create({
    data: { ...createUser(), name },
    select: { id: true, name: true },
  });

// Exactly what the settings action does: prepare and delete in one
// transaction. Every test goes through this, because the point of the module
// is that `prisma.user.delete` succeeds afterwards.
async function deleteAccount(userId: string) {
  return prisma.$transaction(async (tx) => {
    const summary = await prepareAccountForDeletion({ userId, db: tx });
    await tx.user.delete({ where: { id: userId } });
    return summary;
  });
}

const statusOf = (err: unknown): number | undefined => {
  const e = err as { status?: number; init?: { status?: number } };
  return e?.init?.status ?? e?.status;
};

let leaver: Awaited<ReturnType<typeof makeUser>>;
let other: Awaited<ReturnType<typeof makeUser>>;
let third: Awaited<ReturnType<typeof makeUser>>;

beforeEach(async () => {
  [leaver, other, third] = await Promise.all([
    makeUser('Francisco'),
    makeUser('Nicolas'),
    makeUser('Agustin'),
  ]);
});

async function makeGroup(
  members: Array<{ id: string; role: string }>,
  name = 'The Painted',
) {
  return prisma.giftGroup.create({
    data: {
      name,
      groupMembers: {
        create: members.map((m) => ({ userId: m.id, role: m.role })),
      },
    },
    select: { id: true },
  });
}

async function makePool(
  giftGroupId: string,
  organizerId: string,
  contributorIds: string[],
) {
  return prisma.pool.create({
    data: {
      title: 'A bike',
      giftGroupId,
      organizerId,
      contributors: {
        create: contributorIds.map((userId) => ({ userId })),
      },
    },
    select: { id: true },
  });
}

describe('prepareAccountForDeletion', () => {
  it('lets a group member delete their account at all', async () => {
    // The regression: `UsersInGiftGroups.userId` is ON DELETE RESTRICT, so
    // before this module every real user's "Delete all my data" threw.
    const group = await makeGroup([
      { id: leaver.id, role: 'MEMBER' },
      { id: other.id, role: 'OWNER' },
    ]);

    await deleteAccount(leaver.id);

    expect(
      await prisma.user.findUnique({ where: { id: leaver.id } }),
    ).toBeNull();
    // The group and everyone else in it are untouched.
    const survivors = await prisma.usersInGiftGroups.findMany({
      where: { giftGroupId: group.id },
    });
    expect(survivors.map((s) => s.userId)).toEqual([other.id]);
  });

  it('gives a group a new owner rather than leaving it ownerless', async () => {
    const group = await makeGroup([
      { id: leaver.id, role: 'OWNER' },
      { id: other.id, role: 'MEMBER' },
      { id: third.id, role: 'ADMIN' },
    ]);

    const summary = await deleteAccount(leaver.id);
    expect(summary.groupsHandedOver).toEqual([group.id]);

    const rows = await prisma.usersInGiftGroups.findMany({
      where: { giftGroupId: group.id },
    });
    // The admin inherits ahead of the plain member.
    expect(rows.find((r) => r.userId === third.id)?.role).toBe('OWNER');
    expect(rows.find((r) => r.userId === other.id)?.role).toBe('MEMBER');
  });

  it('takes a group nobody else is in with them', async () => {
    const group = await makeGroup([{ id: leaver.id, role: 'OWNER' }]);

    const summary = await deleteAccount(leaver.id);

    expect(summary.groupsDeleted).toEqual([group.id]);
    expect(
      await prisma.giftGroup.findUnique({ where: { id: group.id } }),
    ).toBeNull();
  });

  it('hands a pool they organise to another contributor', async () => {
    const group = await makeGroup([
      { id: leaver.id, role: 'OWNER' },
      { id: other.id, role: 'MEMBER' },
    ]);
    const pool = await makePool(group.id, leaver.id, [leaver.id, other.id]);

    const summary = await deleteAccount(leaver.id);
    expect(summary.poolsHandedOver).toEqual([pool.id]);

    const after = await prisma.pool.findUnique({ where: { id: pool.id } });
    expect(after?.organizerId).toBe(other.id);
    const contributors = await prisma.poolContributor.findMany({
      where: { poolId: pool.id },
    });
    expect(contributors.map((c) => c.userId)).toEqual([other.id]);
  });

  it('takes a pool nobody else contributed to with them', async () => {
    const group = await makeGroup([
      { id: leaver.id, role: 'OWNER' },
      { id: other.id, role: 'MEMBER' },
    ]);
    const pool = await makePool(group.id, leaver.id, [leaver.id]);

    const summary = await deleteAccount(leaver.id);

    expect(summary.poolsDeleted).toEqual([pool.id]);
    expect(await prisma.pool.findUnique({ where: { id: pool.id } })).toBeNull();
  });

  it('refuses while a live pool is still counting on their idea', async () => {
    const group = await makeGroup([
      { id: leaver.id, role: 'MEMBER' },
      { id: other.id, role: 'OWNER' },
    ]);
    const pool = await makePool(group.id, other.id, [leaver.id, other.id]);
    const idea = await prisma.giftIdea.create({
      data: { poolId: pool.id, proposedById: leaver.id, name: 'A telescope' },
      select: { id: true },
    });
    await prisma.pool.update({
      where: { id: pool.id },
      data: { chosenIdeaId: idea.id, status: 'DECIDED' },
    });

    let caught: unknown;
    try {
      await deleteAccount(leaver.id);
    } catch (err) {
      caught = err;
    }
    expect(statusOf(caught)).toBe(409);
    expect((caught as { data: { error: string } }).data.error).toContain(
      'A telescope',
    );
    // Nothing was taken apart on the way to refusing.
    expect(
      await prisma.user.findUnique({ where: { id: leaver.id } }),
    ).not.toBeNull();
    expect(
      (await prisma.pool.findUnique({ where: { id: pool.id } }))?.chosenIdeaId,
    ).toBe(idea.id);
  });

  it('lets them go once the gift has actually been bought', async () => {
    // A purchased or delivered pool is finished: nobody can choose a different
    // idea on it, so refusing would bar this account from ever being deleted
    // with no action that could unblock it.
    const group = await makeGroup([
      { id: leaver.id, role: 'MEMBER' },
      { id: other.id, role: 'OWNER' },
    ]);
    const pool = await makePool(group.id, other.id, [leaver.id, other.id]);
    const idea = await prisma.giftIdea.create({
      data: { poolId: pool.id, proposedById: leaver.id, name: 'A telescope' },
      select: { id: true },
    });
    await prisma.pool.update({
      where: { id: pool.id },
      data: { chosenIdeaId: idea.id, status: 'PURCHASED' },
    });

    await deleteAccount(leaver.id);

    expect(
      await prisma.user.findUnique({ where: { id: leaver.id } }),
    ).toBeNull();
    // The pool survives; it loses only the record of which idea won.
    const after = await prisma.pool.findUnique({ where: { id: pool.id } });
    expect(after?.status).toBe('PURCHASED');
    expect(after?.chosenIdeaId).toBeNull();
  });

  it('clears the ideas, votes and messages that are theirs alone', async () => {
    const group = await makeGroup([
      { id: leaver.id, role: 'MEMBER' },
      { id: other.id, role: 'OWNER' },
    ]);
    const pool = await makePool(group.id, other.id, [leaver.id, other.id]);
    const mine = await prisma.giftIdea.create({
      data: { poolId: pool.id, proposedById: leaver.id, name: 'A kite' },
      select: { id: true },
    });
    const theirs = await prisma.giftIdea.create({
      data: { poolId: pool.id, proposedById: other.id, name: 'A book' },
      select: { id: true },
    });
    await prisma.ideaVote.create({
      data: { poolId: pool.id, ideaId: theirs.id, voterId: leaver.id },
    });
    await prisma.poolMessage.create({
      data: { poolId: pool.id, authorId: leaver.id, body: 'I like the book' },
    });
    await prisma.groupActivity.create({
      data: {
        giftGroupId: group.id,
        actorId: leaver.id,
        type: 'MEMBER_JOINED',
        payload: '{}',
      },
    });

    await deleteAccount(leaver.id);

    expect(
      await prisma.giftIdea.findUnique({ where: { id: mine.id } }),
    ).toBeNull();
    // Someone else's idea survives, minus the departing person's vote.
    expect(
      await prisma.giftIdea.findUnique({ where: { id: theirs.id } }),
    ).not.toBeNull();
    expect(await prisma.ideaVote.count({ where: { poolId: pool.id } })).toBe(0);
    expect(await prisma.poolMessage.count({ where: { poolId: pool.id } })).toBe(
      0,
    );
    expect(
      await prisma.groupActivity.count({ where: { giftGroupId: group.id } }),
    ).toBe(0);
    // And the pool itself is still there for the people who remain.
    expect(
      await prisma.pool.findUnique({ where: { id: pool.id } }),
    ).not.toBeNull();
  });
});
