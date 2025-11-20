import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '#app/utils/misc.tsx';

const badgeVariants = cva(
  [
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
    'bg-muted text-muted-foreground',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'border-transparent',
        pool: 'border-transparent bg-pool text-pool-badge-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      />
    );
  },
);

Badge.displayName = 'Badge';
