import { LuArchive } from 'react-icons/lu';

import { Button } from '#app/components/ui/button';
import { Card } from '#app/components/ui/card.tsx';
import { Heading } from '#app/components/ui/heading.tsx';
import {
  WishlistItemEditor,
} from '#app/routes/wishlist+/__wishlist-item-editor';
import  { type WishlistItemStatusValue } from '#app/utils/wishlist.ts';

import { Grid, Text } from '../ui-kit';
import  { type WishlistItem } from './wishlist-item-state';

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
      <div className="space-y-3 border-t border-card-border p-4">
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
          <Grid columns={{ sm: 2, md: 3, lg: 4 }} gap={4}>
            {sortedItems.map((item) => (
              <PastWishlistItemCard
                key={`${item.id}-${item.updatedAt.getTime()}`}
                item={item}
                isOwner={isOwner}
                categories={categories}
                onStatusChange={onStatusChange}
              />
            ))}
          </Grid>
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
                  aria-label={item.title}
                >
                  {item.title}
                </Text>
                <Text
                  size="xs"
                  className="line-clamp-2 text-muted-foreground"
                  aria-label={item.note ?? 'No description'}
                >
                  {item.note ?? 'No description'}
                </Text>
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                Previously wanted
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span className="truncate">Saved for reference</span>
              <div className="flex items-center gap-1 text-primary">
                <LuArchive className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">View details</span>
                <span className="sm:hidden">View</span>
              </div>
            </div>
          </div>
        </Card>
      }
    />
  );
};
