import { invariantResponse } from '@epic-web/invariant';
import { remember } from '@epic-web/remember';
import  {
  type HeadersFunction,
  type LoaderFunctionArgs,
  type MetaFunction, json 
} from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { LRUCache } from 'lru-cache';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Wishlist, type WishlistUser } from '#app/components/wishlist';
import { prisma } from '#app/utils/db.server.ts';
import { findWishlistPublicShareByToken } from '#app/utils/wishlist.server.ts';

const publicViewRateLimiter = remember(
  'public-view-rate-limit',
  () =>
    new LRUCache<string, { count: number; resetAt: number }>({
      max: 5_000,
    }),
);

const PUBLIC_VIEW_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 40,
};

function getClientIdentifier(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

function enforceRateLimit(request: Request) {
  const key = getClientIdentifier(request);
  const now = Date.now();
  const existing = publicViewRateLimiter.get(key);

  if (!existing || now > existing.resetAt) {
    publicViewRateLimiter.set(
      key,
      { count: 1, resetAt: now + PUBLIC_VIEW_RATE_LIMIT.windowMs },
      { ttl: PUBLIC_VIEW_RATE_LIMIT.windowMs },
    );
    return;
  }

  if (existing.count >= PUBLIC_VIEW_RATE_LIMIT.maxRequests) {
    throw json(
      { message: 'Too many requests. Please try again in a moment.' },
      { status: 429 },
    );
  }

  publicViewRateLimiter.set(
    key,
    {
      count: existing.count + 1,
      resetAt: existing.resetAt,
    },
    { ttl: existing.resetAt - now },
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
    { title: `${displayName}'s wishlist (public) | GiftPool` },
    {
      name: 'description',
      content: `View-only wishlist shared by ${displayName}`,
    },
    { name: 'robots', content: 'noindex, nofollow' },
  ];
};

export async function loader({ params, request }: LoaderFunctionArgs) {
  enforceRateLimit(request);
  invariantResponse(params.token, 'Link not found', { status: 404 });

  const share = await findWishlistPublicShareByToken(params.token);
  invariantResponse(share, 'Link not found or revoked', { status: 404 });

  const user = await prisma.user.findFirst({
    select: {
      id: true,
      name: true,
      username: true,
      wishlistItems: {
        select: {
          id: true,
          title: true,
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
    where: { id: share.ownerId },
  });

  invariantResponse(user, 'Wishlist not found', { status: 404 });

  const wishlistItems: WishlistUser['wishlistItems'] = user.wishlistItems.map(
    ({ image, imageSource, ...item }) => ({
      ...item,
      ownerId: 'public-view',
      purchase: item.purchase
        ? { purchasedById: item.purchase.purchasedById }
        : null,
      updatedAt: item.updatedAt,
      hasImage: Boolean(image),
      imageSource:
        imageSource as WishlistUser['wishlistItems'][number]['imageSource'],
    }),
  );

  return json<LoaderData>(
    {
      user: { ...user, id: 'public-view', wishlistItems },
    },
    { headers: { 'X-Robots-Tag': 'noindex' } },
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

  return <Wishlist isOwner={false} user={user} isPublicView />;
};

export default PublicWishlistRoute;

export const ErrorBoundary = () => {
  return (
    <GeneralErrorBoundary
      statusHandlers={{
        404: () => <p>Public wishlist link not found or revoked.</p>,
        429: () => <p>Too many requests. Please try again soon.</p>,
      }}
    />
  );
};
