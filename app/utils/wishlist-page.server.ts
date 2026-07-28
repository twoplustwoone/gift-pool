import { invariantResponse } from '@epic-web/invariant';
import { type WishlistUser } from '#app/components/wishlist';
import { queueLogEvent } from './analytics.server.ts';
import { prisma } from './db.server.ts';
import { getRelationshipDetails, isFriendOfFriend } from './friends.server.ts';
import { loadClaimStates } from './wishlist-claims.server.ts';
import { cleanupWishlistClaimsForOwner } from './wishlist.server.ts';

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
  wishlistVisibility: true,
  image: {
    select: {
      id: true,
    },
  },
} as const;

const friendWishlistPageDetailsSelect = {
  wishlistNote: true,
  wishlistItems: {
    select: {
      id: true,
      title: true,
      ownerId: true,
      type: true,
      url: true,
      note: true,
      priceCents: true,
      currency: true,
      categoryId: true,
      updatedAt: true,
      sortOrder: true,
      claim: {
        select: {
          claimedByUserId: true,
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
    priceCents?: number | null;
    currency?: string | null;
    categoryId: string | null;
    updatedAt: Date;
    sortOrder: number;
    status: string;
    hasImage: boolean;
    imageSource: string | null;
    // A claim row can hold either a solo claimedByUserId or a pool — see
    // ClaimDescriptor. claimedByUserId is null for a pool-held claim.
    claim?: {
      claimedByUserId: string | null;
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

  let canViewWishlist: boolean;
  if (wishlistOwner.wishlistVisibility === 'EVERYONE') {
    canViewWishlist = true;
  } else if (wishlistOwner.wishlistVisibility === 'FRIENDS_OF_FRIENDS') {
    canViewWishlist =
      relationship.state === 'FRIENDS' ||
      (await isFriendOfFriend(viewerId, wishlistOwner.id));
  } else {
    canViewWishlist = relationship.state === 'FRIENDS';
  }

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
      wishlistNote: true,
      wishlistItems: {
        select: {
          id: true,
          title: true,
          ownerId: true,
          categoryId: true,
          note: true,
          url: true,
          type: true,
          priceCents: true,
          currency: true,
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
  void cleanupWishlistClaimsForOwner(userId);

  invariantResponse(user, 'User not found', {
    status: 404,
  });

  const wishlistItems = mapWishlistItems(user.wishlistItems);
  const viewEvent = includeAnalytics
    ? queueLogEvent({
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

  let canViewWishlist: boolean;
  if (wishlistOwner.wishlistVisibility === 'EVERYONE') {
    canViewWishlist = true;
  } else if (wishlistOwner.wishlistVisibility === 'FRIENDS_OF_FRIENDS') {
    canViewWishlist =
      relationship.state === 'FRIENDS' ||
      (await isFriendOfFriend(viewerId, wishlistOwner.id));
  } else {
    canViewWishlist = relationship.state === 'FRIENDS';
  }

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
  void cleanupWishlistClaimsForOwner(wishlistOwner.id);

  const wishlistItems = mapWishlistItems(wishlistDetails.wishlistItems);
  // Non-owner surface (this is the friend/groupmate view, never the wishlist
  // owner — `wishlistOwner.id === viewerId` redirects to /wishlist above),
  // so the viewer gets the full privacy-laddered disclosure keyed to their
  // own relationship to whichever pool/user holds each claim.
  const claimDisclosures = await loadClaimStates(
    wishlistItems.map((item) => item.id),
    { userId: viewerId, isOwner: false },
  );
  for (const item of wishlistItems) {
    item.claimDisclosure = claimDisclosures.get(item.id);
  }
  const viewEvent = includeAnalytics
    ? queueLogEvent({
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
      wishlistNote: wishlistDetails.wishlistNote,
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
