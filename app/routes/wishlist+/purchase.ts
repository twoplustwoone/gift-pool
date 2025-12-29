import { parseWithZod } from '@conform-to/zod';
import { invariantResponse } from '@epic-web/invariant';
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
  const submission = parseWithZod(formData, { schema: PurchaseFormSchema });

  if (submission.status !== 'success') {
    return json(submission.reply(), {
      status: submission.status === 'error' ? 400 : 200,
    });
  }

  const { wishlistItemId, intent } = submission.value;

  const wishlistItem = await prisma.wishlistItem.findUnique({
    where: { id: wishlistItemId },
    select: {
      ownerId: true,
      owner: { select: { username: true } },
      purchase: { select: { purchasedById: true } },
      status: true,
    },
  });

  invariantResponse(wishlistItem, 'Wishlist item not found', { status: 404 });

  if (wishlistItem.ownerId === userId) {
    return json(
      { error: 'You cannot mark your own wishlist item as purchased.' },
      { status: 400 },
    );
  }

  if (wishlistItem.status !== 'ACTIVE') {
    return json(
      { error: 'This item is no longer available on the wishlist.' },
      { status: 400 },
    );
  }

  const hasAccess = await usersShareWishlistAccess({
    viewerId: userId,
    ownerId: wishlistItem.ownerId,
  });

  if (!hasAccess) {
    return json(
      { error: 'You no longer have access to this wishlist.' },
      { status: 403 },
    );
  }

  if (intent === 'purchase') {
    if (
      wishlistItem.purchase &&
      wishlistItem.purchase.purchasedById !== userId
    ) {
      return json(
        { error: 'This item has already been marked as purchased.' },
        { status: 400 },
      );
    }

    await prisma.wishlistPurchase.upsert({
      where: { wishlistItemId },
      create: { wishlistItemId, purchasedById: userId },
      update: { purchasedById: userId },
    });
  } else {
    if (wishlistItem.purchase?.purchasedById !== userId) {
      return json(
        { error: 'You can only unmark items you marked as purchased.' },
        { status: 400 },
      );
    }

    await prisma.wishlistPurchase.delete({ where: { wishlistItemId } });
  }

  return json({ ok: true });
}
