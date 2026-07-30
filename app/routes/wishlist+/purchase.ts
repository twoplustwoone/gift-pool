import { parseWithZod } from '@conform-to/zod';
import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  queueWishlistClaimTransferredNotification,
  resolveWishlistClaimConflictNotifications,
} from '#app/utils/pool.server.ts';
import { claimForUser, releaseUserClaim } from '#app/utils/wishlist-claims.server.ts';
import { usersShareWishlistAccess } from '#app/utils/wishlist.server.ts';
const PurchaseFormSchema = z.object({
  wishlistItemId: z.string(),
  intent: z.enum(['purchase', 'unpurchase']),
  // Present only when this release was triggered from a WISHLIST_CLAIM_CONFLICT
  // notification's Release action — the WishlistClaim.id that notification
  // was raised about. Binds the release to that exact claim occurrence so a
  // stale notification (the claimant released elsewhere, re-claimed, then
  // clicked an old notification) can't drop the user's current claim. Omitted
  // by the wishlist page's own release button, which always means "release
  // whatever I currently hold."
  claimId: z.string().optional(),
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
  const { wishlistItemId, intent, claimId } = submission.value;
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
          // The actual current claim, not `currentClaim` (read before this
          // attempt). A loser of a concurrent race must see the winner's
          // claim, or the optimistic controller reconciles its UI back to
          // "unclaimed" while the winner's row already exists in the DB.
          claim: outcome.claim,
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
  const release = await releaseUserClaim(wishlistItemId, userId, claimId);
  if (!release.ok) {
    return data(
      {
        ok: false,
        wishlistItemId,
        claim: currentClaim,
        // 'stale' is distinct and legible on purpose: this is the notification
        // Release action targeting a claim occurrence that is no longer
        // live — the user's *current* claim was intentionally left untouched,
        // not "reject, no explanation." See releaseUserClaim's docstring.
        error:
          release.reason === 'stale'
            ? "That notification is out of date — your current claim on this item wasn't touched."
            : 'You can only unmark items you marked as purchased.',
        reason: release.reason,
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
  if (release.transferredToPoolId && release.transferredClaimId) {
    queueWishlistClaimTransferredNotification(
      release.transferredToPoolId,
      wishlistItemId,
      release.transferredClaimId,
    );
  }
  // Resolve any WISHLIST_CLAIM_CONFLICT notification raised about the claim
  // that was just released, so it can't resurface a Release action that
  // would fail forever (the claim it targets is gone). This makes
  // resolution durable server-side instead of depending on the notification
  // bell's separate dismiss request succeeding — see
  // resolveWishlistClaimConflictNotifications's docstring. Awaited but never
  // throws, so a failure here can't turn this already-committed release into
  // a 500.
  await resolveWishlistClaimConflictNotifications(userId, release.releasedClaimId);
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
