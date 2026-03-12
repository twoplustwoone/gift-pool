/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useIsDesktop } from './use-is-desktop';

type MockMediaQueryList = {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

function mockMatchMedia(matches: boolean): MockMediaQueryList {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mql: MockMediaQueryList = {
    matches,
    addEventListener: vi.fn((_event: string, cb: (e: { matches: boolean }) => void) => {
      listeners.add(cb);
    }),
    removeEventListener: vi.fn((_event: string, cb: (e: { matches: boolean }) => void) => {
      listeners.delete(cb);
    }),
  };
  // Expose listener trigger for tests
  (mql as any)._trigger = (newMatches: boolean) => {
    listeners.forEach((cb) => cb({ matches: newMatches }));
  };
  return mql;
}

describe('useIsDesktop', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: originalMatchMedia,
      writable: true,
    });
  });

  it('returns false when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: undefined,
      writable: true,
    });
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it('returns true when matchMedia matches', () => {
    const mql = mockMatchMedia(true);
    Object.defineProperty(window, 'matchMedia', {
      value: () => mql,
      writable: true,
    });
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it('returns false when matchMedia does not match', () => {
    const mql = mockMatchMedia(false);
    Object.defineProperty(window, 'matchMedia', {
      value: () => mql,
      writable: true,
    });
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it('updates when change event fires', () => {
    const mql = mockMatchMedia(false);
    Object.defineProperty(window, 'matchMedia', {
      value: () => mql,
      writable: true,
    });
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);

    act(() => {
      (mql as any)._trigger(true);
    });

    expect(result.current).toBe(true);
  });

  it('removes listener on unmount', () => {
    const mql = mockMatchMedia(true);
    Object.defineProperty(window, 'matchMedia', {
      value: () => mql,
      writable: true,
    });
    const { unmount } = renderHook(() => useIsDesktop());
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledOnce();
  });
});
