import { startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';
import { reloadOnceForChunkError } from './utils/chunk-error.client.ts';
import { NonceProvider } from './utils/nonce-provider.ts';

if (ENV.MODE === 'production' && ENV.SENTRY_DSN) {
  void import('./utils/monitoring.client.tsx').then(({ init }) => init());
}

window.addEventListener('unhandledrejection', (event) => {
  reloadOnceForChunkError(event.reason);
});

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
