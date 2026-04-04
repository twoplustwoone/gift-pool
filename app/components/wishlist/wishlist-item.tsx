import { type WishlistItem as WishlistItemType } from '@prisma/client';
import * as React from 'react';
import {
  LuArchive,
  LuChevronRight,
  LuGift,
  LuImage,
  LuLock,
  LuPencil,
  LuTrash,
} from 'react-icons/lu';
import { useFetcher } from 'react-router';
import { toast } from 'sonner';
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
} from '#app/components/ui/dialog.tsx';
import { DropdownMenuItem } from '#app/components/ui/dropdown-menu.tsx';
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
import { track } from '#app/utils/analytics.client.ts';
import { createClientMutationId } from '#app/utils/client-mutation-id.ts';
import { cn, getWishlistItemImgSrc, useIsPending } from '#app/utils/misc.tsx';
import { useOptionalRequestInfo } from '#app/utils/request-info.ts';
import { useOptionalUser, userHasPermission } from '#app/utils/user.ts';
import { type WishlistItemImageSource } from '#app/utils/wishlist-images.server.ts';
import {
  isWishlistItemActive,
  type WishlistItemStatusValue,
} from '#app/utils/wishlist.ts';
import { Box, Text, Flex } from '../ui-kit';
import { usePressFeedback } from './hooks/use-press-feedback.ts';
import { WishlistStatusBadge, getWishlistStatusMeta } from './status';
import {
  WishlistRowActionsItem,
  WishlistRowActionsMenu,
} from './wishlist-row-actions';

export const DeleteFormSchema = z.object({
  intent: z.literal('delete-wishlist-item'),
  wishlistItemId: z.string(),
});

export type WishlistItemOwnerLayout = 'default' | 'reorder';
type WishlistItemDragState = 'idle' | 'dragging-item' | 'dragging-category';
type WishlistPurchasePayload = { purchasedById: string } | null;
type WishlistPurchaseActionResponse = {
  ok: boolean;
  wishlistItemId: string;
  purchase: WishlistPurchasePayload;
  error?: string;
};

type WishlistItemRecord = (Pick<
  WishlistItemType,
  | 'id'
  | 'title'
  | 'ownerId'
  | 'note'
  | 'url'
  | 'type'
  | 'categoryId'
  | 'updatedAt'
  | 'status'
> & {
  status: WishlistItemStatusValue;
}) &
  Partial<{
    hasImage: boolean;
    imageSource: WishlistItemImageSource | null;
  }> &
  Partial<{ purchase: { purchasedById: string } | null }>;
type WishlistItemImageBlockProps = Readonly<{
  displayImageSrc: string | null;
  imageErrored: boolean;
  imageFetcherState: string;
  isOwner: boolean;
  onImageError: (event?: React.SyntheticEvent) => void;
  onRemoveImage: (event?: React.SyntheticEvent) => void;
  onRetryImage: (event?: React.SyntheticEvent) => void;
  title: string;
}>;
type WishlistItemProps = Readonly<{
  wishlistItem: WishlistItemRecord;
  isOwner?: boolean;
  categories?: { id: string; name: string; order: number }[];
  disableClaims?: boolean;
  layout?: WishlistItemOwnerLayout;
  isReorderMode?: boolean;
  dragState?: WishlistItemDragState;
  onStatusChange?: (
    itemId: string,
    status: WishlistItemStatusValue,
  ) => boolean | void;
}>;
type WishlistArchivedTriggerProps = Readonly<{
  normalizedStatus: WishlistItemStatusValue;
  onOpen: () => void;
  statusMeta: ReturnType<typeof getWishlistStatusMeta>;
  wishlistItem: WishlistItemRecord;
}>;
type WishlistNonOwnerExtrasProps = Readonly<{
  allowClaims: boolean;
  handlePurchaseToggle: (event: React.SyntheticEvent) => void;
  isClaimed: boolean;
  isPurchasePending: boolean;
  isPurchasedByMe: boolean;
  isPurchasedBySomeoneElse: boolean;
  purchaseButtonAriaLabel: string;
  purchaseButtonClassName: string;
  purchaseButtonContent: React.ReactNode;
  purchaseStatusText: string | null;
}>;
type WishlistNonOwnerTriggerProps = Readonly<{
  allowClaims: boolean;
  dragState: WishlistItemDragState;
  handlePurchaseToggle: (event: React.SyntheticEvent) => void;
  imageBlock: React.ReactNode;
  isClaimInfoOpen: boolean;
  isClaimed: boolean;
  isPurchasePending: boolean;
  isPurchasedByMe: boolean;
  isPurchasedBySomeoneElse: boolean;
  onOpen: () => void;
  onClaimInfoOpenChange: (open: boolean) => void;
  press: ReturnType<typeof usePressFeedback<HTMLButtonElement>>;
  purchaseButtonAriaLabel: string;
  purchaseButtonClassName: string;
  purchaseButtonIconOnly: React.ReactNode;
  purchaseStatusText: string | null;
  wishlistItem: WishlistItemRecord;
}>;
type WishlistOwnerTriggerProps = Readonly<{
  actionMenu: React.ReactNode;
  ariaLabel: string;
  displayImageSrc: string | null;
  dragState: WishlistItemDragState;
  imageBlock: React.ReactNode;
  imageErrored: boolean;
  isCompactLayout: boolean;
  onOpen: () => void;
  onImageError: (event?: React.SyntheticEvent) => void;
  press: ReturnType<typeof usePressFeedback<HTMLButtonElement>>;
  wishlistItem: WishlistItemRecord;
}>;

