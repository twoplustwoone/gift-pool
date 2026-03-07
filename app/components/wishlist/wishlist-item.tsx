import { type WishlistItem as WishlistItemType } from '@prisma/client';
import { useFetcher } from 'react-router';
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
  DialogTrigger,
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

export const WishlistItem = ({
  wishlistItem,
  isOwner = false,
  categories = [],
  disableClaims = false,
  layout = 'default',
  isReorderMode = false,
  dragState = 'idle',
  onStatusChange,
}: {
  wishlistItem: (Pick<
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
}) => {
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

  const purchaseFetcher = useFetcher<WishlistPurchaseActionResponse>();
  const isPurchasePending = purchaseFetcher.state !== 'idle';
  const serverPurchaseBy = wishlistItem.purchase?.purchasedById ?? null;
  const [purchaseBy, setPurchaseBy] = React.useState<string | null>(
    serverPurchaseBy,
  );
  const purchaseRollbackRef = React.useRef<string | null>(serverPurchaseBy);
  const hasPendingPurchaseMutationRef = React.useRef(false);
  const isClaimed = Boolean(purchaseBy);
  const isPurchasedByMe = isClaimed && purchaseBy === user?.id;
  const isPurchasedBySomeoneElse = isClaimed && purchaseBy !== user?.id;
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

      // Prefer server truth when present, even for rejected mutations.
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
    if (!user?.id || isPurchasePending || isPurchasedBySomeoneElse) return;

    const nextPurchaseBy = isPurchasedByMe ? null : user.id;
    purchaseRollbackRef.current = purchaseBy;
    hasPendingPurchaseMutationRef.current = true;
    setPurchaseBy(nextPurchaseBy);

    purchaseFetcher.submit(
      {
        intent: isPurchasedByMe ? 'unpurchase' : 'purchase',
        wishlistItemId: wishlistItem.id,
      },
      { method: 'post', action: '/wishlist/purchase' },
    );
  };

  const press = usePressFeedback<HTMLDivElement>(
    isOwner && !isReorderMode
      ? {
          onClick: () => {
            editorRef.current?.openView({ fromTrigger: true });
          },
        }
      : undefined,
  );

  if (!isActiveStatus) {
    return (
      <WishlistItemEditor
        key={`${wishlistItem.id}-${wishlistItem.updatedAt ?? ''}-${normalizedStatus}`}
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
          status: normalizedStatus,
        }}
        canEdit={isOwner}
        categories={categories}
        initialMode="view"
        onStatusChange={onStatusChange}
        trigger={
          <Card
            variant="interactive"
            padding="md"
            className="group h-full cursor-pointer"
          >
            <div className="flex h-full flex-col gap-3">
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
                  <span className="hidden sm:inline">View</span>
                  <span className="sm:hidden">View</span>
                </div>
              </div>
            </div>
          </Card>
        }
      />
    );
  }

  // ---------------- Non-owner: simple, tappable row → read-only view
  if (!isOwner) {
    const allowClaims = !disableClaims;
    const imageBlock = renderImageBlock();
    const isClaimed = isPurchasedByMe || isPurchasedBySomeoneElse;
    const viewPurchaseExtras = allowClaims ? (
      isPurchasedBySomeoneElse ? (
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
      )
    ) : isClaimed ? (
      <Flex align="center" gap={2}>
        <LuGift className="h-4 w-4 text-amber-700" aria-hidden />
        <Text size="sm" className="text-amber-800">
          Someone already grabbed this one.
        </Text>
      </Flex>
    ) : (
      <Text size="sm" className="text-muted-foreground">
        View-only link. Sign in to claim gifts.
      </Text>
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
        data-claimable={allowClaims && !isClaimed ? 'true' : undefined}
        data-pressed={press.pressed ? 'true' : 'false'}
        data-testid="wishlist-item-row"
        data-drag-state={dragState}
        data-drop-target="false"
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
              {allowClaims ? (
                !isPurchasedBySomeoneElse ? (
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
                )
              ) : isClaimed ? (
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
              {isPurchasedBySomeoneElse
                ? 'Locked by a friend'
                : 'You claimed this'}
            </div>
          </div>
        ) : null}

        {allowClaims ? (
          isPurchasedBySomeoneElse ? (
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
                    <MobileBottomSheetTitle>
                      Already claimed
                    </MobileBottomSheetTitle>
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
                    const target = document.querySelector(
                      '[data-claimable="true"]',
                    );
                    if (target instanceof HTMLElement) {
                      target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      });
                    }
                    setIsClaimInfoOpen(false);
                  }}
                >
                  See other ideas
                </Button>
              </MobileBottomSheetContent>
            </MobileBottomSheet>
          ) : isClaimed ? (
            <div className="flex h-10 items-center gap-2 rounded-b-xl bg-pool px-4 text-xs font-semibold text-pool-foreground">
              <LuGift className="h-4 w-4" aria-hidden />
              <span>
                {purchaseStatusText ?? 'You’re on gift duty for this one'}
              </span>
            </div>
          ) : (
            <div className="h-px w-full bg-border/70" aria-hidden />
          )
        ) : isClaimed ? (
          <div className="flex h-10 items-center gap-2 rounded-b-xl bg-amber-100 px-4 text-xs font-semibold text-amber-800">
            <LuGift className="h-4 w-4" aria-hidden />
            <span>Already claimed</span>
          </div>
        ) : (
          <div className="h-px w-full bg-border/70" aria-hidden />
        )}
      </Card>
    );

    return (
      <WishlistItemEditor
        key={`${wishlistItem.id}-${wishlistItem.updatedAt ?? ''}-${normalizedStatus}`}
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
          status: normalizedStatus,
        }}
        canEdit={false}
        initialMode="view"
        categories={categories}
        viewExtras={viewPurchaseExtras}
        onStatusChange={onStatusChange}
        trigger={trigger}
      />
    );
  }

  const imageBlock = renderImageBlock();
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
        <DeleteWishlistItem
          id={wishlistItem.id}
          trigger={
            <DropdownMenuItem className="gap-2 rounded-md px-2 py-2 text-sm text-red-600 focus:text-red-700">
              <LuTrash className="h-4 w-4" aria-hidden />
              Delete item
            </DropdownMenuItem>
          }
        />
      ) : null}
    </WishlistRowActionsMenu>
  ) : null;

  const desktopCardClass = cn(
    'group min-w-0 rounded-xl border border-border/80 bg-card shadow-sm transition hover:border-border hover:shadow-md',
    dragState === 'dragging-item' ? 'opacity-75' : '',
    dragState === 'dragging-category' ? 'opacity-80' : '',
  );

  const DesktopTrigger = !isCompactLayout ? (
    <div className="hidden sm:block">
      <Card
        variant="interactive"
        padding="sm"
        className={desktopCardClass}
        data-testid="wishlist-item-row"
        data-drag-state={dragState}
        data-drop-target="false"
      >
        <div className="flex gap-3">
          {imageBlock}
          <div className="min-w-0 flex-1">
            <Flex justify="between" align="center" className="min-w-0 gap-2">
              <Text
                size="base"
                weight="medium"
                className="block w-0 min-w-0 max-w-full flex-1 truncate"
              >
                {wishlistItem.title}
              </Text>
              <div
                className="flex flex-shrink-0 items-center gap-2"
                onClick={(event) => event.stopPropagation()}
              >
                {actionMenu}
              </div>
            </Flex>
            {wishlistItem.note ? (
              <Box className="max-h-10 overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent)]">
                <Text size="xs" className="break-words text-muted-foreground">
                  {wishlistItem.note}
                </Text>
              </Box>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  ) : null;

  const mobileImageThumb =
    displayImageSrc && !imageErrored ? (
      <img
        src={displayImageSrc}
        alt={wishlistItem.title}
        className="h-10 w-10 flex-shrink-0 rounded-lg border border-border/60 object-cover"
        onError={handleImageError}
        loading="lazy"
      />
    ) : wishlistItem.hasImage ? (
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground">
        <LuImage className="h-4 w-4" aria-hidden />
      </div>
    ) : null;

  const MobileTrigger = (
    <div className={isCompactLayout ? 'block' : 'sm:hidden'}>
      <Card
        variant="interactive"
        padding="none"
        role="button"
        className={cn(
          'min-h-[4.25rem] min-w-0 cursor-pointer touch-pan-y rounded-xl border border-border/80 bg-card shadow-sm transition [-webkit-tap-highlight-color:transparent] data-[pressed=true]:scale-[0.99] data-[pressed=true]:bg-accent/20',
          dragState === 'dragging-item' ? 'opacity-75' : '',
          dragState === 'dragging-category' ? 'opacity-80' : '',
        )}
        data-pressed={press.pressed ? 'true' : 'false'}
        data-testid="wishlist-item-row"
        data-drag-state={dragState}
        data-drop-target="false"
        {...press.rowProps}
      >
        <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
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

          {actionMenu ? (
            <Flex
              align="center"
              className="flex-shrink-0"
              gap={1}
              onClick={(event) => event.stopPropagation()}
            >
              {actionMenu}
            </Flex>
          ) : null}
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
      key={`${wishlistItem.id}-${wishlistItem.updatedAt ?? ''}-${normalizedStatus}`}
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
        status: normalizedStatus,
      }}
      trigger={Trigger} // desktop: row-as-trigger (edit/create); mobile: tap-to-view
      canEdit={true}
      categories={categories}
      onStatusChange={onStatusChange}
    />
  );
};

export const DeleteWishlistItem = ({
  id,
  className,
  trigger,
}: {
  id: string;
  className?: string;
  trigger?: React.ReactNode;
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
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
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
        )}
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
