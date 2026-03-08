import { invariantResponse } from '@epic-web/invariant';
import {
  data,
  redirect,
  type ClientLoaderFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { useLoaderData } from 'react-router';
import { useEffect, useRef } from 'react';
import { FriendGateCard } from '#app/components/friends/friend-gate-card.tsx';
import { Wishlist, type WishlistUser } from '#app/components/wishlist';
import { track } from '#app/utils/analytics.client.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import { type RelationshipState } from '#app/utils/friends.ts';
import { useTranslation } from '#app/utils/i18n.tsx';
import { takePrefetchCache } from '#app/utils/prefetch-cache.client.ts';
import {
  applyRequestIdHeader,
  getRequestContext,
} from '#app/utils/request-context.server.ts';
import { useRequestInfo } from '#app/utils/request-info.ts';
import { loadFriendWishlistPageData } from '#app/utils/wishlist-page.server.ts';
type Relationship = {
  state: RelationshipState;
  friendshipId: string | null;
  incomingRequestId: string | null;
  outgoingRequestId: string | null;
};
type LoaderData = {
  analytics: {
    requestId: string | null;
    viewEventId: string | null;
  };
} & (
  | {
      canViewWishlist: false;
      user: {
        id: string;
        name: string | null;
        username: string;
        image: {
          id: string;
        } | null;
      };
      relationship: Relationship;
    }
  | {
      canViewWishlist: true;
      user: WishlistUser;
      relationship: Relationship;
    }
);
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const username = params.username;

  invariantResponse(username, 'Username is required', {
    status: 400,
  });

  const { requestId, sessionId } = await getRequestContext(request);
  const userId = await requireUserId(request);
  const loaderData = await loadFriendWishlistPageData({
    viewerId: userId,
    username,
    requestId,
    sessionId,
    includeAnalytics: true,
  });

  if ('redirectTo' in loaderData && loaderData.redirectTo) {
    return redirect(loaderData.redirectTo);
  }

  return data<LoaderData>(loaderData, {
    headers: applyRequestIdHeader(null, requestId),
  });
};

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

const UserWishlist = () => {
  const data = useLoaderData<typeof loader>();
  const { t } = useTranslation();
  const requestInfo = useRequestInfo();
  const trackedViewIdRef = useRef<string | null>(null);
  const viewableWishlist = data.canViewWishlist ? data.user : null;
  useEffect(() => {
    if (!viewableWishlist) return;
    const trackingKey =
      data.analytics?.viewEventId ?? `client:${viewableWishlist.id}`;
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
        wishlistOwnerId: viewableWishlist.id,
        itemCount: viewableWishlist.wishlistItems.length,
      },
      trackingOptions,
    );
  }, [
    data.analytics,
    viewableWishlist?.id,
    viewableWishlist?.wishlistItems.length,
    requestInfo.requestId,
  ]);
  if (!data.canViewWishlist) {
    const userDisplayName = data.user.name ?? data.user.username;
    return (
      <FriendGateCard
        title={t('friends.accessRequiredTitle', {
          name: userDisplayName,
        })}
        description={t('friends.accessRequiredWishlist', {
          name: userDisplayName,
        })}
        relationship={data.relationship}
        targetUserId={data.user.id}
        targetUserName={userDisplayName}
        returnLinkLabel={t('friends.navigateAway')}
        returnLinkTo="/friends"
      />
    );
  }
  const user: WishlistUser = {
    ...viewableWishlist!,
    wishlistItems: viewableWishlist!.wishlistItems.map((item) => ({
      ...item,
      updatedAt: new Date(item.updatedAt),
    })),
  };
  return <Wishlist isOwner={false} user={user} />;
};
export default UserWishlist;
