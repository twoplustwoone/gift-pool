import { invariantResponse } from '@epic-web/invariant';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Wishlist, type WishlistUser } from '#app/components/wishlist';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { cleanupWishlistPurchasesForOwner } from '#app/utils/wishlist.server.ts';
// Re-export the server action without importing it in the client bundle
export { action } from './__wishlist-item-editor.server';

type LoaderData = { user: WishlistUser };

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  await cleanupWishlistPurchasesForOwner(userId);
  const [user, archivedWishlistItems] = await Promise.all([
    prisma.user.findFirst({
      select: {
        id: true,
        name: true,
        username: true,
        wishlistItems: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            title: true,
            ownerId: true,
            categoryId: true,
            note: true,
            url: true,
            type: true,
            status: true,
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
    }),
    prisma.wishlistItem.findMany({
      where: { ownerId: userId, status: 'ARCHIVED' },
      select: {
        id: true,
        title: true,
        ownerId: true,
        categoryId: true,
        note: true,
        url: true,
        type: true,
        status: true,
        updatedAt: true,
        image: true,
        imageSource: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  invariantResponse(user, 'User not found', { status: 404 });

  const wishlistItems: WishlistUser['wishlistItems'] = user.wishlistItems.map(
    ({ image, imageSource, status, ...item }) => ({
      ...item,
      status: status as WishlistUser['wishlistItems'][number]['status'],
      hasImage: Boolean(image),
      imageSource:
        imageSource as WishlistUser['wishlistItems'][number]['imageSource'],
    }),
  );

  const archivedWishlistItemsWithStatus: WishlistUser['archivedWishlistItems'] =
    archivedWishlistItems.map(({ image, imageSource, status, ...item }) => ({
      ...item,
      status: status as WishlistUser['wishlistItems'][number]['status'],
      hasImage: Boolean(image),
      imageSource:
        imageSource as WishlistUser['wishlistItems'][number]['imageSource'],
    }));

  const wishlistUser: WishlistUser = {
    name: user.name,
    username: user.username,
    image: user.image,
    wishlistCategories: user.wishlistCategories,
    wishlistItems,
    archivedWishlistItems: archivedWishlistItemsWithStatus,
  };

  return json<LoaderData>({
    user: wishlistUser,
  });
}

const WishlistIndex = () => {
  const data = useLoaderData<typeof loader>();

  const user: WishlistUser = {
    ...data.user,
    wishlistItems: data.user.wishlistItems.map((item) => ({
      ...item,
      status: item.status as WishlistUser['wishlistItems'][number]['status'],
      updatedAt: new Date(item.updatedAt),
    })),
    archivedWishlistItems: data.user.archivedWishlistItems?.map((item) => ({
      ...item,
      status: item.status as WishlistUser['wishlistItems'][number]['status'],
      updatedAt: new Date(item.updatedAt),
    })) ?? [],
  };

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
