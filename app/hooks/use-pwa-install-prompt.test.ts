/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('tracks appinstalled events', () => {
    renderHook(() => usePwaInstallPrompt());

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(trackPwaLifecycleEvent).toHaveBeenCalledWith('pwa_appinstalled');
  });
});
