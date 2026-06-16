// Client-side Web Push helpers. Pure (non-React) utilities shared by the
// service-worker message relay (`entry.client.tsx`) and the `useWebPush` hook.

/**
 * Window event dispatched when the service worker relays an incoming push, so
 * the in-app notification bell can refresh its unread count immediately instead
 * of waiting for the next poll.
 */
export const NOTIFICATIONS_REFRESH_EVENT = 'giftpool:notifications-refresh';

/** Whether this browser can do Web Push at all. */
export const isPushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/**
 * Convert a base64url VAPID public key into the Uint8Array the Push API's
 * `applicationServerKey` option expects.
 */
export const urlBase64ToUint8Array = (
  base64String: string,
): Uint8Array<ArrayBuffer> => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  // Back with an explicit ArrayBuffer so the result satisfies `BufferSource`
  // (the Push API's applicationServerKey) under TS's generic Uint8Array.
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};
