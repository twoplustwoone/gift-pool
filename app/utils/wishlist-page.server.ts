import { invariantResponse } from '@epic-web/invariant';
import { type WishlistUser } from '#app/components/wishlist';
import { logEvent } from './analytics.server.ts';
import { prisma } from './db.server.ts';
import { getRelationshipDetails } from './friends.server.ts';
import { cleanupWishlistPurchasesForOwner } from './wishlist.server.ts';

type Relationship = {
  state: 'NONE' | 'PENDING_INCOMING' | 'PENDING_OUTGOING' | 'FRIENDS';
  friendshipId: string | null;
  incomingRequestId: string | null;
  outgoingRequestId: string | null;
};

type FriendWishlistOwnerSummary = {
  id: string;
  name: string | null;
  username: string;
  image: {
    id: string;
  } | null;
};

type FriendWishlistAccessResult =
  | {
      canViewWishlist: false;
      relationship: Relationship;
      user: FriendWishlistOwnerSummary;
    }
  | {
      canViewWishlist: true;
      relationship: Relationship;
      user: FriendWishlistOwnerSummary;
    }
  | {
      redirectTo: '/wishlist';
    };

const friendWishlistOwnerSummarySelect = {
  id: true,
  name: true,
  username: true,
  image: {
    select: {
      id: true,
    },
  },
} as const;

const friendWishlistPageDetailsSelect = {
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
      sortOrder: true,
      purchase: {
        select: {
          purchasedById: true,
        },
      },
      hasImage: true,
      imageSource: true,
      status: true,
    },
  },
  wishlistCategories: {
    select: {
      id: true,
      name: true,
      order: true,
    },
    orderBy: {
      order: 'asc',
    },
  },
} as const;

async function loadFriendWishlistOwnerSummary(username: string) {
  const wishlistOwner = await prisma.user.findFirst({
    select: friendWishlistOwnerSummarySelect,
    where: {
      username,
    },
  });

  invariantResponse(wishlistOwner, 'User not found', {
    status: 404,
  });

  return wishlistOwner;
}

function mapWishlistItems(
  items: Array<{
    id: string;
    title: string;
    ownerId: string;
    type: string;
    url: string | null;
    note: string | null;
    categoryId: string | null;
    updatedAt: Date;
    sortOrder: number;
    status: string;
    hasImage: boolean;
    imageSource: string | null;
    purchase?: {
      purchasedById: string;
    } | null;
  }>,
): WishlistUser['wishlistItems'] {
  return items.map(({ hasImage, imageSource, status, ...item }) => {
    const normalizedStatus: WishlistUser['wishlistItems'][number]['status'] =
      status === 'ACTIVE' ? 'ACTIVE' : ('ARCHIVED' as const);

    return {
      ...item,
      status: normalizedStatus,
      hasImage,
      imageSource:
        imageSource as WishlistUser['wishlistItems'][number]['imageSource'],
    };
  });
}

function buildRelationship(
  relationshipDetails: Awaited<ReturnType<typeof getRelationshipDetails>>,
): Relationship {
  return {
    state: relationshipDetails.state,
    friendshipId: relationshipDetails.friendship?.id ?? null,
    incomingRequestId: relationshipDetails.incoming?.id ?? null,
    outgoingRequestId: relationshipDetails.outgoing?.id ?? null,
  };
}

export async function loadFriendWishlistAccess({
  viewerId,
  username,
}: {
  viewerId: string;
  username: string;
}): Promise<FriendWishlistAccessResult> {
  const wishlistOwner = await loadFriendWishlistOwnerSummary(username);

  if (wishlistOwner.id === viewerId) {
    return {
      redirectTo: '/wishlist',
    };
  }

  const relationshipDetails = await getRelationshipDetails(
    viewerId,
    wishlistOwner.id,
  );
  const relationship = buildRelationship(relationshipDetails);
  const canViewWishlist = relationship.state === 'FRIENDS';

  return {
    canViewWishlist,
    relationship,
    user: {
      id: wishlistOwner.id,
      name: wishlistOwner.name,
      username: wishlistOwner.username,
      image: wishlistOwner.image,
    },
  };
}

