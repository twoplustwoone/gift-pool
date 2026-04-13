import  { type UserImage } from '@prisma/client';

import {
  WishlistItemEditor,
} from '#app/routes/wishlist+/__wishlist-item-editor';

import { Text } from '../ui-kit';
import { CategoryManager } from './category-manager';
import { WishlistAvatar } from './wishlist-avatar';
import  { type CategoryMutationResult, type WishlistCategory } from './wishlist-category-state';
import { WishlistLinkCopyButton } from './wishlist-link-copy-button';
import { WishlistShareDialog } from './wishlist-share-dialog';

type WishlistPublicShare = { token: string; createdAt: Date };

type UserForHeader = {
  name: string | null;
  username: string;
  image: Pick<UserImage, 'id'> | null;
  wishlistCategories: WishlistCategory[];
};

export const WishlistHeader = ({
  isOwner,
  user,
  displayName,
  origin,
  publicShare,
  isPublicView,
  hideOwnerControls,
  hideFloatingAddButton,
  onStartItemReorder,
  onStartCategoryReorder,
  onCategoryMutationResult,
}: {
  isOwner: boolean;
  user: UserForHeader;
  displayName: string;
  origin?: string;
  publicShare: WishlistPublicShare | null;
  isPublicView: boolean;
  hideOwnerControls: boolean;
  hideFloatingAddButton: boolean;
  onStartItemReorder: () => void;
  onStartCategoryReorder: () => void;
  onCategoryMutationResult: (result: CategoryMutationResult) => void;
}) => (
  <div className="w-full border-b bg-surface shadow">
    <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <WishlistAvatar isOwner={isOwner} user={user} />
        <div className="flex min-w-0 items-center gap-2">
          {isOwner ? (
            <Text size="xl" weight="bold" className="truncate">
              My Wishlist
            </Text>
          ) : (
            <div className="flex min-w-0 flex-col items-start">
              <Text
                size="xl"
                weight="bold"
                className="w-full truncate group-hover:underline"
              >
                {displayName}'s Wishlist
              </Text>
              <Text size="xs" className="w-full truncate text-muted-foreground">
                @{user.username}
              </Text>
            </div>
          )}
          <div className="shrink-0">
            {isOwner ? (
              <WishlistShareDialog
                username={user.username}
                displayName={displayName}
                origin={origin}
                publicShare={publicShare}
              />
            ) : (
              <WishlistLinkCopyButton
                displayName={displayName}
                username={user.username}
                isPublicView={isPublicView}
                origin={origin}
              />
            )}
          </div>
        </div>
      </div>

      {isOwner && !hideOwnerControls ? (
        <div className="flex shrink-0 gap-2">
          <WishlistItemEditor
            categories={user.wishlistCategories}
            hideFloatingTrigger={hideFloatingAddButton}
          />
          <CategoryManager
            categories={user.wishlistCategories}
            compact
            onStartItemReorder={onStartItemReorder}
            onStartCategoryReorder={onStartCategoryReorder}
            onMutationResult={onCategoryMutationResult}
          />
        </div>
      ) : null}
    </div>
  </div>
);
