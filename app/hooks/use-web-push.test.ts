/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWebPush } from './use-web-push.ts';

vi.mock('#app/utils/analytics.client.ts', () => ({ track: vi.fn() }));

const setUserAgent = (ua: string) => {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  // @ts-expect-error reset injected ENV between tests
  delete window.ENV;
  setUserAgent('node.js');
});

describe('useWebPush', () => {
  it('reports unsupported when the browser lacks push APIs', async () => {
    window.ENV = { VAPID_PUBLIC_KEY: 'pub' } as typeof window.ENV;
    // jsdom has no PushManager / serviceWorker by default.
    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.status).toBe('unsupported'));
  });

  it('reports unsupported when no VAPID key is configured server-side', async () => {
    window.ENV = {} as typeof window.ENV;
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'default' });
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: {},
      configurable: true,
    });

    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.status).toBe('unsupported'));
  });

  it('asks iOS users to install the PWA before enabling push', async () => {
    window.ENV = { VAPID_PUBLIC_KEY: 'pub' } as typeof window.ENV;
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'default' });
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: {},
      configurable: true,
    });
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
    );
    // Not standalone (default jsdom matchMedia returns matches: false).
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
    );

    const { result } = renderHook(() => useWebPush());
    await waitFor(() =>
      expect(result.current.status).toBe('ios-needs-install'),
    );
  });
});
