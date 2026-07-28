/**
 * @vitest-environment node
 *
 * The highest-risk path for this feature: the public share link is reachable
 * by anonymous visitors AND by signed-in users who followed someone else's
 * link, and it must show claim state with ZERO attribution either way. This
 * test constructs the strongest possible attribution case — a signed-in
 * viewer who is a CONTRIBUTOR to the exact pool holding the claim, who would
 * see "Your pool <title> is getting this" on every other non-owner surface —
 * and asserts the public route still shows only the generic, unattributed
 * "Already claimed" state to them, identically to an anonymous request.
 */
import { type AppLoadContext } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { getSessionExpirationDate } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { upsertWishlistPublicShare } from '#app/utils/wishlist.server.ts';
import { createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: vi.fn(() => ({ eventId: 'evt-1' })),
}));

import { loader } from './w.public.$token.tsx';

const context = {
  cspNonce: undefined,
  serverBuild: undefined,
} as unknown as AppLoadContext;

async function withSession(userId: string) {
  const session = await prisma.session.create({
    data: { userId, expirationDate: getSessionExpirationDate() },
    select: { id: true },
  });
  return getSessionCookieHeader(session);
}

async function runLoader(token: string, cookie?: string) {
  const request = new Request(`https://giftpool.app/w/public/${token}`, {
    headers: cookie ? { cookie } : {},
  });
  return getRouteResultData<{
    user: {
      wishlistItems: Array<{
        id: string;
        claimDisclosure?: {
          show: boolean;
          tone: string;
          text: string;
          name: string | null;
          poolLink: string | null;
          canJoinPool: boolean;
        };
      }>;
    };
  }>(await loader(toLoaderArgs({ context, params: { token }, request })));
}

describe('w.public.$token loader — claim attribution', () => {
  it('shows a pool-held claim with zero attribution to a signed-in contributor of the holding pool, and identically to an anonymous visitor', async () => {
    const owner = await prisma.user.create({ data: createUser() });
    const viewer = await prisma.user.create({ data: createUser() });
    const item = await prisma.wishlistItem.create({
      data: {
        ownerId: owner.id,
        title: 'Espresso machine',
        type: 'item',
        sortOrder: 0,
      },
    });
    const group = await prisma.giftGroup.create({
      data: { name: 'Secret Coffee Crew', createdById: viewer.id },
    });
    const pool = await prisma.pool.create({
      data: {
        title: 'Espresso pool',
        organizerId: viewer.id,
        recipientUserId: owner.id,
        giftGroupId: group.id,
      },
    });
    const idea = await prisma.giftIdea.create({
      data: {
        poolId: pool.id,
        proposedById: viewer.id,
        name: 'Espresso machine',
        wishlistItemId: item.id,
      },
    });
    await prisma.pool.update({
      where: { id: pool.id },
      data: { status: 'DECIDED', chosenIdeaId: idea.id, decidedAt: new Date() },
    });
    // The strongest attribution case: this viewer CONTRIBUTES to the pool
    // that holds the claim — on any non-owner surface other than this one
    // they'd see "Your pool Espresso pool is getting this".
    await prisma.poolContributor.create({
      data: { poolId: pool.id, userId: viewer.id },
    });
    await prisma.wishlistClaim.create({
      data: { wishlistItemId: item.id, poolId: pool.id },
    });

    const { token } = await upsertWishlistPublicShare(owner.id);

    const cookie = await withSession(viewer.id);
    const asSignedInContributor = await runLoader(token, cookie);
    const anonymous = await runLoader(token);

    const expectedDisclosure = {
      show: true,
      tone: 'warning',
      text: 'Already claimed',
      name: null,
      poolLink: null,
      canJoinPool: false,
    };

    const signedInItem = asSignedInContributor.user.wishlistItems.find(
      (i) => i.id === item.id,
    );
    const anonItem = anonymous.user.wishlistItems.find((i) => i.id === item.id);

    expect(signedInItem?.claimDisclosure).toEqual(expectedDisclosure);
    expect(anonItem?.claimDisclosure).toEqual(expectedDisclosure);

    // Belt-and-braces: the pool title and group name must not leak anywhere
    // in the payload, not just in the claimDisclosure field we asserted on.
    // Checked on both responses — the anonymous one is what an unauthenticated
    // stranger actually hits, so it deserves the check at least as much as
    // the signed-in-contributor response.
    expect(JSON.stringify(asSignedInContributor)).not.toContain(
      'Espresso pool',
    );
    expect(JSON.stringify(asSignedInContributor)).not.toContain(
      'Secret Coffee Crew',
    );
    expect(JSON.stringify(anonymous)).not.toContain('Espresso pool');
    expect(JSON.stringify(anonymous)).not.toContain('Secret Coffee Crew');
  });
});
