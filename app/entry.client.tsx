import { type ErrorInfo, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';
import { reloadOnceForChunkError } from './utils/chunk-error.client.ts';
import { recordHydrationSnapshotOnRouterCreation } from './utils/hydration-diagnostics.ts';
import { NonceProvider } from './utils/nonce-provider.ts';
import { NOTIFICATIONS_REFRESH_EVENT } from './utils/web-push.client.ts';

type RootErrorHandler = (error: unknown, errorInfo: ErrorInfo) => void;

const sentryEnabled = ENV.MODE === 'production' && Boolean(ENV.SENTRY_DSN);
let reportRootError: RootErrorHandler | undefined;
// Hydration errors can fire before the lazy Sentry chunk arrives; hold them so
// they reach Sentry, with their component stack, once it has initialized.
const pendingRootErrors: Parameters<RootErrorHandler>[] = [];

if (sentryEnabled) {
  void import('./utils/monitoring.client.tsx').then((monitoring) => {
    monitoring.init();
    reportRootError = monitoring.reportRootError;
    for (const args of pendingRootErrors.splice(0)) reportRootError(...args);
  });
}

const onRootError: RootErrorHandler = (error, errorInfo) => {
  if (reportRootError) reportRootError(error, errorInfo);
  else pendingRootErrors.push([error, errorInfo]);
};

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

recordHydrationSnapshotOnRouterCreation();

startTransition(() => {
  const nonce = getCspNonceFromMeta();
  hydrateRoot(
    document,
    <NonceProvider value={nonce}>
      <HydratedRouter />
    </NonceProvider>,
    sentryEnabled
      ? { onUncaughtError: onRootError, onRecoverableError: onRootError }
      : undefined,
  );
});
