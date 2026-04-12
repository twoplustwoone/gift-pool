import { type ReactNode } from 'react';
import { Card } from '#app/components/ui/card.tsx';
import { cn } from '#app/utils/misc.tsx';

export const SummaryCard = ({
  label,
  value,
  delta,
  accent,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  delta?: string;
  accent?: string;
  tone?: 'default' | 'warn' | 'danger';
}) => {
  const TONE_CLASSES: Record<'default' | 'warn' | 'danger', string> = {
    danger: 'border-destructive/40 bg-destructive/5',
    warn: 'border-amber-400/40 bg-amber-50/60 dark:bg-amber-950/20',
    default: 'border-border/60 bg-gradient-to-br from-card to-card/70',
  };
  const toneClass = TONE_CLASSES[tone];

  return (
    <Card
      className={cn(
        'flex flex-col gap-1.5 p-4 shadow-sm',
        toneClass,
      )}
    >
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tabular-nums tracking-tight">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {delta ? (
        <span className="text-xs font-medium text-muted-foreground">
          {delta}
        </span>
      ) : null}
      {accent ? (
        <span className="text-xs font-medium uppercase text-muted-foreground">
          {accent}
        </span>
      ) : null}
    </Card>
  );
};

export const SectionCard = ({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <Card className={cn('border-border/60 bg-card p-4 shadow-sm', className)}>
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
    {children}
  </Card>
);

export const EmptyRow = ({ children }: { children: ReactNode }) => (
  <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

export const DLRow = ({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) => (
  <>
    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </dt>
    <dd className={mono ? 'font-mono text-xs' : 'text-sm'}>{value}</dd>
  </>
);
