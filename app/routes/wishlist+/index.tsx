import { useEffect, useRef } from 'react';
import {
  data,
  type ClientLoaderFunctionArgs,
  type LoaderFunctionArgs, useLoaderData 
} from 'react-router';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Wishlist, type WishlistUser } from '#app/components/wishlist';
import { track } from '#app/utils/analytics.client.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import { getDomainUrl } from '#app/utils/misc.tsx';
import { takePrefetchCache } from '#app/utils/prefetch-cache.client.ts';
import {
  applyRequestIdHeader,
  getRequestContext,
} from '#app/utils/request-context.server.ts';
import { useRequestInfo } from '#app/utils/request-info.ts';
import { loadOwnWishlistPageData } from '#app/utils/wishlist-page.server.ts';
// Re-export the server action without importing it in the client bundle
export { action } from './__wishlist-item-editor.server';
type LoaderData = {
  user: WishlistUser;
  analytics: {
    requestId: string | null;
    viewEventId: string | null;
  };
  publicShare: {
    token: string;
    createdAt: string;
  } | null;
  origin: string;
};
export async function loader({ request }: LoaderFunctionArgs) {
  const { requestId, sessionId } = await getRequestContext(request);
  const userId = await requireUserId(request);
  const loaderData = await loadOwnWishlistPageData({
    origin: getDomainUrl(request),
    requestId,
    sessionId,
    userId,
    includeAnalytics: true,
  });

  return data<LoaderData>(loaderData, {
    headers: applyRequestIdHeader(null, requestId),
  });
}

export async function clientLoader({
  request,
  serverLoader,
}: ClientLoaderFunctionArgs) {
  const cached = takePrefetchCache<Awaited<ReturnType<typeof serverLoader>>>(
    request.url,
  );

  if (cached) return cached;

  return serverLoader();
}

const WishlistIndex = () => {
  const data = useLoaderData<typeof loader>();
  const requestInfo = useRequestInfo();
  const trackedViewIdRef = useRef<string | null>(null);
  const user: WishlistUser = {
    ...data.user,
    wishlistItems: data.user.wishlistItems.map((item) => ({
      ...item,
      updatedAt: new Date(item.updatedAt),
    })),
  };
  const publicShare = data.publicShare
    ? {
        ...data.publicShare,
        createdAt: new Date(data.publicShare.createdAt),
      }
    : null;
  useEffect(() => {
    const trackingKey = data.analytics?.viewEventId ?? `client:${user.id}`;
    if (trackedViewIdRef.current === trackingKey) return;
    trackedViewIdRef.current = trackingKey;

    const trackingOptions = data.analytics?.viewEventId
      ? {
          requestId: data.analytics.requestId ?? requestInfo.requestId,
          eventId: data.analytics.viewEventId,
        }
      : {
          requestId: requestInfo.requestId,
        };

    track(
      'wishlist_viewed',
      {
        wishlistOwnerId: user.id,
        itemCount: user.wishlistItems.length,
      },
      trackingOptions,
    );
  }, [
    data.analytics,
    user.id,
    user.wishlistItems.length,
    requestInfo.requestId,
  ]);
  return (
    <Wishlist
      isOwner
      user={user}
      origin={data.origin}
      publicShare={publicShare}
    />
  );
};
export default WishlistIndex;
export const ErrorBoundary = () => {
  return (
    <GeneralErrorBoundary
      statusHandlers={{
        404: ({ params }) => (
          <p>No user with the username "{params.username}" exists</p>
        ),
      }}
    />
  );
};
