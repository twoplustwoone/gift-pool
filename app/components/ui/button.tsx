import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '#app/utils/misc.tsx';

const buttonVariants = cva(
  [
    // layout/typography
    'inline-flex select-none items-center justify-center rounded-full text-sm font-medium',
    // focus
    'outline-none ring-ring ring-offset-2 ring-offset-background focus-visible:ring-2',
    // transitions & pressed feel
    'transition-colors motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-out',
    'active:scale-[0.98] active:opacity-95',
    // touch
    'touch-manipulation [-webkit-tap-highlight-color:transparent]',
    // disabled
    'disabled:pointer-events-none disabled:opacity-50',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/80 active:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/80 active:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground active:bg-accent/70',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/90',
        ghost:
          // make ghost feel tappable: give it a real background on press
          'hover:bg-accent hover:text-accent-foreground active:bg-accent/70',
        link:
          // links don’t get bg, so give a clear visual press via opacity
          'text-primary underline-offset-4 hover:underline active:opacity-80',
      },
      size: {
        default: 'h-10 px-4 py-2',
        wide: 'px-24 py-5',
        xs: 'h-8 px-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
        pill: 'px-12 py-3 leading-3',
        icon: 'h-8 w-8 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
