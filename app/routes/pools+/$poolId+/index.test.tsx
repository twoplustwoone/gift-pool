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

type UserImageFixture = { id: string; altText: string | null } | null;

const loaderDataSnapshot = {
  availableBudgetCents: 0,
  canManage: true,
  contributionBreakdown: null as
    | null
    | {
        kind: 'purchaser';
        breakdown: Array<{
          hasPaid: boolean;
          owedCents: number;
          user: {
            image: UserImageFixture;
            name: string | null;
            username: string;
          };
          userId: string;
        }>;
        finalPriceCents: number;
        purchaserId: string | null;
        shortfallCents: number;
      }
    | {
        kind: 'contributor';
        viewerShare: { owedCents: number; hasPaid: boolean } | null;
        shortfallCents: number;
        allReceived: boolean;
      },
  inviteUrl: 'https://giftpool.app/pools/join/invite-1' as string | null,
  isOrganizer: true,
  myVoteIdeaId: 'idea-1' as string | null,
  organizerReminderStates: {
    CONTRIBUTION: {
      kind: 'CONTRIBUTION',
      latestNudge: null,
      status: 'AVAILABLE',
    },
    VOTE: { kind: 'VOTE', latestNudge: null, status: 'AVAILABLE' },
  } as Record<string, unknown>,
  pool: {
    chosenIdeaId: null as string | null,
    contributors: [
      {
        hasSetLimit: null as boolean | null,
        joinedAt: '2026-01-01T00:00:00.000Z',
        user: {
          image: null as UserImageFixture,
          name: 'Taylor',
          username: 'taylor',
        },
        userId: 'viewer-1',
      },
      {
        hasSetLimit: null as boolean | null,
        joinedAt: '2026-01-02T00:00:00.000Z',
        user: {
          image: null as UserImageFixture,
          name: 'Jordan',
          username: 'jordan',
        },
        userId: 'buyer-1',
      },
      {
        hasSetLimit: null as boolean | null,
        joinedAt: '2026-01-03T00:00:00.000Z',
        user: {
          image: null as UserImageFixture,
          name: null,
          username: 'casey',
        },
        userId: 'deliverer-1',
      },
    ],
    decisionMode: 'VOTE',
    delivererId: 'deliverer-1' as string | null,
    deliverer: {
      id: 'deliverer-1',
      image: null,
      name: null,
      username: 'casey',
    },
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
        wishlistItem: {
          hasImage: false,
          id: 'wish-1',
          title: 'Headphones',
          updatedAt: null as string | null,
          url: null,
        },
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
    purchaser: {
      id: 'buyer-1',
      image: null,
      name: 'Jordan',
      username: 'jordan',
    },
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
  const actual =
    await vi.importActual<typeof import('react-router')>('react-router');

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
    loaderDataSnapshot.organizerReminderStates = {
      CONTRIBUTION: {
        kind: 'CONTRIBUTION',
        latestNudge: null,
        status: 'AVAILABLE',
      },
      VOTE: { kind: 'VOTE', latestNudge: null, status: 'AVAILABLE' },
    };
    loaderDataSnapshot.pool.chosenIdeaId = null;
    loaderDataSnapshot.pool.decisionMode = 'VOTE';
    loaderDataSnapshot.pool.delivererId = 'deliverer-1';
    loaderDataSnapshot.pool.finalPriceCents = null;
    loaderDataSnapshot.pool.purchaserId = 'buyer-1';
    loaderDataSnapshot.pool.status = 'VOTING';
    for (const contributor of loaderDataSnapshot.pool.contributors) {
      contributor.user.image = null;
    }
    loaderDataSnapshot.pool.ideas[0]!.wishlistItem = {
      hasImage: false,
      id: 'wish-1',
      title: 'Headphones',
      updatedAt: null,
      url: null,
    };
    loaderDataSnapshot.recipientWishlistItems = [];
    loaderDataSnapshot.viewer.userId = 'viewer-1';

    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: clipboardWriteText,
      },
    });
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  function renderRoute() {
    return render(
      <MemoryRouter initialEntries={['/pools/pool-1']}>
        <PoolIndex />
      </MemoryRouter>,
    );
  }

  it('renders the active voting UI and contribution editor', async () => {
    renderRoute();

    expect(screen.getByText('Organizer controls')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close vote' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remind voters' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remind contributors' }),
    ).toBeInTheDocument();
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
  });

  it('shows a gift-icon placeholder for ideas with no linked wishlist image', () => {
    renderRoute();

    // idea-1 is linked to a wishlist item but hasImage: false; idea-2 has no
    // linked wishlist item at all. Neither should render an <img>.
    const cards = screen.getAllByTestId('idea-card');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.querySelector('img')).not.toBeInTheDocument();
    }
  });

  it('renders the linked wishlist item image when one exists', () => {
    loaderDataSnapshot.pool.ideas[0]!.wishlistItem = {
      hasImage: true,
      id: 'wish-1',
      title: 'Headphones',
      updatedAt: '2026-02-01T00:00:00.000Z',
      url: null,
    };

    renderRoute();

    const [firstCard] = screen.getAllByTestId('idea-card');
    const img = firstCard!.querySelector('img');
    expect(img).toHaveAttribute(
      'src',
      `/resources/wishlist-images/wish-1?v=${new Date('2026-02-01T00:00:00.000Z').getTime()}`,
    );
  });

  it('moves invite tools and the danger zone off the main page (now on settings)', () => {
    renderRoute();
    // These live on /pools/:id/settings now, reached from the header gear.
    expect(
      screen.queryByRole('button', { name: /copy/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Danger zone')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete pool' }),
    ).not.toBeInTheDocument();
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
    expect(picker).toHaveTextContent('From their wishlist… (optional)');

    await userEvent.click(picker);
    await userEvent.click(
      await screen.findByRole('option', {
        name: 'Espresso machine — $249.99',
      }),
    );

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

  it('Buy stage shows the available-budget-vs-price comparison', () => {
    loaderDataSnapshot.pool.status = 'DECIDED';
    loaderDataSnapshot.pool.chosenIdeaId = 'idea-1';
    loaderDataSnapshot.pool.finalPriceCents = 10000;
    loaderDataSnapshot.availableBudgetCents = 7500;
    loaderDataSnapshot.viewer.userId = 'viewer-1';

    renderRoute();

    const card = screen.getByTestId('budget-vs-price');
    expect(card).toHaveTextContent('$75.00 of $100.00 gift price');
  });

  it('hides the budget comparison without a price or without any limits set', () => {
    loaderDataSnapshot.pool.status = 'DECIDED';
    loaderDataSnapshot.pool.chosenIdeaId = 'idea-1';
    loaderDataSnapshot.pool.finalPriceCents = null;
    loaderDataSnapshot.availableBudgetCents = 7500;

    const { unmount } = renderRoute();
    expect(screen.queryByTestId('budget-vs-price')).not.toBeInTheDocument();
    unmount();

    loaderDataSnapshot.pool.finalPriceCents = 10000;
    loaderDataSnapshot.availableBudgetCents = 0;
    renderRoute();
    expect(screen.queryByTestId('budget-vs-price')).not.toBeInTheDocument();
  });

  it('Complete stage: memory leads, history collapses, settled settlement hidden (§6.5)', () => {
    loaderDataSnapshot.pool.status = 'DELIVERED';
    loaderDataSnapshot.pool.chosenIdeaId = 'idea-1';
    loaderDataSnapshot.pool.finalPriceCents = 2500;
    loaderDataSnapshot.pool.purchaserId = 'buyer-1';
    loaderDataSnapshot.viewer.userId = 'viewer-1';
    loaderDataSnapshot.contributionBreakdown = {
      kind: 'contributor',
      viewerShare: { owedCents: 1200, hasPaid: true },
      shortfallCents: 0,
      allReceived: true,
    };

    renderRoute();

    // Factual memory leads.
    expect(screen.getByTestId('gift-memory-summary')).toBeInTheDocument();
    // Prior work is collapsed into history, not gone.
    expect(screen.getByTestId('pool-history')).toBeInTheDocument();
    expect(screen.getByText('How it came together')).toBeInTheDocument();
    // Settled settlement is inside history only (nothing operationally
    // pending), so the share card is not shown at the top level twice.
    expect(screen.getAllByTestId('viewer-share-card')).toHaveLength(1);
  });

  it('Complete stage keeps unsettled shares visible outside history', () => {
    loaderDataSnapshot.pool.status = 'DELIVERED';
    loaderDataSnapshot.pool.chosenIdeaId = 'idea-1';
    loaderDataSnapshot.pool.finalPriceCents = 2500;
    loaderDataSnapshot.pool.purchaserId = 'buyer-1';
    loaderDataSnapshot.viewer.userId = 'viewer-1';
    loaderDataSnapshot.contributionBreakdown = {
      kind: 'contributor',
      viewerShare: { owedCents: 1200, hasPaid: false },
      shortfallCents: 0,
      allReceived: false,
    };

    renderRoute();

    expect(screen.getByTestId('gift-memory-summary')).toBeInTheDocument();
    expect(screen.getByTestId('viewer-share-card')).toBeInTheDocument();
  });

  it('renders the decided purchaser UI with contribution breakdown and role assignment', () => {
    loaderDataSnapshot.pool.status = 'DECIDED';
    loaderDataSnapshot.pool.chosenIdeaId = 'idea-1';
    loaderDataSnapshot.pool.finalPriceCents = 2500;
    loaderDataSnapshot.pool.purchaserId = 'viewer-1';
    loaderDataSnapshot.viewer.userId = 'viewer-1';
    loaderDataSnapshot.contributionBreakdown = {
      kind: 'purchaser',
      breakdown: [
        {
          hasPaid: false,
          owedCents: 1200,
          user: { image: null, name: 'Taylor', username: 'taylor' },
          userId: 'viewer-1',
        },
        {
          hasPaid: true,
          owedCents: 1000,
          user: { image: null, name: 'Jordan', username: 'jordan' },
          userId: 'buyer-1',
        },
      ],
      finalPriceCents: 2500,
      purchaserId: 'viewer-1',
      shortfallCents: 300,
    };

    renderRoute();

    expect(screen.getByText('Chosen gift')).toBeInTheDocument();
    expect(screen.getByTestId('final-price-display')).toHaveTextContent(
      '$25.00',
    );
    expect(screen.getByTestId('final-price-input')).toHaveValue('25.00');
    expect(
      screen.getByRole('button', { name: 'I bought it' }),
    ).toBeInTheDocument();
    expect(screen.getByText('What everyone owes you')).toBeInTheDocument();
    expect(screen.getByText('You cover $3.00')).toBeInTheDocument();
    expect(screen.getAllByTestId('contribution-breakdown-row')).toHaveLength(2);
    expect(
      screen.getByText('Other ideas that were proposed'),
    ).toBeInTheDocument();
    expect(screen.getByText('Board game')).toBeInTheDocument();
    expect(screen.getByText('Assign roles')).toBeInTheDocument();
  });

  it('renders profile photos on every contributor avatar surface', () => {
    loaderDataSnapshot.pool.status = 'DECIDED';
    loaderDataSnapshot.pool.chosenIdeaId = 'idea-1';
    loaderDataSnapshot.pool.finalPriceCents = 2500;
    loaderDataSnapshot.pool.purchaserId = 'viewer-1';
    loaderDataSnapshot.viewer.userId = 'viewer-1';
    loaderDataSnapshot.pool.contributors[1]!.user.image = {
      id: 'jordan-image',
      altText: null,
    };
    loaderDataSnapshot.contributionBreakdown = {
      kind: 'purchaser',
      breakdown: [
        {
          hasPaid: true,
          owedCents: 1000,
          user: {
            image: { id: 'jordan-image', altText: null },
            name: 'Jordan',
            username: 'jordan',
          },
          userId: 'buyer-1',
        },
      ],
      finalPriceCents: 2500,
      purchaserId: 'viewer-1',
      shortfallCents: 0,
    };

    renderRoute();

    const jordanAvatars = screen.getAllByRole('img', { name: 'Jordan' });
    expect(jordanAvatars).toHaveLength(4);
    for (const avatar of jordanAvatars) {
      expect(avatar).toHaveAttribute(
        'src',
        '/resources/user-images/jordan-image?size=64',
      );
    }
  });

  it('renders the delivery CTA for the assigned deliverer', () => {
    loaderDataSnapshot.pool.status = 'PURCHASED';
    loaderDataSnapshot.pool.chosenIdeaId = 'idea-1';
    loaderDataSnapshot.pool.finalPriceCents = 2500;
    loaderDataSnapshot.viewer.userId = 'deliverer-1';
    loaderDataSnapshot.contributionBreakdown = {
      kind: 'contributor',
      viewerShare: { owedCents: 1200, hasPaid: false },
      shortfallCents: 0,
      allReceived: false,
    };

    renderRoute();

    expect(
      screen.getByRole('button', { name: 'Mark as delivered' }),
    ).toBeInTheDocument();
  });

  it('renders task-local buyer and delivery reminders only for managers who are not the assignee', () => {
    loaderDataSnapshot.pool.status = 'DECIDED';
    loaderDataSnapshot.pool.chosenIdeaId = 'idea-1';
    loaderDataSnapshot.pool.purchaserId = 'buyer-1';
    loaderDataSnapshot.viewer.userId = 'viewer-1';
    loaderDataSnapshot.organizerReminderStates = {
      PURCHASE: { kind: 'PURCHASE', latestNudge: null, status: 'AVAILABLE' },
    };

    const { unmount } = renderRoute();
    expect(screen.getByText('Waiting for the buyer')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remind buyer' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'I bought it' }),
    ).not.toBeInTheDocument();
    unmount();

    loaderDataSnapshot.pool.status = 'PURCHASED';
    loaderDataSnapshot.pool.delivererId = 'deliverer-1';
    loaderDataSnapshot.organizerReminderStates = {
      DELIVERY: { kind: 'DELIVERY', latestNudge: null, status: 'AVAILABLE' },
    };
    renderRoute();

    expect(screen.getByText('Waiting for delivery')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remind deliverer' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark as delivered' }),
    ).not.toBeInTheDocument();
  });
});
