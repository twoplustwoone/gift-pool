/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const clipboardWriteText = vi.fn();
const fetcherState = {
  data: undefined as undefined | { inviteUrl?: string },
  formData: undefined as FormData | undefined,
  state: 'idle' as 'idle' | 'loading' | 'submitting',
};

const loaderDataSnapshot = {
  canManage: true,
  contributionBreakdown: null as null | {
    breakdown: Array<{
      hasPaid: boolean;
      owedCents: number;
      user: { name: string | null; username: string };
      userId: string;
    }>;
    finalPriceCents: number;
    purchaserId: string | null;
    shortfallCents: number;
  },
  inviteUrl: 'https://giftpool.app/pools/join/invite-1' as string | null,
  isOrganizer: true,
  myVoteIdeaId: 'idea-1' as string | null,
  pool: {
    chosenIdeaId: null as string | null,
    contributors: [
      {
        contributionCents: 3000,
        hasPaid: false,
        joinedAt: '2026-01-01T00:00:00.000Z',
        user: { image: null, name: 'Taylor', username: 'taylor' },
        userId: 'viewer-1',
      },
      {
        contributionCents: 2000,
        hasPaid: true,
        joinedAt: '2026-01-02T00:00:00.000Z',
        user: { image: null, name: 'Jordan', username: 'jordan' },
        userId: 'buyer-1',
      },
      {
        contributionCents: 2000,
        hasPaid: false,
        joinedAt: '2026-01-03T00:00:00.000Z',
        user: { image: null, name: null, username: 'casey' },
        userId: 'deliverer-1',
      },
    ],
    decisionMode: 'VOTE',
    delivererId: 'deliverer-1' as string | null,
    finalPriceCents: null as number | null,
    id: 'pool-1',
    ideas: [
      {
        _count: { votes: 2 },
        createdAt: '2026-01-04T00:00:00.000Z',
        description: 'Noise cancelling, black finish',
        estimatedPriceCents: 1599,
        id: 'idea-1',
        name: 'Headphones',
        proposedBy: { id: 'viewer-1', name: 'Taylor', username: 'taylor' },
        proposedById: 'viewer-1',
        url: 'https://example.com/headphones',
        wishlistItem: { hasImage: false, id: 'wish-1', title: 'Headphones', url: null },
        wishlistItemId: 'wish-1',
      },
      {
        _count: { votes: 1 },
        createdAt: '2026-01-05T00:00:00.000Z',
        description: null,
        estimatedPriceCents: null,
        id: 'idea-2',
        name: 'Board game',
        proposedBy: { id: 'buyer-1', name: 'Jordan', username: 'jordan' },
        proposedById: 'buyer-1',
        url: null,
        wishlistItem: null,
        wishlistItemId: null,
      },
    ],
    occasionType: 'BIRTHDAY',
    organizerId: 'viewer-1',
    purchaserId: 'buyer-1' as string | null,
    recipientName: 'Alex',
    status: 'VOTING',
    title: 'Alex Birthday Pool',
  },
  recipientWishlistItems: [] as Array<{
    id: string;
    title: string;
    url: string | null;
    priceCents: number | null;
    currency: string | null;
  }>,
  viewer: {
    contributionCents: 3000,
    hasPaid: false,
    joinedAt: '2026-01-01T00:00:00.000Z',
    user: { image: null, name: 'Taylor', username: 'taylor' },
    userId: 'viewer-1',
  },
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>(
    'react-router',
  );

  return {
    ...actual,
    Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
    useFetcher: () => ({
      Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
      data: fetcherState.data,
      formData: fetcherState.formData,
      state: fetcherState.state,
      submit: vi.fn(),
    }),
    useNavigation: () => ({ state: 'idle' }),
    useRouteLoaderData: () => loaderDataSnapshot,
  };
});

import PoolIndex from './index.tsx';

