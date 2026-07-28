/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ClaimDisclosure } from '#app/utils/wishlist-claim-disclosure.ts';

const clipboardWriteText = vi.fn();
const fetcherSubmit = vi.fn();
const toastSuccess = vi.fn();
const toastWarning = vi.fn();
const fetcherState = {
  data: undefined as
    | undefined
    | {
        inviteUrl?: string;
        claimedItemId?: string | null;
        conflictedItemId?: string | null;
      },
  formData: undefined as FormData | undefined,
  state: 'idle' as 'idle' | 'loading' | 'submitting',
};

vi.mock('sonner', () => ({
  toast: {
    success: (...args: Array<unknown>) => toastSuccess(...args),
    warning: (...args: Array<unknown>) => toastWarning(...args),
  },
}));

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
  ideaClaimConflicts: [] as Array<[string, ClaimDisclosure]>,
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
    claimDisclosure: ClaimDisclosure | null;
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
      submit: fetcherSubmit,
    }),
    useNavigation: () => ({ state: 'idle' }),
    useRouteLoaderData: () => loaderDataSnapshot,
  };
});

import PoolIndex from './index.tsx';

describe('app/routes/pools+/$poolId+/index.tsx', () => {
  beforeEach(() => {
    clipboardWriteText.mockReset().mockResolvedValue(undefined);
    fetcherSubmit.mockReset();
    toastSuccess.mockReset();
    toastWarning.mockReset();
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
    loaderDataSnapshot.ideaClaimConflicts = [];
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
    // Routed through the pool-authorized image resource (keyed by idea.id),
    // not /resources/wishlist-images/:wishlistItemId — see
    // pool-idea-images.$ideaId.tsx for why.
    expect(img).toHaveAttribute(
      'src',
      `/resources/pool-idea-images/idea-1?v=${new Date('2026-02-01T00:00:00.000Z').getTime()}`,
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
        claimDisclosure: null,
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

  it('renders the conflict badge instead of the "From wishlist" pill when a conflict exists', () => {
    loaderDataSnapshot.ideaClaimConflicts = [
      [
        'idea-1',
        {
          show: true,
          tone: 'warning',
          text: 'Another group is getting this',
          name: null,
          poolLink: null,
          canJoinPool: false,
        },
      ],
    ];

    renderRoute();

    expect(
      screen.getByText('Another group is getting this'),
    ).toBeInTheDocument();
    expect(screen.queryByText('From wishlist')).not.toBeInTheDocument();
  });

  it('renders the unmodified "From wishlist" pill when there is no conflict', () => {
    loaderDataSnapshot.ideaClaimConflicts = [];

    renderRoute();

    expect(screen.getByText('From wishlist')).toBeInTheDocument();
    expect(
      screen.queryByText('Another group is getting this'),
    ).not.toBeInTheDocument();
  });

  it('shows the conflict on the chosen gift for a decided pool that does not hold the claim — from loader data, not a toast', () => {
    // No fetcher submission happened in this render at all (fetcherState.data
    // stays undefined) — the viewer is someone who reloaded the page or never
    // submitted the decision themselves, so the toast effect never fires.
    // The only way this warning can reach them is loader-driven.
    loaderDataSnapshot.pool.status = 'DECIDED';
    loaderDataSnapshot.pool.chosenIdeaId = 'idea-1';
    loaderDataSnapshot.pool.purchaserId = 'buyer-1';
    loaderDataSnapshot.viewer.userId = 'deliverer-1';
    loaderDataSnapshot.ideaClaimConflicts = [
      [
        'idea-1',
        {
          show: true,
          tone: 'warning',
          text: 'Already claimed',
          name: null,
          poolLink: null,
          canJoinPool: false,
        },
      ],
    ];

    renderRoute();

    expect(toastWarning).not.toHaveBeenCalled();
    const conflict = screen.getByTestId('chosen-gift-conflict');
    expect(conflict).toHaveTextContent('Already claimed');
    // Honest about today's behavior: it must never promise the claimant will
    // be contacted — there is no notification or keep/release flow yet.
    expect(conflict.textContent?.toLowerCase()).not.toContain('contact');
    expect(conflict.textContent?.toLowerCase()).not.toContain('notif');
    // Pre-purchase, "check before buying" is still actionable advice.
    expect(conflict.textContent?.toLowerCase()).toContain('before buying');
  });

  it('keeps the chosen-gift conflict visible once PURCHASED, without instructing to check before buying', () => {
    // A returning contributor (or a different assigned deliverer) still
    // needs to know this pool never held the claim — but by PURCHASED the
    // purchase has already happened, so "check before buying" would be
    // stale, already-too-late advice.
    loaderDataSnapshot.pool.status = 'PURCHASED';
    loaderDataSnapshot.pool.chosenIdeaId = 'idea-1';
    loaderDataSnapshot.pool.purchaserId = 'buyer-1';
    loaderDataSnapshot.viewer.userId = 'deliverer-1';
    loaderDataSnapshot.ideaClaimConflicts = [
      [
        'idea-1',
        {
          show: true,
          tone: 'warning',
          text: 'Already claimed',
          name: null,
          poolLink: null,
          canJoinPool: false,
        },
      ],
    ];

    renderRoute();

    const conflict = screen.getByTestId('chosen-gift-conflict');
    expect(conflict).toHaveTextContent('Already claimed');
    expect(conflict.textContent?.toLowerCase()).not.toContain(
      'before buying',
    );
    // Still communicates the actual risk, just without the stale action.
    expect(conflict.textContent?.toLowerCase()).toContain(
      'duplicate purchase',
    );
  });

  it('shows no conflict on the chosen gift when the pool holds its own claim', () => {
    loaderDataSnapshot.pool.status = 'DECIDED';
    loaderDataSnapshot.pool.chosenIdeaId = 'idea-1';
    loaderDataSnapshot.pool.purchaserId = 'buyer-1';
    // A chosen idea absent from ideaClaimConflicts means this pool holds the
    // claim (loadIdeaClaimConflicts excludes exactly that case) — the normal,
    // non-conflicted state, which must render nothing.
    loaderDataSnapshot.ideaClaimConflicts = [];

    renderRoute();

    expect(
      screen.queryByTestId('chosen-gift-conflict'),
    ).not.toBeInTheDocument();
  });

  it('marks a claimed picker item as such, keeps it selectable, and discloses no name/pool/link', async () => {
    loaderDataSnapshot.recipientWishlistItems = [
      {
        id: 'wish-9',
        title: 'Espresso machine',
        url: 'https://shop.example.com/espresso',
        priceCents: 24999,
        currency: 'USD',
        claimDisclosure: {
          show: true,
          tone: 'warning',
          text: 'Already claimed',
          name: null,
          poolLink: null,
          canJoinPool: false,
        },
      },
    ];

    renderRoute();

    const picker = screen.getByTestId('wishlist-item-picker');
    await userEvent.click(picker);
    await screen.findAllByRole('option');
    const option = screen
      .getAllByRole('option')
      .find((el) => el.textContent?.includes('Espresso machine'));
    expect(option).toBeDefined();
    expect(option).toHaveTextContent('Already claimed');
    if (!option) throw new Error('option not found');
    // Selectable, not disabled — conflicts advise, never block.
    expect(option).not.toHaveAttribute('aria-disabled', 'true');
    expect(option).not.toHaveAttribute('data-disabled');

    await userEvent.click(option);
    expect(
      document.querySelector<HTMLInputElement>('input[name="wishlistItemId"]')
        ?.value,
    ).toBe('wish-9');

    // Negative containment: the picker must never name a person, pool, or
    // group, and must never carry a link — it's a compose-time list.
    expect(option).not.toHaveTextContent(/pool/i);
    expect(option.querySelector('a')).not.toBeInTheDocument();
  });

  describe('conflicted-decision confirmation', () => {
    it('opens a confirmation dialog instead of submitting when the idea has a claim conflict', async () => {
      loaderDataSnapshot.ideaClaimConflicts = [
        [
          'idea-1',
          {
            show: true,
            tone: 'warning',
            text: 'Claimed by Sarah',
            name: 'Sarah',
            poolLink: null,
            canJoinPool: false,
          },
        ],
      ];

      renderRoute();

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      const [chooseButton] = screen.getAllByRole('button', {
        name: 'Choose',
      });
      await userEvent.click(chooseButton!);

      expect(
        await screen.findByRole('dialog', {
          name: "Sarah's already getting this one",
        }),
      ).toBeVisible();
      // A single click never submits when the idea is conflicted.
      expect(fetcherSubmit).not.toHaveBeenCalled();
    });

    it('submits immediately with no dialog for an unconflicted idea', async () => {
      loaderDataSnapshot.ideaClaimConflicts = [];

      renderRoute();

      const [chooseButton] = screen.getAllByRole('button', {
        name: 'Choose',
      });
      // Unconflicted ideas render as a plain submit button inside a form —
      // a single click submits natively, with no JS gate and no dialog
      // anywhere in the tree. (jsdom doesn't implement real form
      // submission, so this is asserted structurally rather than by
      // clicking — clicking would just hit jsdom's unimplemented
      // requestSubmit, not exercise anything this feature owns.)
      expect(chooseButton).toHaveAttribute('type', 'submit');
      expect(chooseButton!.closest('form')).not.toBeNull();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('confirming proceeds with the decision', async () => {
      loaderDataSnapshot.ideaClaimConflicts = [
        [
          'idea-1',
          {
            show: true,
            tone: 'warning',
            text: 'Claimed by Sarah',
            name: 'Sarah',
            poolLink: null,
            canJoinPool: false,
          },
        ],
      ];

      renderRoute();

      const [chooseButton] = screen.getAllByRole('button', {
        name: 'Choose',
      });
      await userEvent.click(chooseButton!);
      await userEvent.click(
        await screen.findByRole('button', { name: 'Choose it anyway' }),
      );

      expect(fetcherSubmit).toHaveBeenCalledTimes(1);
      const [submittedFormData] = fetcherSubmit.mock.calls[0] as [FormData];
      expect(submittedFormData.get('intent')).toBe('choose-idea');
      expect(submittedFormData.get('poolId')).toBe('pool-1');
      expect(submittedFormData.get('ideaId')).toBe('idea-1');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('dismissing does not submit', async () => {
      loaderDataSnapshot.ideaClaimConflicts = [
        [
          'idea-1',
          {
            show: true,
            tone: 'warning',
            text: 'Claimed by Sarah',
            name: 'Sarah',
            poolLink: null,
            canJoinPool: false,
          },
        ],
      ];

      renderRoute();

      const [chooseButton] = screen.getAllByRole('button', {
        name: 'Choose',
      });
      await userEvent.click(chooseButton!);
      await userEvent.click(
        await screen.findByRole('button', { name: 'Keep looking' }),
      );

      expect(fetcherSubmit).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('carries no attribution when the disclosure withheld a name, and never describes a pool holder as a person', async () => {
      loaderDataSnapshot.ideaClaimConflicts = [
        [
          'idea-1',
          {
            show: true,
            tone: 'warning',
            text: 'Another group is getting this',
            name: null,
            poolLink: null,
            canJoinPool: false,
          },
        ],
      ];

      renderRoute();

      const [chooseButton] = screen.getAllByRole('button', {
        name: 'Choose',
      });
      await userEvent.click(chooseButton!);

      const dialog = await screen.findByRole('dialog', {
        name: "This one's already claimed",
      });
      expect(dialog).toBeVisible();
      // Leads with the ladder's own wording for this tier — a pool holder,
      // not a person.
      expect(dialog).toHaveTextContent('Another group is getting this');
      // Never reconstruct attribution the disclosure withheld.
      expect(dialog).not.toHaveTextContent(/sarah/i);
      const dialogText = dialog.textContent?.toLowerCase() ?? '';
      // Never rewrite a pool holder into a person, and never misattribute
      // the wishlist — it belongs to the pool's recipient, not the holder.
      expect(dialogText).not.toContain('someone');
      expect(dialogText).not.toContain('on their wishlist');
    });

    it('names the claimer for a solo conflict without misattributing whose wishlist it is', async () => {
      loaderDataSnapshot.ideaClaimConflicts = [
        [
          'idea-1',
          {
            show: true,
            tone: 'warning',
            text: 'Claimed by Sarah',
            name: 'Sarah',
            poolLink: null,
            canJoinPool: false,
          },
        ],
      ];

      renderRoute();

      const [chooseButton] = screen.getAllByRole('button', {
        name: 'Choose',
      });
      await userEvent.click(chooseButton!);

      const dialog = await screen.findByRole('dialog', {
        name: "Sarah's already getting this one",
      });
      expect(dialog).toBeVisible();
      expect(dialog).toHaveTextContent('Claimed by Sarah');
      // The wishlist belongs to the pool's recipient, not to Sarah — never
      // imply otherwise.
      expect(dialog.textContent?.toLowerCase()).not.toContain(
        'on their wishlist',
      );
    });

    it('toasts once a decision actually claims a previously-free wishlist item', () => {
      loaderDataSnapshot.ideaClaimConflicts = [];
      fetcherState.data = { claimedItemId: 'wish-1' };

      renderRoute();

      expect(toastSuccess).toHaveBeenCalledWith(
        'Marked as claimed on their wishlist.',
      );
    });

    it('warns when a conflict is discovered at decision time even though the loader rendered the idea as unconflicted', () => {
      // The loader saw no conflict, so the idea card submitted with no
      // confirmation dialog — the pool still lost the claim underneath it,
      // and the organizer must not be left with silence.
      loaderDataSnapshot.ideaClaimConflicts = [];
      fetcherState.data = { claimedItemId: null, conflictedItemId: 'wish-1' };

      renderRoute();

      expect(toastWarning).toHaveBeenCalledTimes(1);
      const [message] = toastWarning.mock.calls[0] as [string];
      // Generic on purpose — the action response carries no disclosure
      // object, so the client must never guess a claimant's identity.
      expect(message).not.toMatch(/sarah/i);
      expect(message.toLowerCase()).toContain("didn't get it");
      expect(toastSuccess).not.toHaveBeenCalled();
    });

    it('does not claim the claimant will be contacted or notified', async () => {
      loaderDataSnapshot.ideaClaimConflicts = [
        [
          'idea-1',
          {
            show: true,
            tone: 'warning',
            text: 'Claimed by Sarah',
            name: 'Sarah',
            poolLink: null,
            canJoinPool: false,
          },
        ],
      ];

      renderRoute();

      const [chooseButton] = screen.getAllByRole('button', {
        name: 'Choose',
      });
      await userEvent.click(chooseButton!);

      const dialog = await screen.findByRole('dialog', {
        name: "Sarah's already getting this one",
      });
      const dialogText = dialog.textContent ?? '';
      // No promise of a Keep/Release follow-up to the claimant — that
      // feature does not exist yet.
      expect(dialogText).not.toMatch(/ask (them|if)/i);
      expect(dialogText).not.toMatch(/let them know/i);
      expect(dialogText).not.toMatch(/we'll/i);
      expect(dialogText).toContain(
        "your pool won't hold the claim — so there's a real risk you both end up buying it.",
      );
    });
  });
});
