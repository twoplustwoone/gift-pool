/**
 * @vitest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('#app/components/nav/top/top-nav', () => ({
  TopNav: () => <div data-testid="top-nav" />,
}));

import { TopBar } from './top-bar.tsx';

describe('<TopBar />', () => {
  let resizeCallback: ResizeObserverCallback;
  const observeMock = vi.fn();
  const disconnectMock = vi.fn();

  beforeEach(() => {
    observeMock.mockReset();
    disconnectMock.mockReset();

    vi.stubGlobal(
      'ResizeObserver',
      vi.fn((cb: ResizeObserverCallback) => {
        resizeCallback = cb;
        return { observe: observeMock, disconnect: disconnectMock };
      }),
    );

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 56,
      bottom: 56,
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
    document.documentElement.style.removeProperty('--top-bar-height');
  });

  test('renders the top nav', () => {
    render(<TopBar />);
    expect(screen.getByTestId('top-nav')).toBeInTheDocument();
  });

  test('is visible by default', () => {
    render(<TopBar />);
    const header = screen.getByTestId('top-bar');
    expect(header).not.toHaveClass('-translate-y-full');
    expect(header).not.toHaveClass('pointer-events-none');
    expect(header).not.toHaveClass('opacity-0');
  });

  test('applies hidden classes when hidden=true', () => {
    render(<TopBar hidden />);
    const header = screen.getByTestId('top-bar');
    expect(header).toHaveClass('-translate-y-full');
    expect(header).toHaveClass('pointer-events-none');
    expect(header).toHaveClass('opacity-0');
  });

  test('uses --pwa-banner-height CSS variable for top offset', () => {
    render(<TopBar />);
    const header = screen.getByTestId('top-bar');
    expect(header.style.top).toBe('var(--pwa-banner-height, 0px)');
  });

  test('sets --top-bar-height CSS variable after mount', () => {
    render(<TopBar />);
    expect(
      document.documentElement.style.getPropertyValue('--top-bar-height'),
    ).toBe('56px');
  });

  test('calls onHeightChange with measured height', () => {
    const onHeightChange = vi.fn();
    render(<TopBar onHeightChange={onHeightChange} />);
    expect(onHeightChange).toHaveBeenCalledWith(56);
  });

  test('updates --top-bar-height when ResizeObserver fires with new height', () => {
    render(<TopBar />);

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 72,
      bottom: 72,
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
      document.documentElement.style.getPropertyValue('--top-bar-height'),
    ).toBe('72px');
  });

  test('attaches ResizeObserver to the header element', () => {
    render(<TopBar />);
    expect(observeMock).toHaveBeenCalledTimes(1);
    expect(observeMock).toHaveBeenCalledWith(screen.getByTestId('top-bar'));
  });

  test('disconnects ResizeObserver on unmount', () => {
    const { unmount } = render(<TopBar />);
    unmount();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });
});
