import {
  type User,
  type UserImage,
  type WishlistItem as WishlistItemType,
} from '@prisma/client';
import { Link } from '@remix-run/react';

import { WishlistItemEditor } from '#app/routes/wishlist+/__wishlist-item-editor';
import { getUserImgSrc } from '#app/utils/misc.tsx';
import { Grid, Stack } from '../ui-kit';
import { WishlistItem } from './wishlist-item';

export const Wishlist = ({
  user,
  isOwner,
}: {
  user: Pick<User, 'username' | 'name'> & {
    image: Pick<UserImage, 'id'> | null;
    wishlistItems: Pick<
      WishlistItemType,
      'id' | 'title' | 'ownerId' | 'note' | 'url' | 'type'
    >[];
  };
  isOwner: boolean;
}) => {
  const displayName = user.name ?? user.username;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="py-4 sm:pb-4 sm:pl-8 sm:pr-4 sm:pt-12">
        <div className="flex flex-col items-center justify-between gap-2 lg:flex-row">
          <Link
            to={`/users/${user.username}`}
            className="flex flex-col items-center justify-center gap-2 lg:flex-row lg:justify-start lg:gap-4"
          >
            <img
              src={getUserImgSrc(user.image?.id)}
              alt={displayName}
              className="h-16 w-16 rounded-full object-cover lg:h-24 lg:w-24"
            />
            <h1 className="text-center text-base font-bold md:text-lg lg:text-left lg:text-2xl">
              {displayName}'s Wishlist
            </h1>
          </Link>
          {isOwner && <WishlistItemEditor />}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-bottom-nav sm:pb-0">
        <Stack gap={4}>
        {user.wishlistItems.length === 0 ? (
          <div className="flex w-full flex-col items-center justify-center">
            {isOwner ? (
              <p className="text-center text-base text-slate-500">
                Looks like you don't have any items in your wishlist yet! You
                don't want stuff? Really?
              </p>
            ) : (
              <p className="text-center text-base text-slate-500">
                {displayName} doesn't have any items in their wishlist yet!
              </p>
            )}
          </div>
        ) : (
          <Grid columns={{ sm: 2, md: 3, lg: 4 }} gap={4}>
            {user.wishlistItems.map((item) => (
              <WishlistItem
                key={item.id}
                wishlistItem={item}
                isOwner={isOwner}
              />
            ))}
          </Grid>
        )}
        </Stack>
      </div>
    </div>
  );
};
