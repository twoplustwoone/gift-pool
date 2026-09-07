import { useEffect } from 'react';
import { useRevalidator } from 'react-router';
import { NOTIFICATIONS_REFRESH_EVENT } from '#app/utils/web-push.client.ts';

/**
 * Re-runs the current route's loaders on an interval while the tab is
 * visible, and immediately on focus / visibility regain / an incoming push.
 * Same instance-safe polling rationale as `useNotificationPolling` (Fly +
 * LiteFS, no cross-instance pub/sub): a page that must move for everyone at
 * the same moment — an exchange being revealed — converges within one tick.
 */
export const useVisibilityRevalidation = ({
  enabled = true,
  intervalMs = 30_000,
}: { enabled?: boolean; intervalMs?: number } = {}) => {
  const { revalidate, state } = useRevalidator();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      if (state !== 'idle') return;
      void revalidate();
    };

    const interval = window.setInterval(tick, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, tick);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, tick);
    };
  }, [enabled, intervalMs, revalidate, state]);
};
