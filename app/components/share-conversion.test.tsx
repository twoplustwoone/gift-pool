/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useOptionalUser = vi.fn();
const track = vi.fn();

vi.mock('#app/utils/user.ts', () => ({
  useOptionalUser: () => useOptionalUser(),
}));

vi.mock('#app/utils/analytics.client.ts', () => ({
  track: (...args: unknown[]) => track(...args),
}));

import {
  ShareConversionBanner,
  ShareConversionCard,
} from './share-conversion.tsx';

describe('share conversion surfaces', () => {
  beforeEach(() => {
    useOptionalUser.mockReset();
    useOptionalUser.mockReturnValue(undefined);
    track.mockReset();
  });

  it('shows the banner with the owner name and a signup link carrying redirectTo', () => {
    render(
      <MemoryRouter>
        <ShareConversionBanner ownerName="Maria" />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/made this wishlist on GiftPool/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /create your own/i }),
    ).toHaveAttribute('href', '/signup?redirectTo=%2Fwishlist');
  });

  it('tracks a banner CTA click with its placement', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ShareConversionBanner ownerName="Maria" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /create your own/i }));

    expect(track).toHaveBeenCalledWith('share_cta_clicked', {
      placement: 'banner',
    });
  });

  it('shows the footer card with signup and login affordances', () => {
    render(
      <MemoryRouter>
        <ShareConversionCard />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/want one of these for yourself/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /get started/i })).toHaveAttribute(
      'href',
      '/signup?redirectTo=%2Fwishlist',
    );
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2Fwishlist',
    );
  });

  it('tracks a footer card CTA click with its placement', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ShareConversionCard />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /get started/i }));

    expect(track).toHaveBeenCalledWith('share_cta_clicked', {
      placement: 'footer_card',
    });
  });

  it('renders nothing for logged-in viewers', () => {
    useOptionalUser.mockReturnValue({ id: 'user-1', username: 'maria' });

    render(
      <MemoryRouter>
        <ShareConversionBanner ownerName="Maria" />
        <ShareConversionCard />
      </MemoryRouter>,
    );

    expect(
      screen.queryByText(/made this wishlist on GiftPool/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/want one of these for yourself/i),
    ).not.toBeInTheDocument();
  });
});
