import { useNotificationPolling } from '#app/hooks/use-notification-polling.ts';

/**
 * Headless component that keeps the bell's unread count live. Rendered inside
 * `NotificationsProvider` for authenticated users only (see `app/root.tsx`).
 */
export const NotificationPolling = () => {
  useNotificationPolling();
  return null;
};
