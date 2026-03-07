import { remixRoutesOptionAdapter } from '@react-router/remix-routes-option-adapter';
import { flatRoutes } from 'remix-flat-routes';

export default await remixRoutesOptionAdapter((defineRoutes) =>
  flatRoutes('routes', defineRoutes, {
    ignoredRouteFiles: [
      '.*',
      '**/*.css',
      '**/*.test.{js,jsx,ts,tsx}',
      '**/__*.*',
      '**/*.server.*',
      '**/*.client.*',
    ],
  }),
);
