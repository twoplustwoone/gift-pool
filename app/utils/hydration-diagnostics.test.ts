/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';

const setContext = vi.fn();
const setTag = vi.fn();

vi.mock('@sentry/react-router', () => ({
  setContext: (...args: Array<unknown>) => setContext(...args),
  setTag: (...args: Array<unknown>) => setTag(...args),
}));

import {
  readHydrationSnapshot,
  recordHydrationSnapshotOnRouterCreation,
} from './hydration-diagnostics.ts';

const POOL_ROUTES = [
  'root',
  'routes/pools+/route',
  'routes/pools+/$poolId+/_layout',
  'routes/pools+/$poolId+/settings',
];

function makeWindow({
  loaderRouteIds,
  errorRouteIds = [],
  initialized,
  navigationType = 'navigate',
}: {
  loaderRouteIds: string[];
  errorRouteIds?: string[];
  initialized: boolean;
  navigationType?: string;
}) {
  return {
    location: { pathname: '/pools/abc/settings' },
    performance: {
      getEntriesByType: (type: string) =>
        type === 'navigation' ? [{ type: navigationType }] : [],
    },
    __reactRouterRouteModules: Object.fromEntries(
      POOL_ROUTES.map((id) => [id, {}]),
    ),
    __reactRouterContext: {
      state: {
        loaderData: Object.fromEntries(loaderRouteIds.map((id) => [id, {}])),
        errors: errorRouteIds.length
          ? Object.fromEntries(errorRouteIds.map((id) => [id, new Error('x')]))
          : null,
      },
    },
    __reactRouterDataRouter: {
      state: {
        initialized,
        matches: POOL_ROUTES.map((id) => ({ route: { id } })),
        loaderData: {},
        errors: null,
      },
    },
  };
}

describe('readHydrationSnapshot', () => {
  it('reports no missing data for a healthy hydration', () => {
    const snapshot = readHydrationSnapshot(
      makeWindow({ loaderRouteIds: POOL_ROUTES, initialized: true }),
      'interactive',
    );

    expect(snapshot).toMatchObject({
      pathname: '/pools/abc/settings',
      navigationType: 'navigate',
      readyState: 'interactive',
      serverRouteIds: POOL_ROUTES,
      routerMatchIds: POOL_ROUTES,
      routerInitialized: true,
      routeIdsMissingData: [],
    });
  });

  it('names the matched routes the hydration data has nothing for', () => {
    const snapshot = readHydrationSnapshot(
      makeWindow({
        loaderRouteIds: ['root'],
        initialized: false,
        navigationType: 'back_forward',
      }),
      'loading',
    );

    expect(snapshot.navigationType).toBe('back_forward');
    expect(snapshot.routerInitialized).toBe(false);
    expect(snapshot.routeIdsMissingData).toEqual(POOL_ROUTES.slice(1));
  });

  it('does not count a route whose hydration state carries an error', () => {
    const win = makeWindow({
      loaderRouteIds: ['root'],
      errorRouteIds: POOL_ROUTES.slice(1),
      initialized: true,
    });

    expect(readHydrationSnapshot(win, null).routeIdsMissingData).toEqual([]);
  });

  it('degrades to nulls when the router globals are absent', () => {
    const snapshot = readHydrationSnapshot(
      { location: { pathname: '/' } },
      null,
    );

    expect(snapshot).toEqual({
      pathname: '/',
      navigationType: null,
      readyState: null,
      serverRouteIds: [],
      hydratedLoaderRouteIds: null,
      hydratedErrorRouteIds: null,
      routerMatchIds: null,
      routerInitialized: null,
      routeIdsMissingData: null,
    });
  });
});

describe('recordHydrationSnapshotOnRouterCreation', () => {
  it('records once, at the moment React Router publishes its router', () => {
    const fake = makeWindow({ loaderRouteIds: ['root'], initialized: false });
    Object.assign(window, {
      __reactRouterRouteModules: fake.__reactRouterRouteModules,
      __reactRouterContext: fake.__reactRouterContext,
    });

    recordHydrationSnapshotOnRouterCreation();
    expect(setContext).not.toHaveBeenCalled();

    const w = window as unknown as { __reactRouterDataRouter: unknown };
    w.__reactRouterDataRouter = fake.__reactRouterDataRouter;

    expect(w.__reactRouterDataRouter).toBe(fake.__reactRouterDataRouter);
    expect(setContext).toHaveBeenCalledTimes(1);
    expect(setContext).toHaveBeenCalledWith(
      'hydration',
      expect.objectContaining({
        routerInitialized: false,
        routeIdsMissingData: POOL_ROUTES.slice(1),
      }),
    );
    expect(setTag).toHaveBeenCalledWith('hydration.missing_route_data', 'true');

    // A later reassignment (HMR) must not overwrite the hydration-time record.
    w.__reactRouterDataRouter = fake.__reactRouterDataRouter;
    expect(setContext).toHaveBeenCalledTimes(1);
  });
});
