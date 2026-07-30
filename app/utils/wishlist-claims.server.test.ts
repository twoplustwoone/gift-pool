/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { NOTIFICATION_TYPES } from '#app/utils/notification-catalog.ts';
import { createUser } from '#tests/db-utils.ts';
import { cancelPool, chooseIdea } from './pool.server.ts';
import * as wishlistClaims from './wishlist-claims.server.ts';
import {
  claimForUser,
  loadClaimStates,
  loadIdeaClaimConflicts,
  releaseUserClaim,
  syncPoolClaim,
} from './wishlist-claims.server.ts';

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
      claim: { claimedByUserId: null },
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

describe('syncPoolClaim', () => {
  it('claims a free wishlist item when the pool decides', async () => {
    const { owner, organizer, item } = await fixture();
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    const result = await syncPoolClaim(pool.id);
    expect(result.claimedItemId).toBe(item.id);
    expect(result.conflictedItemId).toBeNull();
    const claim = await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } });
    expect(claim?.poolId).toBe(pool.id);
  });

  it('reports a conflict and takes nothing when a person already holds it', async () => {
    const { owner, friend, organizer, item } = await fixture();
    await claimForUser(item.id, friend.id);
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());

    const result = await syncPoolClaim(pool.id);

    expect(result.claimedItemId).toBeNull();
    expect(result.conflictedItemId).toBe(item.id);
    const claim = await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } });
    expect(claim?.claimedByUserId).toBe(friend.id);
  });

  it('releases the old item and settles it when the pool re-decides', async () => {
    const { owner, organizer, item } = await fixture();
    const other = await prisma.wishlistItem.create({
      data: { ownerId: owner.id, title: 'Headphones', type: 'item', sortOrder: 1 },
    });
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    await syncPoolClaim(pool.id);

    const newIdea = await prisma.giftIdea.create({
      data: { poolId: pool.id, proposedById: organizer.id, name: 'Headphones', wishlistItemId: other.id },
    });
    await chooseIdea(pool.id, newIdea.id, organizer.id);

    expect(await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } })).toBeNull();
    const moved = await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: other.id } });
    expect(moved?.poolId).toBe(pool.id);
  });

  it('reports a released item as transferred when settlement hands it to a waiting pool', async () => {
    const { owner, organizer, item } = await fixture();
    const other = await prisma.wishlistItem.create({
      data: { ownerId: owner.id, title: 'Headphones', type: 'item', sortOrder: 1 },
    });
    const holder = await decidedPoolFor(item.id, owner.id, organizer.id, new Date('2026-07-01'));
    await syncPoolClaim(holder.id);

    // A second pool has intent on the same item and is left waiting behind the holder.
    const waiter = await decidedPoolFor(item.id, owner.id, organizer.id, new Date('2026-07-10'));

    // The holder re-decides onto a different item, freeing `item` for the waiter.
    const newIdea = await prisma.giftIdea.create({
      data: {
        poolId: holder.id,
        proposedById: organizer.id,
        name: 'Headphones',
        wishlistItemId: other.id,
      },
    });
    await prisma.pool.update({
      where: { id: holder.id },
      data: { chosenIdeaId: newIdea.id, decidedAt: new Date('2026-07-15') },
    });

    const result = await syncPoolClaim(holder.id);

    expect(result.released).toEqual([
      { wishlistItemId: item.id, transferredToPoolId: waiter.id },
    ]);
    const claim = await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } });
    expect(claim?.poolId).toBe(waiter.id);
  });

  it('releases the claim when the pool is cancelled', async () => {
    const { owner, organizer, item } = await fixture();
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    await syncPoolClaim(pool.id);
    await cancelPool(pool.id, organizer.id);
    expect(await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } })).toBeNull();
  });
});

