import { invariantResponse } from '@epic-web/invariant';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useEffect, useRef } from 'react';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { logEvent } from '#app/utils/analytics.server.ts';
import { track } from '#app/utils/analytics.client.ts';
import { Wishlist, type WishlistUser } from '#app/components/wishlist';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  applyRequestIdHeader,
  getRequestContext,
} from '#app/utils/request-context.server.ts';
import { cleanupWishlistPurchasesForOwner } from '#app/utils/wishlist.server.ts';
import { useRequestInfo } from '#app/utils/request-info.ts';
// Re-export the server action without importing it in the client bundle
export { action } from './__wishlist-item-editor.server';

type LoaderData = {
  user: WishlistUser;
  analytics: { requestId: string; viewEventId: string };
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { requestId, sessionId } = await getRequestContext(request);
  const userId = await requireUserId(request);
  await cleanupWishlistPurchasesForOwner(userId);
  const user = await prisma.user.findFirst({
    select: {
      id: true,
      name: true,
      username: true,
      wishlistItems: {
        select: {
          id: true,
          title: true,
          ownerId: true,
          categoryId: true,
          note: true,
          url: true,
          type: true,
          updatedAt: true,
          image: true,
          imageSource: true,
        },
      },
      wishlistCategories: {
        select: {
          id: true,
          name: true,
          order: true,
        },
        orderBy: { order: 'asc' },
      },
      image: { select: { id: true } },
    },
    where: { id: userId },
  });

  invariantResponse(user, 'User not found', { status: 404 });

  const wishlistItems: WishlistUser['wishlistItems'] = user.wishlistItems.map(
    ({ image, imageSource, ...item }) => ({
      ...item,
      hasImage: Boolean(image),
      imageSource:
        imageSource as WishlistUser['wishlistItems'][number]['imageSource'],
    }),
  );

  const viewEvent = await logEvent({
    name: 'wishlist_viewed',
    userId,
    source: 'server',
    requestId,
    sessionId,
    properties: { wishlistOwnerId: userId, itemCount: wishlistItems.length },
  });

  return json<LoaderData>(
    {
      user: { ...user, wishlistItems },
      analytics: { requestId, viewEventId: viewEvent.eventId },
    },
    { headers: applyRequestIdHeader(null, requestId) },
  );
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

  useEffect(() => {
    if (!data.analytics?.viewEventId) return;
    if (trackedViewIdRef.current === data.analytics.viewEventId) return;
    trackedViewIdRef.current = data.analytics.viewEventId;
    track(
      'wishlist_viewed',
      {
        wishlistOwnerId: user.id,
        itemCount: user.wishlistItems.length,
      },
      {
        requestId: data.analytics.requestId ?? requestInfo.requestId,
        eventId: data.analytics.viewEventId,
      },
    );
  }, [
    data.analytics,
    user.id,
    user.wishlistItems.length,
    requestInfo.requestId,
  ]);

  return <Wishlist isOwner user={user} />;
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
