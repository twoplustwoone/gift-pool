import { setContext, setTag } from '@sentry/react-router';

// Diagnostics for GIFTPOOL-UI-36 / GIFTPOOL-UI-1H: on iOS Safari a page can
// hydrate with React Router's hydration data missing a matched route, so the
// router starts uninitialized, renders a fallback that doesn't match the
// server HTML (React #418/#423), then throws `No result found for routeId`
// from the initial-load data strategy. Neither event says WHY the data was
// missing, and Chromium cannot reproduce it. This snapshot records the state
// the router hydrated from, once per document, before `router.initialize()`
// runs, so the next occurrence carries enough to tell the causes apart (a
// reload or back/forward restore vs. a server/client route mismatch).

type RouterLike = {
  state: {
    initialized: boolean;
    matches: Array<{ route: { id: string } }>;
    loaderData: Record<string, unknown>;
    errors: Record<string, unknown> | null;
  };
};

type HydrationWindow = {
  location: { pathname: string };
  performance?: { getEntriesByType?: (type: string) => unknown[] };
  __reactRouterDataRouter?: RouterLike;
  __reactRouterRouteModules?: Record<string, unknown>;
  __reactRouterManifest?: {
    routes?: Record<string, { hasLoader?: boolean } | undefined>;
  };
  __reactRouterContext?: {
    state?: {
      loaderData?: Record<string, unknown> | null;
      errors?: Record<string, unknown> | null;
    };
  };
};

export type HydrationSnapshot = {
  pathname: string;
  // `navigate` | `reload` | `back_forward` | `prerender`, or null if the
  // browser exposes no Navigation Timing entry.
  navigationType: string | null;
  readyState: string | null;
  // Route modules the server inlined into the document — i.e. the routes the
  // server matched when it rendered this HTML.
  serverRouteIds: string[];
  // Routes the decoded hydration state carries loader data / errors for.
  hydratedLoaderRouteIds: string[] | null;
  hydratedErrorRouteIds: string[] | null;
  // What the client router matched against `window.location`, and whether it
  // considered itself initialized from that hydration data.
  routerMatchIds: string[] | null;
  routerInitialized: boolean | null;
  // Client matches that have a loader but no hydration data or error —
  // non-empty is the exact condition that produces `No result found for
  // routeId`. Loaderless routes (e.g. an action-only index) never have a
  // `loaderData` entry, so they are excluded, as React Router does.
  routeIdsMissingData: string[] | null;
};

function readNavigationType(win: HydrationWindow): string | null {
  const entry = win.performance?.getEntriesByType?.('navigation')?.[0] as
    { type?: unknown } | undefined;
  return typeof entry?.type === 'string' ? entry.type : null;
}

export function readHydrationSnapshot(
  win: HydrationWindow,
  readyState: string | null,
): HydrationSnapshot {
  const router = win.__reactRouterDataRouter;
  const state = win.__reactRouterContext?.state;
  const loaderData = state?.loaderData ?? null;
  const routerMatchIds = router
    ? router.state.matches.map((match) => match.route.id)
    : null;
  const manifestRoutes = win.__reactRouterManifest?.routes ?? {};

  return {
    pathname: win.location.pathname,
    navigationType: readNavigationType(win),
    readyState,
    serverRouteIds: Object.keys(win.__reactRouterRouteModules ?? {}),
    hydratedLoaderRouteIds: loaderData ? Object.keys(loaderData) : null,
    hydratedErrorRouteIds: state?.errors ? Object.keys(state.errors) : null,
    routerMatchIds,
    routerInitialized: router ? router.state.initialized : null,
    routeIdsMissingData:
      routerMatchIds && loaderData
        ? routerMatchIds.filter(
            (id) =>
              manifestRoutes[id]?.hasLoader === true &&
              !(id in loaderData) &&
              !(state?.errors && id in state.errors),
          )
        : null,
  };
}

let recorded = false;

/**
 * Attaches the hydration snapshot to every later Sentry event from this
 * document, taken the moment React Router creates its router.
 *
 * `HydratedRouter` assigns `window.__reactRouterDataRouter` at the end of
 * `createHydratedRouter`, after building the router from the hydration data
 * and before its layout effect calls `router.initialize()` — exactly the state
 * to capture. A setter observes that without touching the React tree: a root
 * route effect never runs on the failing load (with route data missing, React
 * Router renders nothing for the route tree, as there is no HydrateFallback),
 * and a sibling component next to `HydratedRouter` would shift `useId` values
 * away from the server-rendered tree.
 *
 * Call once, before `hydrateRoot`.
 */
export function recordHydrationSnapshotOnRouterCreation() {
  if (typeof window === 'undefined') return;

  let router: unknown;
  Object.defineProperty(window, '__reactRouterDataRouter', {
    configurable: true,
    enumerable: true,
    get: () => router,
    set: (value: unknown) => {
      router = value;
      recordHydrationSnapshot();
    },
  });
}

function recordHydrationSnapshot() {
  if (recorded) return;
  recorded = true;

  const snapshot = readHydrationSnapshot(
    window as unknown as HydrationWindow,
    document.readyState,
  );
  setContext('hydration', snapshot);
  setTag('hydration.navigation_type', snapshot.navigationType ?? 'unknown');
  setTag(
    'hydration.router_initialized',
    String(snapshot.routerInitialized ?? 'unknown'),
  );
  setTag(
    'hydration.missing_route_data',
    String((snapshot.routeIdsMissingData?.length ?? 0) > 0),
  );
}