function getClaimedLabel(isPurchasedBySomeoneElse: boolean) {
  return isPurchasedBySomeoneElse ? 'Locked by a friend' : 'You claimed this';
}

function toEditorWishlistItem(
  wishlistItem: WishlistItemRecord,
  normalizedStatus: WishlistItemStatusValue,
) {
  return {
    id: wishlistItem.id,
    title: wishlistItem.title,
    url: wishlistItem.url ?? null,
    note: wishlistItem.note ?? null,
    type: wishlistItem.type,
    categoryId: wishlistItem.categoryId ?? null,
    hasImage: wishlistItem.hasImage ?? false,
    imageSource: wishlistItem.imageSource ?? null,
    updatedAt: wishlistItem.updatedAt,
    status: normalizedStatus,
  };
}

function useWishlistPurchaseController({
  userId,
  wishlistItem,
}: {
  userId: string | undefined;
  wishlistItem: WishlistItemRecord;
}) {
  const purchaseFetcher = useFetcher<WishlistPurchaseActionResponse>();
  const isPurchasePending = purchaseFetcher.state !== 'idle';
  const serverPurchaseBy = wishlistItem.purchase?.purchasedById ?? null;
  const [purchaseBy, setPurchaseBy] = React.useState<string | null>(
    serverPurchaseBy,
  );
  const purchaseRollbackRef = React.useRef<string | null>(serverPurchaseBy);
  const hasPendingPurchaseMutationRef = React.useRef(false);

  React.useEffect(() => {
    if (purchaseFetcher.state !== 'idle') return;
    setPurchaseBy(serverPurchaseBy);
    purchaseRollbackRef.current = serverPurchaseBy;
  }, [serverPurchaseBy, purchaseFetcher.state, wishlistItem.id]);

  React.useEffect(() => {
    if (purchaseFetcher.state !== 'idle') return;
    if (!hasPendingPurchaseMutationRef.current) return;
    hasPendingPurchaseMutationRef.current = false;

    const actionData = purchaseFetcher.data;
    const isFailedMutation =
      actionData?.wishlistItemId === wishlistItem.id && actionData.ok === false;

    if (actionData?.wishlistItemId === wishlistItem.id) {
      const reconciledPurchaseBy = actionData.purchase?.purchasedById ?? null;
      if (actionData.ok) {
        setPurchaseBy(reconciledPurchaseBy);
        purchaseRollbackRef.current = reconciledPurchaseBy;
        return;
      }
      if (reconciledPurchaseBy !== purchaseRollbackRef.current) {
        setPurchaseBy(reconciledPurchaseBy);
        purchaseRollbackRef.current = reconciledPurchaseBy;
        return;
      }
    }

    setPurchaseBy(purchaseRollbackRef.current);
    if (isFailedMutation) {
      toast.error(actionData.error ?? 'Unable to update gift claim.');
    }
  }, [purchaseFetcher.data, purchaseFetcher.state, wishlistItem.id]);

  const isClaimed = Boolean(purchaseBy);
  const isPurchasedByMe = isClaimed && purchaseBy === userId;
  const isPurchasedBySomeoneElse = isClaimed && purchaseBy !== userId;

  const handlePurchaseToggle = React.useCallback(
    (event: React.SyntheticEvent) => {
      event.stopPropagation();
      if (!userId || isPurchasePending || isPurchasedBySomeoneElse) return;

      const nextPurchaseBy = isPurchasedByMe ? null : userId;
      purchaseRollbackRef.current = purchaseBy;
      hasPendingPurchaseMutationRef.current = true;
      setPurchaseBy(nextPurchaseBy);

      Promise.resolve(
        purchaseFetcher.submit(
          {
            intent: isPurchasedByMe ? 'unpurchase' : 'purchase',
            wishlistItemId: wishlistItem.id,
          },
          { method: 'post', action: '/wishlist/purchase' },
        ),
      ).catch(() => {});
    },
    [
      isPurchasePending,
      isPurchasedByMe,
      isPurchasedBySomeoneElse,
      purchaseBy,
      purchaseFetcher,
      userId,
      wishlistItem.id,
    ],
  );

  return {
    handlePurchaseToggle,
    isClaimed,
    isPurchasePending,
    isPurchasedByMe,
    isPurchasedBySomeoneElse,
    purchaseBy,
  };
}

