import { parseWithZod } from '@conform-to/zod';
import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
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
    if (wishlistItem.claim && wishlistItem.claim.claimedByUserId !== userId) {
      return data(
        {
          ok: false,
          wishlistItemId,
          claim: currentClaim,
          error: 'This item has already been marked as purchased.',
        },
        {
          status: 400,
        },
      );
    }
    await prisma.wishlistClaim.upsert({
      where: {
        wishlistItemId,
      },
      create: {
        wishlistItemId,
        claimedByUserId: userId,
      },
      update: {
        claimedByUserId: userId,
      },
    });
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
  if (wishlistItem.claim?.claimedByUserId !== userId) {
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
  await prisma.wishlistClaim.delete({
    where: {
      wishlistItemId,
    },
  });
  return {
    ok: true,
    wishlistItemId,
    claim: null,
  };
}