describe('app/routes/pools+/$poolId+/index.tsx', () => {
  beforeEach(() => {
    clipboardWriteText.mockReset().mockResolvedValue(undefined);
    fetcherState.data = undefined;
    fetcherState.formData = undefined;
    fetcherState.state = 'idle';

    loaderDataSnapshot.canManage = true;
    loaderDataSnapshot.contributionBreakdown = null;
    loaderDataSnapshot.inviteUrl = 'https://giftpool.app/pools/join/invite-1';
    loaderDataSnapshot.isOrganizer = true;
    loaderDataSnapshot.myVoteIdeaId = 'idea-1';
    loaderDataSnapshot.pool.chosenIdeaId = null;
    loaderDataSnapshot.pool.decisionMode = 'VOTE';
    loaderDataSnapshot.pool.delivererId = 'deliverer-1';
    loaderDataSnapshot.pool.finalPriceCents = null;
    loaderDataSnapshot.pool.purchaserId = 'buyer-1';
    loaderDataSnapshot.pool.status = 'VOTING';
    loaderDataSnapshot.recipientWishlistItems = [];
    loaderDataSnapshot.viewer.userId = 'viewer-1';

    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: clipboardWriteText,
      },
    });
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  function renderRoute() {
    return render(
      <MemoryRouter initialEntries={['/pools/pool-1']}>
        <PoolIndex />
      </MemoryRouter>,
    );
  }

  it('renders the active voting UI, contribution editor, and invite tools', async () => {
    renderRoute();

    expect(screen.getByText('Organizer controls')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close vote' })).toBeInTheDocument();
    expect(screen.getByText('Voting open')).toBeInTheDocument();
    expect(screen.getAllByTestId('idea-card')).toHaveLength(2);
    expect(screen.getByText('≈ $15.99')).toBeInTheDocument();
    expect(screen.getByText('From wishlist')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view link/i })).toHaveAttribute(
      'href',
      '/out?idea=idea-1',
    );
    expect(screen.getByText('Propose an idea')).toBeInTheDocument();
    expect(screen.getByDisplayValue('30.00')).toBeInTheDocument();

    const input = screen.getByTestId('contribution-input');
    await userEvent.clear(input);
    await userEvent.type(input, '45');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(clipboardWriteText).toHaveBeenCalledWith(
      'https://giftpool.app/pools/join/invite-1',
    );

    expect(screen.getByText('Danger zone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel pool' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete pool' })).toBeInTheDocument();
  });

  it('prefills the propose form from a picked wishlist item', async () => {
    loaderDataSnapshot.recipientWishlistItems = [
      {
        id: 'wish-9',
        title: 'Espresso machine',
        url: 'https://shop.example.com/espresso',
        priceCents: 24999,
        currency: 'USD',
      },
    ];

    renderRoute();

    const picker = screen.getByTestId('wishlist-item-picker');
    expect(picker).toHaveTextContent('Espresso machine — $249.99');

    await userEvent.selectOptions(picker, 'wish-9');

    await screen.findByDisplayValue('Espresso machine');
    expect(
      screen.getByDisplayValue('https://shop.example.com/espresso'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('249.99')).toBeInTheDocument();
    expect(
      document.querySelector<HTMLInputElement>('input[name="wishlistItemId"]')
        ?.value,
    ).toBe('wish-9');
  });

  it('hides the wishlist picker when the recipient has no platform wishlist', () => {
    renderRoute();
    expect(
      screen.queryByTestId('wishlist-item-picker'),
    ).not.toBeInTheDocument();
  });

  it('renders the decided purchaser UI with contribution breakdown and role assignment', () => {
    loaderDataSnapshot.pool.status = 'DECIDED';
    loaderDataSnapshot.pool.chosenIdeaId = 'idea-1';
    loaderDataSnapshot.pool.finalPriceCents = 2500;
    loaderDataSnapshot.pool.purchaserId = 'viewer-1';
    loaderDataSnapshot.viewer.userId = 'viewer-1';
    loaderDataSnapshot.contributionBreakdown = {
      breakdown: [
        {
          hasPaid: false,
          owedCents: 1200,
          user: { name: 'Taylor', username: 'taylor' },
          userId: 'viewer-1',
        },
        {
          hasPaid: true,
          owedCents: 1000,
          user: { name: 'Jordan', username: 'jordan' },
          userId: 'buyer-1',
        },
      ],
      finalPriceCents: 2500,
      purchaserId: 'viewer-1',
      shortfallCents: 300,
    };

    renderRoute();

    expect(screen.getByText('Chosen gift')).toBeInTheDocument();
    expect(screen.getByTestId('final-price-display')).toHaveTextContent('$25.00');
    expect(screen.getByTestId('final-price-input')).toHaveValue('25.00');
    expect(screen.getByRole('button', { name: 'I bought it' })).toBeInTheDocument();
    expect(screen.getByText('What everyone owes the buyer')).toBeInTheDocument();
    expect(screen.getByText('Buyer covers $3.00')).toBeInTheDocument();
    expect(screen.getAllByTestId('contribution-breakdown-row')).toHaveLength(2);
    expect(screen.getByText('Other ideas that were proposed')).toBeInTheDocument();
    expect(screen.getByText('Board game')).toBeInTheDocument();
    expect(screen.getByText('Assign roles')).toBeInTheDocument();
  });

  it('renders the delivery CTA for the assigned deliverer', () => {
    loaderDataSnapshot.pool.status = 'PURCHASED';
    loaderDataSnapshot.pool.chosenIdeaId = 'idea-1';
    loaderDataSnapshot.pool.finalPriceCents = 2500;
    loaderDataSnapshot.viewer.userId = 'deliverer-1';
    loaderDataSnapshot.contributionBreakdown = {
      breakdown: [
        {
          hasPaid: false,
          owedCents: 1200,
          user: { name: null, username: 'casey' },
          userId: 'deliverer-1',
        },
      ],
      finalPriceCents: 2500,
      purchaserId: 'buyer-1',
      shortfallCents: 0,
    };

    renderRoute();

    expect(
      screen.getByRole('button', { name: 'Mark as delivered' }),
    ).toBeInTheDocument();
  });
});
