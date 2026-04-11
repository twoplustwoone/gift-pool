import { LuExternalLink, LuGift } from 'react-icons/lu';
import { Link } from 'react-router';
import { Card } from '#app/components/ui/card.tsx';
import { Text } from '#app/components/ui-kit/text.tsx';
import { cn, getWishlistItemImgSrc } from '#app/utils/misc.tsx';

type PreviewItem = {
  id: string;
  title: string;
  url: string | null;
  hasImage: boolean;
  updatedAt: Date | string;
};

type WishlistPreviewCardProps = Readonly<{
  items: PreviewItem[];
  totalCount: number;
  fullListTo: string;
  ownerName: string;
}>;

// Compact preview of up to N unpurchased items. Each row uses the same
// thumbnail-or-gift-icon pattern as the main wishlist rows, so the visual
// language carries across. The card header shows the total active count.
export function WishlistPreviewCard({
  items,
  totalCount,
  fullListTo,
  ownerName,
}: WishlistPreviewCardProps) {
  return (
    <Card
      variant="default"
      padding="none"
      className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
      data-testid="wishlist-preview-card"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <LuGift className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
          <Text size="sm" weight="semibold" className="text-foreground">
            Wishlist
          </Text>
          {totalCount > 0 ? (
            <Text size="xs" className="text-muted-foreground">
              · {totalCount} item{totalCount === 1 ? '' : 's'}
            </Text>
          ) : null}
        </div>
        <Link
          to={fullListTo}
          prefetch="intent"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary transition hover:underline"
        >
          See all
          <LuExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      </div>

      {items.length > 0 ? (
        <ul className="divide-y divide-border/60">
          {items.map((item) => (
            <WishlistPreviewRow key={item.id} item={item} fullListTo={fullListTo} />
          ))}
        </ul>
      ) : (
        <div className="px-4 py-8 text-center sm:px-5">
          <Text size="sm" className="text-muted-foreground">
            {ownerName} hasn't added any items yet.
          </Text>
        </div>
      )}
    </Card>
  );
}

function WishlistPreviewRow({
  item,
  fullListTo,
}: Readonly<{
  item: PreviewItem;
  fullListTo: string;
}>) {
  const updatedAtMs =
    item.updatedAt instanceof Date
      ? item.updatedAt.getTime()
      : new Date(item.updatedAt).getTime();
  const imageSrc = item.hasImage
    ? `${getWishlistItemImgSrc(item.id)}?v=${updatedAtMs}`
    : null;

  return (
    <li className="relative">
      <Link
        to={fullListTo}
        prefetch="intent"
        className={cn(
          'flex items-center gap-3 px-4 py-3 transition sm:px-5',
          'hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/40',
        )}
      >
        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <LuGift className="h-5 w-5" aria-hidden />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Text
            size="sm"
            weight="medium"
            className="truncate text-foreground"
          >
            {item.title}
          </Text>
          {item.url ? (
            <Text size="xs" className="truncate text-muted-foreground">
              {safeHost(item.url)}
            </Text>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function safeHost(rawUrl: string) {
  try {
    return new URL(rawUrl).host.replace(/^www\./, '');
  } catch {
    return rawUrl;
  }
}