function useWishlistImageController({
  isOwner,
  wishlistItem,
}: {
  isOwner: boolean;
  wishlistItem: WishlistItemRecord;
}) {
  const imageFetcher = useFetcher();
  const [imageErrored, setImageErrored] = React.useState(false);
  const [imageVersion, setImageVersion] = React.useState(0);
  const imageSrc = wishlistItem.hasImage
    ? getWishlistItemImgSrc(wishlistItem.id)
    : null;
  const imageVersionBase = wishlistItem.updatedAt
    ? new Date(wishlistItem.updatedAt).getTime()
    : 0;
  const imageVersionValue = imageVersionBase + imageVersion;
  const imageSrcSeparator = imageSrc?.includes('?') ? '&' : '?';
  const displayImageSrc = imageSrc
    ? `${imageSrc}${imageSrcSeparator}v=${imageVersionValue}`
    : null;

  React.useEffect(() => {
    setImageErrored(false);
  }, [displayImageSrc]);

  const handleImageError = React.useCallback((event?: React.SyntheticEvent) => {
    event?.stopPropagation();
    setImageErrored(true);
  }, []);

  const handleRetryImage = React.useCallback((event?: React.SyntheticEvent) => {
    event?.stopPropagation();
    setImageErrored(false);
    setImageVersion((value) => value + 1);
  }, []);

  const handleRemoveImage = React.useCallback(
    (event?: React.SyntheticEvent) => {
      event?.stopPropagation();
      if (!isOwner) return;

      const formData = new FormData();
      formData.set('intent', 'save');
      formData.set('id', wishlistItem.id);
      formData.set('title', wishlistItem.title);
      formData.set('type', wishlistItem.type);
      if (wishlistItem.url) formData.set('url', wishlistItem.url);
      if (wishlistItem.note) formData.set('note', wishlistItem.note);
      if (wishlistItem.categoryId) {
        formData.set('categoryId', wishlistItem.categoryId);
      }
      formData.set('imageAction', 'remove');

      Promise.resolve(
        imageFetcher.submit(formData, {
          method: 'post',
          encType: 'multipart/form-data',
          action: '/wishlist',
        }),
      ).catch(() => {});
    },
    [imageFetcher, isOwner, wishlistItem],
  );

  return {
    displayImageSrc,
    handleImageError,
    handleRemoveImage,
    handleRetryImage,
    imageErrored,
    imageFetcher,
  };
}

