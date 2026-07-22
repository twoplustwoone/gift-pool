import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { requireUserInPool } from '#app/utils/pool.server.ts';
import { WISHLIST_IMAGE_HEADERS } from '#app/utils/wishlist-images.server.ts';

// A pool invite carries no friend/group requirement (see
// joinPoolViaInvite) — any contributor can already see this idea's
// wishlist-sourced title/price/url via the pool loader regardless of
// whether they share wishlist access with the recipient. Gating the image
// bytes behind the stricter friend/group check that /resources/
// wishlist-images/:id uses would 404 the image for a valid contributor
// while the surrounding idea data still renders, so this route authorizes
// against pool contribution instead — the boundary that already governs
// everything else about this idea.
export async function loader({ params, request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  invariantResponse(params.ideaId, 'Idea ID is required', { status: 400 });

  const idea = await prisma.giftIdea.findUnique({
    where: { id: params.ideaId },
    select: {
      poolId: true,
      wishlistItem: { select: { image: true } },
    },
  });

  invariantResponse(idea?.wishlistItem?.image, 'Not found', { status: 404 });

  await requireUserInPool(userId, idea.poolId);

  const body = new Uint8Array(idea.wishlistItem.image).buffer;

  return new Response(body, {
    headers: {
      ...WISHLIST_IMAGE_HEADERS,
      'Content-Length': String(idea.wishlistItem.image.byteLength),
      'Content-Disposition': `inline; filename="${params.ideaId}.webp"`,
    },
  });
}
