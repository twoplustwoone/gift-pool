import { invariantResponse } from '@epic-web/invariant';
import { data, type LoaderFunctionArgs } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import { loadFriendWishlistPageData } from '#app/utils/wishlist-page.server.ts';

export async function loader({ params, request }: LoaderFunctionArgs) {
  invariantResponse(params.username, 'Username is required', {
    status: 400,
  });

  const userId = await requireUserId(request);
  const prefetchedData = await loadFriendWishlistPageData({
    viewerId: userId,
    username: params.username,
    includeAnalytics: false,
  });

  invariantResponse(
    !('redirectTo' in prefetchedData),
    'Invalid wishlist owner',
    {
      status: 400,
    },
  );

  return data(prefetchedData);
}