describe('chooseIdea + claim sync atomicity', () => {
  it('rolls back the DECIDED transition when the claim sync fails mid-transaction', async () => {
    // Regression for the P1 finding: chooseIdea's status transition and its
    // claim sync used to be two separate writes, leaving a window where a
    // concurrent solo claim could steal the item a pool just decided on —
    // and a sync failure left the pool stuck DECIDED with no claim and no
    // retry path. They now commit inside one `prisma.$transaction`, so a
    // rejection from the sync must roll back the pool's status change too.
    // Spying on the real `syncPoolClaimInTx` export (rather than mocking the
    // whole module) keeps this a real Prisma transaction end to end — only
    // the sync's outcome is forced to fail.
    const { owner, organizer, item } = await fixture();
    const pool = await prisma.pool.create({
      data: { title: 'Birthday pool', organizerId: organizer.id, recipientUserId: owner.id },
    });
    const idea = await prisma.giftIdea.create({
      data: { poolId: pool.id, proposedById: organizer.id, name: 'Spa voucher', wishlistItemId: item.id },
    });

    const spy = vi
      .spyOn(wishlistClaims, 'syncPoolClaimInTx')
      .mockRejectedValueOnce(new Error('claim sync boom'));

    await expect(chooseIdea(pool.id, idea.id, organizer.id)).rejects.toThrow('claim sync boom');

    const reloaded = await prisma.pool.findUniqueOrThrow({ where: { id: pool.id } });
    expect(reloaded.status).not.toBe('DECIDED');
    expect(reloaded.chosenIdeaId).toBeNull();
    expect(await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } })).toBeNull();

    spy.mockRestore();
  });
});

describe('cancelPool + claim sync atomicity', () => {
  it('rolls back the CANCELLED transition when the claim sync fails mid-transaction', async () => {
    // Regression for the P1 finding: cancelPool used to set the pool
    // CANCELLED, then call a separately-transacted sync whose failures were
    // swallowed to Sentry — leaving a cancelled pool that still owned its
    // wishlist claim, with no retry path (cancelPool early-returns once the
    // pool already reads CANCELLED). The status transition and the claim
    // sync now commit inside one `prisma.$transaction`, so a rejection from
    // the sync must roll back the cancellation too.
    const { owner, organizer, item } = await fixture();
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    await syncPoolClaim(pool.id);

    const spy = vi
      .spyOn(wishlistClaims, 'syncPoolClaimInTx')
      .mockRejectedValueOnce(new Error('claim sync boom'));

    await expect(cancelPool(pool.id, organizer.id)).rejects.toThrow('claim sync boom');

    const reloaded = await prisma.pool.findUniqueOrThrow({ where: { id: pool.id } });
    expect(reloaded.status).not.toBe('CANCELLED');
    // The pool must still hold its claim — the bug this regression closes is
    // a cancelled pool that lost its claim with no way to get it back.
    const claim = await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } });
    expect(claim?.poolId).toBe(pool.id);

    spy.mockRestore();
  });
});

describe('releaseSoloClaimForItem', () => {
  it('hands the item to a waiting pool instead of leaving it unclaimed', async () => {
    // Regression for the P1 finding: the owner-archive route used to
    // bare-delete a solo claim without settling it, so a pool that had
    // already decided on the item was left with no claim after the owner
    // archived (or restored) it.
    const { owner, friend, organizer, item } = await fixture();
    await claimForUser(item.id, friend.id);
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());

    const result = await wishlistClaims.releaseSoloClaimForItem(item.id);

    expect(result).toEqual({ ok: true, transferredToPoolId: pool.id });
    const claim = await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } });
    expect(claim?.poolId).toBe(pool.id);
    expect(claim?.claimedByUserId).toBeNull();
  });

  it('leaves a pool-held claim untouched', async () => {
    const { owner, organizer, item } = await fixture();
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    await syncPoolClaim(pool.id);

    const result = await wishlistClaims.releaseSoloClaimForItem(item.id);

    expect(result).toEqual({ ok: false, transferredToPoolId: null });
    const claim = await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } });
    expect(claim?.poolId).toBe(pool.id);
  });

  it('is a no-op when the item has no claim', async () => {
    const { item } = await fixture();
    const result = await wishlistClaims.releaseSoloClaimForItem(item.id);
    expect(result).toEqual({ ok: false, transferredToPoolId: null });
  });
});

