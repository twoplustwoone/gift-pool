// `v8_passThroughRequests` (react-router.config.ts) hands loaders and actions
// the raw request. For a client-side navigation that is a single-fetch data
// request — `/wishlist.data?_routes=routes%2Fwishlist%2B%2Findex` — not the
// page URL the user is on. Anything that turns `request.url` back into a
// user-facing path (a login `redirectTo`, a post-verify redirect, a cache
// key) must normalize it first, or the user gets sent to a `.data` URL
// (GIFTPOOL-UI-37).

/** Map a single-fetch `.data` pathname back to the route pathname. */
export function normalizeDataRequestPathname(pathname: string) {
  if (pathname === '/_root.data') return '/';
  // v8_trailingSlashAwareDataRequests: `/foo/` is fetched as `/foo/_.data`.
  if (pathname.endsWith('/_.data')) return pathname.slice(0, -'_.data'.length);
  if (pathname.endsWith('.data')) return pathname.slice(0, -'.data'.length);
  return pathname;
}

/** Remove the query params React Router adds to data requests (in place). */
export function stripDataRequestParams(searchParams: URLSearchParams) {
  searchParams.delete('_data');
  searchParams.delete('_routes');
  searchParams.delete('index');
  return searchParams;
}

/**
 * The user-facing `pathname?search` for a request URL, whether it came from
 * a document request or a single-fetch data request.
 */
export function getRoutePath(url: string | URL) {
  const parsed = new URL(url);
  const pathname = normalizeDataRequestPathname(parsed.pathname);
  const search = stripDataRequestParams(
    new URLSearchParams(parsed.search),
  ).toString();
  return search ? `${pathname}?${search}` : pathname;
}
