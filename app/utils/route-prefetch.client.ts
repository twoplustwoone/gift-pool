import {
  getPrefetchCacheScope,
  hasPrefetchCache,
  normalizePrefetchCacheKey,
  primePrefetchCache,
} from './prefetch-cache.client.ts';

type NetworkInformationLike = {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
};

const inFlightPrefetches = new Map<string, Promise<void>>();

export function getNavigatorConnection(): NetworkInformationLike | null {
  if (typeof navigator === 'undefined') return null;

  return (
    (
      navigator as Navigator & {
        connection?: NetworkInformationLike;
      }
    ).connection ?? null
  );
}

export function shouldPauseConservativePrefetch() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }

  if (
    typeof document !== 'undefined' &&
    document.visibilityState === 'hidden'
  ) {
    return true;
  }

  const connection = getNavigatorConnection();
  if (!connection) return false;

  if (connection.saveData) return true;
  return (
    connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g'
  );
}

export function scheduleIdleTask(task: () => void) {
  if (typeof window === 'undefined') return () => {};

  if ('requestIdleCallback' in window) {
    const idleId = window.requestIdleCallback(() => task(), {
      timeout: 1_000,
    });

    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = setTimeout(task, 0);
  return () => clearTimeout(timeoutId);
}

export async function prefetchRouteData({
  cacheKey,
  resourcePath,
  signal,
}: {
  cacheKey: string | URL;
  resourcePath: string;
  signal?: AbortSignal;
}) {
  const normalizedKey = normalizePrefetchCacheKey(cacheKey);
  const scopeKey = getPrefetchCacheScope();
  const inFlightKey = `${scopeKey}:${normalizedKey}`;

  if (hasPrefetchCache(normalizedKey, scopeKey)) return;

  const existingRequest = inFlightPrefetches.get(inFlightKey);
  if (existingRequest) return existingRequest;

  const nextRequest = (async () => {
    const response = await fetch(resourcePath, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
      signal,
    });

    if (!response.ok) return;

    const payload = await response.json();
    primePrefetchCache(normalizedKey, payload, undefined, scopeKey);
  })()
    .catch((error) => {
      if ((error as Error).name === 'AbortError') return;
    })
    .finally(() => {
      inFlightPrefetches.delete(inFlightKey);
    });

  inFlightPrefetches.set(inFlightKey, nextRequest);

  return nextRequest;
}
