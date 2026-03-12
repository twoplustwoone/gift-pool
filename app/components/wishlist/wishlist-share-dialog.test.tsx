/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { WishlistShareDialog } from './wishlist-share-dialog';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useFetcher: () => ({
      Form: (props: any) => <form {...props} />,
      submit: vi.fn(),
      load: vi.fn(),
      state: 'idle',
      data: undefined,
    }),
  };
});

vi.mock('#app/components/toaster.tsx', () => ({
  useToast: () => {},
}));

vi.mock('#app/utils/request-info.ts', () => ({
  useOptionalRequestInfo: () => ({ origin: 'https://example.com' }),
}));

vi.mock('./hooks/use-is-desktop', () => ({
  useIsDesktop: () => true,
}));

describe('WishlistShareDialog', () => {
  it('renders share button', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistShareDialog
            username="jane"
            displayName="Jane"
            publicShare={null}
          />
        ),
      },
    ]);
    render(<App />);
    expect(
      screen.getByRole('button', { name: /share wishlist/i }),
    ).toBeInTheDocument();
  });

  it('opens dialog on click', async () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistShareDialog
            username="jane"
            displayName="Jane"
            publicShare={null}
          />
        ),
      },
    ]);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /share wishlist/i }));
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /share wishlist/i }),
      ).toBeInTheDocument();
    });
  });

  it('shows "Generate public link" button when no publicShare', async () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistShareDialog
            username="jane"
            displayName="Jane"
            publicShare={null}
          />
        ),
      },
    ]);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /share wishlist/i }));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /generate public link/i }),
      ).toBeInTheDocument();
    });
  });

  it('shows public link input when publicShare provided', async () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistShareDialog
            username="jane"
            displayName="Jane"
            publicShare={{ token: 'abc123', createdAt: new Date() }}
          />
        ),
      },
    ]);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /share wishlist/i }));
    await waitFor(() => {
      expect(
        screen.getByDisplayValue(/\/w\/public\/abc123/),
      ).toBeInTheDocument();
    });
  });

  it('shows revoke confirmation before revoking', async () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <WishlistShareDialog
            username="jane"
            displayName="Jane"
            publicShare={{ token: 'abc123', createdAt: new Date() }}
          />
        ),
      },
    ]);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /share wishlist/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /revoke$/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /revoke$/i }));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /revoke link/i }),
      ).toBeInTheDocument();
    });
  });
});
