/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import { claimForUser, releaseUserClaim } from './wishlist-claims.server.ts';

async function fixture() {
  const [owner, friend, organizer] = await Promise.all([
    prisma.user.create({ data: createUser() }),
    prisma.user.create({ data: createUser() }),
    prisma.user.create({ data: createUser() }),
  ]);
  const item = await prisma.wishlistItem.create({
    data: { ownerId: owner.id, title: 'Spa voucher', type: 'item', sortOrder: 0 },
  });
  return { owner, friend, organizer, item };
}

async function decidedPoolFor(
  itemId: string,
  recipientId: string,
  organizerId: string,
  decidedAt: Date,
) {
  const pool = await prisma.pool.create({
    data: { title: 'Birthday pool', organizerId, recipientUserId: recipientId },
  });
  const idea = await prisma.giftIdea.create({
    data: { poolId: pool.id, proposedById: organizerId, name: 'Spa voucher', wishlistItemId: itemId },
  });
  await prisma.pool.update({
    where: { id: pool.id },
    data: { status: 'DECIDED', chosenIdeaId: idea.id, decidedAt },
  });
  return pool;
}

describe('claimForUser', () => {
  it('grants a claim on a free item', async () => {
    const { friend, item } = await fixture();
    await expect(claimForUser(item.id, friend.id)).resolves.toEqual({ ok: true });
    const claim = await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } });
    expect(claim?.claimedByUserId).toBe(friend.id);
    expect(claim?.poolId).toBeNull();
  });

  it('refuses when a pool holds the claim, and says so distinctly', async () => {
    const { owner, friend, organizer, item } = await fixture();
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    await prisma.wishlistClaim.create({ data: { wishlistItemId: item.id, poolId: pool.id } });
    await expect(claimForUser(item.id, friend.id)).resolves.toEqual({
      ok: false,
      reason: 'held-by-pool',
    });
  });

  it('resolves a concurrent race on the same free item without throwing', async () => {
    const { friend, organizer, item } = await fixture();

    const results = await Promise.all([
      claimForUser(item.id, friend.id),
      claimForUser(item.id, organizer.id),
    ]);

    const oks = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ ok: false, reason: 'held-by-user' });

    const claims = await prisma.wishlistClaim.findMany({ where: { wishlistItemId: item.id } });
    expect(claims).toHaveLength(1);
  });
});

describe('settlement on release', () => {
  it('hands a released claim to a pool that has intent — the orphaned-claim fix', async () => {
    const { owner, friend, organizer, item } = await fixture();
    await claimForUser(item.id, friend.id);
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());

    const result = await releaseUserClaim(item.id, friend.id);

    expect(result.transferredToPoolId).toBe(pool.id);
    const claim = await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } });
    expect(claim?.poolId).toBe(pool.id);
    expect(claim?.claimedByUserId).toBeNull();
  });

  it('frees the item when no pool has intent', async () => {
    const { friend, item } = await fixture();
    await claimForUser(item.id, friend.id);
    const result = await releaseUserClaim(item.id, friend.id);
    expect(result.transferredToPoolId).toBeNull();
    expect(await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } })).toBeNull();
  });

  it('gives the claim to the earliest decision when two pools have intent', async () => {
    const { owner, friend, organizer, item } = await fixture();
    await claimForUser(item.id, friend.id);
    const later = await decidedPoolFor(item.id, owner.id, organizer.id, new Date('2026-07-20'));
    const earlier = await decidedPoolFor(item.id, owner.id, organizer.id, new Date('2026-07-10'));

    const result = await releaseUserClaim(item.id, friend.id);

    expect(result.transferredToPoolId).toBe(earlier.id);
    expect(result.transferredToPoolId).not.toBe(later.id);
  });

  it('prefers a pool with a real decidedAt over one with a null decidedAt, even when the null one is older', async () => {
    // SQLite sorts NULL before every value in `ORDER BY ... ASC`, so a naive
    // `orderBy: [{ decidedAt: 'asc' }, { createdAt: 'asc' }]` would let this
    // null-dated (legacy, not-yet-backfilled) pool permanently outrank a
    // correctly-dated one, regardless of createdAt. This must fail against
    // that orderBy and pass once settlement sorts nulls-last in JS.
    const { owner, friend, organizer, item } = await fixture();
    await claimForUser(item.id, friend.id);

    const nullDatedPool = await prisma.pool.create({
      data: { title: 'Legacy pool', organizerId: organizer.id, recipientUserId: owner.id },
    });
    const nullIdea = await prisma.giftIdea.create({
      data: {
        poolId: nullDatedPool.id,
        proposedById: organizer.id,
        name: 'Spa voucher',
        wishlistItemId: item.id,
      },
    });
    await prisma.pool.update({
      where: { id: nullDatedPool.id },
      data: { status: 'DECIDED', chosenIdeaId: nullIdea.id },
    });

    const datedPool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date('2026-07-20'));

    const result = await releaseUserClaim(item.id, friend.id);

    expect(result.transferredToPoolId).toBe(datedPool.id);
    expect(result.transferredToPoolId).not.toBe(nullDatedPool.id);
  });

  it('ignores a cancelled pool when settling', async () => {
    const { owner, friend, organizer, item } = await fixture();
    await claimForUser(item.id, friend.id);
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    await prisma.pool.update({ where: { id: pool.id }, data: { status: 'CANCELLED' } });

    const result = await releaseUserClaim(item.id, friend.id);
    expect(result.transferredToPoolId).toBeNull();
  });

  it('refuses to release a claim the caller does not hold', async () => {
    const { friend, organizer, item } = await fixture();
    await claimForUser(item.id, friend.id);
    const result = await releaseUserClaim(item.id, organizer.id);
    expect(result.ok).toBe(false);
    const claim = await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } });
    expect(claim?.claimedByUserId).toBe(friend.id);
  });
});