describe('claimForUser losing a race', () => {
  it('tells the loser of a concurrent race the winning claim, not a pre-race null', async () => {
    // Regression for the P2 finding: the caller (purchase.ts) used to send
    // back the claim state it read *before* calling claimForUser — null, for
    // a free item — so a loser of a genuine concurrent race had its UI
    // reconciled back to "unclaimed" even though the winner's row already
    // existed. claimForUser must report the actual post-race state.
    const { friend, organizer, item } = await fixture();

    const results = await Promise.all([
      claimForUser(item.id, friend.id),
      claimForUser(item.id, organizer.id),
    ]);

    const loser = results.find((r) => !r.ok);
    expect(loser).toBeDefined();
    if (!loser || loser.ok) throw new Error('expected a losing outcome');
    expect(loser.reason).toBe('held-by-user');
    // The loser must be told the actual winner, not null.
    expect(loser.claim.claimedByUserId).not.toBeNull();
    expect([friend.id, organizer.id]).toContain(loser.claim.claimedByUserId);

    const claim = await prisma.wishlistClaim.findUniqueOrThrow({
      where: { wishlistItemId: item.id },
    });
    expect(loser.claim.claimedByUserId).toBe(claim.claimedByUserId);
  });

  it('reports a pre-existing user claim without needing a race', async () => {
    const { friend, organizer, item } = await fixture();
    await prisma.wishlistClaim.create({
      data: { wishlistItemId: item.id, claimedByUserId: organizer.id },
    });

    const result = await claimForUser(item.id, friend.id);

    expect(result).toEqual({
      ok: false,
      reason: 'held-by-user',
      claim: { claimedByUserId: organizer.id },
    });
  });

  it('reports a pool-held claim with the null-claimedByUserId sentinel', async () => {
    const { owner, friend, organizer, item } = await fixture();
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    await syncPoolClaim(pool.id);

    const result = await claimForUser(item.id, friend.id);

    expect(result).toEqual({
      ok: false,
      reason: 'held-by-pool',
      claim: { claimedByUserId: null },
    });
  });
});

describe('loadClaimStates', () => {
  it('returns nothing at all for the wishlist owner', async () => {
    const { owner, friend, item } = await fixture();
    await claimForUser(item.id, friend.id);
    const states = await loadClaimStates([item.id], { userId: owner.id, isOwner: true });
    expect(states.get(item.id)?.show).toBe(false);
  });

  it('names the pool to one of its contributors and not to an outsider', async () => {
    const { owner, friend, organizer, item } = await fixture();
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    await prisma.poolContributor.create({ data: { poolId: pool.id, userId: organizer.id } });
    await syncPoolClaim(pool.id);

    const inside = await loadClaimStates([item.id], { userId: organizer.id, isOwner: false });
    expect(inside.get(item.id)?.name).toBe('Birthday pool');

    const outside = await loadClaimStates([item.id], { userId: friend.id, isOwner: false });
    expect(outside.get(item.id)?.text).toBe('Already claimed');
    expect(JSON.stringify(outside.get(item.id))).not.toContain('Birthday pool');
  });

  it('gives an anonymous viewer claim state with zero attribution', async () => {
    const { owner, organizer, item } = await fixture();
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    await syncPoolClaim(pool.id);
    const states = await loadClaimStates([item.id], { userId: null, isOwner: false });
    expect(states.get(item.id)?.show).toBe(true);
    expect(states.get(item.id)?.name).toBeNull();
  });

  it('stops naming the group to a member who has been removed from it', async () => {
    const { owner, friend, organizer, item } = await fixture();
    const group = await prisma.giftGroup.create({
      data: { name: 'Sunday Roasters', createdById: organizer.id },
    });
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    await prisma.pool.update({ where: { id: pool.id }, data: { giftGroupId: group.id } });
    await syncPoolClaim(pool.id);
    const membership = await prisma.usersInGiftGroups.create({
      data: { userId: friend.id, giftGroupId: group.id },
    });

    const asMember = await loadClaimStates([item.id], { userId: friend.id, isOwner: false });
    expect(asMember.get(item.id)?.name).toBe('Sunday Roasters');

    // The membership row survives removal — only removedAt makes it non-current.
    await prisma.usersInGiftGroups.update({
      where: { userId_giftGroupId: { userId: membership.userId, giftGroupId: group.id } },
      data: { removedAt: new Date() },
    });

    const afterRemoval = await loadClaimStates([item.id], { userId: friend.id, isOwner: false });
    expect(afterRemoval.get(item.id)?.name).toBeNull();
    expect(JSON.stringify(afterRemoval.get(item.id))).not.toContain('Sunday Roasters');
  });

  it('defaults to the label surface when no surface argument is given', async () => {
    const { owner, organizer, item } = await fixture();
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    await prisma.poolContributor.create({ data: { poolId: pool.id, userId: organizer.id } });
    await syncPoolClaim(pool.id);

    const defaulted = await loadClaimStates([item.id], { userId: organizer.id, isOwner: false });
    const explicitLabel = await loadClaimStates(
      [item.id],
      { userId: organizer.id, isOwner: false },
      'label',
    );
    expect(defaulted.get(item.id)).toEqual(explicitLabel.get(item.id));
    expect(defaulted.get(item.id)?.name).toBe('Birthday pool');
  });

  it("the 'row' surface names nobody, even to a viewer the label surface would name", async () => {
    const { owner, organizer, item } = await fixture();
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    await prisma.poolContributor.create({ data: { poolId: pool.id, userId: organizer.id } });
    await syncPoolClaim(pool.id);

    // Sanity: the label surface *would* name this pool to its own contributor.
    const label = await loadClaimStates([item.id], { userId: organizer.id, isOwner: false }, 'label');
    expect(label.get(item.id)?.name).toBe('Birthday pool');

    const row = await loadClaimStates([item.id], { userId: organizer.id, isOwner: false }, 'row');
    expect(row.get(item.id)?.show).toBe(true);
    expect(row.get(item.id)?.name).toBeNull();
    expect(row.get(item.id)?.poolLink).toBeNull();
    expect(row.get(item.id)?.text).toBe('Already claimed');
    expect(JSON.stringify(row.get(item.id))).not.toContain('Birthday pool');
  });
});

