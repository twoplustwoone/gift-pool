/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const track = vi.hoisted(() => vi.fn());

vi.mock('./analytics.client.ts', () => ({ track }));

import {
  classifyBrowser,
  classifyDeviceType,
  classifyOperatingSystem,
  collectClientEnvironment,
  getViewportBucket,
  trackClientEnvironmentOncePerDay,
  trackPwaLifecycleEvent,
} from './client-environment.ts';

const setUserAgent = (ua: string) => {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
};

const setMaxTouchPoints = (maxTouchPoints: number) => {
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    value: maxTouchPoints,
    configurable: true,
  });
};

const setMatchMedia = (matchedMode: string | null) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches:
        matchedMode === null
          ? false
          : query === `(display-mode: ${matchedMode})`,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
};

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    configurable: true,
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  setUserAgent('node.js');
  setMaxTouchPoints(0);
  Reflect.deleteProperty(window.navigator, 'serviceWorker');
});

beforeEach(() => {
  track.mockReset().mockReturnValue('event-id');
  setMatchMedia(null);
  setViewportWidth(1024);
});

describe('client environment classification', () => {
  it('normalizes common browser families and major versions', () => {
    expect(classifyBrowser('Mozilla/5.0 Edg/120.0')).toEqual({
      browserFamily: 'Edge',
      browserMajor: 120,
    });
    expect(classifyBrowser('Mozilla/5.0 Firefox/121.0')).toEqual({
      browserFamily: 'Firefox',
      browserMajor: 121,
    });
    expect(
      classifyBrowser('Mozilla/5.0 Version/17.0 Mobile Safari/604.1'),
    ).toEqual({
      browserFamily: 'Safari',
      browserMajor: 17,
    });
  });

  it('classifies operating systems, devices, and viewport buckets', () => {
    const ipadDesktopUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)';

    expect(classifyOperatingSystem(ipadDesktopUa, 5)).toBe('iOS');
    expect(classifyDeviceType(ipadDesktopUa, 5)).toBe('tablet');
    expect(classifyOperatingSystem('Mozilla/5.0 (Windows NT 10.0)', 0)).toBe(
      'Windows',
    );
    expect(
      classifyDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 0),
    ).toBe('mobile');
    expect(getViewportBucket(390)).toBe('mobile');
    expect(getViewportBucket(800)).toBe('tablet');
    expect(getViewportBucket(1280)).toBe('desktop');
  });

  it('collects a normalized snapshot without raw user-agent data', () => {
    const now = new Date('2026-06-29T12:00:00.000Z');
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120.0 Mobile Safari/604.1',
    );
    setViewportWidth(390);
    setMatchMedia('standalone');
    vi.stubGlobal('Notification', { permission: 'denied' });
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: {},
      configurable: true,
    });

    const snapshot = collectClientEnvironment(now);

    expect(snapshot).toEqual({
      browserFamily: 'Chrome',
      browserMajor: 120,
      osFamily: 'iOS',
      deviceType: 'mobile',
      viewportBucket: 'mobile',
      displayMode: 'standalone',
      isStandalone: true,
      serviceWorkerSupported: true,
      notificationPermission: 'denied',
      observedAt: '2026-06-29T12:00:00.000Z',
    });
    expect(snapshot).not.toHaveProperty('userAgent');
  });
});

describe('client environment tracking', () => {
  it('posts one normalized environment observation per day', async () => {
    const now = new Date('2026-06-29T12:00:00.000Z');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    setUserAgent('Mozilla/5.0 (Macintosh) Chrome/120.0 Safari/537.36');

    await trackClientEnvironmentOncePerDay(now);
    await trackClientEnvironmentOncePerDay(now);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/analytics',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as {
      name: string;
      properties: Record<string, unknown>;
    };
    expect(body.name).toBe('client_environment_observed');
    expect(body.properties.browserFamily).toBe('Chrome');
    expect(body.properties).not.toHaveProperty('userAgent');
  });

  it('dedupes PWA lifecycle events per event name per day', () => {
    const now = new Date('2026-06-29T12:00:00.000Z');

    const first = trackPwaLifecycleEvent(
      'pwa_prompt_available',
      undefined,
      now,
    );
    const second = trackPwaLifecycleEvent(
      'pwa_prompt_available',
      undefined,
      now,
    );

    expect(first).toBe('event-id');
    expect(second).toBeNull();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('pwa_prompt_available', undefined);
  });

  it('tracks a standalone launch before posting the daily snapshot', async () => {
    const now = new Date('2026-06-29T12:00:00.000Z');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    setMatchMedia('standalone');
    setUserAgent('Mozilla/5.0 (Macintosh) Chrome/120.0 Safari/537.36');

    await trackClientEnvironmentOncePerDay(now);

    expect(track).toHaveBeenCalledWith('pwa_launched_standalone', {
      displayMode: 'standalone',
    });
  });
});
