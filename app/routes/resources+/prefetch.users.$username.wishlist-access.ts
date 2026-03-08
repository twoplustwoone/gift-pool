import { invariantResponse } from '@epic-web/invariant';
import { requireUserId } from '#app/utils/auth.server.ts';
import { loadFriendWishlistAccess } from '#app/utils/wishlist-page.server.ts';

export async function loader({
  params,
  request,
}: {
  params: { username?: string };
  request: Request;
}) {
  invariantResponse(params.username, 'Username is required', {
    status: 400,
  });

  const userId = await requireUserId(request);
  const access = await loadFriendWishlistAccess({
    viewerId: userId,
    username: params.username,
  });

  if ('redirectTo' in access) {
    return new Response(null, {
      status: 409,
    });
  }

  return new Response(null, {
    status: access.canViewWishlist ? 204 : 403,
  });
}
