import * as React from 'react';
import { useSpinDelay } from 'spin-delay';
import { cn } from '#app/utils/misc.tsx';
import { Button, type ButtonProps } from './button.tsx';
import { Icon } from './icon.tsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip.tsx';

export const StatusButton = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & {
    status: 'pending' | 'success' | 'error' | 'idle';
    message?: string | null;
    spinDelay?: Parameters<typeof useSpinDelay>[1];
  }
>(function StatusButton(
  { message, status, children, className, spinDelay, ...props },
  ref,
) {
  const labelId = React.useId();
  const statusId = React.useId();
  const delayedPending = useSpinDelay(status === 'pending', {
    delay: 400,
    minDuration: 300,
    ...spinDelay,
  });

  const badge = {
    pending: delayedPending ? (
      <Icon
        name="update"
        className="h-4 w-4 animate-spin text-muted-foreground"
      />
    ) : null,
    success: <Icon name="check" className="h-4 w-4 text-success" />,
    error: <Icon name="cross-1" className="h-4 w-4 text-destructive" />,
    idle: null,
  }[status];

  const badgeNode = badge ? (
    message ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent>{message}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : (
      badge
    )
  ) : null;

  // Only describe status to AT when meaningful (not idle)
  const shouldDescribe = status !== 'idle';

  // Merge any consumer-provided aria-describedby with our status id
  const describedBy =
    [props['aria-describedby'], shouldDescribe ? statusId : undefined]
      .filter(Boolean)
      .join(' ')
      .trim() || undefined;

  // Respect consumer-provided aria-labelledby; otherwise, label only the primary text
  const labelledBy = props['aria-labelledby'] ?? labelId;

  return (
    <Button
      ref={ref}
      className={cn(
        'inline-flex h-10 items-center px-4 text-sm font-medium',
        'ring-ring ring-offset-2 ring-offset-background transition-colors focus-visible:ring-2',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      {/* Primary button label (used for accessible name) */}
      <span id={labelId}>{children}</span>
      {/* fade badge in/out without overlap */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        id={statusId}
        className={cn(
          'flex items-center transition-opacity',
          badge ? 'ml-2 opacity-100' : 'opacity-0',
        )}
      >
        {badgeNode}
        {status !== 'idle' ? (
          <span className="sr-only">{message ?? status}</span>
        ) : null}
      </span>
    </Button>
  );
});
StatusButton.displayName = 'StatusButton';