function WishlistItemImageBlock({
  displayImageSrc,
  imageErrored,
  imageFetcherState,
  isOwner,
  onImageError,
  onRemoveImage,
  onRetryImage,
  title,
}: WishlistItemImageBlockProps) {
  if (!(displayImageSrc || imageErrored)) return null;

  return (
    <div className="overflow-hidden rounded-lg bg-muted/30 sm:w-40">
      {displayImageSrc && !imageErrored ? (
        <img
          src={displayImageSrc}
          alt={title}
          className="h-40 w-full object-cover sm:h-full"
          onError={onImageError}
          loading="lazy"
        />
      ) : (
        <div className="flex h-40 flex-col items-center justify-center gap-2 p-3 text-xs text-muted-foreground sm:h-full sm:min-h-[9rem]">
          <LuImage className="h-5 w-5" aria-hidden />
          <span>{imageErrored ? 'Image failed to load' : 'Image unavailable'}</span>
          {imageErrored ? (
            <div className="flex gap-2">
              <Button type="button" size="xs" variant="secondary" onClick={onRetryImage}>
                Retry
              </Button>
              {isOwner ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={onRemoveImage}
                  disabled={imageFetcherState !== 'idle'}
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
}

function WishlistArchivedTrigger({
  normalizedStatus,
  onOpen,
  statusMeta,
  wishlistItem,
}: WishlistArchivedTriggerProps) {
  return (
    <Card
      asChild
      variant="interactive"
      padding="md"
      className="group h-full cursor-pointer"
    >
      <button
        type="button"
        className="flex h-full flex-col gap-3 text-left"
        onClick={onOpen}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Text
              size="base"
              weight="medium"
              className="block truncate"
              aria-label={wishlistItem.title}
            >
              {wishlistItem.title}
            </Text>
            <Text
              size="xs"
              className="line-clamp-2 text-muted-foreground"
              aria-label={wishlistItem.note ?? 'No description'}
            >
              {wishlistItem.note ?? 'No description'}
            </Text>
          </div>
          <WishlistStatusBadge status={normalizedStatus} />
        </div>
        <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
          <span className="truncate">{statusMeta.description}</span>
          <div className="flex items-center gap-1 text-primary">
            <LuArchive className="h-3.5 w-3.5" aria-hidden />
            <span>View</span>
          </div>
        </div>
      </button>
    </Card>
  );
}

function WishlistNonOwnerExtras({
  allowClaims,
  handlePurchaseToggle,
  isClaimed,
  isPurchasePending,
  isPurchasedByMe,
  isPurchasedBySomeoneElse,
  purchaseButtonAriaLabel,
  purchaseButtonClassName,
  purchaseButtonContent,
  purchaseStatusText,
}: WishlistNonOwnerExtrasProps) {
  if (allowClaims) {
    if (isPurchasedBySomeoneElse) {
      return (
        <Flex align="center" gap={2}>
          <LuGift className="h-4 w-4 text-amber-700" aria-hidden />
          <Text size="sm" className="text-amber-800">
            Someone already grabbed this one.
          </Text>
        </Flex>
      );
    }

    return (
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
  }

  if (isClaimed) {
    return (
      <Flex align="center" gap={2}>
        <LuGift className="h-4 w-4 text-amber-700" aria-hidden />
        <Text size="sm" className="text-amber-800">
          Someone already grabbed this one.
        </Text>
      </Flex>
    );
  }

  return (
    <Text size="sm" className="text-muted-foreground">
      View-only link. Sign in to claim gifts.
    </Text>
  );
}

function WishlistNonOwnerFooter({
  allowClaims,
  isClaimInfoOpen,
  isClaimed,
  isPurchasedBySomeoneElse,
  onClaimInfoOpenChange,
  purchaseStatusText,
}: Pick<
  WishlistNonOwnerTriggerProps,
  | 'allowClaims'
  | 'isClaimInfoOpen'
  | 'isClaimed'
  | 'isPurchasedBySomeoneElse'
  | 'onClaimInfoOpenChange'
  | 'purchaseStatusText'
>) {
  if (allowClaims && isPurchasedBySomeoneElse) {
    return (
      <MobileBottomSheet
        open={isClaimInfoOpen}
        onOpenChange={onClaimInfoOpenChange}
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
                target.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                });
              }
              onClaimInfoOpenChange(false);
            }}
          >
            See other ideas
          </Button>
        </MobileBottomSheetContent>
      </MobileBottomSheet>
    );
  }

  if (allowClaims && isClaimed) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-b-xl bg-pool px-4 text-xs font-semibold text-pool-foreground">
        <LuGift className="h-4 w-4" aria-hidden />
        <span>{purchaseStatusText ?? 'You’re on gift duty for this one'}</span>
      </div>
    );
  }

  if (!allowClaims && isClaimed) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-b-xl bg-amber-100 px-4 text-xs font-semibold text-amber-800">
        <LuGift className="h-4 w-4" aria-hidden />
        <span>Already claimed</span>
      </div>
    );
  }

  return <div className="h-px w-full bg-border/70" aria-hidden />;
}

