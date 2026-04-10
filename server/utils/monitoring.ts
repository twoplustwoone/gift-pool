import * as Sentry from '@sentry/react-router';

export function init() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // Sample 10% of transactions in production. The previous 100% rate was
    // expensive on a small Fly machine while producing more data than we
    // actually consume.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    denyUrls: [
      /\/resources\/healthcheck/,
      // TODO: be smarter about the public assets...
      /\/build\//,
      /\/favicons\//,
      /\/img\//,
      /\/fonts\//,
      /\/favicon.ico/,
      /\/site\.webmanifest/,
    ],
    integrations: [Sentry.httpIntegration(), Sentry.prismaIntegration()],
    tracesSampler(samplingContext) {
      // ignore healthcheck transactions by other services (consul, etc.)
      if (samplingContext.request?.url?.includes('/resources/healthcheck')) {
        return 0;
      }
      return 0.1;
    },
    beforeSendTransaction(event) {
      // ignore all healthcheck related transactions
      //  note that name of header here is case-sensitive
      if (event.request?.headers?.['x-healthcheck'] === 'true') {
        return null;
      }

      return event;
    },
  });
}
