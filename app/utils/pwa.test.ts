/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectManualInstallPlatform, isIos, isStandalone } from './pwa.ts';

const setUserAgent = (ua: string) => {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  setUserAgent('node.js');
});

describe('pwa detection', () => {
  it('isStandalone reflects the display-mode media query', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true }),
    );
    expect(isStandalone()).toBe(true);
  });

  it('isIos detects iPhone user agents', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(isIos()).toBe(true);
    setUserAgent('Mozilla/5.0 (Macintosh) Chrome/120');
    expect(isIos()).toBe(false);
  });

  it('detectManualInstallPlatform identifies iOS Safari vs Chrome, null elsewhere', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));

    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1',
    );
    expect(detectManualInstallPlatform()).toBe('ios-safari');

    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120 Safari',
    );
    expect(detectManualInstallPlatform()).toBe('ios-chrome');

    setUserAgent('Mozilla/5.0 (Macintosh) Chrome/120 Safari/537');
    expect(detectManualInstallPlatform()).toBeNull();
  });

  it('returns null platform when already installed (standalone)', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    setUserAgent('Mozilla/5.0 (iPhone) Safari/604.1');
    expect(detectManualInstallPlatform()).toBeNull();
  });
});