describe('loadIdeaClaimConflicts', () => {
  it('names a claimer who contributes to this pool, and not one who does not', async () => {
    const { owner, friend, organizer, item } = await fixture();
    await claimForUser(item.id, friend.id);
    const pool = await prisma.pool.create({
      data: { title: 'Pool', organizerId: organizer.id, recipientUserId: owner.id },
    });
    const idea = await prisma.giftIdea.create({
      data: { poolId: pool.id, proposedById: organizer.id, name: 'Spa', wishlistItemId: item.id },
    });
    await prisma.poolContributor.create({ data: { poolId: pool.id, userId: organizer.id } });

    const outside = await loadIdeaClaimConflicts(pool.id, organizer.id);
    expect(outside.get(idea.id)?.name).toBeNull();
    expect(outside.get(idea.id)?.text).toBe('Already claimed');
    // Negative containment: the claimer's identity must not leak into the
    // serialised disclosure even indirectly (e.g. via an unused field).
    expect(JSON.stringify(outside.get(idea.id))).not.toContain(friend.id);

    await prisma.poolContributor.create({ data: { poolId: pool.id, userId: friend.id } });
    const inside = await loadIdeaClaimConflicts(pool.id, organizer.id);
    expect(inside.get(idea.id)?.name).not.toBeNull();
    expect(inside.get(idea.id)?.tone).toBe('warning');
  });

  it('is absent for an idea whose item this same pool already holds the claim on', async () => {
    const { owner, organizer, item } = await fixture();
    const pool = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    const idea = await prisma.giftIdea.findFirstOrThrow({ where: { poolId: pool.id } });
    await syncPoolClaim(pool.id);

    const conflicts = await loadIdeaClaimConflicts(pool.id, organizer.id);

    expect(conflicts.has(idea.id)).toBe(false);
  });

  it('never names a rival pool, even to a viewer who also contributes there', async () => {
    const { owner, organizer, item } = await fixture();
    const holder = await decidedPoolFor(item.id, owner.id, organizer.id, new Date());
    await syncPoolClaim(holder.id);

    // A second pool proposes the same (now pool-claimed) item as an idea.
    const viewerPool = await prisma.pool.create({
      data: { title: 'Rival viewing pool', organizerId: organizer.id, recipientUserId: owner.id },
    });
    const idea = await prisma.giftIdea.create({
      data: {
        poolId: viewerPool.id,
        proposedById: organizer.id,
        name: 'Spa voucher',
        wishlistItemId: item.id,
      },
    });
    // The viewer contributes to both pools — must still learn nothing about
    // the holder pool's identity from this surface.
    await prisma.poolContributor.create({ data: { poolId: holder.id, userId: organizer.id } });
    await prisma.poolContributor.create({ data: { poolId: viewerPool.id, userId: organizer.id } });

    const conflicts = await loadIdeaClaimConflicts(viewerPool.id, organizer.id);

    expect(conflicts.get(idea.id)?.text).toBe('Another group is getting this');
    expect(conflicts.get(idea.id)?.name).toBeNull();
    expect(conflicts.get(idea.id)?.poolLink).toBeNull();
    const serialised = JSON.stringify(conflicts.get(idea.id));
    expect(serialised).not.toContain('Birthday pool');
    expect(serialised).not.toContain(holder.id);
  });

  it('returns an empty map when the pool has no ideas linked to wishlist items', async () => {
    const { owner, organizer } = await fixture();
    const pool = await prisma.pool.create({
      data: { title: 'Empty pool', organizerId: organizer.id, recipientUserId: owner.id },
    });
    const conflicts = await loadIdeaClaimConflicts(pool.id, organizer.id);
    expect(conflicts.size).toBe(0);
  });
});

