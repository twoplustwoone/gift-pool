import { parseWithZod } from '@conform-to/zod';
import { json, type ActionFunctionArgs } from '@remix-run/node';
import { z } from 'zod';
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
  const submission = parseWithZod(formData, { schema: PurchaseFormSchema });

  if (submission.status !== 'success') {
    return json(
      {
        ok: false,
        wishlistItemId: submittedWishlistItemId,
        purchase: null,
        error: 'Invalid purchase request.',
      },
      { status: 400 },
    );
  }

  const { wishlistItemId, intent } = submission.value;

  const wishlistItem = await prisma.wishlistItem.findUnique({
    where: { id: wishlistItemId },
    select: {
      ownerId: true,
      purchase: { select: { purchasedById: true } },
      status: true,
    },
  });

  if (!wishlistItem) {
    return json(
      {
        ok: false,
        wishlistItemId,
        purchase: null,
        error: 'Wishlist item not found.',
      },
      { status: 404 },
    );
  }

  const currentPurchase = wishlistItem.purchase
    ? { purchasedById: wishlistItem.purchase.purchasedById }
    : null;

  if (wishlistItem.ownerId === userId) {
    return json(
      {
        ok: false,
        wishlistItemId,
        purchase: currentPurchase,
        error: 'You cannot mark your own wishlist item as purchased.',
      },
      { status: 400 },
    );
  }

  if (wishlistItem.status !== 'ACTIVE') {
    return json(
      {
        ok: false,
        wishlistItemId,
        purchase: currentPurchase,
        error: 'This item is no longer available on the wishlist.',
      },
      { status: 400 },
    );
  }

  const hasAccess = await usersShareWishlistAccess({
    viewerId: userId,
    ownerId: wishlistItem.ownerId,
  });

  if (!hasAccess) {
    return json(
      {
        ok: false,
        wishlistItemId,
        purchase: currentPurchase,
        error: 'You no longer have access to this wishlist.',
      },
      { status: 403 },
    );
  }

  if (intent === 'purchase') {
    if (
      wishlistItem.purchase &&
      wishlistItem.purchase.purchasedById !== userId
    ) {
      return json(
        {
          ok: false,
          wishlistItemId,
          purchase: currentPurchase,
          error: 'This item has already been marked as purchased.',
        },
        { status: 400 },
      );
    }

    await prisma.wishlistPurchase.upsert({
      where: { wishlistItemId },
      create: { wishlistItemId, purchasedById: userId },
      update: { purchasedById: userId },
    });

    return json({
      ok: true,
      wishlistItemId,
      purchase: { purchasedById: userId },
    });
  }

  if (wishlistItem.purchase?.purchasedById !== userId) {
    return json(
      {
        ok: false,
        wishlistItemId,
        purchase: currentPurchase,
        error: 'You can only unmark items you marked as purchased.',
      },
      { status: 400 },
    );
  }

  await prisma.wishlistPurchase.delete({ where: { wishlistItemId } });

  return json({ ok: true, wishlistItemId, purchase: null });
}
