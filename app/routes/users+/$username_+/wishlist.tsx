import { invariantResponse } from '@epic-web/invariant';
import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Wishlist, type WishlistUser } from '#app/components/wishlist';
import { FriendGateCard } from '#app/components/friends/friend-gate-card.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getRelationshipDetails } from '#app/utils/friends.server.ts';
import { type RelationshipState } from '#app/utils/friends.ts';
import { useTranslation } from '#app/utils/i18n.tsx';
import { cleanupWishlistPurchasesForOwner } from '#app/utils/wishlist.server.ts';

type Relationship = {
  state: RelationshipState;
  friendshipId: string | null;
  incomingRequestId: string | null;
  outgoingRequestId: string | null;
};

type LoaderData =
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
  | { canViewWishlist: true; user: WishlistUser; relationship: Relationship };

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { username } = params;

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
    return json<LoaderData>({
      canViewWishlist,
      user: {
        id: wishlistOwner.id,
        name: wishlistOwner.name,
        username: wishlistOwner.username,
        image: wishlistOwner.image,
      },
      relationship,
    });
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

  return json<LoaderData>({
    canViewWishlist,
    user: { ...user, wishlistItems },
    relationship,
  });
};

const UserWishlist = () => {
  const data = useLoaderData<typeof loader>();
  const { t } = useTranslation();

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
    ...data.user,
    wishlistItems: data.user.wishlistItems.map((item) => ({
      ...item,
      updatedAt: new Date(item.updatedAt),
    })),
  };

  return <Wishlist isOwner={false} user={user} />;
};

export default UserWishlist;
