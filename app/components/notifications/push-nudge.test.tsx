/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushNudge } from './push-nudge.tsx';

const track = vi.fn();
const subscribe = vi.fn().mockResolvedValue(true);
let status = 'default';

vi.mock('#app/utils/analytics.client.ts', () => ({
  track: (...args: unknown[]) => track(...args),
}));
vi.mock('#app/hooks/use-web-push.ts', () => ({
  useWebPush: () => ({ status, isBusy: false, subscribe }),
}));

beforeEach(() => {
  track.mockReset();
  subscribe.mockClear();
  status = 'default';
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('PushNudge', () => {
  it('renders the opt-in when push is available and not enabled', () => {
    render(<PushNudge />);
    expect(
      screen.getByRole('button', { name: /enable notifications/i }),
    ).toBeInTheDocument();
  });

  it('renders nothing when push is unsupported', () => {
    status = 'unsupported';
    const { container } = render(<PushNudge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing once dismissed', () => {
    window.localStorage.setItem('push-nudge-dismissed', 'true');
    const { container } = render(<PushNudge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('subscribes when accepting', () => {
    render(<PushNudge />);
    fireEvent.click(
      screen.getByRole('button', { name: /enable notifications/i }),
    );
    expect(subscribe).toHaveBeenCalled();
  });

  it('persists dismissal and tracks it on "Not now"', () => {
    render(<PushNudge />);
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    expect(window.localStorage.getItem('push-nudge-dismissed')).toBe('true');
    expect(track).toHaveBeenCalledWith('push_prompt_dismissed');
    expect(
      screen.queryByRole('button', { name: /enable notifications/i }),
    ).not.toBeInTheDocument();
  });
});
