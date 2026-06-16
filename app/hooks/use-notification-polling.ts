import { useEffect } from 'react';
import { useNotificationsStore } from '#app/components/notifications/notifications-context.tsx';
import { NOTIFICATIONS_REFRESH_EVENT } from '#app/utils/web-push.client.ts';

const UNREAD_COUNT_ENDPOINT = '/api/notifications/unread-count';
const POLL_INTERVAL_MS = 30_000;

/**
 * Keeps the in-app notification bell's unread count fresh while the tab is
 * visible. Polls a lightweight count endpoint on an interval and refreshes
 * immediately on focus / visibility regain and whenever the service worker
 * relays an incoming push. Deliberately polling (not SSE): the app runs on
 * Fly.io + LiteFS with no cross-instance pub/sub, so polling is the
 * instance-safe baseline and the SW message gives push subscribers an instant
 * bump on top.
 *
 * Mounted once, under an authenticated user (see `app/root.tsx`).
 */
export const useNotificationPolling = () => {
  const { setUnreadCount } = useNotificationsStore();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const fetchCount = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch(UNREAD_COUNT_ENDPOINT, {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { unreadCount?: number };
        if (!cancelled && typeof body.unreadCount === 'number') {
          setUnreadCount(body.unreadCount);
        }
      } catch {
        // Network blips are non-fatal — the next tick retries.
      }
    };

    const interval = window.setInterval(() => {
      void fetchCount();
    }, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchCount();
    };
    const onRefresh = () => {
      void fetchCount();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    };
  }, [setUnreadCount]);
};
