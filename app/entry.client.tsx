import { startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';
import { reloadOnceForChunkError } from './utils/chunk-error.client.ts';
import { NonceProvider } from './utils/nonce-provider.ts';
import { NOTIFICATIONS_REFRESH_EVENT } from './utils/web-push.client.ts';

if (ENV.MODE === 'production' && ENV.SENTRY_DSN) {
  void import('./utils/monitoring.client.tsx').then(({ init }) => init());
}

window.addEventListener('unhandledrejection', (event) => {
  reloadOnceForChunkError(event.reason);
});

// Register the (push-only) service worker so already-subscribed devices keep
// receiving pushes, and relay its "new notification" messages to a window event
// the in-app bell polling hook listens for.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failures are non-fatal — push just won't be available.
    });
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'notification') {
      window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT));
    }
  });
}

function getCspNonceFromMeta() {
  const el = document.querySelector('meta[name="csp-nonce"]');
  return el?.getAttribute('content') ?? '';
}

startTransition(() => {
  const nonce = getCspNonceFromMeta();
  hydrateRoot(
    document,
    <NonceProvider value={nonce}>
      <HydratedRouter />
    </NonceProvider>,
  );
});
