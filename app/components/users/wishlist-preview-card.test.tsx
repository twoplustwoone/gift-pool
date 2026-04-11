/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { WishlistPreviewCard } from './wishlist-preview-card.tsx';

function renderCard(
  props: Partial<React.ComponentProps<typeof WishlistPreviewCard>> = {},
) {
  const defaultProps: React.ComponentProps<typeof WishlistPreviewCard> = {
    items: [],
    totalCount: 0,
    fullListTo: '/users/taylor/wishlist',
    ownerName: 'Taylor',
  };
  return render(
    <MemoryRouter>
      <WishlistPreviewCard {...defaultProps} {...props} />
    </MemoryRouter>,
  );
}

describe('<WishlistPreviewCard />', () => {
  it('renders an empty state when there are no items', () => {
    renderCard();
    expect(
      screen.getByText("Taylor hasn't added any items yet."),
    ).toBeInTheDocument();
  });

  it('renders item titles and link to the full wishlist', () => {
    renderCard({
      totalCount: 5,
      items: [
        {
          id: 'item-1',
          title: 'Cast iron skillet',
          url: 'https://example.com/skillet',
          hasImage: false,
          updatedAt: new Date('2026-04-10T00:00:00.000Z'),
        },
        {
          id: 'item-2',
          title: 'Vinyl record',
          url: null,
          hasImage: false,
          updatedAt: new Date('2026-04-09T00:00:00.000Z'),
        },
      ],
    });

    expect(screen.getByText('Cast iron skillet')).toBeInTheDocument();
    expect(screen.getByText('Vinyl record')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /see all/i }),
    ).toHaveAttribute('href', '/users/taylor/wishlist');
  });

  it('shows the host extracted from the item url', () => {
    renderCard({
      totalCount: 1,
      items: [
        {
          id: 'item-1',
          title: 'Speaker',
          url: 'https://www.sony.com/audio/speakers',
          hasImage: false,
          updatedAt: new Date('2026-04-10T00:00:00.000Z'),
        },
      ],
    });
    expect(screen.getByText('sony.com')).toBeInTheDocument();
  });

  it('shows the total count in the header when populated', () => {
    renderCard({
      totalCount: 3,
      items: [
        {
          id: 'item-1',
          title: 'Thing',
          url: null,
          hasImage: false,
          updatedAt: new Date('2026-04-10T00:00:00.000Z'),
        },
      ],
    });
    expect(screen.getByText('· 3 items')).toBeInTheDocument();
  });
});
