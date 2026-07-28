/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import { cleanupWishlistClaimsForOwner } from './wishlist.server.ts';

describe('cleanupWishlistClaimsForOwner', () => {
  it('does not delete a pool-held claim, even though the pool has no claimedByUser relation', async () => {
    const owner = await prisma.user.create({ data: createUser() });
    const organizer = await prisma.user.create({ data: createUser() });
    const item = await prisma.wishlistItem.create({
      data: {
        ownerId: owner.id,
        title: 'Espresso machine',
        sortOrder: 0,
        type: 'text',
      },
    });
    const pool = await prisma.pool.create({
      data: { title: 'Espresso machine pool', organizerId: organizer.id },
    });
    const claim = await prisma.wishlistClaim.create({
      data: {
        wishlistItemId: item.id,
        poolId: pool.id,
      },
    });

    await cleanupWishlistClaimsForOwner(owner.id);

    const stillExists = await prisma.wishlistClaim.findUnique({
      where: { id: claim.id },
    });
    expect(stillExists).not.toBeNull();
  });

  it('still deletes a solo claim by a user who shares no friendship or group with the owner', async () => {
    const owner = await prisma.user.create({ data: createUser() });
    const stranger = await prisma.user.create({ data: createUser() });
    const item = await prisma.wishlistItem.create({
      data: {
        ownerId: owner.id,
        title: 'Espresso machine',
        sortOrder: 0,
        type: 'text',
      },
    });
    const claim = await prisma.wishlistClaim.create({
      data: {
        wishlistItemId: item.id,
        claimedByUserId: stranger.id,
      },
    });

    await cleanupWishlistClaimsForOwner(owner.id);

    const stillExists = await prisma.wishlistClaim.findUnique({
      where: { id: claim.id },
    });
    expect(stillExists).toBeNull();
  });

  it('settles a released solo claim onto a decided pool waiting behind it, instead of bare-deleting it', async () => {
    // Regression for the P1 finding: cleanupWishlistClaimsForOwner used to
    // call a bare wishlistClaim.deleteMany. If a decided pool was waiting
    // behind a solo claimant who had since lost wishlist access, the next
    // cleanup (which runs from wishlist loaders, i.e. on page views) deleted
    // that solo claim without settlement — freeing the item for anyone,
    // instead of transferring it to the pool that had already decided on it.
    const owner = await prisma.user.create({ data: createUser() });
    const stranger = await prisma.user.create({ data: createUser() });
    const organizer = await prisma.user.create({ data: createUser() });
    const item = await prisma.wishlistItem.create({
      data: {
        ownerId: owner.id,
        title: 'Espresso machine',
        sortOrder: 0,
        type: 'text',
      },
    });
    // The stranger holds a solo claim but shares no friendship or group with
    // the owner, so this claim is exactly what the next cleanup releases.
    await prisma.wishlistClaim.create({
      data: { wishlistItemId: item.id, claimedByUserId: stranger.id },
    });
    // A pool has already decided on the same item and is waiting behind the
    // solo claimant.
    const pool = await prisma.pool.create({
      data: {
        title: 'Espresso machine pool',
        organizerId: organizer.id,
        recipientUserId: owner.id,
      },
    });
    const idea = await prisma.giftIdea.create({
      data: {
        poolId: pool.id,
        proposedById: organizer.id,
        name: 'Espresso machine',
        wishlistItemId: item.id,
      },
    });
    await prisma.pool.update({
      where: { id: pool.id },
      data: { status: 'DECIDED', chosenIdeaId: idea.id, decidedAt: new Date() },
    });

    await cleanupWishlistClaimsForOwner(owner.id);

    const claim = await prisma.wishlistClaim.findUniqueOrThrow({
      where: { wishlistItemId: item.id },
    });
    expect(claim.poolId).toBe(pool.id);
    expect(claim.claimedByUserId).toBeNull();
  });
});
