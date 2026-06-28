import { type ReactNode } from 'react';

import { cn } from '#app/utils/misc.tsx';

/**
 * A system-supplied annotation (you, owner, "from wishlist", etc.) rendered so
 * it reads as *system*, not as content the user typed (R5.4). The muted pill
 * treatment deliberately differs from username/value styling so a label like
 * "you" is never mistaken for part of a name.
 *
 * Baseline tone matches the existing pool contributor "you" pill. Role badges
 * (`RoleBadge`) keep their own iconography — this is for lightweight inline
 * markers.
 */
export function SystemLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
