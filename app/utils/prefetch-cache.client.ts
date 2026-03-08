const PREFETCH_CACHE_BASE_URL = 'https://prefetch.giftpool.local';

type PrefetchCacheEntry = {
  data: unknown;
  expiresAt: number;
  scopeKey: string;
};

export const PREFETCH_CACHE_TTL_MS = 30_000;

const prefetchCache = new Map<string, PrefetchCacheEntry>();
const ANONYMOUS_PREFETCH_SCOPE = 'anonymous';
let currentPrefetchCacheScope = ANONYMOUS_PREFETCH_SCOPE;

function toURL(input: string | URL) {
  return input instanceof URL
    ? new URL(input.toString())
    : new URL(input, PREFETCH_CACHE_BASE_URL);
}

function normalizeReactRouterDataPath(pathname: string) {
  if (pathname === '/_root.data') return '/';
  if (pathname.endsWith('/_.data')) {
    return pathname.slice(0, -'_.data'.length);
  }
  if (pathname.endsWith('.data')) {
    return pathname.slice(0, -'.data'.length);
  }

  return pathname;
}

function normalizeScopeKey(scopeKey?: string | null) {
  return scopeKey ?? ANONYMOUS_PREFETCH_SCOPE;
}

export function normalizePrefetchCacheKey(input: string | URL) {
  const url = toURL(input);
  const pathname = normalizeReactRouterDataPath(url.pathname);
  const searchParams = new URLSearchParams(url.search);

  // React Router appends internal params when issuing single-fetch loader
  // requests. They should not affect cache reuse for the underlying route.
  searchParams.delete('_data');
  searchParams.delete('_routes');
  searchParams.delete('index');

  if (pathname === '/friends') {
    searchParams.delete('q');
    searchParams.delete('tab');
  }

  searchParams.sort();

  const search = searchParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}

function getLiveEntry(key: string, scopeKey = currentPrefetchCacheScope) {
  const entry = prefetchCache.get(key);

  if (!entry) return null;
  if (entry.scopeKey !== scopeKey) {
    prefetchCache.delete(key);
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    prefetchCache.delete(key);
    return null;
  }

  return entry;
}

export function getPrefetchCacheScope() {
  return currentPrefetchCacheScope;
}

export function setPrefetchCacheScope(scopeKey?: string | null) {
  const normalizedScopeKey = normalizeScopeKey(scopeKey);

  if (normalizedScopeKey === currentPrefetchCacheScope) return;

  currentPrefetchCacheScope = normalizedScopeKey;
  clearPrefetchCache();
}

export function primePrefetchCache<T>(
  key: string | URL,
  data: T,
  ttlMs = PREFETCH_CACHE_TTL_MS,
  scopeKey = currentPrefetchCacheScope,
) {
  prefetchCache.set(normalizePrefetchCacheKey(key), {
    data,
    expiresAt: Date.now() + ttlMs,
    scopeKey,
  });

  return data;
}

export function hasPrefetchCache(
  key: string | URL,
  scopeKey = currentPrefetchCacheScope,
) {
  return getLiveEntry(normalizePrefetchCacheKey(key), scopeKey) !== null;
}

export function takePrefetchCache<T>(
  key: string | URL,
  scopeKey = currentPrefetchCacheScope,
) {
  const normalizedKey = normalizePrefetchCacheKey(key);
  const entry = getLiveEntry(normalizedKey, scopeKey);

  if (!entry) return undefined;

  prefetchCache.delete(normalizedKey);
  return entry.data as T;
}

export function clearPrefetchCache() {
  prefetchCache.clear();
}