function WishlistNonOwnerTrigger({
  allowClaims,
  dragState,
  handlePurchaseToggle,
  imageBlock,
  isClaimInfoOpen,
  isClaimed,
  isPurchasePending,
  isPurchasedByMe,
  isPurchasedBySomeoneElse,
  onOpen,
  onClaimInfoOpenChange,
  press,
  purchaseButtonAriaLabel,
  purchaseButtonClassName,
  purchaseButtonIconOnly,
  purchaseStatusText,
  wishlistItem,
}: WishlistNonOwnerTriggerProps) {
  return (
    <Card
      variant="default"
      padding="none"
      className={cn(
        'relative flex min-w-0 flex-col overflow-hidden',
        isPurchasedBySomeoneElse ? 'opacity-90' : '',
      )}
    >
      <button
        type="button"
        className="group relative flex w-full min-w-0 cursor-pointer flex-col text-left transition [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[pressed=true]:scale-[0.99] data-[pressed=true]:bg-accent/30 sm:hover:bg-muted sm:active:bg-muted/80"
        data-claimable={allowClaims && !isClaimed ? 'true' : undefined}
        data-pressed={press.pressed ? 'true' : 'false'}
        data-testid="wishlist-item-row"
        data-drag-state={dragState}
        data-drop-target="false"
        onClick={onOpen}
        {...press.rowProps}
      >
        <div
          className={cn(
            'flex h-full flex-col gap-3 px-4 py-3 sm:flex-row',
            allowClaims && !isPurchasedBySomeoneElse
              ? 'pr-16 sm:pr-24'
              : 'pr-4',
          )}
        >
          {imageBlock}
          <Flex justify="between" align="start" className="min-w-0 flex-1 gap-3">
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
              {isPurchasedBySomeoneElse || (!allowClaims && isClaimed) ? (
                <div
                  className="flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200"
                  aria-hidden
                >
                  <LuGift className="h-4 w-4" />
                  Claimed
                </div>
              ) : null}
              <LuChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            </div>
          </Flex>
        </div>

        {isClaimed ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden items-center justify-center rounded-xl bg-background/60 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:flex sm:backdrop-blur"
          >
            <div className="flex items-center gap-2 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold shadow-sm ring-1 ring-border">
              <LuLock className="h-4 w-4" />
              {getClaimedLabel(isPurchasedBySomeoneElse)}
            </div>
          </div>
        ) : null}
      </button>

      {allowClaims && !isPurchasedBySomeoneElse ? (
        <div className="absolute right-4 top-3">
          <Button
            type="button"
            size="sm"
            variant={isPurchasedByMe ? 'secondary' : 'outline'}
            disabled={isPurchasePending}
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
        </div>
      ) : null}

      <WishlistNonOwnerFooter
        allowClaims={allowClaims}
        isClaimInfoOpen={isClaimInfoOpen}
        isClaimed={isClaimed}
        isPurchasedBySomeoneElse={isPurchasedBySomeoneElse}
        onClaimInfoOpenChange={onClaimInfoOpenChange}
        purchaseStatusText={purchaseStatusText}
      />
    </Card>
  );
}

