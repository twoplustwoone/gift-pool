/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATIONS_REFRESH_EVENT } from '#app/utils/web-push.client.ts';

const revalidator = {
  revalidate: vi.fn(),
  state: 'idle' as 'idle' | 'loading',
};

vi.mock('react-router', () => ({
  useRevalidator: () => revalidator,
}));

import { useVisibilityRevalidation } from './use-visibility-revalidation.ts';

function Probe(props: { enabled?: boolean; intervalMs?: number }) {
  useVisibilityRevalidation(props);
  return null;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  revalidator.revalidate = vi.fn();
  revalidator.state = 'idle';
  setVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useVisibilityRevalidation', () => {
  it('revalidates on the interval while the tab is visible', () => {
    render(<Probe intervalMs={1000} />);
    vi.advanceTimersByTime(3000);
    expect(revalidator.revalidate).toHaveBeenCalledTimes(3);
  });

  it('stays quiet in a hidden tab, and catches up when it comes back', () => {
    setVisibility('hidden');
    render(<Probe intervalMs={1000} />);
    vi.advanceTimersByTime(3000);
    expect(revalidator.revalidate).not.toHaveBeenCalled();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(revalidator.revalidate).toHaveBeenCalledTimes(1);
  });

  it('never stacks a second revalidation on one already running', () => {
    revalidator.state = 'loading';
    render(<Probe intervalMs={1000} />);
    vi.advanceTimersByTime(3000);
    expect(revalidator.revalidate).not.toHaveBeenCalled();
  });

  it('refreshes immediately on focus and on an incoming push', () => {
    render(<Probe intervalMs={100000} />);
    window.dispatchEvent(new Event('focus'));
    expect(revalidator.revalidate).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT));
    expect(revalidator.revalidate).toHaveBeenCalledTimes(2);
  });

  it('does nothing at all when disabled, and detaches on unmount', () => {
    const { unmount } = render(<Probe enabled={false} intervalMs={1000} />);
    vi.advanceTimersByTime(3000);
    window.dispatchEvent(new Event('focus'));
    expect(revalidator.revalidate).not.toHaveBeenCalled();
    unmount();

    const mounted = render(<Probe intervalMs={1000} />);
    mounted.unmount();
    vi.advanceTimersByTime(3000);
    window.dispatchEvent(new Event('focus'));
    expect(revalidator.revalidate).not.toHaveBeenCalled();
  });
});
