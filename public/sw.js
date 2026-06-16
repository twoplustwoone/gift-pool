/* GiftPool service worker — push only.
 *
 * Deliberately minimal: no offline caching / precaching (avoids
 * cache-invalidation bugs). Its only jobs are receiving Web Push messages,
 * showing the OS notification, forwarding to open tabs so the in-app bell can
 * refresh live, and routing clicks back into the app.
 */

self.addEventListener('install', () => {
  // Activate this SW immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = { title: 'GiftPool', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'GiftPool';
  const url = payload.url || '/';
  const options = {
    body: payload.body || '',
    tag: payload.tag,
    icon: '/favicons/android-chrome-192x192.png',
    badge: '/favicons/android-chrome-192x192.png',
    data: { url },
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // Nudge any open tab to refresh its unread count immediately rather than
      // waiting for the next poll.
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({ type: 'notification' });
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Focus an existing tab if one is open, then navigate it.
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(targetUrl);
            } catch (err) {
              /* cross-origin or detached client — ignore */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
