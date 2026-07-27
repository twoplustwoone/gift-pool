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
});
