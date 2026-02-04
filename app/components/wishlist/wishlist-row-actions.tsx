import { type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { LuEllipsisVertical } from 'react-icons/lu';

import { Button } from '#app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu';
import { cn } from '#app/utils/misc.tsx';

type MenuAlign = 'start' | 'center' | 'end';

export const WishlistRowActionsMenu = ({
  label,
  children,
  align = 'end',
  triggerClassName,
  contentClassName,
}: {
  label: string;
  children: ReactNode;
  align?: MenuAlign;
  triggerClassName?: string;
  contentClassName?: string;
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className={cn(
            'h-10 w-10 rounded-lg border border-transparent text-muted-foreground transition hover:bg-muted hover:text-foreground',
            triggerClassName,
          )}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <LuEllipsisVertical className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={8}
        className={cn('min-w-[11rem]', contentClassName)}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const WishlistRowActionsItem = ({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuItem>) => {
  return (
    <DropdownMenuItem
      className={cn('gap-2 rounded-md px-2 py-2 text-sm', className)}
      {...props}
    >
      {children}
    </DropdownMenuItem>
  );
};
