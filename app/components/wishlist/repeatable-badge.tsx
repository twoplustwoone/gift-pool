import { LuRepeat } from 'react-icons/lu';
import { cn } from '#app/utils/misc.tsx';

export const RepeatableBadge = ({ className }: { className?: string }) => (
  <span
    className={cn(
      'pointer-events-none inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border',
      className,
    )}
  >
    <LuRepeat className="h-3 w-3" aria-hidden />
    Multiples welcome
  </span>
);