export async function loadOwnWishlistPageData({
  origin,
  requestId,
  sessionId,
  userId,
  includeAnalytics,
}: {
  origin: string;
  requestId?: string | null;
  sessionId?: string | null;
  userId: string;
  includeAnalytics: boolean;
}) {
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
          sortOrder: true,
          hasImage: true,
          imageSource: true,
          status: true,
        },
      },
      wishlistCategories: {
        select: {
          id: true,
          name: true,
          order: true,
        },
        orderBy: {
          order: 'asc',
        },
      },
      image: {
        select: {
          id: true,
        },
      },
    },
    where: {
      id: userId,
    },
  });
  // Run cleanup after the critical query — don't block the response on it
  void cleanupWishlistPurchasesForOwner(userId);

  invariantResponse(user, 'User not found', {
    status: 404,
  });

  const wishlistItems = mapWishlistItems(user.wishlistItems);
  const viewEvent = includeAnalytics
    ? await logEvent({
        name: 'wishlist_viewed',
        userId,
        source: 'server',
        requestId,
        sessionId,
        properties: {
          wishlistOwnerId: userId,
          itemCount: wishlistItems.length,
        },
      })
    : null;

  const publicShare = await prisma.wishlistPublicShare.findUnique({
    select: {
      token: true,
      createdAt: true,
    },
    where: {
      ownerId: userId,
    },
  });

  return {
    user: {
      ...user,
      wishlistItems,
    },
    analytics: {
      requestId: includeAnalytics ? (requestId ?? null) : null,
      viewEventId: viewEvent?.eventId ?? null,
    },
    publicShare: publicShare
      ? {
          token: publicShare.token,
          createdAt: publicShare.createdAt.toISOString(),
        }
      : null,
    origin,
  };
}

export async function loadFriendWishlistPageData({
  viewerId,
  username,
  requestId,
  sessionId,
  includeAnalytics,
}: {
  viewerId: string;
  username: string;
  requestId?: string | null;
  sessionId?: string | null;
  includeAnalytics: boolean;
}) {
  const wishlistOwner = await loadFriendWishlistOwnerSummary(username);

  if (wishlistOwner.id === viewerId) {
    return { redirectTo: '/wishlist' } as const;
  }

  const relationshipDetails = await getRelationshipDetails(
    viewerId,
    wishlistOwner.id,
  );
  const relationship = buildRelationship(relationshipDetails);
  const canViewWishlist = relationship.state === 'FRIENDS';

  const userSummary = {
    id: wishlistOwner.id,
    name: wishlistOwner.name,
    username: wishlistOwner.username,
    image: wishlistOwner.image,
  };

  if (!canViewWishlist) {
    return {
      canViewWishlist: false,
      user: userSummary,
      relationship,
      analytics: {
        requestId: null,
        viewEventId: null,
      },
    } as const;
  }

  const wishlistDetails = await prisma.user.findFirst({
    select: friendWishlistPageDetailsSelect,
    where: {
      id: wishlistOwner.id,
    },
  });

  invariantResponse(wishlistDetails, 'User not found', { status: 404 });

  // Run cleanup after the critical queries — don't block the response on it
  void cleanupWishlistPurchasesForOwner(wishlistOwner.id);

  const wishlistItems = mapWishlistItems(wishlistDetails.wishlistItems);
  const viewEvent = includeAnalytics
    ? await logEvent({
        name: 'wishlist_viewed',
        userId: viewerId,
        source: 'server',
        requestId,
        sessionId,
        properties: {
          wishlistOwnerId: wishlistOwner.id,
          viewerId,
          itemCount: wishlistItems.length,
        },
      })
    : null;

  return {
    canViewWishlist: true,
    user: {
      ...userSummary,
      wishlistItems,
      wishlistCategories: wishlistDetails.wishlistCategories,
    },
    relationship,
    analytics: {
      requestId: includeAnalytics ? (requestId ?? null) : null,
      viewEventId: viewEvent?.eventId ?? null,
    },
  } as const;
}
