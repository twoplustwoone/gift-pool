import { useEffect, useLayoutEffect, useRef } from 'react';
import { TopNav } from '#app/components/nav/top/top-nav';
import { cn } from '#app/utils/misc.tsx';

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const TopBar = ({
  hidden = false,
  onHeightChange,
}: {
  hidden?: boolean;
  onHeightChange?: (height: number) => void;
}) => {
  const headerRef = useRef<HTMLElement>(null);

  useIsomorphicLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => {
      const height = el.getBoundingClientRect().height;
      if (height > 0) {
        onHeightChange?.(height);
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty(
            '--top-bar-height',
            `${height}px`,
          );
        }
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange]);

  return (
    <header
      ref={headerRef}
      data-hidden={hidden ? 'true' : 'false'}
      data-testid="top-bar"
      style={{ top: 'var(--pwa-banner-height, 0px)' }}
      className={cn(
        'fixed z-40 w-full border-b border-surface-border bg-surface py-3 transition-[transform,opacity] duration-200 ease-out will-change-transform sm:py-4',
        hidden && 'pointer-events-none -translate-y-full opacity-0',
      )}
    >
      <TopNav />
    </header>
  );
};
