import { useCallback, useEffect, useState } from 'react';
import { track } from '#app/utils/analytics.client.ts';
import { isIos, isStandalone } from '#app/utils/pwa.ts';
import {
  isPushSupported,
  urlBase64ToUint8Array,
} from '#app/utils/web-push.client.ts';

export type WebPushStatus =
  // Browser can't do push, or the server has no VAPID key configured.
  | 'unsupported'
  // iOS requires the PWA to be installed to the home screen first.
  | 'ios-needs-install'
  // The user blocked notifications at the browser level.
  | 'denied'
  // Push is available and not yet enabled (permission default or granted but
  // not subscribed).
  | 'default'
  // Subscribed and registered with the server.
  | 'subscribed'
  // Still determining the initial state.
  | 'loading';

const SUBSCRIBE_ENDPOINT = '/api/push/subscribe';
const UNSUBSCRIBE_ENDPOINT = '/api/push/unsubscribe';

const getVapidPublicKey = (): string | undefined =>
  typeof window !== 'undefined' ? window.ENV?.VAPID_PUBLIC_KEY : undefined;

const getPermission = (): NotificationPermission =>
  typeof Notification !== 'undefined' ? Notification.permission : 'default';

export const useWebPush = () => {
  const [status, setStatus] = useState<WebPushStatus>('loading');
  const [isBusy, setIsBusy] = useState(false);

  const computeBaseStatus = useCallback((): WebPushStatus | null => {
    if (!isPushSupported() || !getVapidPublicKey()) return 'unsupported';
    if (isIos() && !isStandalone()) return 'ios-needs-install';
    if (getPermission() === 'denied') return 'denied';
    return null; // needs the async subscription check
  }, []);

  const refresh = useCallback(async () => {
    const base = computeBaseStatus();
    if (base) {
      setStatus(base);
      return;
    }
    // Permission is default or granted — distinguish subscribed vs not.
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setStatus(existing ? 'subscribed' : 'default');
    } catch {
      setStatus('default');
    }
  }, [computeBaseStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    const vapidKey = getVapidPublicKey();
    if (!isPushSupported() || !vapidKey) return false;

    setIsBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'default');
        if (permission === 'denied') track('push_permission_denied');
        return false;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        }));

      const response = await fetch(SUBSCRIBE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        setStatus('default');
        return false;
      }

      setStatus('subscribed');
      track('push_subscribed');
      return true;
    } catch {
      await refresh();
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [refresh]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isPushSupported()) return false;
    setIsBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch(UNSUBSCRIBE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus('default');
      track('push_unsubscribed');
      return true;
    } catch {
      await refresh();
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [refresh]);

  return { status, isBusy, subscribe, unsubscribe, refresh };
};

export type UseWebPushReturn = ReturnType<typeof useWebPush>;
