import { type WishlistItem as WishlistItemType } from '@prisma/client';
import * as React from 'react';
import {
  LuArchive,
  LuChevronRight,
  LuGift,
  LuImage,
  LuLink,
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
import { Text, Flex } from '../ui-kit';
import { type usePressFeedback } from './hooks/use-press-feedback.ts';
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
type WishlistItemProps = Readonly<{
  wishlistItem: WishlistItemRecord;
  isOwner?: boolean;
  categories?: { id: string; name: string; order: number }[];
  disableClaims?: boolean;
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

// Right-slot control for the non-owner row. Swaps between four states:
// public-view (no claims), already-claimed-by-someone-else (with an info
// popover explaining why), you-claimed-it, or free-to-claim.
function NonOwnerClaimSlot({
  allowClaims,
  handlePurchaseToggle,
  isClaimInfoOpen,
  isClaimed,
  isPurchasePending,
  isPurchasedByMe,
  isPurchasedBySomeoneElse,
  onClaimInfoOpenChange,
  purchaseButtonAriaLabel,
}: Pick<
  WishlistNonOwnerTriggerProps,
  | 'allowClaims'
  | 'handlePurchaseToggle'
  | 'isClaimInfoOpen'
  | 'isClaimed'
  | 'isPurchasePending'
  | 'isPurchasedByMe'
  | 'isPurchasedBySomeoneElse'
  | 'onClaimInfoOpenChange'
  | 'purchaseButtonAriaLabel'
>) {
  // Public view (signed out on a shared link) — no claim affordance, just
  // show a chevron so the row looks tap-able, or an "Already claimed" badge.
  if (!allowClaims) {
    if (isClaimed) {
      return (
        <span
          aria-hidden
          className="flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-200"
        >
          <LuLock className="h-3.5 w-3.5" />
          Claimed
        </span>
      );
    }
    return (
      <LuChevronRight
        className="h-5 w-5 flex-shrink-0 text-muted-foreground"
        aria-hidden
      />
    );
  }

  // Claimed by somebody else — non-action button that opens an info sheet
  // explaining why. Stop propagation so clicking the badge doesn't also
  // open the item editor.
  if (isPurchasedBySomeoneElse) {
    return (
      <MobileBottomSheet
        open={isClaimInfoOpen}
        onOpenChange={onClaimInfoOpenChange}
      >
        <MobileBottomSheetTrigger asChild>
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            className="flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-200"
          >
            <LuLock className="h-3.5 w-3.5" aria-hidden />
            Claimed
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

  // Free to claim, or already-claimed-by-me (toggle).
  return (
    <Button
      type="button"
      size="sm"
      variant={isPurchasedByMe ? 'secondary' : 'outline'}
      disabled={isPurchasePending}
      onClick={(event) => {
        event.stopPropagation();
        handlePurchaseToggle(event);
      }}
      className={cn(
        'flex-shrink-0 gap-1.5',
        isPurchasedByMe
          ? 'border-pool bg-pool text-pool-foreground hover:bg-pool/90'
          : '',
      )}
      aria-pressed={isPurchasedByMe}
      aria-label={purchaseButtonAriaLabel}
    >
      <LuGift className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">
        {isPurchasedByMe ? 'Claimed' : "I'll grab"}
      </span>
    </Button>
  );
}

function WishlistNonOwnerTrigger({
  allowClaims,
  dragState,
  handlePurchaseToggle,
  isClaimInfoOpen,
  isClaimed,
  isPurchasePending,
  isPurchasedByMe,
  isPurchasedBySomeoneElse,
  onOpen,
  onClaimInfoOpenChange,
  displayImageSrc,
  imageErrored,
  onImageError,
  purchaseButtonAriaLabel,
  wishlistItem,
}: Omit<
  WishlistNonOwnerTriggerProps,
  'imageBlock' | 'press' | 'purchaseButtonClassName' | 'purchaseButtonIconOnly' | 'purchaseStatusText'
> & {
  displayImageSrc: string | null;
  imageErrored: boolean;
  onImageError: (event?: React.SyntheticEvent) => void;
}) {
  const urlHost = wishlistItem.url ? formatUrlHost(wishlistItem.url) : null;

  return (
    <Card
      variant="default"
      padding="none"
      className={cn(
        'group relative min-w-0 cursor-pointer overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition-shadow',
        'hover:border-border hover:shadow-md',
        'focus-within:border-border focus-within:shadow-md',
        isPurchasedBySomeoneElse ? 'opacity-90' : '',
        dragState === 'dragging-item' ? 'opacity-75' : '',
      )}
    >
      <button
        type="button"
        aria-label={wishlistItem.title}
        onClick={onOpen}
        className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        data-claimable={allowClaims && !isClaimed ? 'true' : undefined}
        data-testid="wishlist-item-row"
        data-drag-state={dragState}
        data-drop-target="false"
      />

      <div className="pointer-events-none relative flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
        <WishlistItemThumbnail
          displayImageSrc={displayImageSrc}
          hasImage={wishlistItem.hasImage ?? false}
          imageErrored={imageErrored}
          onImageError={onImageError}
          title={wishlistItem.title}
        />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
          <Text
            size="base"
            weight="medium"
            className="line-clamp-2 min-w-0 max-w-full"
          >
            {wishlistItem.title}
          </Text>
          {wishlistItem.note ? (
            <Text
              size="xs"
              className="line-clamp-1 min-w-0 max-w-full text-muted-foreground"
            >
              {wishlistItem.note}
            </Text>
          ) : null}
          {urlHost ? (
            <span className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <LuLink className="h-3 w-3 flex-shrink-0" aria-hidden />
              <span className="truncate">{urlHost}</span>
            </span>
          ) : null}
        </div>
        <div className="pointer-events-auto relative flex flex-shrink-0 items-center">
          <NonOwnerClaimSlot
            allowClaims={allowClaims}
            handlePurchaseToggle={handlePurchaseToggle}
            isClaimInfoOpen={isClaimInfoOpen}
            isClaimed={isClaimed}
            isPurchasePending={isPurchasePending}
            isPurchasedByMe={isPurchasedByMe}
            isPurchasedBySomeoneElse={isPurchasedBySomeoneElse}
            onClaimInfoOpenChange={onClaimInfoOpenChange}
            purchaseButtonAriaLabel={purchaseButtonAriaLabel}
          />
        </div>
      </div>
    </Card>
  );
}

// Extract the "display" hostname from a URL (e.g. "www.amazon.com" → "amazon.com").
// Returns null for unparseable strings so the URL chip can be hidden.
export function formatUrlHost(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

type WishlistItemThumbnailProps = Readonly<{
  displayImageSrc: string | null;
  hasImage: boolean;
  imageErrored: boolean;
  onImageError: (event?: React.SyntheticEvent) => void;
  title: string;
}>;

// Small square thumb that's ALWAYS present: image if we have one, placeholder
// icon otherwise. Reserving this slot is what keeps rows a uniform height
// regardless of whether an item has an image — the old layout let images
// stretch the whole card.
export function WishlistItemThumbnail({
  displayImageSrc,
  hasImage,
  imageErrored,
  onImageError,
  title,
}: WishlistItemThumbnailProps) {
  const sizeClass = 'h-14 w-14 sm:h-16 sm:w-16';
  const frameClass =
    'flex-shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/30';

  if (displayImageSrc && !imageErrored) {
    return (
      <img
        src={displayImageSrc}
        alt={title}
        className={cn(sizeClass, frameClass, 'object-cover')}
        onError={onImageError}
        loading="lazy"
      />
    );
  }

  const PlaceholderIcon = hasImage && imageErrored ? LuImage : LuGift;

  return (
    <div
      aria-hidden
      className={cn(
        sizeClass,
        frameClass,
        'flex items-center justify-center text-muted-foreground',
      )}
    >
      <PlaceholderIcon className="h-5 w-5" />
    </div>
  );
}

type WishlistOwnerRowProps = Readonly<{
  actionMenu: React.ReactNode;
  ariaLabel: string;
  displayImageSrc: string | null;
  dragState: WishlistItemDragState;
  imageErrored: boolean;
  onOpen: () => void;
  onImageError: (event?: React.SyntheticEvent) => void;
  wishlistItem: WishlistItemRecord;
}>;

// Single responsive row used for every active owner item.
//
// Layout uses the "absolute click-catcher" pattern: the whole Card surface
// is clickable, but the 3-dot action menu can still intercept its own
// clicks. A single hidden <button> is absolutely positioned to fill the
// Card — that's what the click/focus/hover targets. The visible content
// layer has `pointer-events-none` so taps pass through to the button,
// except for the action menu slot which re-enables pointer events via
// `pointer-events-auto`. This replaces the previous layout where only
// the inner text column was clickable, leaving a dead strip above and
// below the text that visually looked active because of the card's
// hover ring.
function WishlistOwnerRow({
  actionMenu,
  ariaLabel,
  displayImageSrc,
  dragState,
  imageErrored,
  onImageError,
  onOpen,
  wishlistItem,
}: WishlistOwnerRowProps) {
  const urlHost = wishlistItem.url ? formatUrlHost(wishlistItem.url) : null;

  return (
    <Card
      variant="default"
      padding="none"
      className={cn(
        'group relative min-w-0 cursor-pointer overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition-shadow',
        'hover:border-border hover:shadow-md',
        'focus-within:border-border focus-within:shadow-md',
        dragState === 'dragging-item' ? 'opacity-75' : '',
        dragState === 'dragging-category' ? 'opacity-80' : '',
      )}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onOpen}
        className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        data-testid="wishlist-item-row"
        data-drag-state={dragState}
        data-drop-target="false"
      />
      <div className="pointer-events-none relative flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
        <WishlistItemThumbnail
          displayImageSrc={displayImageSrc}
          hasImage={wishlistItem.hasImage ?? false}
          imageErrored={imageErrored}
          onImageError={onImageError}
          title={wishlistItem.title}
        />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
          <Text
            size="base"
            weight="medium"
            className="line-clamp-2 min-w-0 max-w-full"
          >
            {wishlistItem.title}
          </Text>
          {wishlistItem.note ? (
            <Text
              size="xs"
              className="line-clamp-1 min-w-0 max-w-full text-muted-foreground"
            >
              {wishlistItem.note}
            </Text>
          ) : null}
          {urlHost ? (
            <span className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <LuLink className="h-3 w-3 flex-shrink-0" aria-hidden />
              <span className="truncate">{urlHost}</span>
            </span>
          ) : null}
        </div>
        {actionMenu ? (
          <div className="pointer-events-auto relative flex flex-shrink-0 items-center">
            {actionMenu}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export const WishlistItem = ({
  wishlistItem,
  isOwner = false,
  categories = [],
  disableClaims = false,
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
    imageErrored,
  } = useWishlistImageController({
    isOwner,
    wishlistItem,
  });
  const [isClaimInfoOpen, setIsClaimInfoOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  // The purchase-related copy below is used by WishlistNonOwnerExtras, which
  // renders INSIDE the item-editor modal (not on the row itself). The row
  // only needs handlePurchaseToggle + isPurchased* flags; the modal shows
  // the full "Claim this gift" button with the visible label + check state.
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
          displayImageSrc={displayImageSrc}
          handlePurchaseToggle={handlePurchaseToggle}
          imageErrored={imageErrored}
          isClaimInfoOpen={isClaimInfoOpen}
          isClaimed={isClaimed}
          isPurchasePending={isPurchasePending}
          isPurchasedByMe={isPurchasedByMe}
          isPurchasedBySomeoneElse={isPurchasedBySomeoneElse}
          onClaimInfoOpenChange={setIsClaimInfoOpen}
          onImageError={handleImageError}
          onOpen={() => editorRef.current?.openView()}
          purchaseButtonAriaLabel={purchaseButtonAriaLabel}
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
      <WishlistOwnerRow
        actionMenu={actionMenu}
        ariaLabel={wishlistItem.title}
        displayImageSrc={displayImageSrc}
        dragState={dragState}
        imageErrored={imageErrored}
        onImageError={handleImageError}
        onOpen={() => editorRef.current?.openEdit()}
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
