/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
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

  describe('on a supported desktop browser', () => {
    let getSubscription: ReturnType<typeof vi.fn>;
    let subscribeFn: ReturnType<typeof vi.fn>;
    let registerFn: ReturnType<typeof vi.fn>;
    let requestPermission: ReturnType<typeof vi.fn>;
    let fetchMock: ReturnType<typeof vi.fn>;
    const fakeSubscription = {
      endpoint: 'https://push.example/abc',
      toJSON: () => ({
        endpoint: 'https://push.example/abc',
        keys: { p256dh: 'p', auth: 'a' },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    };

    const setup = (permission: NotificationPermission) => {
      window.ENV = { VAPID_PUBLIC_KEY: 'pub' } as typeof window.ENV;
      setUserAgent('Mozilla/5.0 (Macintosh) Chrome/120 Safari/537');
      getSubscription = vi.fn().mockResolvedValue(null);
      subscribeFn = vi.fn().mockResolvedValue(fakeSubscription);
      const registration = {
        pushManager: { getSubscription, subscribe: subscribeFn },
      };
      registerFn = vi.fn().mockResolvedValue(registration);
      // Initial Notification.permission is `permission`; the prompt result
      // defaults to granted and is overridden per test where needed.
      requestPermission = vi.fn().mockResolvedValue('granted');
      vi.stubGlobal('PushManager', class {});
      vi.stubGlobal('Notification', { permission, requestPermission });
      Object.defineProperty(window.navigator, 'serviceWorker', {
        value: {
          register: registerFn,
          ready: Promise.resolve(registration),
          addEventListener: vi.fn(),
        },
        configurable: true,
      });
      fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
    };

    const lastFetchBody = (): {
      enableAll?: boolean;
      subscription?: { endpoint: string };
      endpoint?: string;
    } => {
      const init = fetchMock.mock.calls.at(-1)?.[1] as { body: string };
      return JSON.parse(init.body) as {
        enableAll?: boolean;
        subscription?: { endpoint: string };
        endpoint?: string;
      };
    };

    it('starts in default state and subscribes with enableAll on opt-in', async () => {
      setup('default');
      const { result } = renderHook(() => useWebPush());
      await waitFor(() => expect(result.current.status).toBe('default'));

      let outcome: boolean | undefined;
      await act(async () => {
        outcome = await result.current.subscribe();
      });

      expect(outcome).toBe(true);
      expect(requestPermission).toHaveBeenCalled();
      expect(registerFn).toHaveBeenCalledWith('/sw.js');
      const body = lastFetchBody();
      expect(body.enableAll).toBe(true);
      expect(body.subscription?.endpoint).toBe('https://push.example/abc');
      expect(result.current.status).toBe('subscribed');
    });

    it('records denied permission and does not subscribe', async () => {
      setup('default');
      requestPermission.mockResolvedValue('denied');
      const { result } = renderHook(() => useWebPush());
      await waitFor(() => expect(result.current.status).toBe('default'));

      await act(async () => {
        await result.current.subscribe();
      });

      expect(subscribeFn).not.toHaveBeenCalled();
      expect(result.current.status).toBe('denied');
    });

    it('re-registers an already-present subscription without enableAll', async () => {
      setup('granted');
      getSubscription.mockResolvedValue(fakeSubscription);
      const { result } = renderHook(() => useWebPush());
      await waitFor(() => expect(result.current.status).toBe('subscribed'));

      const body = lastFetchBody();
      expect(body.subscription?.endpoint).toBe('https://push.example/abc');
      expect(body.enableAll).toBeUndefined();
    });

    it('unsubscribes: posts to the server, unsubscribes the browser, returns to default', async () => {
      setup('granted');
      getSubscription.mockResolvedValue(fakeSubscription);
      const { result } = renderHook(() => useWebPush());
      await waitFor(() => expect(result.current.status).toBe('subscribed'));

      let outcome: boolean | undefined;
      await act(async () => {
        outcome = await result.current.unsubscribe();
      });

      expect(outcome).toBe(true);
      expect(fakeSubscription.unsubscribe).toHaveBeenCalled();
      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/push/unsubscribe');
      expect(lastFetchBody()).toEqual({
        endpoint: 'https://push.example/abc',
      });
      expect(result.current.status).toBe('default');
    });
  });
});
