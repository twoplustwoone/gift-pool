import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from '@remix-run/node';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { WISHLIST_IMAGE_HEADERS } from '#app/utils/wishlist-images.server.ts';
import { usersShareWishlistAccess } from '#app/utils/wishlist.server.ts';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  invariantResponse(params.wishlistItemId, 'Image ID is required', {
    status: 400,
  });

  const wishlistItem = await prisma.wishlistItem.findUnique({
    where: { id: params.wishlistItemId },
    select: { image: true, ownerId: true, title: true },
  });

  invariantResponse(wishlistItem?.image, 'Not found', { status: 404 });

  if (wishlistItem.ownerId !== userId) {
    const canView = await usersShareWishlistAccess({
      ownerId: wishlistItem.ownerId,
      viewerId: userId,
    });
    invariantResponse(canView, 'Not found', { status: 404 });
  }

  const body = new Uint8Array(wishlistItem.image).buffer;

  return new Response(body, {
    headers: {
      ...WISHLIST_IMAGE_HEADERS,
      'Content-Length': String(wishlistItem.image.byteLength),
      'Content-Disposition': `inline; filename="${params.wishlistItemId}.webp"`,
    },
  });
}
