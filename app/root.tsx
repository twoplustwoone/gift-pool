// form utilities are not needed here anymore
import { parseWithZod } from '@conform-to/zod';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  data,
  type LoaderFunctionArgs,
  type HeadersFunction,
  type LinksFunction,
  type MetaFunction,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigation,
  useFetchers,
  useLoaderData,
  useRouteError,
} from 'react-router';
import { HoneypotProvider } from 'remix-utils/honeypot/react';
import { useSpinDelay } from 'spin-delay';
import { z } from 'zod';
import appleTouchIconAssetUrl from './assets/favicons/apple-touch-icon.png';
import faviconAssetUrl from './assets/favicons/favicon.svg';
import {
  PALETTE_CLASSES,
  PALETTE_STORAGE_KEY,
  PaletteSwitcher,
  shouldShowPaletteSwitcher,
} from './components/dev/palette-switcher.tsx';
import { GeneralErrorBoundary } from './components/error-boundary.tsx';
import { FriendsRouteSkeleton } from './components/friends/friends-route-skeleton.tsx';
import { BottomNav } from './components/nav/bottom/bottom-nav.tsx';
import { TopBar } from './components/nav/top-bar.tsx';
import { NotificationsProvider } from './components/notifications/notifications-context.tsx';
import { NotificationPolling } from './components/notifications/notification-polling.tsx';
import { EpicProgress } from './components/progress-bar.tsx';
import { SiteFooter } from './components/site-footer.tsx';
import { useToast } from './components/toaster.tsx';
import { href as iconsHref } from './components/ui/icon.tsx';
import { EpicToaster } from './components/ui/sonner.tsx';
import { WishlistRouteSkeleton } from './components/wishlist/wishlist-route-skeleton.tsx';
import fontsStyleSheet from './styles/fonts.css?url';
import tailwindStyleSheetUrl from './styles/tailwind.css?url';
import { getUserId, logout } from './utils/auth.server.ts';
import { queueTimeZoneUpdate } from './utils/user-time-zone.server.ts';
import {
  isChunkLoadError,
  reloadOnceForChunkError,
} from './utils/chunk-error.client.ts';
import { ClientHintCheck, getHints, useHints } from './utils/client-hints.tsx';
import { scrollForNavigation } from './utils/scroll-to-hash.ts';
import { trackClientEnvironmentOncePerDay } from './utils/client-environment.ts';
import { prisma } from './utils/db.server.ts';
import { getEnv } from './utils/env.server.ts';
import { honeypot } from './utils/honeypot.server.ts';
import { I18nProvider, getLocaleFromRequest } from './utils/i18n.tsx';
import { combineHeaders, getDomainUrl } from './utils/misc.tsx';
import { useNonce } from './utils/nonce-provider.ts';
import { setPrefetchCacheScope } from './utils/prefetch-cache.client.ts';
import {
  applyRequestIdHeader,
  getRequestContext,
} from './utils/request-context.server.ts';
import { useRequestInfo } from './utils/request-info.ts';
import { type Theme, getTheme } from './utils/theme.server.ts';
import { makeTimings, time } from './utils/timing.server.ts';
import { getToast } from './utils/toast.server.ts';
import { ensureVisitorId } from './utils/visitor-id.server.ts';
export const links: LinksFunction = () => [
  // Preload svg sprite as a resource to avoid render blocking
  {
    rel: 'preload',
    href: iconsHref,
    as: 'image',
  },
  {
    rel: 'preload',
    href: '/fonts/nunito-sans-latin-wght.woff2',
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'preload',
    href: '/fonts/plus-jakarta-sans-latin-wght.woff2',
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'icon',
    href: '/favicon.ico',
    sizes: '48x48',
  },
  {
    rel: 'icon',
    type: 'image/svg+xml',
    href: faviconAssetUrl,
  },
  {
    rel: 'apple-touch-icon',
    href: appleTouchIconAssetUrl,
  },
  {
    rel: 'manifest',
    href: '/site.webmanifest',
    crossOrigin: 'use-credentials',
  },
  {
    rel: 'stylesheet',
    href: tailwindStyleSheetUrl,
  },
  {
    rel: 'preload',
    href: fontsStyleSheet,
    as: 'style',
  },
  {
    rel: 'stylesheet',
    href: fontsStyleSheet,
  },
];
export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [
    {
      title: data ? 'GiftPool' : 'Error | GiftPool',
    },
    {
      name: 'description',
      content: `Your own captain's log`,
    },
  ];
};
export async function loader({ request }: LoaderFunctionArgs) {
  const timings = makeTimings('root loader');
  const { requestId } = await getRequestContext(request);
  // Anonymous visitor id for drop-off analytics — set/refreshed on every
  // document request so share/invite landings are attributable pre-signup.
  const { setCookieHeader: visitorCookieHeader } = ensureVisitorId(request);
  const userId = await time(() => getUserId(request), {
    timings,
    type: 'getUserId',
    desc: 'getUserId in root',
  });
  const locale = getLocaleFromRequest(request);
  // Remembered so a note can be scheduled for this person's morning on a
  // request that isn't theirs — the delivery sweep has no client hints.
  queueTimeZoneUpdate(userId, getHints(request).timeZone);

  // Four independent I/O operations — the user lookup, the session toast
  // read, the unread notification count, and the honeypot props. Previously
  // these ran sequentially, adding up to ~50-100ms on every `.data` request
  // (every client-side nav). `findUnique` replaces `findUniqueOrThrow` so
  // the "user was deleted under us" branch below still has a chance to fire
  // instead of throwing straight to the error boundary.
  const [user, toastResult, unreadCount, honeyProps] = await Promise.all([
    userId
      ? time(
          () =>
            prisma.user.findUnique({
              select: {
                id: true,
                name: true,
                username: true,
                image: { select: { id: true } },
                roles: {
                  select: {
                    name: true,
                    permissions: {
                      select: { entity: true, action: true, access: true },
                    },
                  },
                },
              },
              where: { id: userId },
            }),
          { timings, type: 'find user', desc: 'find user in root' },
        )
      : Promise.resolve(null),
    getToast(request),
    userId
      ? prisma.notification.count({
          where: { userId, status: 'UNREAD' },
        })
      : Promise.resolve(0),
    honeypot.getInputProps(),
  ]);
  const { toast, headers: toastHeaders } = toastResult;

  if (userId && !user) {
    console.info('something weird happened');
    // something weird happened... The user is authenticated but we can't find
    // them in the database. Maybe they were deleted? Let's log them out.
    await logout({
      request,
      redirectTo: '/',
    });
  }
  return data(
    {
      user,
      requestInfo: {
        hints: getHints(request),
        origin: getDomainUrl(request),
        path: new URL(request.url).pathname,
        requestId,
        userPrefs: {
          theme: getTheme(request),
        },
        locale,
      },
      // Use getEnv() so every public var (incl. VAPID_PUBLIC_KEY) reaches the
      // client — hardcoding the keys here silently drops new public env vars.
      ENV: getEnv(),
      toast,
      notifications: {
        unreadCount,
      },
      honeyProps,
    },
    {
      headers: combineHeaders(
        {
          'Server-Timing': timings.toString(),
        },
        visitorCookieHeader ? { 'Set-Cookie': visitorCookieHeader } : null,
        toastHeaders,
        applyRequestIdHeader(null, requestId),
      ),
    },
  );
}
export const headers: HeadersFunction = ({ loaderHeaders }) => {
  const headers = {
    'Server-Timing': loaderHeaders.get('Server-Timing') ?? '',
  };
  return headers;
};
// The root route has no meaningful action handler. Return 405 for unexpected
// POST requests (e.g. bots, stale forms) so React Router doesn't 405-error
// with an unhandled "no action" message. (Fixes GIFTPOOL-UI-18, GIFTPOOL-UI-12)
export const action = () => new Response('Method Not Allowed', { status: 405 });
const ThemeFormSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
});
const Document = ({
  children,
  nonce,
  theme = 'light',
  env = {},
  showPaletteSwitcher = false,
}: {
  children: React.ReactNode;
  nonce: string;
  theme?: Theme;
  env?: Record<string, string | undefined>;
  showPaletteSwitcher?: boolean;
}) => {
  return (
    <html lang="en" className={`${theme} min-h-full overflow-x-hidden`}>
      <head>
        <ClientHintCheck nonce={nonce} />
        <Meta />
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1,viewport-fit=cover"
        />
        <meta name="csp-nonce" content={nonce} />
        <Links />
        {showPaletteSwitcher ? (
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{
              // Palette comparison tool (see PaletteSwitcher) — applies the
              // stored palette before first paint so switching to a
              // candidate and reloading doesn't flash the current palette.
              // Available in dev for any developer and in production for
              // admins only; `showPaletteSwitcher` mirrors the same check
              // client-side. Serializes the same PALETTE_CLASSES map the
              // component uses, so there's one source of truth for id->class.
              __html: `try{var c=${JSON.stringify(PALETTE_CLASSES)}[localStorage.getItem('${PALETTE_STORAGE_KEY}')];if(c){document.documentElement.classList.add(c)}}catch(e){}`,
            }}
          />
        ) : null}
      </head>
      <body className="min-h-screen overflow-hidden bg-background text-foreground">
        {children}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify(env)}`,
          }}
        />
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
};
const Footer = () => {
  return (
    <div className="md:hidden">
      <BottomNav />
    </div>
  );
};
const useIsomorphicLayoutEffect =
  typeof document === 'undefined' ? useEffect : useLayoutEffect;

const App = () => {
  const data = useLoaderData<typeof loader>();
  const nonce = useNonce();
  const theme = useTheme();
  // Palette comparison tool: any developer in dev, admins only in prod.
  const showPaletteSwitcher = shouldShowPaletteSwitcher(
    import.meta.env.DEV,
    data.user,
  );
  useIsomorphicLayoutEffect(() => {
    setPrefetchCacheScope(data.user?.id ?? null);
  }, [data.user?.id]);
  useToast(data.toast);
  useEffect(() => {
    void trackClientEnvironmentOncePerDay();
  }, []);
  const [hideHeader, setHideHeader] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigation = useNavigation();
  const lastRouteKey = useRef(
    `${location.pathname}${location.search}${location.hash}`,
  );
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let lastScrollTop = el.scrollTop;
    const threshold = 6;
    let ticking = false;
    const update = () => {
      const current = el.scrollTop;
      const delta = current - lastScrollTop;
      if (current < 8) {
        setHideHeader(false);
      } else if (Math.abs(delta) > threshold) {
        setHideHeader(delta > 0);
      }
      lastScrollTop = current;
      ticking = false;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };
    el.addEventListener('scroll', onScroll, {
      passive: true,
    });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Reset the scroll area on navigation, since window scrolling is disabled —
  // or scroll to the anchor when there is one. See `scrollForNavigation` for
  // why this container has to own both.
  useEffect(() => {
    if (navigation.state !== 'idle') return;
    const key = `${location.pathname}${location.search}${location.hash}`;
    if (lastRouteKey.current === key) return;
    lastRouteKey.current = key;
    const hash = location.hash;
    requestAnimationFrame(() => {
      scrollForNavigation({ container: scrollRef.current, hash });
    });
  }, [location, navigation.state]);
  const targetLocation = navigation.location;
  const isRouteChangeNavigation =
    targetLocation != null &&
    (targetLocation.pathname !== location.pathname ||
      targetLocation.search !== location.search ||
      targetLocation.hash !== location.hash);
  const isWishlistNavigationTarget =
    targetLocation != null &&
    (targetLocation.pathname === '/wishlist' ||
      /^\/users\/[^/]+\/wishlist$/.test(targetLocation.pathname));
  const isFriendsNavigationTarget = targetLocation?.pathname === '/friends';
  const hasSkeletonTarget =
    isWishlistNavigationTarget || isFriendsNavigationTarget;
  const isSkeletonNavigationPending =
    navigation.state === 'loading' &&
    isRouteChangeNavigation &&
    hasSkeletonTarget;
  // Gate the skeleton swap behind a small delay so fast navigations don't
  // flicker through a skeleton. Use a SINGLE useSpinDelay for the overall
  // "should a skeleton be visible" question; pick which skeleton off the
  // current navigation target so that if the user redirects mid-flight
  // (e.g. clicks Friends while a wishlist nav is still winding down) we
  // always render the skeleton for the route they're actually going to.
  const showSkeleton = useSpinDelay(isSkeletonNavigationPending, {
    delay: 400,
    minDuration: 300,
  });
  let routeContent = <Outlet />;
  if (showSkeleton) {
    if (isWishlistNavigationTarget) {
      routeContent = <WishlistRouteSkeleton />;
    } else if (isFriendsNavigationTarget) {
      routeContent = <FriendsRouteSkeleton />;
    }
  }
  return (
    <Document
      nonce={nonce}
      theme={theme}
      env={data.ENV}
      showPaletteSwitcher={showPaletteSwitcher}
    >
      <I18nProvider locale={data.requestInfo.locale}>
        <NotificationsProvider
          initialUnreadCount={data.notifications?.unreadCount ?? 0}
        >
          {data.notifications ? <NotificationPolling /> : null}
          <div className="flex max-h-[100dvh] min-h-[100dvh] flex-col overflow-hidden">
            <TopBar hidden={hideHeader} />

            <div
              ref={scrollRef}
              style={{ paddingTop: 'var(--top-bar-height)' }}
              className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-br from-background to-background-muted pb-bottom-nav md:pb-0"
              data-testid="app-scroll-area"
            >
              <div className="flex min-h-full flex-col">
                <div className="flex-1">{routeContent}</div>
                <SiteFooter />
              </div>
            </div>

            <Footer />
          </div>
          <EpicProgress />
          <EpicToaster closeButton position="top-center" theme={theme} />
          {showPaletteSwitcher ? <PaletteSwitcher /> : null}
        </NotificationsProvider>
      </I18nProvider>
    </Document>
  );
};

// Mobile dropdown menu replaced by Drawer

const AppWithProviders = () => {
  const data = useLoaderData<typeof loader>();
  return (
    <HoneypotProvider {...data.honeyProps}>
      <App />
    </HoneypotProvider>
  );
};
export default AppWithProviders;

/**
 * @returns the user's theme preference, or the client hint theme if the user
 * has not set a preference.
 */
export function useTheme() {
  const hints = useHints();
  const requestInfo = useRequestInfo();
  const optimisticMode = useOptimisticThemeMode();
  if (optimisticMode) {
    return optimisticMode === 'system' ? hints.theme : optimisticMode;
  }
  return requestInfo.userPrefs.theme ?? hints.theme;
}

/**
 * If the user's changing their theme mode preference, this will return the
 * value it's being changed to.
 */
export function useOptimisticThemeMode() {
  const fetchers = useFetchers();
  const themeFetcher = fetchers.find(
    (f) => f.formAction === '/' || f.formAction === '/resources/theme-switch',
  );
  if (themeFetcher && themeFetcher.formData) {
    const submission = parseWithZod(themeFetcher.formData, {
      schema: ThemeFormSchema,
    });
    return submission.status === 'success' ? submission.value.theme : null;
  }
}
export const ErrorBoundary = () => {
  // the nonce doesn't rely on the loader so we can access that
  const nonce = useNonce();
  const error = useRouteError();

  // NOTE: you cannot use useLoaderData in an ErrorBoundary because the loader
  // likely failed to run so we have to do the best we can.
  // We could probably do better than this (it's possible the loader did run).
  // This would require a change in Remix.

  // Just make sure your root route never errors out and you'll always be able
  // to give the user a better UX.

  // Guard against SSR context where the .client.ts module resolves to
  // undefined — calling an undefined value throws "isChunkLoadError is not a
  // function" (GIFTPOOL-UI-17).
  const isChunkError =
    typeof isChunkLoadError === 'function' && isChunkLoadError(error);

  useEffect(() => {
    reloadOnceForChunkError(error);
  }, [error]);

  if (isChunkError) {
    return (
      <Document nonce={nonce}>
        <div className="container flex items-center justify-center p-20 text-h2">
          <p>Updating, please wait…</p>
        </div>
      </Document>
    );
  }

  return (
    <Document nonce={nonce}>
      <GeneralErrorBoundary />
    </Document>
  );
};
