// WishlistItem.tsx
import { type WishlistItem as WishlistItemType } from '@prisma/client';
import { useFetcher } from '@remix-run/react';
import * as React from 'react';
import { FaPencilAlt, FaTrashAlt, FaChevronRight } from 'react-icons/fa';
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
import {
  WishlistItemEditor,
  type WishlistItemEditorHandle,
} from '#app/routes/wishlist+/__wishlist-item-editor';
import { useIsPending } from '#app/utils/misc.tsx';
import { useOptionalUser, userHasPermission } from '#app/utils/user.ts';
import { Box, Text, Flex } from '../ui-kit';
import { usePressFeedback } from './hooks/use-press-feedback.ts';

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

  const editorRef = React.useRef<WishlistItemEditorHandle>(null);
  const { pressed, rowProps } = usePressFeedback<HTMLDivElement>({
    onClick: () => editorRef.current?.open(),
  });

  // ---------------- Non-owner: simple, tappable row + chevron
  if (!isOwner) {
    return (
      <Card
        variant="interactive"
        padding="md"
        className="h-28 cursor-pointer transition active:scale-[0.99] active:bg-accent/30 sm:h-auto"
        role="button"
        onClick={() => editorRef.current?.open()}
      >
        {/* Single editor instance to open read-only view */}
        <WishlistItemEditor
          ref={editorRef}
          wishlistItem={{
            id: wishlistItem.id,
            title: wishlistItem.title,
            url: wishlistItem.url ?? null,
            note: wishlistItem.note ?? null,
            type: wishlistItem.type,
          }}
          // no trigger — we open imperatively
        />

        <Flex justify="between" align="center" className="gap-3">
          <Box className="min-w-0">
            <Text size="base" weight="medium" className="truncate">
              {wishlistItem.title}
            </Text>
            <Text size="xs" className="line-clamp-2 text-muted-foreground">
              {wishlistItem.note}
            </Text>
          </Box>

          {/* Primary nav cue */}
          <FaChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </Flex>
      </Card>
    );
  }

  // ---------------- Owner: desktop trigger (row click-to-edit)
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
      {/* One editor instance per row; desktop uses the trigger above */}
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

      {/* Mobile row: explicit actions + chevron, whole row also tappable */}
      <div className="sm:hidden">
        <Card
          variant="interactive"
          padding="md"
          role="button"
          // REMOVE base active:*; use data-pressed instead; keep desktop with sm:active if you want
          className="h-28 cursor-pointer touch-pan-y transition [-webkit-tap-highlight-color:transparent] data-[pressed=true]:scale-[0.99] data-[pressed=true]:bg-accent/30 sm:active:bg-accent/30"
          data-pressed={pressed ? 'true' : 'false'}
          {...rowProps}
        >
          <Flex className="h-full" align="center" justify="between" gap={3}>
            <Box className="min-w-0">
              <Text size="base" weight="medium" className="truncate">
                {wishlistItem.title}
              </Text>
              <Text size="xs" className="line-clamp-2 text-muted-foreground">
                {wishlistItem.note}
              </Text>
            </Box>

            <Flex align="center" className="flex-shrink-0" gap={1}>
              {/* EDIT */}
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
                className="h-9 w-9 text-muted-foreground [-webkit-tap-highlight-color:transparent] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
              >
                <FaPencilAlt className="h-4 w-4" />
              </Button>

              {/* DELETE */}
              {canDelete && (
                <DeleteWishlistItem
                  id={wishlistItem.id}
                  className="h-9 w-9 text-red-600 [-webkit-tap-highlight-color:transparent] hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
                />
              )}

              {/* Divider + Chevron */}
              <div className="mx-1 h-6 border-l border-border/40" />
              <FaChevronRight
                className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform data-[pressed=true]:translate-x-0.5"
                // mirror data-pressed for the chevron micro-motion
                data-pressed={pressed ? 'true' : 'false'}
              />
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
            <FaTrashAlt className="h-4 w-4" />
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
