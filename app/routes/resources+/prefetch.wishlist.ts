import { data, type LoaderFunctionArgs } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import { getDomainUrl } from '#app/utils/misc.tsx';
import { loadOwnWishlistPageData } from '#app/utils/wishlist-page.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  return data(
    await loadOwnWishlistPageData({
      origin: getDomainUrl(request),
      userId,
      includeAnalytics: false,
    }),
  );
}
