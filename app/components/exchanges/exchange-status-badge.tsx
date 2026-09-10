import {
  EXCHANGE_STAGE_LABELS,
  type ExchangeStage,
} from '#app/utils/exchange-constants.ts';
import { cn } from '#app/utils/misc.tsx';

// Same semantic roles as the pool stage pill: teal = coordination underway,
// amber = waiting on a person, green = the moment has come, muted = history.
// The label always accompanies the colour.
export const exchangeStageBadgeClasses: Record<ExchangeStage, string> = {
  GATHERING: 'bg-pool/15 text-pool',
  DRAWN: 'bg-pool/15 text-pool',
  TODAY: 'bg-success-muted text-success',
  READY_TO_REVEAL: 'bg-warning-muted text-warning',
  REVEALED: 'bg-muted text-muted-foreground',
  FINISHED: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-muted text-muted-foreground line-through',
};

export const ExchangeStatusBadge = ({
  stage,
  className,
}: {
  stage: ExchangeStage;
  className?: string;
}) => (
  <span
    className={cn(
      'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
      exchangeStageBadgeClasses[stage],
      className,
    )}
    data-testid="exchange-stage"
  >
    {EXCHANGE_STAGE_LABELS[stage]}
  </span>
);
