import { type UserImage } from '@prisma/client';
import { LuSettings } from 'react-icons/lu';

import { PageShell } from '#app/components/page-shell.tsx';
import { WishlistItemEditor } from '#app/routes/wishlist+/__wishlist-item-editor';

import { Button } from '../ui/button';
import { Flex, Text } from '../ui-kit';
import { WishlistAvatar } from './wishlist-avatar';
import { type WishlistCategory } from './wishlist-category-state';
import { WishlistLinkCopyButton } from './wishlist-link-copy-button';
import { WishlistNote } from './wishlist-note';
import { WishlistShareDialog } from './wishlist-share-dialog';

type WishlistPublicShare = { token: string; createdAt: Date };

type UserForHeader = {
  name: string | null;
  username: string;
  image: Pick<UserImage, 'id'> | null;
  wishlistCategories: WishlistCategory[];
};

// Consolidates identity, sharing, the personal note, and the owner's primary
// actions into one header block. Previously the note rendered as its own
// full-width bar directly underneath this one — stacked under the global nav
// that read as a third (and fourth) toolbar. It's now a subline inside this
// block: content under the title, not chrome of its own.
export const WishlistHeader = ({
  isOwner,
  user,
  displayName,
  note,
  origin,
  publicShare,
  isPublicView,
  hideOwnerControls,
  hideFloatingAddButton,
  showOrganize,
  onStartOrganize,
}: {
  isOwner: boolean;
  user: UserForHeader;
  displayName: string;
  note: string | null;
  origin?: string;
  publicShare: WishlistPublicShare | null;
  isPublicView: boolean;
  hideOwnerControls: boolean;
  hideFloatingAddButton: boolean;
  showOrganize: boolean;
  onStartOrganize: () => void;
}) => (
  <div className="w-full border-b bg-surface shadow">
    <PageShell className="flex items-start justify-between gap-3 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <WishlistAvatar isOwner={isOwner} user={user} />
        <div className="flex min-w-0 flex-col gap-1.5">
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
                <Text
                  size="xs"
                  className="w-full truncate text-muted-foreground"
                >
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
          {/* Same signal that hides Add Item/Organize during Organize mode —
              only ever true for the owner, so this never affects a viewer. */}
          {!hideOwnerControls ? (
            <WishlistNote note={note} isOwner={isOwner} />
          ) : null}
        </div>
      </div>

      {isOwner && !hideOwnerControls ? (
        <div className="flex shrink-0 gap-2">
          <WishlistItemEditor
            categories={user.wishlistCategories}
            hideFloatingTrigger={hideFloatingAddButton}
          />
          {showOrganize ? (
            <Button
              type="button"
              variant="outline"
              className="whitespace-nowrap"
              onClick={onStartOrganize}
            >
              <Flex gap={1.5} className="items-center">
                <LuSettings className="h-4 w-4" aria-hidden />
                <Text size="sm">Organize</Text>
              </Flex>
            </Button>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  </div>
);
