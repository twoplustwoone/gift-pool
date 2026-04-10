import {
  init as sentryInit,
  reactRouterTracingIntegration,
  replayIntegration,
} from '@sentry/react-router';

export function init() {
  sentryInit({
    dsn: ENV.SENTRY_DSN,
    environment: ENV.MODE,
    beforeSend(event) {
      if (event.request?.url) {
        const url = new URL(event.request.url);
        if (
          url.protocol === 'chrome-extension:' ||
          url.protocol === 'moz-extension:'
        ) {
          // This error is from a browser extension, ignore it
          return null;
        }
      }
      return event;
    },
    integrations: [reactRouterTracingIntegration(), replayIntegration()],

    // Sample 10% of transactions in production. The previous 100% rate was
    // creating measurable overhead on a small Fly machine while providing
    // more data than we actually consume.
    tracesSampleRate: 0.1,

    // Capture Replay for 10% of all sessions,
    // plus for 100% of sessions with an error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}
