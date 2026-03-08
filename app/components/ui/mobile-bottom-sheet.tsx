import * as DialogPrimitive from '@radix-ui/react-dialog';
import { type FullGestureState, useDrag } from '@use-gesture/react';
import * as React from 'react';
import { cn } from '#app/utils/misc.tsx';
import { Icon } from './icon';

const MobileBottomSheet = DialogPrimitive.Root;

const MobileBottomSheetTrigger = DialogPrimitive.Trigger;

const MobileBottomSheetPortal = DialogPrimitive.Portal;

const MobileBottomSheetClose = DialogPrimitive.Close;

const MobileBottomSheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Close asChild>
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-[1000] bg-[hsl(var(--scrim))] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  </DialogPrimitive.Close>
));
MobileBottomSheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

type MobileBottomSheetContentProps = React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> & {
  showHandle?: boolean;
};

const MobileBottomSheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  MobileBottomSheetContentProps
>(
  (
    { className, children, showHandle = true, onOpenAutoFocus, ...props },
    ref,
  ) => {
    const [snapPoint, setSnapPoint] = React.useState<'peek' | 'full'>('peek');
    const [dragOffset, setDragOffset] = React.useState(0);
    const dragStartSnapRef = React.useRef<'peek' | 'full'>('peek');
    const closeRef = React.useRef<HTMLButtonElement>(null);

    const bindHandleDrag = useDrag(
      ({
        first,
        last,
        movement: [, movementY],
        velocity: [, velocityY],
        direction: [, directionY],
      }: FullGestureState<'drag'>) => {
        if (first) {
          dragStartSnapRef.current = snapPoint;
        }

        const limitedOffset = Math.max(movementY, -120);
        setDragOffset(last ? 0 : limitedOffset);

        if (!last) return;

        const downwardsIntent =
          movementY > 140 ||
          (movementY > 80 && velocityY > 1.1 && directionY > 0);
        const upwardsIntent =
          movementY < -80 ||
          (movementY < -40 && velocityY < -1 && directionY < 0);
        const shouldPeek =
          dragStartSnapRef.current === 'full' &&
          movementY > 60 &&
          directionY > 0 &&
          velocityY > 0.4;

        if (downwardsIntent) {
          closeRef.current?.click();
          setSnapPoint('peek');
          return;
        }

        if (upwardsIntent) {
          setSnapPoint('full');
          return;
        }

        if (shouldPeek) {
          setSnapPoint('peek');
        }
      },
      {
        axis: 'y',
        filterTaps: true,
        pointer: { touch: true },
        eventOptions: { passive: false },
      },
    );

    return (
      <MobileBottomSheetPortal>
        <MobileBottomSheetOverlay />
        <DialogPrimitive.Content
          ref={ref}
          data-snap={snapPoint}
          style={{
            transform: dragOffset
              ? `translateY(${Math.max(dragOffset, -120)}px)`
              : undefined,
          }}
          onOpenAutoFocus={(event) => {
            setSnapPoint('peek');
            onOpenAutoFocus?.(event);
          }}
          className={cn(
            'fixed inset-x-0 bottom-0 z-[1001] grid max-h-[calc(100vh-theme(spacing.3))] w-full gap-4 overflow-y-auto overflow-x-hidden rounded-t-3xl border border-modal-border bg-modal p-5 shadow-[0_-18px_36px_rgba(0,0,0,0.24)] duration-200 data-[snap=full]:max-h-[calc(100vh-theme(spacing.3))] data-[snap=peek]:max-h-[70vh] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:overflow-y-auto sm:overflow-x-hidden sm:rounded-lg sm:border sm:p-6 sm:shadow-lg sm:data-[snap=full]:max-h-[calc(100vh-3rem)] sm:data-[snap=peek]:max-h-[calc(100vh-3rem)] sm:data-[state=closed]:fade-out-0 sm:data-[state=open]:fade-in-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]',
            className,
          )}
          {...props}
        >
          {showHandle ? (
            <div
              {...bindHandleDrag()}
              className="mx-auto mb-2 h-1.5 w-12 touch-none select-none rounded-full bg-muted sm:hidden"
              aria-hidden
            />
          ) : null}
          {children}
          <DialogPrimitive.Close
            ref={closeRef}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
          >
            <Icon name="cross-2" className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </MobileBottomSheetPortal>
    );
  },
);
MobileBottomSheetContent.displayName = DialogPrimitive.Content.displayName;

const MobileBottomSheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left',
      className,
    )}
    {...props}
  />
);
MobileBottomSheetHeader.displayName = 'MobileBottomSheetHeader';

const MobileBottomSheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className,
    )}
    {...props}
  />
);
MobileBottomSheetFooter.displayName = 'MobileBottomSheetFooter';

const MobileBottomSheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className,
    )}
    {...props}
  />
));
MobileBottomSheetTitle.displayName = DialogPrimitive.Title.displayName;

const MobileBottomSheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
MobileBottomSheetDescription.displayName =
  DialogPrimitive.Description.displayName;

export {
  MobileBottomSheet,
  MobileBottomSheetPortal,
  MobileBottomSheetOverlay,
  MobileBottomSheetTrigger,
  MobileBottomSheetClose,
  MobileBottomSheetContent,
  MobileBottomSheetHeader,
  MobileBottomSheetFooter,
  MobileBottomSheetTitle,
  MobileBottomSheetDescription,
};
