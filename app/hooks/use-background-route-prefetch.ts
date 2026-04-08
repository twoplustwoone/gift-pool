import * as React from 'react';
import {
  getNavigatorConnection,
  prefetchRouteData,
  scheduleIdleTask,
  shouldPauseConservativePrefetch,
} from '#app/utils/route-prefetch.client.ts';

// Keep at 1 so background prefetches don't pile up on the SQLite connection
// while the user is actively navigating. Raise to 2 once the app is on Postgres.
const FRIEND_WISHLIST_PREFETCH_CONCURRENCY = 1;

// Wait this long after the friends page mounts before starting to prefetch.
// Gives the page render and any in-flight navigations time to settle first.
const FRIEND_WISHLIST_PREFETCH_INITIAL_DELAY_MS = 2_000;

export function useHomeBackgroundPrefetch({
  enabled,
  scopeKey,
}: {
  enabled: boolean;
  scopeKey?: string | null;
}) {
  const lastStartedScopeRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      lastStartedScopeRef.current = null;
      return;
    }

    const normalizedScopeKey = scopeKey ?? 'anonymous';
    if (lastStartedScopeRef.current === normalizedScopeKey) return;
    lastStartedScopeRef.current = normalizedScopeKey;

    const controller = new AbortController();
    const cancelIdleTask = scheduleIdleTask(() => {
      void Promise.allSettled([
        prefetchRouteData({
          cacheKey: '/wishlist',
          resourcePath: '/resources/prefetch/wishlist',
          signal: controller.signal,
        }),
        prefetchRouteData({
          cacheKey: '/friends',
          resourcePath: '/resources/prefetch/friends',
          signal: controller.signal,
        }),
      ]);
    });

    return () => {
      controller.abort();
      cancelIdleTask();
    };
  }, [enabled, scopeKey]);
}

export function useFriendWishlistPrefetch(usernames: string[]) {
  const queueRef = React.useRef<string[]>([]);
  const queuedUsernamesRef = React.useRef(new Set<string>());
  const activeCountRef = React.useRef(0);
  const cancelIdleTaskRef = React.useRef<null | (() => void)>(null);
  const activeControllersRef = React.useRef(new Set<AbortController>());
  const scheduleDrainRef = React.useRef<() => void>(() => {});
  const usernamesKey = usernames.join('|');

  React.useEffect(() => {
    for (const username of usernames) {
      if (queuedUsernamesRef.current.has(username)) continue;

      queuedUsernamesRef.current.add(username);
      queueRef.current.push(username);
    }

    scheduleDrainRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- usernamesKey proxies usernames content
  }, [usernamesKey]);

  React.useEffect(() => {
    const controllers = activeControllersRef.current;
    let disposed = false;

    const scheduleDrain = () => {
      if (disposed) return;
      if (cancelIdleTaskRef.current) return;

      cancelIdleTaskRef.current = scheduleIdleTask(() => {
        cancelIdleTaskRef.current = null;
        drainQueue();
      });
    };

    const drainQueue = () => {
      if (disposed) return;
      if (shouldPauseConservativePrefetch()) return;

      while (
        activeCountRef.current < FRIEND_WISHLIST_PREFETCH_CONCURRENCY &&
        queueRef.current.length > 0
      ) {
        const username = queueRef.current.shift();
        if (!username) break;

        activeCountRef.current += 1;
        const controller = new AbortController();
        controllers.add(controller);

        void prefetchRouteData({
          cacheKey: `/users/${username}/wishlist`,
          resourcePath: `/resources/prefetch/users/${encodeURIComponent(username)}/wishlist`,
          signal: controller.signal,
        }).finally(() => {
          controllers.delete(controller);
          activeCountRef.current = Math.max(0, activeCountRef.current - 1);
          scheduleDrain();
        });
      }
    };

    scheduleDrainRef.current = scheduleDrain;

    const resumePrefetch = () => {
      scheduleDrain();
    };

    const connection = getNavigatorConnection();

    window.addEventListener('online', resumePrefetch);
    document.addEventListener('visibilitychange', resumePrefetch);
    connection?.addEventListener?.('change', resumePrefetch);

    // Delay the first drain so the page render and any in-flight navigations
    // can settle before we start hammering the DB with prefetch requests.
    const initialDelayId = setTimeout(
      () => scheduleDrain(),
      FRIEND_WISHLIST_PREFETCH_INITIAL_DELAY_MS,
    );

    return () => {
      disposed = true;
      clearTimeout(initialDelayId);
      cancelIdleTaskRef.current?.();
      cancelIdleTaskRef.current = null;

      for (const controller of controllers) {
        controller.abort();
      }
      controllers.clear();

      window.removeEventListener('online', resumePrefetch);
      document.removeEventListener('visibilitychange', resumePrefetch);
      connection?.removeEventListener?.('change', resumePrefetch);

      scheduleDrainRef.current = () => {};
      activeCountRef.current = 0;
    };
  }, []);
}
