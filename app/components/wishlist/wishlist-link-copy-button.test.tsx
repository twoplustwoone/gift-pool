/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WishlistLinkCopyButton } from './wishlist-link-copy-button';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual };
});

describe('WishlistLinkCopyButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders button with correct aria-label', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistLinkCopyButton
            username="jim"
            displayName="Jim"
            isPublicView={false}
          />
        ),
      },
    ]);
    render(<App />);
    expect(
      screen.getByRole('button', { name: /copy jim's wishlist link/i }),
    ).toBeInTheDocument();
  });

  it('calls clipboard.writeText with correct URL on click', async () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistLinkCopyButton
            username="jim"
            displayName="Jim"
            isPublicView={false}
            origin="https://example.com"
          />
        ),
      },
    ]);
    render(<App />);

    fireEvent.click(
      screen.getByRole('button', { name: /copy jim's wishlist link/i }),
    );
    // Flush the async clipboard promise so state updates settle.
    // onClick is async (awaits clipboard.writeText), so we need act to flush it.
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {});

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://example.com/users/jim/wishlist',
    );
  });

  it('shows "copied" state then resets after 2s', async () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistLinkCopyButton
            username="jim"
            displayName="Jim"
            isPublicView={false}
            origin="https://example.com"
          />
        ),
      },
    ]);
    render(<App />);

    fireEvent.click(
      screen.getByRole('button', { name: /copy jim's wishlist link/i }),
    );
    // Flush the async clipboard promise so state updates (setCopied) settle.
    // onClick is async (awaits clipboard.writeText), so we need act to flush it.
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {});

    expect(
      screen.getByRole('button', { name: /wishlist link copied/i }),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(
      screen.getByRole('button', { name: /copy jim's wishlist link/i }),
    ).toBeInTheDocument();
  });
});
