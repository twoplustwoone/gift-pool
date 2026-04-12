/**
 * @vitest-environment node
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useLoaderData = vi.fn();
const useLocation = vi.fn();
const useNavigation = vi.fn();
const useFetchers = vi.fn();
const useRequestInfo = vi.fn();
const useHints = vi.fn();
const usePwaInstallPrompt = vi.fn();
const useToast = vi.fn();
const setPrefetchCacheScope = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');

  return {
    ...actual,
    Links: () => null,
    Meta: () => null,
    Outlet: () => <div data-testid="route-outlet">Outlet</div>,
    Scripts: () => null,
    ScrollRestoration: () => null,
    useFetchers: () => useFetchers(),
    useLoaderData: () => useLoaderData(),
    useLocation: () => useLocation(),
    useNavigation: () => useNavigation(),
  };
});

vi.mock('remix-utils/honeypot/react', () => ({
  HoneypotProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('./components/error-boundary.tsx', () => ({
  GeneralErrorBoundary: () => <div>error boundary</div>,
}));

vi.mock('./components/nav/bottom/bottom-nav.tsx', () => ({
  BottomNav: () => <div>bottom nav</div>,
}));

vi.mock('./components/site-footer.tsx', () => ({
  SiteFooter: () => <div>site footer</div>,
}));

vi.mock('./components/nav/top-bar.tsx', () => ({
  TopBar: () => <div>top bar</div>,
}));

vi.mock('./components/notifications/notifications-context.tsx', () => ({
  NotificationsProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('./components/progress-bar.tsx', () => ({
  EpicProgress: () => <div data-testid="epic-progress" />,
}));

vi.mock('./components/pwa-install-banner.tsx', () => ({
  PwaInstallBanner: () => <div>install banner</div>,
}));

vi.mock('./components/toaster.tsx', () => ({
  useToast: (...args: Array<unknown>) => useToast(...args),
}));

vi.mock('./components/ui/icon.tsx', () => ({
  href: '/icons.svg',
}));

vi.mock('./components/ui/sonner.tsx', () => ({
  EpicToaster: () => null,
}));

vi.mock('./components/friends/friends-route-skeleton.tsx', () => ({
  FriendsRouteSkeleton: () => <div data-testid="friends-route-skeleton" />,
}));

vi.mock('./components/wishlist/wishlist-route-skeleton.tsx', () => ({
  WishlistRouteSkeleton: () => <div data-testid="wishlist-route-skeleton" />,
}));

vi.mock('./hooks/use-pwa-install-prompt.ts', () => ({
  usePwaInstallPrompt: (...args: Array<unknown>) => usePwaInstallPrompt(...args),
}));

vi.mock('./utils/auth.server.ts', () => ({
  getUserId: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('./utils/chunk-error.client.ts', () => ({
  isChunkLoadError: () => false,
  reloadOnceForChunkError: vi.fn(),
}));

vi.mock('./utils/client-hints.tsx', () => ({
  ClientHintCheck: () => null,
  getHints: vi.fn(),
  useHints: () => useHints(),
}));

vi.mock('./utils/db.server.ts', () => ({
  prisma: {
    user: {
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

vi.mock('./utils/honeypot.server.ts', () => ({
  honeypot: {},
}));

vi.mock('./utils/i18n.tsx', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getLocaleFromRequest: vi.fn(),
}));

vi.mock('./utils/misc.tsx', () => ({
  combineHeaders: vi.fn(),
  getDomainUrl: vi.fn(),
}));

vi.mock('./utils/nonce-provider.ts', () => ({
  useNonce: () => 'nonce',
}));

vi.mock('./utils/prefetch-cache.client.ts', () => ({
  setPrefetchCacheScope: (...args: Array<unknown>) => setPrefetchCacheScope(...args),
}));

vi.mock('./utils/request-context.server.ts', () => ({
  applyRequestIdHeader: vi.fn(),
  getRequestContext: vi.fn(),
}));

vi.mock('./utils/request-info.ts', () => ({
  useRequestInfo: () => useRequestInfo(),
}));

vi.mock('./utils/theme.server.ts', () => ({
  getTheme: vi.fn(),
}));

vi.mock('./utils/timing.server.ts', () => ({
  makeTimings: vi.fn(),
  time: vi.fn(),
}));

vi.mock('./utils/toast.server.ts', () => ({
  getToast: vi.fn(),
}));

import AppWithProviders from './root.tsx';

beforeEach(() => {
  useLoaderData.mockReturnValue({
    ENV: {},
    honeyProps: {},
    notifications: { unreadCount: 0 },
    requestInfo: {
      locale: 'en',
      userPrefs: { theme: 'light' },
    },
    toast: null,
    user: null,
  });
  useLocation.mockReturnValue({
    hash: '',
    pathname: '/',
    search: '',
  });
  useNavigation.mockReturnValue({
    location: {
      hash: '',
      pathname: '/friends',
      search: '',
    },
    state: 'loading',
  });
  useFetchers.mockReturnValue([]);
  useRequestInfo.mockReturnValue({
    requestId: 'req-1',
    userPrefs: { theme: 'light' },
  });
  useHints.mockReturnValue({ theme: 'light' });
  usePwaInstallPrompt.mockReturnValue({
    capability: 'unavailable',
    dismissBanner: vi.fn(),
    isPrompting: false,
    manualPlatform: null,
    promptInstall: vi.fn(),
    shouldShowBanner: false,
  });
  useToast.mockReset();
  setPrefetchCacheScope.mockReset();
});

describe('app/root.tsx', () => {
  it('renders the friends route skeleton during a pending friends navigation', () => {
    // `useSpinDelay` intentionally returns true on SSR (there is no prior
    // content to flash against, so showing the skeleton immediately is
    // correct on the server). The client-side delay-gating is what prevents
    // the flicker we're fixing — that path isn't exercised by SSR tests.
    const markup = renderToStaticMarkup(<AppWithProviders />);

    expect(markup).toContain('data-testid="friends-route-skeleton"');
    expect(markup).not.toContain('data-testid="route-outlet"');
    expect(markup).not.toContain('data-testid="wishlist-route-skeleton"');
  });
});
