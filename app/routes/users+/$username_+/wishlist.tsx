import { invariantResponse } from '@epic-web/invariant';
import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useEffect, useRef } from 'react';
import { Wishlist, type WishlistUser } from '#app/components/wishlist';
import { FriendGateCard } from '#app/components/friends/friend-gate-card.tsx';
import { logEvent } from '#app/utils/analytics.server.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getRelationshipDetails } from '#app/utils/friends.server.ts';
import { type RelationshipState } from '#app/utils/friends.ts';
import { useTranslation } from '#app/utils/i18n.tsx';
import {
  applyRequestIdHeader,
  getRequestContext,
} from '#app/utils/request-context.server.ts';
import { cleanupWishlistPurchasesForOwner } from '#app/utils/wishlist.server.ts';
import { track } from '#app/utils/analytics.client.ts';
import { useRequestInfo } from '#app/utils/request-info.ts';

type Relationship = {
  state: RelationshipState;
  friendshipId: string | null;
  incomingRequestId: string | null;
  outgoingRequestId: string | null;
};

type LoaderData = {
  analytics: { requestId: string; viewEventId: string | null };
} & (
  | {
      canViewWishlist: false;
      user: {
        id: string;
        name: string | null;
        username: string;
        image: { id: string } | null;
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
  const { username } = params;

  const { requestId, sessionId } = await getRequestContext(request);
  const userId = await requireUserId(request);
  const wishlistOwner = await prisma.user.findFirst({
    select: { id: true, name: true, username: true, image: { select: { id: true } } },
    where: { username },
  });

  invariantResponse(wishlistOwner, 'User not found', { status: 404 });

  if (wishlistOwner.id === userId) {
    return redirect('/wishlist');
  }

  const relationshipDetails = await getRelationshipDetails(userId, wishlistOwner.id);
  const relationship: Relationship = {
    state: relationshipDetails.state,
    friendshipId: relationshipDetails.friendship?.id ?? null,
    incomingRequestId: relationshipDetails.incoming?.id ?? null,
    outgoingRequestId: relationshipDetails.outgoing?.id ?? null,
  };

  const canViewWishlist = relationship.state === 'FRIENDS';

  if (!canViewWishlist) {
    return json<LoaderData>(
      {
        canViewWishlist,
        user: {
          id: wishlistOwner.id,
          name: wishlistOwner.name,
          username: wishlistOwner.username,
          image: wishlistOwner.image,
        },
        relationship,
        analytics: { requestId, viewEventId: null },
      },
      { headers: applyRequestIdHeader(null, requestId) },
    );
  }

  await cleanupWishlistPurchasesForOwner(wishlistOwner.id);

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
          type: true,
          url: true,
          note: true,
          categoryId: true,
          updatedAt: true,
          purchase: { select: { purchasedById: true } },
          image: true,
          imageSource: true,
        },
      },
      wishlistCategories: {
        select: { id: true, name: true, order: true },
        orderBy: { order: 'asc' },
      },
      image: { select: { id: true } },
    },
    where: { id: wishlistOwner.id },
  });

  invariantResponse(user, 'User not found', { status: 404 });

  const wishlistItems: WishlistUser['wishlistItems'] = user.wishlistItems.map(
    ({ image, imageSource, ...item }) => ({
      ...item,
      updatedAt: item.updatedAt,
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
    properties: {
      wishlistOwnerId: user.id,
      viewerId: userId,
      itemCount: wishlistItems.length,
    },
  });

  return json<LoaderData>(
    {
      canViewWishlist,
      user: { ...user, wishlistItems },
      relationship,
      analytics: {
        requestId,
        viewEventId: viewEvent.eventId,
      },
    },
    { headers: applyRequestIdHeader(null, requestId) },
  );
};

const UserWishlist = () => {
  const data = useLoaderData<typeof loader>();
  const { t } = useTranslation();
  const requestInfo = useRequestInfo();
  const trackedViewIdRef = useRef<string | null>(null);
  const viewableWishlist = data.canViewWishlist ? data.user : null;

  useEffect(() => {
    if (!data.analytics?.viewEventId) return;
    if (!viewableWishlist) return;
    if (trackedViewIdRef.current === data.analytics.viewEventId) return;
    trackedViewIdRef.current = data.analytics.viewEventId;
    track(
      'wishlist_viewed',
      {
        wishlistOwnerId: viewableWishlist.id,
        itemCount: viewableWishlist.wishlistItems.length,
      },
      {
        requestId: data.analytics.requestId ?? requestInfo.requestId,
        eventId: data.analytics.viewEventId,
      },
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
        title={t('friends.accessRequiredTitle', { name: userDisplayName })}
        description={t('friends.accessRequiredWishlist', { name: userDisplayName })}
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
