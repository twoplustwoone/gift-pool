import { parseWithZod } from '@conform-to/zod';
import { createId as cuid } from '@paralleldrive/cuid2';
import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { wishlistItemStatusSchema } from '#app/utils/wishlist.ts';
const WishlistStatusSchema = z.object({
  intent: z.literal('update-wishlist-item-status'),
  wishlistItemId: z.string(),
  status: wishlistItemStatusSchema,
  clientMutationId: z.string().min(1).optional(),
});
export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const clientMutationIdRaw = formData.get('clientMutationId');
  const clientMutationId =
    typeof clientMutationIdRaw === 'string' && clientMutationIdRaw.length > 0
      ? clientMutationIdRaw
      : null;
  const submission = parseWithZod(formData, {
    schema: WishlistStatusSchema,
  });
  if (submission.status !== 'success') {
    const errorMessage =
      (submission.error as any)?.formErrors?.[0] ??
      (submission.error as any)?.fieldErrors?.status?.[0] ??
      'Invalid request.';
    return data(
      {
        ok: false,
        error: errorMessage,
        clientMutationId,
      },
      {
        status: 400,
      },
    );
  }
  const { wishlistItemId, status } = submission.value;
  const wishlistItem = await prisma.wishlistItem.findUnique({
    select: {
      id: true,
      ownerId: true,
      status: true,
    },
    where: {
      id: wishlistItemId,
    },
  });
  if (!wishlistItem) {
    return data(
      {
        ok: false,
        error: 'Wishlist item not found.',
        clientMutationId,
      },
      {
        status: 404,
      },
    );
  }
  if (wishlistItem.ownerId !== userId) {
    return data(
      {
        ok: false,
        error: 'Only the owner can update this wishlist item.',
        clientMutationId,
      },
      {
        status: 403,
      },
    );
  }
  if (wishlistItem.status !== status) {
    await prisma.wishlistItem.update({
      where: {
        id: wishlistItemId,
      },
      data: {
        status,
      },
    });
  }
  await prisma.wishlistPurchase.deleteMany({
    where: {
      wishlistItemId,
    },
  });
  const statusTextMap: Record<
    string,
    {
      title: string;
      description: string;
    }
  > = {
    ARCHIVED: {
      title: 'Moved to Past items',
      description: 'Undo available.',
    },
    ACTIVE: {
      title: 'Returned to wishlist',
      description: 'Item restored.',
    },
  };
  return {
    ok: true,
    status,
    clientMutationId,
    toast: {
      id: cuid(),
      type: 'success' as const,
      title: statusTextMap[status]?.title ?? 'Wishlist updated',
      description: statusTextMap[status]?.description ?? 'Status updated.',
    },
  };
}
