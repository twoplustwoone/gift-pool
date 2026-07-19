import { cn } from '#app/utils/misc.tsx';
import {
  POOL_STATUS_LABELS,
  type PoolStatus,
} from '#app/utils/pool-constants.ts';

// Shared pool status presentation (handoff §9 "Pool stage indicator" seam).
// Semantic roles: teal = coordination underway, amber = waiting on people,
// green = decision made, muted = historical. Labels always accompany color,
// so two waiting states may share amber. Dark values flip via the tokens.
export const poolStatusBadgeClasses: Record<PoolStatus, string> = {
  OPEN: 'bg-pool/15 text-pool',
  VOTING: 'bg-warning-muted text-warning',
  DECIDED: 'bg-success-muted text-success',
  PURCHASED: 'bg-warning-muted text-warning',
  DELIVERED: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-muted text-muted-foreground line-through',
};

export const PoolStatusBadge = ({
  status,
  className,
}: {
  status: PoolStatus;
  className?: string;
}) => (
  <span
    className={cn(
      'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
      poolStatusBadgeClasses[status],
      className,
    )}
  >
    {POOL_STATUS_LABELS[status]}
  </span>
);
