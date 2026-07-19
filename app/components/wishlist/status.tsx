import { type IconType } from 'react-icons';
import { LuArchive, LuListChecks } from 'react-icons/lu';
import { cn } from '#app/utils/misc.tsx';
import { type WishlistItemStatusValue } from '#app/utils/wishlist.ts';

type StatusTone = 'default' | 'success' | 'muted' | 'info';

// Semantic token tones (dark values flip via the tokens themselves).
const statusToneClasses: Record<StatusTone, string> = {
  default: 'bg-pool/10 text-pool ring-1 ring-inset ring-pool/25',
  muted: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
  success: 'bg-success-muted text-success ring-1 ring-inset ring-success/30',
  info: 'bg-warning-muted text-warning ring-1 ring-inset ring-warning/30',
};

const statusMeta: Record<
  'ACTIVE' | 'ARCHIVED',
  { label: string; description: string; icon: IconType; tone: StatusTone }
> = {
  ACTIVE: {
    label: 'On wishlist',
    description: 'Visible to friends',
    icon: LuListChecks,
    tone: 'default',
  },
  ARCHIVED: {
    label: 'Past item',
    description: 'Already received or no longer needed',
    icon: LuArchive,
    tone: 'muted',
  },
};

export function getWishlistStatusMeta(
  status: WishlistItemStatusValue = 'ACTIVE',
) {
  if (status === 'ACTIVE') return statusMeta.ACTIVE;
  return statusMeta.ARCHIVED;
}

export function WishlistStatusBadge({
  status,
  className,
}: {
  status: WishlistItemStatusValue;
  className?: string;
}) {
  const meta = getWishlistStatusMeta(status);
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold leading-none',
        statusToneClasses[meta.tone],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {meta.label}
    </span>
  );
}