async function conflictNotificationsFor(userId: string) {
  return prisma.notification.findMany({
    where: { userId, type: NOTIFICATION_TYPES.WISHLIST_CLAIM_CONFLICT },
    select: { sourceIdentifier: true },
  });
}

describe('wishlist claim conflict notification — occurrence key (real ledger)', () => {
  // These exercise the real `queueNotification` -> `dispatchNotification` ->
  // `NotificationDelivery` ledger path (unmocked, same as the rest of this
  // file), because the bug this regression closes lives entirely in whether
  // the ledger key changes at the right times — a test that mocks
  // `queueNotification` can only assert what key was *computed*, not that the
  // ledger actually deduped or didn't.

  it('does not duplicate the same still-live conflict across a re-decision', async () => {
    const { owner, friend, organizer, item } = await fixture();
    await claimForUser(item.id, friend.id);
    const other = await prisma.wishlistItem.create({
      data: { ownerId: owner.id, title: 'Headphones', type: 'item', sortOrder: 1 },
    });
    const pool = await prisma.pool.create({
      data: { title: 'Birthday pool', organizerId: organizer.id, recipientUserId: owner.id },
    });
    const ideaA = await prisma.giftIdea.create({
      data: { poolId: pool.id, proposedById: organizer.id, name: 'Spa voucher', wishlistItemId: item.id },
    });
    const ideaB = await prisma.giftIdea.create({
      data: { poolId: pool.id, proposedById: organizer.id, name: 'Headphones', wishlistItemId: other.id },
    });

    // First decision on the claimed item: a real conflict, one notification.
    await chooseIdea(pool.id, ideaA.id, organizer.id);
    await vi.waitFor(async () => {
      expect(await conflictNotificationsFor(friend.id)).toHaveLength(1);
    });

    // The organizer changes their mind (item B, unclaimed — no conflict),
    // then re-decides back onto the still-claimed item. `friend` never
    // released or re-claimed in between, so this is the exact same
    // WishlistClaim row as before — not a new conflict.
    await chooseIdea(pool.id, ideaB.id, organizer.id);
    await chooseIdea(pool.id, ideaA.id, organizer.id);

    // Give the (unawaited) fanout a beat to run, then assert the count never
    // grew past the original one.
    await vi.waitFor(async () => {
      const claim = await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } });
      expect(claim?.claimedByUserId).toBe(friend.id);
    });
    expect(await conflictNotificationsFor(friend.id)).toHaveLength(1);
  });

  it('notifies again when the same item conflicts a second time on a freshly re-claimed WishlistClaim', async () => {
    const { owner, friend, organizer, item } = await fixture();
    await claimForUser(item.id, friend.id);
    const other = await prisma.wishlistItem.create({
      data: { ownerId: owner.id, title: 'Headphones', type: 'item', sortOrder: 1 },
    });
    const pool = await prisma.pool.create({
      data: { title: 'Birthday pool', organizerId: organizer.id, recipientUserId: owner.id },
    });
    const ideaA = await prisma.giftIdea.create({
      data: { poolId: pool.id, proposedById: organizer.id, name: 'Spa voucher', wishlistItemId: item.id },
    });
    const ideaB = await prisma.giftIdea.create({
      data: { poolId: pool.id, proposedById: organizer.id, name: 'Headphones', wishlistItemId: other.id },
    });

    await chooseIdea(pool.id, ideaA.id, organizer.id);
    await vi.waitFor(async () => {
      expect(await conflictNotificationsFor(friend.id)).toHaveLength(1);
    });
    const firstClaim = await prisma.wishlistClaim.findUniqueOrThrow({
      where: { wishlistItemId: item.id },
    });

    // The pool moves on, freeing its intent on the item.
    await chooseIdea(pool.id, ideaB.id, organizer.id);
    // The holder releases (no pool is waiting on it now, so it goes fully
    // free — not transferred), then someone re-claims it. This is a brand
    // new WishlistClaim row, not the one the first notification was about.
    await releaseUserClaim(item.id, friend.id);
    expect(await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } })).toBeNull();
    await claimForUser(item.id, friend.id);
    const secondClaim = await prisma.wishlistClaim.findUniqueOrThrow({
      where: { wishlistItemId: item.id },
    });
    expect(secondClaim.id).not.toBe(firstClaim.id);

    // The pool decides on the item again: a genuinely new conflict against
    // the new claim.
    await chooseIdea(pool.id, ideaA.id, organizer.id);

    await vi.waitFor(async () => {
      expect(await conflictNotificationsFor(friend.id)).toHaveLength(2);
    });
    const sourceIdentifiers = (await conflictNotificationsFor(friend.id)).map(
      (row) => row.sourceIdentifier,
    );
    expect(new Set(sourceIdentifiers).size).toBe(2);
  });
});

