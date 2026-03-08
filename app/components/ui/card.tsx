import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '#app/utils/misc.tsx';

const cardVariants = cva(
  [
    // Base card: no hover by default (mobile shouldn't flash on scroll)
    'rounded-xl border border-card-border bg-card text-card-foreground shadow-sm',
    // Keep transitions but respect prefers-reduced-motion
    'motion-safe:transition-colors motion-safe:transition-shadow',
    // If you still want a subtle hover for non-interactive cards on desktop, gate it:
    'sm:hover:bg-card/95',
  ].join(' '),
  {
    variants: {
      variant: {
        default: '',
        interactive: [
          // Cursor + mobile scrolling intent
          'cursor-pointer touch-pan-y',
          // Accessibility: only show ring for keyboard/pointer that supports focus
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          // Kill iOS gray flash
          '[-webkit-tap-highlight-color:transparent]',
          // Desktop/tablet feedback only
          'sm:hover:bg-muted sm:hover:shadow-md sm:active:bg-muted/80',
        ].join(' '),
        elevated: 'shadow-md sm:hover:shadow-lg',
      },
      padding: {
        none: 'p-0',
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
    },
  },
);

export interface CardProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  asChild?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div';
    return (
      <Comp
        ref={ref}
        className={cn(cardVariants({ variant, padding }), className)}
        {...props}
      />
    );
  },
);
Card.displayName = 'Card';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-body-sm', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export { Card, CardContent };
