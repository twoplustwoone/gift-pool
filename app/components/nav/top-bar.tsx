import { TopNav } from '#app/components/nav/top/top-nav';
import { cn } from '#app/utils/misc.tsx';

export const TopBar = ({ hidden = false }: { hidden?: boolean }) => {
  return (
    <header
      data-hidden={hidden ? 'true' : 'false'}
      data-testid="top-bar"
      className={cn(
        'fixed top-0 z-40 flex h-[var(--top-bar-height)] w-full items-center border-b border-subcard-border bg-subcard transition-[transform,opacity] duration-200 ease-out will-change-transform',
        hidden && 'pointer-events-none -translate-y-full opacity-0',
      )}
    >
      <TopNav />
    </header>
  );
};
