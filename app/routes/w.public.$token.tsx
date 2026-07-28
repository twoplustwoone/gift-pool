import { invariantResponse } from '@epic-web/invariant';
import { remember } from '@epic-web/remember';
import { LRUCache } from 'lru-cache';
import {
  type HeadersFunction,
  type LoaderFunctionArgs,
  type MetaFunction,
  data,
  useLoaderData,
} from 'react-router';
import {
  ErrorFallback,
  GeneralErrorBoundary,
} from '#app/components/error-boundary.tsx';
import {
  ShareConversionBanner,
  ShareConversionCard,
} from '#app/components/share-conversion.tsx';
import { Wishlist, type WishlistUser } from '#app/components/wishlist';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { getUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getRequestContext } from '#app/utils/request-context.server.ts';
import { loadClaimStates } from '#app/utils/wishlist-claims.server.ts';
import {
  cleanupWishlistClaimsForOwner,
  findWishlistPublicShareByToken,
} from '#app/utils/wishlist.server.ts';
const publicViewRateLimiter = remember(
  'public-view-rate-limit',
  () =>
    new LRUCache<
      string,
      {
        count: number;
        resetAt: number;
      }
    >({
      max: 5_000,
    }),
);
const PUBLIC_VIEW_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 40,
};
function getClientIdentifier(request: Request) {
  return (
    request.headers.get('fly-client-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}
function enforceRateLimit(request: Request) {
  const key = getClientIdentifier(request);
  const now = Date.now();
  const existing = publicViewRateLimiter.get(key);
  if (!existing || now > existing.resetAt) {
    publicViewRateLimiter.set(
      key,
      {
        count: 1,
        resetAt: now + PUBLIC_VIEW_RATE_LIMIT.windowMs,
      },
      {
        ttl: PUBLIC_VIEW_RATE_LIMIT.windowMs,
      },
    );
    return;
  }
  if (existing.count >= PUBLIC_VIEW_RATE_LIMIT.maxRequests) {
    throw data(
      {
        message: 'Too many requests. Please try again in a moment.',
      },
      {
        status: 429,
      },
    );
  }
  publicViewRateLimiter.set(
    key,
    {
      count: existing.count + 1,
      resetAt: existing.resetAt,
    },
    {
      ttl: existing.resetAt - now,
    },
  );
}
type LoaderData = {
  user: WishlistUser;
};
export const headers: HeadersFunction = () => ({
  'X-Robots-Tag': 'noindex',
});
export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const displayName = data?.user.name ?? data?.user.username ?? 'Wishlist';
  return [
    {
      title: `${displayName}'s wishlist (public) | GiftPool`,
    },
    {
      name: 'description',
      content: `View-only wishlist shared by ${displayName}`,
    },
    {
      name: 'robots',
      content: 'noindex, nofollow',
    },
  ];
};
export async function loader({ params, request }: LoaderFunctionArgs) {
  enforceRateLimit(request);
  invariantResponse(params.token, 'Link not found', {
    status: 404,
  });
  const share = await findWishlistPublicShareByToken(params.token);
  invariantResponse(share, 'Link not found or revoked', {
    status: 404,
  });
  // Share-link reach was previously invisible (only /out clicks were logged).
  // Anonymous viewers are attributed via visitorId.
  const { requestId, visitorId } = await getRequestContext(request);
  const viewerId = await getUserId(request);
  queueLogEvent({
    name: 'wishlist_share_viewed',
    userId: viewerId,
    source: 'server',
    requestId,
    visitorId,
    properties: { wishlistOwnerId: share.ownerId },
  });
  await cleanupWishlistClaimsForOwner(share.ownerId);
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
          image: true,
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
      id: share.ownerId,
    },
  });
  invariantResponse(user, 'Wishlist not found', {
    status: 404,
  });
  // This surface is reachable by anonymous visitors AND by a signed-in user
  // who followed someone else's share link — either way it must show ZERO
  // attribution. `isAnonymous` inside loadClaimStates is a surface-policy
  // flag, not a "nobody is logged in" check (see ViewerRelationship's doc
  // comment), so `userId` is hardcoded null here regardless of `viewerId`
  // above (which exists only for analytics). Do not thread the real viewer
  // id through — that would leak pool/group names to a signed-in visitor.
  const claimDisclosures = await loadClaimStates(
    user.wishlistItems.map((item) => item.id),
    { userId: null, isOwner: false },
  );
  const wishlistItems: WishlistUser['wishlistItems'] = user.wishlistItems.map(
    ({ image, imageSource, status, ...item }) => ({
      ...item,
      status: status === 'ACTIVE' ? 'ACTIVE' : 'ARCHIVED',
      ownerId: 'public-view',
      claim: item.claim
        ? {
            claimedByUserId: item.claim.claimedByUserId,
          }
        : null,
      claimDisclosure: claimDisclosures.get(item.id),
      updatedAt: item.updatedAt,
      hasImage: Boolean(image),
      imageSource:
        imageSource as WishlistUser['wishlistItems'][number]['imageSource'],
    }),
  );
  return data<LoaderData>(
    {
      user: {
        ...user,
        id: 'public-view',
        image: null, // don't expose image IDs to unauthenticated visitors
        wishlistItems,
      },
    },
    {
      headers: {
        'X-Robots-Tag': 'noindex',
      },
    },
  );
}
const PublicWishlistRoute = () => {
  const data = useLoaderData<typeof loader>();
  const user: WishlistUser = {
    ...data.user,
    wishlistItems: data.user.wishlistItems.map((item) => ({
      ...item,
      updatedAt: new Date(item.updatedAt),
    })),
  };
  const ownerName = user.name ?? user.username;
  return (
    <>
      <ShareConversionBanner ownerName={ownerName} />
      <Wishlist isOwner={false} user={user} isPublicView />
      <ShareConversionCard />
    </>
  );
};
export default PublicWishlistRoute;
export const ErrorBoundary = () => {
  return (
    <GeneralErrorBoundary
      statusHandlers={{
        404: () => (
          <ErrorFallback
            icon="magnifying-glass"
            title="Public wishlist link not found or revoked"
          />
        ),
        429: () => (
          <ErrorFallback
            icon="clock"
            title="Too many requests"
            description="Please try again soon."
          />
        ),
      }}
    />
  );
};
