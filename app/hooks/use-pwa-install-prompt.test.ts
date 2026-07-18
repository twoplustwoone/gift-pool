/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testConsole } from '#tests/setup/setup-test-env.ts';

const trackPwaLifecycleEvent = vi.hoisted(() => vi.fn());

vi.mock('#app/utils/client-environment.ts', () => ({
  trackPwaLifecycleEvent,
}));

import { usePwaInstallPrompt } from './use-pwa-install-prompt.ts';

const setUserAgent = (ua: string) => {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
};

const makeBeforeInstallPromptEvent = (
  outcome: 'accepted' | 'dismissed' = 'accepted',
) => {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{
      outcome: 'accepted' | 'dismissed';
      platform: string;
    }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome, platform: 'web' });
  return event;
};

beforeEach(() => {
  window.localStorage.clear();
  trackPwaLifecycleEvent.mockReset();
  setUserAgent('Mozilla/5.0 (Macintosh) Chrome/120 Safari/537.36');
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  setUserAgent('node.js');
});

describe('usePwaInstallPrompt analytics', () => {
  it('reports unsupported browsers without exposing an install action', async () => {
    const { result } = renderHook(() => usePwaInstallPrompt());

    await waitFor(() => expect(result.current.capability).toBe('unsupported'));
    expect(result.current.isInstalled).toBe(false);
    expect(result.current.manualPlatform).toBeNull();
  });

  it('reports manual installation for iOS Safari', async () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    );
    const { result } = renderHook(() => usePwaInstallPrompt());

    await waitFor(() => expect(result.current.capability).toBe('manual'));
    expect(result.current.manualPlatform).toBe('ios-safari');
  });

  it('suppresses installation when already running standalone', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(display-mode: standalone)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const { result } = renderHook(() => usePwaInstallPrompt());

    await waitFor(() => expect(result.current.isInstalled).toBe(true));
    expect(result.current.capability).toBe('unsupported');
  });

  it('tracks when the browser install prompt becomes available', async () => {
    const { result } = renderHook(() => usePwaInstallPrompt());
    const event = makeBeforeInstallPromptEvent();

    act(() => {
      window.dispatchEvent(event);
    });

    await waitFor(() => expect(result.current.capability).toBe('prompt'));
    expect(trackPwaLifecycleEvent).toHaveBeenCalledWith('pwa_prompt_available');
  });

  it('tracks accepted install prompt outcomes', async () => {
    const { result } = renderHook(() => usePwaInstallPrompt());
    const event = makeBeforeInstallPromptEvent('accepted');

    act(() => {
      window.dispatchEvent(event);
    });
    await waitFor(() => expect(result.current.capability).toBe('prompt'));

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBe('accepted');
    expect(event.prompt).toHaveBeenCalled();
    expect(trackPwaLifecycleEvent).toHaveBeenCalledWith('pwa_install_clicked');
    expect(trackPwaLifecycleEvent).toHaveBeenCalledWith('pwa_install_accepted');
  });

  it('tracks dismissed install prompt outcomes', async () => {
    const { result } = renderHook(() => usePwaInstallPrompt());
    const event = makeBeforeInstallPromptEvent('dismissed');

    act(() => {
      window.dispatchEvent(event);
    });
    await waitFor(() => expect(result.current.capability).toBe('prompt'));

    await act(async () => {
      await result.current.promptInstall();
    });

    expect(trackPwaLifecycleEvent).toHaveBeenCalledWith(
      'pwa_install_dismissed',
    );
  });

  it('returns unavailable when no native prompt is active', async () => {
    const { result } = renderHook(() => usePwaInstallPrompt());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBe('unavailable');
  });

  it('contains native prompt failures', async () => {
    testConsole.error.mockImplementation(() => {});
    const { result } = renderHook(() => usePwaInstallPrompt());
    const event = makeBeforeInstallPromptEvent();
    event.prompt.mockRejectedValue(new Error('prompt failed'));

    act(() => {
      window.dispatchEvent(event);
    });
    await waitFor(() => expect(result.current.capability).toBe('prompt'));

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBe('error');
    expect(result.current.capability).toBe('unsupported');
  });

  it('tracks appinstalled events', async () => {
    const { result } = renderHook(() => usePwaInstallPrompt());
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(display-mode: standalone)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(trackPwaLifecycleEvent).toHaveBeenCalledWith('pwa_appinstalled');
    await waitFor(() => expect(result.current.isInstalled).toBe(true));
  });
});
