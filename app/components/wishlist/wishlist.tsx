import {
  type User,
  type UserImage,
  type WishlistItem as WishlistItemType,
} from '@prisma/client';
import { Link } from '@remix-run/react';
import { WishlistItemEditor } from '#app/routes/wishlist+/__wishlist-item-editor';
import { getUserImgSrc } from '#app/utils/misc.tsx';
import { WishlistItem } from './wishlist-item';

export function Wishlist({
  user,
  isOwner,
}: {
  user: Pick<User, 'username' | 'name'> & {
    image: Pick<UserImage, 'id'> | null;
    wishlistItems: Pick<WishlistItemType, 'id' | 'title' | 'ownerId'>[];
  };
  isOwner: boolean;
}) {
  const displayName = user.name ?? user.username;
  return (
    <div>
      <Link
        to={`/users/${user.username}`}
        className="flex flex-col items-center justify-center gap-2 bg-muted pb-4 pl-8 pr-4 pt-12 lg:flex-row lg:justify-start lg:gap-4"
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
      <div>
        {isOwner && <WishlistItemEditor />}
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
          <ul className="overflow-y-auto overflow-x-hidden pb-12">
            {user.wishlistItems.map((wishlistItem) => (
              <li key={wishlistItem.id}>
                <WishlistItem wishlistItem={wishlistItem} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
