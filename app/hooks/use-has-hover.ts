import { useEffect, useState } from 'react';

const HOVER_QUERY = '(hover: hover) and (pointer: fine)';

/**
 * True only on devices with a real hover-capable pointer (mouse/trackpad).
 * Used to gate hover-only affordances so they never render on touch.
 *
 * SSR-safe: starts `false` so the server and the first client paint agree,
 * then upgrades after mount. Mirrors `useIsDesktop`.
 */
export const useHasHover = () => {
  const [hasHover, setHasHover] = useState(false);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }

    const mediaQuery = window.matchMedia(HOVER_QUERY);

    const handleChange = (event: MediaQueryListEvent) => {
      setHasHover(event.matches);
    };

    setHasHover(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return hasHover;
};
