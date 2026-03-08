import * as React from 'react';
import {
  getNavigatorConnection,
  prefetchRouteData,
  scheduleIdleTask,
  shouldPauseConservativePrefetch,
} from '#app/utils/route-prefetch.client.ts';

const FRIEND_WISHLIST_PREFETCH_CONCURRENCY = 2;

export function useHomeBackgroundPrefetch({ enabled }: { enabled: boolean }) {
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;

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
  }, [enabled]);
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
  }, [usernamesKey]);

  React.useEffect(() => {
    const scheduleDrain = () => {
      if (cancelIdleTaskRef.current) return;

      cancelIdleTaskRef.current = scheduleIdleTask(() => {
        cancelIdleTaskRef.current = null;
        drainQueue();
      });
    };

    const drainQueue = () => {
      if (shouldPauseConservativePrefetch()) return;

      while (
        activeCountRef.current < FRIEND_WISHLIST_PREFETCH_CONCURRENCY &&
        queueRef.current.length > 0
      ) {
        const username = queueRef.current.shift();
        if (!username) break;

        activeCountRef.current += 1;
        const controller = new AbortController();
        activeControllersRef.current.add(controller);

        void prefetchRouteData({
          cacheKey: `/users/${username}/wishlist`,
          resourcePath: `/resources/prefetch/users/${encodeURIComponent(username)}/wishlist`,
          signal: controller.signal,
        }).finally(() => {
          activeControllersRef.current.delete(controller);
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

    scheduleDrain();

    return () => {
      cancelIdleTaskRef.current?.();
      cancelIdleTaskRef.current = null;

      for (const controller of activeControllersRef.current) {
        controller.abort();
      }
      activeControllersRef.current.clear();

      window.removeEventListener('online', resumePrefetch);
      document.removeEventListener('visibilitychange', resumePrefetch);
      connection?.removeEventListener?.('change', resumePrefetch);

      scheduleDrainRef.current = () => {};
      activeCountRef.current = 0;
    };
  }, []);
}
