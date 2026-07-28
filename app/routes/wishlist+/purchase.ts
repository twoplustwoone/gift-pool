import { parseWithZod } from '@conform-to/zod';
import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { claimForUser, releaseUserClaim } from '#app/utils/wishlist-claims.server.ts';
import { usersShareWishlistAccess } from '#app/utils/wishlist.server.ts';
const PurchaseFormSchema = z.object({
  wishlistItemId: z.string(),
  intent: z.enum(['purchase', 'unpurchase']),
});
export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const submittedWishlistItemId =
    typeof formData.get('wishlistItemId') === 'string'
      ? String(formData.get('wishlistItemId'))
      : '';
  const submission = parseWithZod(formData, {
    schema: PurchaseFormSchema,
  });
  if (submission.status !== 'success') {
    return data(
      {
        ok: false,
        wishlistItemId: submittedWishlistItemId,
        claim: null,
        error: 'Invalid purchase request.',
      },
      {
        status: 400,
      },
    );
  }
  const { wishlistItemId, intent } = submission.value;
  const wishlistItem = await prisma.wishlistItem.findUnique({
    where: {
      id: wishlistItemId,
    },
    select: {
      ownerId: true,
      claim: {
        select: {
          claimedByUserId: true,
        },
      },
      status: true,
    },
  });
  if (!wishlistItem) {
    return data(
      {
        ok: false,
        wishlistItemId,
        claim: null,
        error: 'Wishlist item not found.',
      },
      {
        status: 404,
      },
    );
  }
  const currentClaim = wishlistItem.claim
    ? {
        claimedByUserId: wishlistItem.claim.claimedByUserId,
      }
    : null;
  if (wishlistItem.ownerId === userId) {
    return data(
      {
        ok: false,
        wishlistItemId,
        claim: currentClaim,
        error: 'You cannot mark your own wishlist item as purchased.',
      },
      {
        status: 400,
      },
    );
  }
  if (wishlistItem.status !== 'ACTIVE') {
    return data(
      {
        ok: false,
        wishlistItemId,
        claim: currentClaim,
        error: 'This item is no longer available on the wishlist.',
      },
      {
        status: 400,
      },
    );
  }
  const hasAccess = await usersShareWishlistAccess({
    viewerId: userId,
    ownerId: wishlistItem.ownerId,
  });
  if (!hasAccess) {
    return data(
      {
        ok: false,
        wishlistItemId,
        claim: currentClaim,
        error: 'You no longer have access to this wishlist.',
      },
      {
        status: 403,
      },
    );
  }
  if (intent === 'purchase') {
    const outcome = await claimForUser(wishlistItemId, userId);
    if (!outcome.ok) {
      return data(
        {
          ok: false,
          wishlistItemId,
          claim: currentClaim,
          // Today's message ("already marked as purchased") is false when a
          // pool holds it — a DECIDED pool has explicitly not purchased
          // anything. PURCHASED is a separate, later pool status.
          error:
            outcome.reason === 'held-by-pool'
              ? 'A group is already getting this one.'
              : 'Someone already grabbed this one.',
        },
        {
          status: 400,
        },
      );
    }
    queueLogEvent({
      name: 'wishlist_purchase_recorded',
      userId,
      source: 'server',
      properties: {
        wishlistItemId,
        ownerId: wishlistItem.ownerId,
      },
    });
    return {
      ok: true,
      wishlistItemId,
      claim: {
        claimedByUserId: userId,
      },
    };
  }
  const release = await releaseUserClaim(wishlistItemId, userId);
  if (!release.ok) {
    return data(
      {
        ok: false,
        wishlistItemId,
        claim: currentClaim,
        error: 'You can only unmark items you marked as purchased.',
      },
      {
        status: 400,
      },
    );
  }
  queueLogEvent({
    name: release.transferredToPoolId
      ? 'wishlist_claim_transferred'
      : 'wishlist_claim_released',
    userId,
    source: 'server',
    properties: { wishlistItemId, toPoolId: release.transferredToPoolId },
  });
  // A transfer means the item is NOT free — settlement handed the claim
  // straight to the longest-waiting pool inside the same transaction as the
  // release (see `releaseUserClaim`). Reporting `claim: null` here would be a
  // lie the client believes: it renders the item as free to grab while a
  // pool actively holds it. `{ claimedByUserId: null }` is the same shape
  // the loaders use for a pool-held claim (see `mapWishlistItems` /
  // `w.public.$token.tsx`), so the client's existing sentinel mapping
  // (`toPurchaseBySentinel`) reconciles it correctly without special-casing.
  return {
    ok: true,
    wishlistItemId,
    claim: release.transferredToPoolId ? { claimedByUserId: null } : null,
  };
}
