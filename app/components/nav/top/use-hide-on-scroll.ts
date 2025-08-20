import { useEffect, useRef, useState } from 'react';

export function useHideOnScroll(options?: {
  threshold?: number;
  revealOffset?: number;
}) {
  const threshold = options?.threshold ?? 8;
  const revealOffset = options?.revealOffset ?? 64;
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    lastY.current = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const delta = y - lastY.current;

        // shadow toggle
        if (y > 0 && !scrolled) setScrolled(true);
        if (y === 0 && scrolled) setScrolled(false);

        if (Math.abs(delta) > threshold) {
          if (y <= revealOffset) setHidden(false);
          else if (delta > 0)
            setHidden(true); // down -> hide
          else setHidden(false); // up -> show
          lastY.current = y;
        }

        ticking.current = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold, revealOffset, scrolled]);

  return { hidden, scrolled };
}
