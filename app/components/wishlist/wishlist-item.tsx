// WishlistItem.tsx
import { type WishlistItem as WishlistItemType } from '@prisma/client';
import { useFetcher } from '@remix-run/react';
import * as React from 'react';
import { FaPencilAlt, FaTrashAlt } from 'react-icons/fa';
import { z } from 'zod';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#app/components/ui/dialog.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import {
  WishlistItemEditor,
  type WishlistItemEditorHandle,
} from '#app/routes/wishlist+/__wishlist-item-editor';
import { useIsPending } from '#app/utils/misc.tsx';
import { useOptionalUser, userHasPermission } from '#app/utils/user.ts';
import { Box, Text, Flex } from '../ui-kit';

export const DeleteFormSchema = z.object({
  intent: z.literal('delete-wishlist-item'),
  wishlistItemId: z.string(),
});

export const WishlistItem = ({
  wishlistItem,
  isOwner = false,
}: {
  wishlistItem: Pick<
    WishlistItemType,
    'id' | 'title' | 'ownerId' | 'note' | 'url' | 'type'
  >;
  isOwner?: boolean;
}) => {
  const user = useOptionalUser();
  const isOwnerByUser = user?.id === wishlistItem.ownerId;
  const canDelete = userHasPermission(
    user,
    isOwnerByUser ? `delete:wishlistItem:own` : `delete:wishlistItem:any`,
  );

  if (!isOwner) {
    return (
      <Card variant="default" padding="md" className="h-28">
        <Flex justify="between" align="center">
          <Text size="base" weight="medium">
            {wishlistItem.title}
          </Text>
        </Flex>
        <Box className="overflow-y-hidden">
          <Text size="xs" className="text-muted-foreground">
            {wishlistItem.note}
          </Text>
        </Box>
      </Card>
    );
  }

  const editorRef = React.useRef<WishlistItemEditorHandle>(null);

  // Desktop trigger: whole row edits (hidden on mobile)
  const DesktopTrigger = (
    <div className="hidden sm:block">
      <Card variant="interactive" padding="md" className="group h-28">
        <Flex justify="between" align="center">
          <Text size="base" weight="medium">
            {wishlistItem.title}
          </Text>
          {canDelete && (
            <DeleteWishlistItem
              id={wishlistItem.id}
              className="items-center justify-center text-red-600 opacity-0 transition-opacity duration-200 ease-in-out hover:text-red-800 group-hover:opacity-100"
            />
          )}
        </Flex>
        <Box className="overflow-y-hidden">
          <Text size="xs" className="text-muted-foreground">
            {wishlistItem.note}
          </Text>
        </Box>
      </Card>
    </div>
  );

  return (
    <>
      {/* One editor instance per row; desktop uses the built-in DialogTrigger */}
      <WishlistItemEditor
        ref={editorRef}
        wishlistItem={{
          id: wishlistItem.id,
          title: wishlistItem.title,
          url: wishlistItem.url ?? null,
          note: wishlistItem.note ?? null,
          type: wishlistItem.type,
        }}
        trigger={DesktopTrigger}
      />

      {/* Mobile row: explicit actions, no row tap-to-edit */}
      <div className="sm:hidden">
        <Card variant="default" padding="md" className="h-28">
          <Flex className="h-full" align="center" justify="between" gap={3}>
            <Box className="min-w-0">
              <Text size="base" weight="medium" className="truncate">
                {wishlistItem.title}
              </Text>
              <Text size="xs" className="line-clamp-2 text-muted-foreground">
                {wishlistItem.note}
              </Text>
            </Box>

            <Flex align="center" gap={1}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  editorRef.current?.open();
                }}
                aria-label="Edit item"
                title="Edit"
                className="h-10 w-10 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FaPencilAlt />
              </Button>

              {canDelete && (
                <DeleteWishlistItem
                  id={wishlistItem.id}
                  className="h-10 w-10 touch-manipulation text-red-600 [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
            </Flex>
          </Flex>
        </Card>
      </div>
    </>
  );
};

export const DeleteWishlistItem = ({
  id,
  className,
}: {
  id: string;
  className?: string;
}) => {
  const isPending = useIsPending();
  const fetcher = useFetcher();

  return (
    <Dialog>
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
      >
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            className={className}
            size="icon"
            type="button"
            aria-label="Delete item"
            title="Delete"
          >
            <FaTrashAlt />
          </Button>
        </DialogTrigger>
      </div>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Delete wishlist item</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this item? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <fetcher.Form
            method="DELETE"
            action={`/wishlist/${id}`}
            className="flex w-full gap-4"
          >
            <input type="hidden" name="wishlistItemId" value={id} />
            <Button
              type="submit"
              name="intent"
              value="delete-wishlist-item"
              variant="destructive"
              disabled={isPending}
              className="flex-1"
            >
              Delete
            </Button>
          </fetcher.Form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
