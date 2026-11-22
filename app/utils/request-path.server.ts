import { safeRedirect } from 'remix-utils/safe-redirect';

// React Router single-fetch internals that must never escape into an
// app-facing path. `_data` is the Remix v1 equivalent of `_routes`.
const INTERNAL_SEARCH_PARAMS = ['_routes', '_data', 'index'];

/**
 * Turns a single-fetch data path back into the document path the user sees.
 *
 * `future.v8_passThroughRequests` hands loaders and actions the raw HTTP
 * request, so `request.url` is `/wishlist.data?_routes=…` during client
 * navigations and revalidations. Anything that turns that URL into a
 * user-facing path (a login `redirectTo`, a post-verify target) has to undo
 * the encoding first or the user lands on an internal URL (GIFTPOOL-UI-37).
 *
 * String-only on purpose: parsing with `new URL(path, base)` would read a
 * value like `/\evil.example` as a host.
 */
export function normalizeAppPath(path: string): string {
  const hashIndex = path.indexOf('#');
  const hash = hashIndex === -1 ? '' : path.slice(hashIndex);
  const beforeHash = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf('?');
  let pathname =
    queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  let search = queryIndex === -1 ? '' : beforeHash.slice(queryIndex + 1);

  if (pathname === '/_root.data') {
    pathname = '/';
  } else if (pathname.endsWith('.data')) {
    // `/a/b/_.data` is the trailing-slash-aware encoding of `/a/b/`.
    pathname = pathname.replace(/(\/_)?\.data$/, (_, slash) =>
      slash ? '/' : '',
    );
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
  }

  const params = new URLSearchParams(search);
  if (INTERNAL_SEARCH_PARAMS.some((name) => params.has(name))) {
    for (const name of INTERNAL_SEARCH_PARAMS) params.delete(name);
    search = params.toString();
  }

  return `${pathname || '/'}${search ? `?${search}` : ''}${hash}`;
}

/** The document path (pathname + search) a request represents. */
export function getRequestPath(request: Request): string {
  const url = new URL(request.url);
  return normalizeAppPath(`${url.pathname}${url.search}`);
}

/**
 * `safeRedirect` for user-supplied redirect targets, which also repairs a
 * single-fetch data URL that leaked into `redirectTo` (e.g. from a login link
 * minted before the requireUserId fix). The result is always re-checked by
 * `safeRedirect`, so normalization can never produce an off-site target.
 */
export function safeRedirectPath(to: string | null | undefined): string {
  return safeRedirect(to ? normalizeAppPath(to.trim()) : to);
}
