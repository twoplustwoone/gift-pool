import { type WishlistItem as WishlistItemType } from '@prisma/client';
import { useFetcher } from '@remix-run/react';
import * as React from 'react';
import {
  LuChevronRight,
  LuGift,
  LuImage,
  LuLock,
  LuPencil,
  LuTrash,
} from 'react-icons/lu';
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
  MobileBottomSheet,
  MobileBottomSheetContent,
  MobileBottomSheetDescription,
  MobileBottomSheetHeader,
  MobileBottomSheetTitle,
  MobileBottomSheetTrigger,
} from '#app/components/ui/mobile-bottom-sheet.tsx';
import {
  WishlistItemEditor,
  type WishlistItemEditorHandle,
} from '#app/routes/wishlist+/__wishlist-item-editor';
import { cn, getWishlistItemImgSrc, useIsPending } from '#app/utils/misc.tsx';
import { useOptionalUser, userHasPermission } from '#app/utils/user.ts';
import { type WishlistItemImageSource } from '#app/utils/wishlist-images.server.ts';
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
    'id' | 'title' | 'ownerId' | 'note' | 'url' | 'type' | 'categoryId' | 'updatedAt'
  > &
    Partial<{
      hasImage: boolean;
      imageSource: WishlistItemImageSource | null;
    }> &
    Partial<{ purchase: { purchasedById: string } | null }>;
  isOwner?: boolean;
  categories?: { id: string; name: string; order: number }[];
}) => {
  const user = useOptionalUser();
  const isOwnerByUser = user?.id === wishlistItem.ownerId;
  const canDelete = userHasPermission(
    user,
    isOwnerByUser ? `delete:wishlistItem:own` : `delete:wishlistItem:any`,
  );

  const purchaseFetcher = useFetcher();
  const isPurchasePending = purchaseFetcher.state !== 'idle';
  const isPurchasedByMe = wishlistItem.purchase?.purchasedById === user?.id;
  const isPurchasedBySomeoneElse =
    !!wishlistItem.purchase && wishlistItem.purchase.purchasedById !== user?.id;
  const imageFetcher = useFetcher();
  const [imageErrored, setImageErrored] = React.useState(false);
  const [imageVersion, setImageVersion] = React.useState(0);
  const [isClaimInfoOpen, setIsClaimInfoOpen] = React.useState(false);
  const imageSrc = wishlistItem.hasImage
    ? getWishlistItemImgSrc(wishlistItem.id)
    : null;
  const displayImageSrc = imageSrc
    ? `${imageSrc}${imageSrc.includes('?') ? '&' : '?'}v=${(wishlistItem.updatedAt ? new Date(wishlistItem.updatedAt).getTime() : 0) + imageVersion}`
    : null;

  React.useEffect(() => {
    setImageErrored(false);
  }, [displayImageSrc]);

  const handleImageError = (event?: React.SyntheticEvent) => {
    event?.stopPropagation();
    setImageErrored(true);
  };

  const handleRetryImage = (event?: React.SyntheticEvent) => {
    event?.stopPropagation();
    setImageErrored(false);
    setImageVersion((v) => v + 1);
  };

  const handleRemoveImage = (event?: React.SyntheticEvent) => {
    event?.stopPropagation();
    if (!isOwner) return;
    const formData = new FormData();
    formData.set('intent', 'save');
    formData.set('id', wishlistItem.id);
    formData.set('title', wishlistItem.title);
    formData.set('type', wishlistItem.type);
    if (wishlistItem.url) formData.set('url', wishlistItem.url);
    if (wishlistItem.note) formData.set('note', wishlistItem.note);
    if (wishlistItem.categoryId)
      formData.set('categoryId', wishlistItem.categoryId);
    formData.set('imageAction', 'remove');
    imageFetcher.submit(formData, {
      method: 'post',
      encType: 'multipart/form-data',
      action: '/wishlist',
    });
  };

  const renderImageBlock = () => {
    if (!(wishlistItem.hasImage || imageErrored)) return null;
    return (
      <div className="overflow-hidden rounded-lg bg-muted/30 sm:w-40">
        {displayImageSrc && !imageErrored ? (
          <img
            src={displayImageSrc}
            alt={wishlistItem.title}
            className="h-40 w-full object-cover sm:h-full"
            onError={handleImageError}
            loading="lazy"
          />
        ) : (
          <div className="flex h-40 flex-col items-center justify-center gap-2 p-3 text-xs text-muted-foreground sm:h-full sm:min-h-[9rem]">
            <LuImage className="h-5 w-5" aria-hidden />
            <span>
              {imageErrored ? 'Image failed to load' : 'Image unavailable'}
            </span>
            {imageErrored ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  onClick={handleRetryImage}
                >
                  Retry
                </Button>
                {isOwner ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={handleRemoveImage}
                    disabled={imageFetcher.state !== 'idle'}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  };
  const purchaseStatusText = isPurchasedBySomeoneElse
    ? 'Someone already grabbed this'
    : isPurchasedByMe
      ? 'You’re on gift duty for this one'
      : null;
  const purchaseActionLabel = isPurchasedByMe
    ? 'Change my mind'
    : "I'll grab this";
  const purchaseButtonAriaLabel = isPurchasedByMe
    ? 'Let someone else pick up this gift'
    : "I'll grab this gift";
  const purchaseCheckIndicator = (
    <span
      aria-hidden
      className={cn(
        'flex h-4 w-4 items-center justify-center rounded-sm border text-xs transition-colors',
        isPurchasedByMe
          ? 'border-pool bg-pool text-pool-foreground'
          : 'border-input bg-background',
      )}
    >
      {isPurchasedByMe ? (
        <svg viewBox="0 0 8 8" className="h-3 w-3">
          <path
            d="M1,4 L3,6 L7,2"
            stroke="currentColor"
            strokeWidth="1.25"
            fill="none"
          />
        </svg>
      ) : null}
    </span>
  );
  const purchaseButtonClassName = cn(
    'gap-2',
    isPurchasedByMe
      ? 'border-pool bg-pool text-pool-foreground hover:bg-pool/90'
      : '',
  );
  const purchaseButtonContent = (
    <>
      {purchaseCheckIndicator}
      <span className="sr-only sm:hidden">{purchaseActionLabel}</span>
      <span className="hidden sm:inline">{purchaseActionLabel}</span>
      <LuGift className="h-4 w-4 sm:hidden" aria-hidden />
    </>
  );
  const purchaseButtonIconOnly = (
    <>
      <span className="sr-only">{purchaseActionLabel}</span>
      <LuGift className="h-4 w-4" aria-hidden />
    </>
  );

  const handlePurchaseToggle = (event: React.SyntheticEvent) => {
    event.stopPropagation();
    purchaseFetcher.submit(
      {
        intent: isPurchasedByMe ? 'unpurchase' : 'purchase',
        wishlistItemId: wishlistItem.id,
      },
      { method: 'post', action: '/wishlist/purchase' },
    );
  };

  const editorRef = React.useRef<WishlistItemEditorHandle>(null);

  const press = usePressFeedback<HTMLDivElement>(
    isOwner
      ? {
          onClick: () => {
            editorRef.current?.openView({ fromTrigger: true });
          },
        }
      : undefined,
  );

  // ---------------- Non-owner: simple, tappable row → read-only view
  if (!isOwner) {
    const imageBlock = renderImageBlock();
    const statusIsClaimed = isPurchasedByMe || isPurchasedBySomeoneElse;
    const viewPurchaseExtras = isPurchasedBySomeoneElse ? (
      <Flex align="center" gap={2}>
        <LuGift className="h-4 w-4 text-amber-700" aria-hidden />
        <Text size="sm" className="text-amber-800">
          Someone already grabbed this one.
        </Text>
      </Flex>
    ) : (
      <div className="flex flex-col gap-3">
        <Text size="sm" className="text-muted-foreground">
          Claim this gift so everyone else knows it’s handled.
        </Text>
        <Button
          type="button"
          variant={isPurchasedByMe ? 'secondary' : 'outline'}
          disabled={isPurchasePending}
          onClick={handlePurchaseToggle}
          aria-pressed={isPurchasedByMe}
          aria-label={purchaseButtonAriaLabel}
          className={cn('justify-center sm:w-auto', purchaseButtonClassName)}
        >
          {purchaseButtonContent}
        </Button>
        {purchaseStatusText ? (
          <Text size="sm" className="text-pool">
            {purchaseStatusText}
          </Text>
        ) : null}
      </div>
    );

    const trigger = (
      <Card
        variant="interactive"
        padding="none"
        role="button"
        className={cn(
          'group relative flex min-w-0 cursor-pointer flex-col overflow-hidden [-webkit-tap-highlight-color:transparent] data-[pressed=true]:scale-[0.99] data-[pressed=true]:bg-accent/30',
          isPurchasedBySomeoneElse ? 'opacity-90' : '',
        )}
        data-claimable={!statusIsClaimed ? 'true' : undefined}
        data-pressed={press.pressed ? 'true' : 'false'}
        {...press.rowProps}
      >
        <div className="flex h-full flex-col gap-3 px-4 py-3 sm:flex-row">
          {imageBlock}
          <Flex
            justify="between"
            align="start"
            className="min-w-0 flex-1 gap-3"
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
                  {wishlistItem.note ?? ''}
                </Text>
              </Box>
            </Box>
            <div className="flex items-center gap-2">
              {!isPurchasedBySomeoneElse ? (
                <Button
                  type="button"
                  size="sm"
                  variant={isPurchasedByMe ? 'secondary' : 'outline'}
                  disabled={isPurchasePending}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onClick={handlePurchaseToggle}
                  className={cn(
                    'flex items-center whitespace-nowrap',
                    purchaseButtonClassName,
                  )}
                  aria-pressed={isPurchasedByMe}
                  aria-label={purchaseButtonAriaLabel}
                >
                  {purchaseButtonIconOnly}
                </Button>
              ) : (
                <div
                  className="flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200"
                  aria-hidden
                >
                  <LuGift className="h-4 w-4" />
                  Claimed
                </div>
              )}
              <LuChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            </div>
          </Flex>
        </div>

        {statusIsClaimed ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-background/60 text-muted-foreground opacity-0 transition-opacity sm:flex sm:backdrop-blur group-hover:opacity-100"
          >
            <div className="flex items-center gap-2 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold shadow-sm ring-1 ring-border">
              <LuLock className="h-4 w-4" />
              {isPurchasedBySomeoneElse ? 'Locked by a friend' : 'You claimed this'}
            </div>
          </div>
        ) : null}

        {isPurchasedBySomeoneElse ? (
          <MobileBottomSheet
            open={isClaimInfoOpen}
            onOpenChange={setIsClaimInfoOpen}
          >
            <MobileBottomSheetTrigger asChild>
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
                className="flex h-10 items-center justify-between gap-2 bg-amber-100 px-4 text-left text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-200"
              >
                <div className="flex items-center gap-2">
                  <LuGift className="h-4 w-4" aria-hidden />
                  <span>Someone already grabbed this</span>
                </div>
                <LuChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </MobileBottomSheetTrigger>
            <MobileBottomSheetContent className="gap-3 sm:gap-4">
              <MobileBottomSheetHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                    <LuLock className="h-5 w-5" aria-hidden />
                  </div>
                  <MobileBottomSheetTitle>Already claimed</MobileBottomSheetTitle>
                </div>
                <MobileBottomSheetDescription>
                  This item has already been claimed by someone else to avoid
                  duplicates.
                </MobileBottomSheetDescription>
              </MobileBottomSheetHeader>
              <Button
                type="button"
                variant="secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  const target = document.querySelector('[data-claimable="true"]');
                  if (target instanceof HTMLElement) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                  setIsClaimInfoOpen(false);
                }}
              >
                See other ideas
              </Button>
            </MobileBottomSheetContent>
          </MobileBottomSheet>
        ) : statusIsClaimed ? (
          <div className="flex h-10 items-center gap-2 bg-pool px-4 text-xs font-semibold text-pool-foreground">
            <LuGift className="h-4 w-4" aria-hidden />
            <span>You’re on gift duty</span>
          </div>
        ) : (
          <div className="h-px w-full bg-border/70" aria-hidden />
        )}
      </Card>
    );

    return (
      <WishlistItemEditor
        key={`${wishlistItem.id}-${wishlistItem.updatedAt ?? ''}`}
        ref={editorRef}
        wishlistItem={{
          id: wishlistItem.id,
          title: wishlistItem.title,
          url: wishlistItem.url ?? null,
          note: wishlistItem.note ?? null,
          type: wishlistItem.type,
          categoryId: wishlistItem.categoryId ?? null,
          hasImage: wishlistItem.hasImage ?? false,
          imageSource: wishlistItem.imageSource ?? null,
          updatedAt: wishlistItem.updatedAt,
        }}
        canEdit={false}
        initialMode="view"
        categories={categories}
        viewExtras={viewPurchaseExtras}
        trigger={trigger}
      />
    );
  }

  // ---------------- Owner: desktop trigger keeps click-to-edit behavior
  const imageBlock = renderImageBlock();
  const DesktopTrigger = (
    <div className="hidden sm:block">
      <Card variant="interactive" padding="md" className="group min-w-0">
        <div className="flex gap-3">
          {imageBlock}
          <div className="min-w-0 flex-1">
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
                {wishlistItem.note ?? ''}
              </Text>
            </Box>
          </div>
        </div>
      </Card>
    </div>
  );

  const MobileTrigger = (
    <div className="sm:hidden">
      <Card
        variant="interactive"
        padding="md"
        role="button"
        className="h-28 min-w-0 cursor-pointer touch-pan-y transition [-webkit-tap-highlight-color:transparent] data-[pressed=true]:scale-[0.99] data-[pressed=true]:bg-accent/30"
        data-pressed={press.pressed ? 'true' : 'false'}
        {...press.rowProps}
      >
        <div className="flex h-full min-w-0 flex-col gap-3">
          {imageBlock}
          <Flex className="min-w-0" align="center" justify="between" gap={3}>
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
                  {wishlistItem.note ?? ''}
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
        </div>
      </Card>
    </div>
  );

  const Trigger = (
    <div className="contents">
      {DesktopTrigger}
      {MobileTrigger}
    </div>
  );

  // ---------------- Owner: mobile row (explicit actions + chevron); row tap → read-only view
  return (
    <WishlistItemEditor
      key={`${wishlistItem.id}-${wishlistItem.updatedAt ?? ''}`}
      ref={editorRef}
      wishlistItem={{
        id: wishlistItem.id,
        title: wishlistItem.title,
        url: wishlistItem.url ?? null,
        note: wishlistItem.note ?? null,
        type: wishlistItem.type,
        categoryId: wishlistItem.categoryId ?? null,
        hasImage: wishlistItem.hasImage ?? false,
        imageSource: wishlistItem.imageSource ?? null,
        updatedAt: wishlistItem.updatedAt,
      }}
      trigger={Trigger} // desktop: row-as-trigger (edit/create); mobile: tap-to-view
      canEdit={true}
      categories={categories}
    />
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
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className={className}
          size="icon"
          type="button"
          aria-label="Delete item"
          title="Delete"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
        >
          <LuTrash className="h-4 w-4" />
        </Button>
      </DialogTrigger>

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
