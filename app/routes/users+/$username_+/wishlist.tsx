import { invariantResponse } from '@epic-web/invariant';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { redirect, useLoaderData } from '@remix-run/react';
import { Wishlist } from '#app/components/wishlist';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { requireUsersShareAGroupOrAreFriends } from '#app/utils/groups.server.ts';
import { cleanupWishlistPurchasesForOwner } from '#app/utils/wishlist.server.ts';

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

  return json({ user });
};

const UserWishlist = () => {
  const { user } = useLoaderData<typeof loader>();
  return <Wishlist isOwner={false} user={user} />;
};

export default UserWishlist;