describe('wishlist claim transfer notification (real DB, via chooseIdea/cancelPool)', () => {
  // `queueWishlistClaimTransferredNotification` fans out to every contributor
  // of the pool that just inherited a claim — the "your duplicate-purchase
  // risk is over" half of the conflict story. Both call sites (`chooseIdea`
  // re-deciding away from a held item, and `cancelPool`) only reach this
  // branch when settlement actually hands the freed item to a *different*,
  // waiting pool — so the fixture always sets up a holder and a waiter.

  it('notifies every contributor of the waiting pool when chooseIdea re-decides away from a held item', async () => {
    const { owner, organizer, item } = await fixture();
    const other = await prisma.wishlistItem.create({
      data: { ownerId: owner.id, title: 'Headphones', type: 'item', sortOrder: 1 },
    });
    const holder = await decidedPoolFor(item.id, owner.id, organizer.id, new Date('2026-07-01'));
    await syncPoolClaim(holder.id);
    const waiter = await decidedPoolFor(item.id, owner.id, organizer.id, new Date('2026-07-10'));
    const waiterContributor = await prisma.user.create({ data: createUser() });
    await prisma.poolContributor.create({ data: { poolId: waiter.id, userId: waiterContributor.id } });

    const newIdea = await prisma.giftIdea.create({
      data: { poolId: holder.id, proposedById: organizer.id, name: 'Headphones', wishlistItemId: other.id },
    });

    await chooseIdea(holder.id, newIdea.id, organizer.id);

    await vi.waitFor(async () => {
      const rows = await prisma.notification.findMany({
        where: { userId: waiterContributor.id, type: NOTIFICATION_TYPES.WISHLIST_CLAIM_TRANSFERRED },
      });
      expect(rows).toHaveLength(1);
    });
    const notification = await prisma.notification.findFirstOrThrow({
      where: { userId: waiterContributor.id, type: NOTIFICATION_TYPES.WISHLIST_CLAIM_TRANSFERRED },
    });
    // The persisted row's sourceIdentifier is the per-channel ledger key
    // (`<occurrenceKey>:<channel>`); assert the occurrence key itself.
    expect(notification.sourceIdentifier).toBe(
      `claim-transferred:${waiter.id}:${item.id}:IN_APP`,
    );
    // The item really did move to the waiter — the notification isn't lying.
    const claim = await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } });
    expect(claim?.poolId).toBe(waiter.id);
  });

  it('notifies every contributor of the waiting pool when cancelPool releases a held claim', async () => {
    const { owner, organizer, item } = await fixture();
    const holder = await decidedPoolFor(item.id, owner.id, organizer.id, new Date('2026-07-01'));
    await syncPoolClaim(holder.id);
    const waiter = await decidedPoolFor(item.id, owner.id, organizer.id, new Date('2026-07-10'));
    const waiterContributor = await prisma.user.create({ data: createUser() });
    await prisma.poolContributor.create({ data: { poolId: waiter.id, userId: waiterContributor.id } });

    await cancelPool(holder.id, organizer.id);

    await vi.waitFor(async () => {
      const rows = await prisma.notification.findMany({
        where: { userId: waiterContributor.id, type: NOTIFICATION_TYPES.WISHLIST_CLAIM_TRANSFERRED },
      });
      expect(rows).toHaveLength(1);
    });
    const claim = await prisma.wishlistClaim.findUnique({ where: { wishlistItemId: item.id } });
    expect(claim?.poolId).toBe(waiter.id);
  });
});
