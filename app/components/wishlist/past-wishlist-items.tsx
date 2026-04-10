import * as React from 'react';
import { LuArchive, LuLink } from 'react-icons/lu';

import { Button } from '#app/components/ui/button';
import { Card } from '#app/components/ui/card.tsx';
import { Heading } from '#app/components/ui/heading.tsx';
import {
  WishlistItemEditor,
} from '#app/routes/wishlist+/__wishlist-item-editor';
import { formatRelativeTime, useTranslation } from '#app/utils/i18n.tsx';
import { cn, getWishlistItemImgSrc } from '#app/utils/misc.tsx';
import { type WishlistItemStatusValue } from '#app/utils/wishlist.ts';

import { Text } from '../ui-kit';
import {
  WishlistItemThumbnail,
  formatUrlHost,
} from './wishlist-item';
import { type WishlistItem } from './wishlist-item-state';

type Category = { id: string; name: string; order: number };

export const PastEducationCallout = ({
  onViewPast,
  onDismissEducation,
}: {
  onViewPast: () => void;
  onDismissEducation: () => void;
}) => (
  <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/50 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
    <div className="flex flex-col gap-1">
      <Text weight="bold">Item moved to Past items</Text>
      <Text className="text-muted-foreground">
        When you remove something from your wishlist, it's saved here so you can
        remember what you wanted — and others can get inspiration.
      </Text>
    </div>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button variant="secondary" onClick={onViewPast}>
        View Past items
      </Button>
      <Button variant="ghost" onClick={onDismissEducation}>
        Got it
      </Button>
    </div>
  </div>
);

export const PastWishlistItems = ({
  items,
  isOwner,
  categories,
  showEducation,
  onDismissEducation,
  onViewPast,
  onStatusChange,
}: {
  items: WishlistItem[];
  isOwner: boolean;
  categories: Category[];
  showEducation: boolean;
  onDismissEducation: () => void;
  onViewPast: () => void;
  onStatusChange: (
    itemId: string,
    status: WishlistItemStatusValue,
  ) => boolean | void;
}) => {
  const sortedItems = [...items].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-card-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <LuArchive className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="flex flex-col">
            <Heading>Past items</Heading>
            <Text size="sm" className="text-muted-foreground">
              Items you received or removed stay here
            </Text>
          </div>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-3 border-t border-card-border p-4">
        {showEducation ? (
          <PastEducationCallout
            onDismissEducation={onDismissEducation}
            onViewPast={onViewPast}
          />
        ) : null}

        {sortedItems.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
            <Text weight="bold">Your past wishlist items live here</Text>
            <Text className="text-muted-foreground">
              Items you've received or removed stay here for reference and
              inspiration.
            </Text>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sortedItems.map((item) => (
              <PastWishlistItemCard
                key={`${item.id}-${item.updatedAt.getTime()}`}
                item={item}
                isOwner={isOwner}
                categories={categories}
                onStatusChange={onStatusChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const PastWishlistItemCard = ({
  item,
  isOwner,
  categories,
  onStatusChange,
}: {
  item: WishlistItem;
  isOwner: boolean;
  categories: Category[];
  onStatusChange: (
    itemId: string,
    status: WishlistItemStatusValue,
  ) => boolean | void;
}) => {
  const { locale } = useTranslation();
  // Past items don't need the owner-only image error/retry controls; if the
  // image fails to load, the thumbnail swaps to a placeholder icon and that's
  // the end of it. Keep the simple error state locally so we don't pull in
  // the full image fetcher from wishlist-item.tsx.
  const [imageErrored, setImageErrored] = React.useState(false);
  const displayImageSrc = item.hasImage
    ? `${getWishlistItemImgSrc(item.id)}?v=${item.updatedAt.getTime()}`
    : null;
  const urlHost = item.url ? formatUrlHost(item.url) : null;
  const archivedLabel = formatRelativeTime(item.updatedAt, locale);

  return (
    <WishlistItemEditor
      wishlistItem={{
        id: item.id,
        title: item.title,
        url: item.url ?? null,
        note: item.note ?? null,
        type: item.type,
        categoryId: item.categoryId ?? null,
        hasImage: item.hasImage ?? false,
        imageSource: item.imageSource ?? null,
        updatedAt: item.updatedAt,
        status: item.status as WishlistItemStatusValue,
      }}
      categories={categories}
      canEdit={isOwner}
      initialMode="view"
      onStatusChange={onStatusChange}
      trigger={
        // Past items share the active-row primitive but are visually
        // de-emphasized so they never get confused with live wishlist items
        // at a glance: a muted background (instead of solid card), a dashed
        // border, grayscale thumbnail, and muted title text. Still fully
        // clickable (the Card is the dialog trigger), still hover-responsive
        // so the user knows they can open the editor.
        <Card
          variant="interactive"
          padding="none"
          className={cn(
            'group min-w-0 cursor-pointer overflow-hidden rounded-xl border border-dashed border-border/60 bg-muted/30 shadow-none transition-shadow',
            'hover:border-border hover:bg-muted/40 hover:shadow-sm',
          )}
        >
          <div className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
            <div className="flex-shrink-0 [&>img]:grayscale [&>div]:opacity-70">
              <WishlistItemThumbnail
                displayImageSrc={displayImageSrc}
                hasImage={item.hasImage ?? false}
                imageErrored={imageErrored}
                onImageError={() => setImageErrored(true)}
                title={item.title}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
              <Text
                size="base"
                weight="medium"
                className="line-clamp-2 min-w-0 max-w-full text-muted-foreground"
              >
                {item.title}
              </Text>
              {item.note ? (
                <Text
                  size="xs"
                  className="line-clamp-1 min-w-0 max-w-full text-muted-foreground/80"
                >
                  {item.note}
                </Text>
              ) : null}
              {urlHost ? (
                <span className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground/80">
                  <LuLink className="h-3 w-3 flex-shrink-0" aria-hidden />
                  <span className="truncate">{urlHost}</span>
                </span>
              ) : null}
            </div>
            {/*
             * Right slot: neutral archived-time pill. Room for "Bought by X"
             * or a giver attribution later, but intentionally not wired up —
             * the own-wishlist loader doesn't select WishlistPurchase.purchasedBy
             * because the gifting model is surprise-preserving. Revealing
             * the giver on past items would be a product decision we haven't
             * made yet.
             */}
            <div className="flex flex-shrink-0 items-center gap-1 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground ring-1 ring-inset ring-border/60">
              <LuArchive className="h-3.5 w-3.5" aria-hidden />
              <span>{archivedLabel}</span>
            </div>
          </div>
        </Card>
      }
    />
  );
};