function WishlistOwnerTrigger({
  actionMenu,
  ariaLabel,
  displayImageSrc,
  dragState,
  imageBlock,
  imageErrored,
  isCompactLayout,
  onOpen,
  onImageError,
  press,
  wishlistItem,
}: WishlistOwnerTriggerProps) {
  const desktopCardClass = cn(
    'group min-w-0 rounded-xl border border-border/80 bg-card shadow-sm transition hover:border-border hover:shadow-md',
    dragState === 'dragging-item' ? 'opacity-75' : '',
    dragState === 'dragging-category' ? 'opacity-80' : '',
  );

  const mobileImageThumb =
    displayImageSrc && !imageErrored ? (
      <img
        src={displayImageSrc}
        alt={wishlistItem.title}
        className="h-10 w-10 flex-shrink-0 rounded-lg border border-border/60 object-cover"
        onError={onImageError}
        loading="lazy"
      />
    ) : wishlistItem.hasImage ? (
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground">
        <LuImage className="h-4 w-4" aria-hidden />
      </div>
    ) : null;
  const renderDesktopImageOutsideButton = imageErrored && wishlistItem.hasImage;

  return (
    <div className="contents">
      {!isCompactLayout ? (
        <div className="hidden sm:block">
          <Card
            variant="default"
            padding="none"
            className={desktopCardClass}
          >
            <div className="flex items-start gap-2">
              {renderDesktopImageOutsideButton ? (
                <div className="p-3 pr-0">{imageBlock}</div>
              ) : null}
              <button
                type="button"
                aria-label={ariaLabel}
                className={cn(
                  'flex min-w-0 flex-1 gap-3 rounded-xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:hover:bg-muted sm:active:bg-muted/80',
                  renderDesktopImageOutsideButton ? 'pl-3' : '',
                )}
                data-testid="wishlist-item-row"
                data-drag-state={dragState}
                data-drop-target="false"
                onClick={onOpen}
              >
                {renderDesktopImageOutsideButton ? null : imageBlock}
                <div className="min-w-0 flex-1">
                  <Text
                    size="base"
                    weight="medium"
                    className="block min-w-0 max-w-full truncate"
                  >
                    {wishlistItem.title}
                  </Text>
                  {wishlistItem.note ? (
                    <Box className="max-h-10 overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent)]">
                      <Text
                        size="xs"
                        className="break-words text-muted-foreground"
                      >
                        {wishlistItem.note}
                      </Text>
                    </Box>
                  ) : null}
                </div>
              </button>
              {actionMenu ? (
                <div className="flex flex-shrink-0 items-center gap-2 p-3 pl-0">
                  {actionMenu}
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      <div className={isCompactLayout ? 'block' : 'sm:hidden'}>
        <Card
          variant="default"
          padding="none"
          className={cn(
            'min-w-0 rounded-xl border border-border/80 bg-card shadow-sm',
            dragState === 'dragging-item' ? 'opacity-75' : '',
            dragState === 'dragging-category' ? 'opacity-80' : '',
          )}
        >
          <div className="flex min-h-[4.25rem] items-center gap-1">
            <button
              type="button"
              aria-label={ariaLabel}
              className="flex min-w-0 flex-1 cursor-pointer touch-pan-y items-center gap-2 rounded-xl px-3 py-2.5 text-left transition [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[pressed=true]:scale-[0.99] data-[pressed=true]:bg-accent/20 sm:hover:bg-muted sm:active:bg-muted/80"
              data-pressed={press.pressed ? 'true' : 'false'}
              data-testid="wishlist-item-row"
              data-drag-state={dragState}
              data-drop-target="false"
              onClick={onOpen}
              {...press.rowProps}
            >
              {mobileImageThumb}
              <Box className="w-0 min-w-0 flex-1 overflow-hidden">
                <Text
                  size="base"
                  weight="medium"
                  className="block min-w-0 max-w-full truncate"
                >
                  {wishlistItem.title}
                </Text>
                {wishlistItem.note ? (
                  <Text
                    size="xs"
                    className="block min-w-0 max-w-full truncate text-muted-foreground"
                  >
                    {wishlistItem.note}
                  </Text>
                ) : null}
              </Box>
            </button>

            {actionMenu ? (
              <Flex align="center" className="flex-shrink-0 pr-2" gap={1}>
                {actionMenu}
              </Flex>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

export const WishlistItem = ({
  wishlistItem,
  isOwner = false,
  categories = [],
  disableClaims = false,
  layout = 'default',
  isReorderMode = false,
  dragState = 'idle',
  onStatusChange,
}: WishlistItemProps) => {
  const user = useOptionalUser();
  const isOwnerByUser = user?.id === wishlistItem.ownerId;
  const canDelete = userHasPermission(
    user,
    isOwnerByUser ? `delete:wishlistItem:own` : `delete:wishlistItem:any`,
  );
  const normalizedStatus =
    (wishlistItem.status as WishlistItemStatusValue | undefined) ?? 'ACTIVE';
  const isActiveStatus = isWishlistItemActive(normalizedStatus);
  const statusMeta = getWishlistStatusMeta(normalizedStatus);
  const editorRef = React.useRef<WishlistItemEditorHandle>(null);
  const {
    handlePurchaseToggle,
    isPurchasePending,
    isPurchasedByMe,
    isPurchasedBySomeoneElse,
  } = useWishlistPurchaseController({
    userId: user?.id,
    wishlistItem,
  });
  const {
    displayImageSrc,
    handleImageError,
    handleRemoveImage,
    handleRetryImage,
    imageErrored,
    imageFetcher,
  } = useWishlistImageController({
    isOwner,
    wishlistItem,
  });
  const [isClaimInfoOpen, setIsClaimInfoOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const imageBlock = (
    <WishlistItemImageBlock
      displayImageSrc={displayImageSrc}
      imageErrored={imageErrored}
      imageFetcherState={imageFetcher.state}
      isOwner={isOwner}
      onImageError={handleImageError}
      onRemoveImage={handleRemoveImage}
      onRetryImage={handleRetryImage}
      title={wishlistItem.title}
    />
  );

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

  const press = usePressFeedback<HTMLButtonElement>();

  if (!isActiveStatus) {
    return (
      <>
        <WishlistArchivedTrigger
          normalizedStatus={normalizedStatus}
          onOpen={() => editorRef.current?.openView()}
          statusMeta={statusMeta}
          wishlistItem={wishlistItem}
        />
        <WishlistItemEditor
          key={`${wishlistItem.id}-${wishlistItem.updatedAt ?? ''}-${normalizedStatus}`}
          ref={editorRef}
          wishlistItem={toEditorWishlistItem(wishlistItem, normalizedStatus)}
          canEdit={isOwner}
          categories={categories}
          initialMode="view"
          onStatusChange={onStatusChange}
          showDefaultTrigger={false}
        />
      </>
    );
  }

  // ---------------- Non-owner: simple, tappable row → read-only view
  if (!isOwner) {
    const allowClaims = !disableClaims;
    const isClaimed = isPurchasedByMe || isPurchasedBySomeoneElse;
    const viewPurchaseExtras = (
      <WishlistNonOwnerExtras
        allowClaims={allowClaims}
        handlePurchaseToggle={handlePurchaseToggle}
        isClaimed={isClaimed}
        isPurchasePending={isPurchasePending}
        isPurchasedByMe={isPurchasedByMe}
        isPurchasedBySomeoneElse={isPurchasedBySomeoneElse}
        purchaseButtonAriaLabel={purchaseButtonAriaLabel}
        purchaseButtonClassName={purchaseButtonClassName}
        purchaseButtonContent={purchaseButtonContent}
        purchaseStatusText={purchaseStatusText}
      />
    );

    return (
      <>
        <WishlistNonOwnerTrigger
          allowClaims={allowClaims}
          dragState={dragState}
          handlePurchaseToggle={handlePurchaseToggle}
          imageBlock={imageBlock}
          isClaimInfoOpen={isClaimInfoOpen}
          isClaimed={isClaimed}
          isPurchasePending={isPurchasePending}
          isPurchasedByMe={isPurchasedByMe}
          isPurchasedBySomeoneElse={isPurchasedBySomeoneElse}
          onClaimInfoOpenChange={setIsClaimInfoOpen}
          onOpen={() => editorRef.current?.openView()}
          press={press}
          purchaseButtonAriaLabel={purchaseButtonAriaLabel}
          purchaseButtonClassName={purchaseButtonClassName}
          purchaseButtonIconOnly={purchaseButtonIconOnly}
          purchaseStatusText={purchaseStatusText}
          wishlistItem={wishlistItem}
        />
        <WishlistItemEditor
          key={`${wishlistItem.id}-${wishlistItem.updatedAt ?? ''}-${normalizedStatus}`}
          ref={editorRef}
          wishlistItem={toEditorWishlistItem(wishlistItem, normalizedStatus)}
          canEdit={false}
          initialMode="view"
          categories={categories}
          viewExtras={viewPurchaseExtras}
          onStatusChange={onStatusChange}
          showDefaultTrigger={false}
        />
      </>
    );
  }

  const isCompactLayout = layout === 'reorder';

  const actionMenu = !isReorderMode ? (
    <WishlistRowActionsMenu label={`Item actions for ${wishlistItem.title}`}>
      <WishlistRowActionsItem
        onSelect={() => {
          editorRef.current?.openEdit();
        }}
      >
        <LuPencil className="h-4 w-4 text-muted-foreground" aria-hidden />
        Edit item
      </WishlistRowActionsItem>
      {onStatusChange ? (
        <WishlistRowActionsItem
          onSelect={() => {
            onStatusChange(wishlistItem.id, 'ARCHIVED');
          }}
        >
          <LuArchive className="h-4 w-4 text-muted-foreground" aria-hidden />
          Move to past items
        </WishlistRowActionsItem>
      ) : null}
      {canDelete ? (
        <DropdownMenuItem
          className="gap-2 rounded-md px-2 py-2 text-sm text-red-600 focus:text-red-700"
          onSelect={() => setDeleteOpen(true)}
        >
          <LuTrash className="h-4 w-4" aria-hidden />
          Delete item
        </DropdownMenuItem>
      ) : null}
    </WishlistRowActionsMenu>
  ) : null;

  // ---------------- Owner: mobile row (explicit actions + chevron); row tap → read-only view
  return (
    <>
      <WishlistItemEditor
        key={`${wishlistItem.id}-${wishlistItem.updatedAt ?? ''}-${normalizedStatus}`}
        ref={editorRef}
        wishlistItem={toEditorWishlistItem(wishlistItem, normalizedStatus)}
        canEdit={true}
        categories={categories}
        onStatusChange={onStatusChange}
        showDefaultTrigger={false}
      />
      <WishlistOwnerTrigger
        actionMenu={actionMenu}
        ariaLabel={wishlistItem.title}
        displayImageSrc={displayImageSrc}
        dragState={dragState}
        imageBlock={imageBlock}
        imageErrored={imageErrored}
        isCompactLayout={isCompactLayout}
        onImageError={handleImageError}
        onOpen={() => editorRef.current?.openEdit()}
        press={press}
        wishlistItem={wishlistItem}
      />
      {canDelete ? (
        <DeleteWishlistItem
          id={wishlistItem.id}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      ) : null}
    </>
  );
};

export const DeleteWishlistItem = ({
  id,
  open,
  onOpenChange,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const isPending = useIsPending();
  const fetcher = useFetcher<{
    success: boolean;
    analyticsEventId?: string | null;
    requestId?: string;
  }>();
  const requestInfo = useOptionalRequestInfo();
  const trackedArchiveIdRef = React.useRef<string | null>(null);
  const fallbackRequestId = requestInfo?.requestId ?? null;
  const attachClientMutationId = (event: React.FormEvent<HTMLFormElement>) => {
    const formElement = event.currentTarget;
    const mutationId = createClientMutationId();
    const existingInput = formElement.elements.namedItem(
      'clientMutationId',
    ) as HTMLInputElement | null;
    if (existingInput) {
      existingInput.value = mutationId;
      return;
    }

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'hidden';
    hiddenInput.name = 'clientMutationId';
    hiddenInput.value = mutationId;
    formElement.append(hiddenInput);
  };

  React.useEffect(() => {
    const eventId = fetcher.data?.analyticsEventId ?? null;
    if (!eventId) return;
    if (!fetcher.data?.success) return;
    if (trackedArchiveIdRef.current === eventId) return;
    trackedArchiveIdRef.current = eventId;
    track('wishlist_item_archived', undefined, {
      eventId,
      requestId: fetcher.data.requestId ?? fallbackRequestId,
    });
  }, [fallbackRequestId, fetcher.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            onSubmit={attachClientMutationId}
          >
            <input type="hidden" name="wishlistItemId" value={id} />
            <input type="hidden" name="clientMutationId" value="" />
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
