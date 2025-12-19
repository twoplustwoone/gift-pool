import { useLayoutEffect, useRef, useState } from 'react';
import { TopNav } from '#app/components/nav/top/top-nav';
import { cn } from '#app/utils/misc.tsx';

export const TopBar = ({
  hidden = false,
  onHeightChange,
}: {
  hidden?: boolean;
  onHeightChange?: (height: number) => void;
}) => {
  const headerRef = useRef<HTMLElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number>(0);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => {
      const height = el.getBoundingClientRect().height;
      if (height > 0) {
        setMeasuredHeight(height);
        onHeightChange?.(height);
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
      className={cn(
        'sticky top-0 z-40 border-b border-surface-border bg-surface py-3 transition-[transform,opacity,margin] duration-200 ease-out will-change-transform sm:py-4',
        hidden && '-translate-y-full opacity-0 pointer-events-none',
      )}
      style={{ marginBottom: hidden ? -measuredHeight : 0 }}
    >
      <TopNav />
    </header>
  );
};
