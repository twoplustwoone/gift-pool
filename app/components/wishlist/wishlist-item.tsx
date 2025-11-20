// WishlistItem.tsx
import { type WishlistItem as WishlistItemType } from '@prisma/client';
import { useFetcher } from '@remix-run/react';
import * as React from 'react';
import { LuChevronRight, LuPencil, LuTrash } from 'react-icons/lu';
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
  categories = [],
}: {
  wishlistItem: Pick<
    WishlistItemType,
    'id' | 'title' | 'ownerId' | 'note' | 'url' | 'type' | 'categoryId'
  >;
  isOwner?: boolean;
  categories?: { id: string; name: string; order: number }[];
}) => {
  const user = useOptionalUser();
  const isOwnerByUser = user?.id === wishlistItem.ownerId;
  const canDelete = userHasPermission(
    user,
    isOwnerByUser ? `delete:wishlistItem:own` : `delete:wishlistItem:any`,
  );

  const editorRef = React.useRef<WishlistItemEditorHandle>(null);

  // 🔧 Call hook once, unconditionally
  const press = usePressFeedback<HTMLDivElement>(
    isOwner
      ? {
          onClick: () => editorRef.current?.openView(),
        }
      : undefined,
  );

  // ---------------- Non-owner: simple, tappable row → read-only view
  if (!isOwner) {
    const trigger = (
      <Card
        variant="interactive"
        padding="md"
        role="button"
        className="h-28 min-w-0 cursor-pointer touch-pan-y transition [-webkit-tap-highlight-color:transparent] data-[pressed=true]:scale-[0.99] data-[pressed=true]:bg-accent/30 sm:h-auto"
        data-pressed={press.pressed ? 'true' : 'false'}
        {...press.rowProps}
      >
        <Flex justify="between" align="center" className="min-w-0 gap-3">
          <Box className="w-0 min-w-0 flex-1 overflow-hidden">
            <Text
              size="base"
              weight="medium"
              className="block min-w-0 max-w-full truncate"
            >
              {wishlistItem.title}
            </Text>
            <Box className="max-h-10 overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent)]">
              <Text size="xs" className="break-words text-muted-foreground">
                {wishlistItem.note}
              </Text>
            </Box>
          </Box>
          <LuChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </Flex>
      </Card>
    );

    return (
      <WishlistItemEditor
        ref={editorRef}
        wishlistItem={{
          id: wishlistItem.id,
          title: wishlistItem.title,
          url: wishlistItem.url ?? null,
          note: wishlistItem.note ?? null,
          type: wishlistItem.type,
          categoryId: wishlistItem.categoryId ?? null,
        }}
        canEdit={false}
        initialMode="view"
        categories={categories}
        trigger={trigger}
      />
    );
  }

  // ---------------- Owner: desktop trigger keeps click-to-edit behavior
  const DesktopTrigger = (
    <div className="hidden sm:block">
      <Card variant="interactive" padding="md" className="group h-28 min-w-0">
        <Flex justify="between" align="center" className="min-w-0 gap-3">
          <Text
            size="base"
            weight="medium"
            className="block w-0 min-w-0 max-w-full flex-1 truncate"
          >
            {wishlistItem.title}
          </Text>
          <div className="flex items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Flex>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Edit item"
                onClick={(e) => {
                  e.stopPropagation();
                  editorRef.current?.openEdit();
                }}
              >
                <LuPencil className="h-4 w-4" />
              </Button>
              {canDelete && (
                <DeleteWishlistItem
                  id={wishlistItem.id}
                  className="items-center justify-center text-red-600 hover:text-red-800"
                />
              )}
            </Flex>
          </div>
        </Flex>
        <Box className="max-h-10 overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent)]">
          <Text size="xs" className="break-words text-muted-foreground">
            {wishlistItem.note}
          </Text>
        </Box>
      </Card>
    </div>
  );

  // ---------------- Owner: mobile row (explicit actions + chevron); row tap → read-only view
  return (
    <>
      <WishlistItemEditor
        ref={editorRef}
        wishlistItem={{
          id: wishlistItem.id,
          title: wishlistItem.title,
          url: wishlistItem.url ?? null,
          note: wishlistItem.note ?? null,
          type: wishlistItem.type,
          categoryId: wishlistItem.categoryId ?? null,
        }}
        trigger={DesktopTrigger} // desktop: row-as-trigger (edit/create)
        canEdit={true}
        categories={categories}
      />

      <div className="sm:hidden">
        <Card
          variant="interactive"
          padding="md"
          role="button"
          className="h-28 min-w-0 cursor-pointer touch-pan-y transition [-webkit-tap-highlight-color:transparent] data-[pressed=true]:scale-[0.99] data-[pressed=true]:bg-accent/30"
          data-pressed={press.pressed ? 'true' : 'false'}
          {...press.rowProps}
        >
          <Flex
            className="h-full min-w-0"
            align="center"
            justify="between"
            gap={3}
          >
            <Box className="w-0 min-w-0 flex-1 overflow-hidden">
              <Text
                size="base"
                weight="medium"
                className="block min-w-0 max-w-full truncate"
              >
                {wishlistItem.title}
              </Text>
              <Box className="max-h-10 overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent)]">
                <Text size="xs" className="break-words text-muted-foreground">
                  {wishlistItem.note}
                </Text>
              </Box>
            </Box>

            <Flex align="center" className="flex-shrink-0" gap={1}>
              {/* EDIT → flip current modal to edit mode */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  editorRef.current?.openEdit();
                }}
                aria-label="Edit item"
                title="Edit"
                className="h-9 w-9 text-muted-foreground [-webkit-tap-highlight-color:transparent] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
              >
                <LuPencil className="h-4 w-4" />
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
              <LuChevronRight
                className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform data-[pressed=true]:translate-x-0.5"
                data-pressed={press.pressed ? 'true' : 'false'}
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
        onPointerUp={(e) => e.stopPropagation()} // ADD THIS
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
            <LuTrash className="h-4 w-4" />
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
