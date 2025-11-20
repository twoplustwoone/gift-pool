import { invariantResponse } from '@epic-web/invariant';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { redirect, useLoaderData } from '@remix-run/react';
import { Wishlist, type WishlistUser } from '#app/components/wishlist';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { requireUsersShareAGroupOrAreFriends } from '#app/utils/groups.server.ts';
import { cleanupWishlistPurchasesForOwner } from '#app/utils/wishlist.server.ts';

type LoaderData = { user: WishlistUser };

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { username } = params;

  const userId = await requireUserId(request);
  await requireUsersShareAGroupOrAreFriends({ userId, username: username! });
  const wishlistOwner = await prisma.user.findFirst({
    select: { id: true },
    where: { username },
  });

  invariantResponse(wishlistOwner, 'User not found', { status: 404 });

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

  if (user.id === userId) {
    return redirect('/wishlist');
  }

  const wishlistItems: WishlistUser['wishlistItems'] = user.wishlistItems.map(
    ({ image, imageSource, ...item }) => ({
      ...item,
      hasImage: Boolean(image),
      imageSource:
        imageSource as WishlistUser['wishlistItems'][number]['imageSource'],
    }),
  );

  return json<LoaderData>({ user: { ...user, wishlistItems } });
};

const UserWishlist = () => {
  const data = useLoaderData<typeof loader>();
  return <Wishlist isOwner={false} user={data.user} />;
};

export default UserWishlist;
