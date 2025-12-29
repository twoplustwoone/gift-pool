import { type IconType } from 'react-icons';
import { LuArchive, LuListChecks } from 'react-icons/lu';
import { cn } from '#app/utils/misc.tsx';
import { type WishlistItemStatusValue } from '#app/utils/wishlist.ts';

type StatusTone = 'default' | 'success' | 'muted' | 'info';

const statusToneClasses: Record<StatusTone, string> = {
  default:
    'bg-blue-50 text-blue-900 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/40 dark:text-blue-100 dark:ring-blue-800',
  muted:
    'bg-slate-100 text-slate-900 ring-1 ring-inset ring-slate-200 dark:bg-slate-950/40 dark:text-slate-200 dark:ring-slate-800',
  success:
    'bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-800',
  info: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800',
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
