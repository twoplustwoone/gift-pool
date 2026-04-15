/**
 * @vitest-environment jsdom
 *
 * Covers the --pwa-banner-height ResizeObserver effect in root.tsx.
 * All heavy dependencies are mocked; this test focuses solely on whether
 * the CSS variable is set and cleared based on banner visibility.
 */
import { act, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testConsole } from '#tests/setup/setup-test-env.ts';

// ─── Module mocks (must be hoisted above imports) ────────────────────────────

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
  HoneypotProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
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
  EpicProgress: () => <div />,
}));

vi.mock('./components/pwa-install-banner.tsx', () => ({
  PwaInstallBanner: () => (
    <div data-testid="pwa-install-banner">install banner</div>
  ),
}));

vi.mock('./components/toaster.tsx', () => ({
  useToast: (...args: Array<unknown>) => useToast(...args),
}));

vi.mock('./components/ui/icon.tsx', () => ({ href: '/icons.svg' }));

vi.mock('./components/ui/sonner.tsx', () => ({
  EpicToaster: () => null,
}));

vi.mock('./components/friends/friends-route-skeleton.tsx', () => ({
  FriendsRouteSkeleton: () => <div />,
}));

vi.mock('./components/wishlist/wishlist-route-skeleton.tsx', () => ({
  WishlistRouteSkeleton: () => <div />,
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
  prisma: { user: { findUniqueOrThrow: vi.fn() } },
}));

vi.mock('./utils/honeypot.server.ts', () => ({ honeypot: {} }));

vi.mock('./utils/i18n.tsx', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getLocaleFromRequest: vi.fn(),
}));

vi.mock('./utils/misc.tsx', () => ({
  combineHeaders: vi.fn(),
  getDomainUrl: vi.fn(),
}));

vi.mock('./utils/nonce-provider.ts', () => ({ useNonce: () => 'nonce' }));

vi.mock('./utils/prefetch-cache.client.ts', () => ({
  setPrefetchCacheScope: (...args: Array<unknown>) =>
    setPrefetchCacheScope(...args),
}));

vi.mock('./utils/request-context.server.ts', () => ({
  applyRequestIdHeader: vi.fn(),
  getRequestContext: vi.fn(),
}));

vi.mock('./utils/request-info.ts', () => ({
  useRequestInfo: () => useRequestInfo(),
}));

vi.mock('./utils/theme.server.ts', () => ({ getTheme: vi.fn() }));

vi.mock('./utils/timing.server.ts', () => ({
  makeTimings: vi.fn(),
  time: vi.fn(),
}));

vi.mock('./utils/toast.server.ts', () => ({ getToast: vi.fn() }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

import AppWithProviders from './root.tsx';

const BASE_LOADER_DATA = {
  ENV: {},
  honeyProps: {},
  notifications: { unreadCount: 0 },
  requestInfo: { locale: 'en', userPrefs: { theme: 'light' } },
  toast: null,
  user: null,
};

const BASE_LOCATION = { hash: '', pathname: '/', search: '' };

const BASE_NAVIGATION = {
  location: undefined,
  state: 'idle',
};

function makePwaPrompt(overrides = {}) {
  return {
    capability: 'unavailable' as const,
    dismissBanner: vi.fn(),
    isPrompting: false,
    manualPlatform: null,
    promptInstall: vi.fn(),
    shouldShowBanner: false,
    ...overrides,
  };
}

function setupMocks(pwaOverrides = {}) {
  useLoaderData.mockReturnValue(BASE_LOADER_DATA);
  useLocation.mockReturnValue(BASE_LOCATION);
  useNavigation.mockReturnValue(BASE_NAVIGATION);
  useFetchers.mockReturnValue([]);
  useRequestInfo.mockReturnValue({
    requestId: 'req-1',
    userPrefs: { theme: 'light' },
  });
  useHints.mockReturnValue({ theme: 'light' });
  usePwaInstallPrompt.mockReturnValue(makePwaPrompt(pwaOverrides));
  useToast.mockReset();
  setPrefetchCacheScope.mockReset();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('root.tsx — PWA banner height CSS variable', () => {
  let observeMock: ReturnType<typeof vi.fn>;
  let disconnectMock: ReturnType<typeof vi.fn>;
  let resizeCallback: ResizeObserverCallback;

  beforeEach(() => {
    // React fires recoverable internal warnings during concurrent-mode
    // reconciliation in jsdom. Suppress to keep test output clean.
    testConsole.error.mockImplementation(() => {});

    observeMock = vi.fn();
    disconnectMock = vi.fn();

    vi.stubGlobal(
      'ResizeObserver',
      vi.fn((cb: ResizeObserverCallback) => {
        resizeCallback = cb;
        return { observe: observeMock, disconnect: disconnectMock };
      }),
    );

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 48,
      bottom: 48,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty('--pwa-banner-height');
  });

  it('resets --pwa-banner-height to 0px when the banner is not shown', () => {
    setupMocks({ shouldShowBanner: false });
    render(<AppWithProviders />);
    expect(
      document.documentElement.style.getPropertyValue('--pwa-banner-height'),
    ).toBe('0px');
  });

  it('sets --pwa-banner-height to the measured banner height when shown', () => {
    setupMocks({ capability: 'prompt', shouldShowBanner: true });

    render(<AppWithProviders />);

    expect(
      document.documentElement.style.getPropertyValue('--pwa-banner-height'),
    ).toBe('48px');
  });

  it('updates --pwa-banner-height when the banner resizes', () => {
    setupMocks({ capability: 'prompt', shouldShowBanner: true });

    render(<AppWithProviders />);

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 96,
      bottom: 96,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    act(() => {
      resizeCallback([], {} as ResizeObserver);
    });

    expect(
      document.documentElement.style.getPropertyValue('--pwa-banner-height'),
    ).toBe('96px');
  });

  it('resets --pwa-banner-height to 0px when banner is dismissed', () => {
    setupMocks({ capability: 'prompt', shouldShowBanner: true });

    const { rerender } = render(<AppWithProviders />);

    expect(
      document.documentElement.style.getPropertyValue('--pwa-banner-height'),
    ).toBe('48px');

    setupMocks({ shouldShowBanner: false });

    act(() => {
      rerender(<AppWithProviders />);
    });

    expect(
      document.documentElement.style.getPropertyValue('--pwa-banner-height'),
    ).toBe('0px');
  });
});
