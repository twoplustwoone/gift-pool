/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from './w.public.$token.tsx';

function renderAtRoute(loader: () => never) {
  const Stub = createRoutesStub([
    {
      path: '/w/public/:token',
      loader,
      Component: () => null,
      ErrorBoundary,
    },
  ]);
  return render(<Stub initialEntries={['/w/public/abc123']} />);
}

describe('public wishlist route error boundary', () => {
  it('renders a not-found fallback when the share link is missing or revoked', async () => {
    renderAtRoute(() => {
      throw new Response(null, { status: 404 });
    });

    expect(
      await screen.findByRole('heading', {
        name: 'Public wishlist link not found or revoked',
      }),
    ).toBeInTheDocument();
  });

  it('renders a rate-limit fallback on 429', async () => {
    renderAtRoute(() => {
      throw new Response(null, { status: 429 });
    });

    expect(
      await screen.findByRole('heading', { name: 'Too many requests' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Please try again soon.')).toBeInTheDocument();
  });
});
