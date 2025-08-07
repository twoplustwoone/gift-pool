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
    success: <Icon name="check" className="h-4 w-4 text-emerald-600" />,
    error: <Icon name="cross-1" className="h-4 w-4 text-destructive" />,
    idle: null,
  }[status];

  const badgeNode = message ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{message}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    badge
  );

  return (
    <Button
      ref={ref}
      className={cn(
        'inline-flex h-10 items-center gap-2 px-4 text-sm font-medium',
        'ring-ring ring-offset-2 ring-offset-background transition-colors focus-visible:ring-2',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      {/* fade badge in/out without overlap */}
      <span
        className={cn(
          'flex items-center transition-opacity',
          badge ? 'opacity-100' : 'opacity-0',
        )}
      >
        {badgeNode}
      </span>
    </Button>
  );
});
StatusButton.displayName = 'StatusButton';
