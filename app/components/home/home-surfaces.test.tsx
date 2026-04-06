/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_COPY } from './home-copy';

const fetcherLoad = vi.fn();
const fetcherSnapshot: {
  data:
    | {
        activity: Array<{ description: string; id: string; timestampISO: string }>;
        birthdays: Array<{
          dateISO: string;
          dateLabel: string;
          groupId: string | null;
          id: string;
          name: string;
          username?: string | null;
        }>;
      }
    | undefined;
  state: 'idle' | 'loading' | 'submitting';
} = {
  data: undefined,
  state: 'idle',
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>(
    'react-router',
  );

  return {
    ...actual,
    useFetcher: () => ({
      Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
      data: fetcherSnapshot.data,
      load: fetcherLoad,
      state: fetcherSnapshot.state,
      submit: vi.fn(),
    }),
  };
});

import { HomeLoggedIn } from './HomeLoggedIn.tsx';
import { HomepageMockup } from './HomepageMockup.tsx';
import { HomeSocialProof } from './HomeSocialProof.tsx';

describe('home surface components', () => {
  beforeEach(() => {
    fetcherLoad.mockReset();
    fetcherSnapshot.data = { activity: [], birthdays: [] };
    fetcherSnapshot.state = 'idle';
  });

  function renderHomeLoggedIn(
    props: Partial<React.ComponentProps<typeof HomeLoggedIn>> = {},
  ) {
    const activePools = props.activePools ?? [];

    return render(
      <MemoryRouter>
        <HomeLoggedIn
          activePools={activePools}
          wishlistCount={props.wishlistCount ?? 1}
          groupCount={props.groupCount ?? 1}
          mock={props.mock}
        />
      </MemoryRouter>,
    );
  }

  it('renders the homepage mockup as an accessible image with matching caption', () => {
    render(
      <HomepageMockup
        alt="Illustration of a wishlist and gift group activity"
        className="w-full"
      />,
    );

    expect(
      screen.getByRole('img', {
        name: 'Illustration of a wishlist and gift group activity',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Illustration of a wishlist and gift group activity'),
    ).toHaveClass('sr-only');
  });

  it('renders the visible social proof copy and keeps testimonial placeholders hidden', () => {
    render(<HomeSocialProof />);

    expect(screen.getByText(HOME_COPY.social.strip)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: HOME_COPY.social.testimonialsHeading,
      }),
    ).not.toBeInTheDocument();
  });

  it('renders "Your pools" section heading', () => {
    renderHomeLoggedIn();

    expect(
      screen.getByRole('heading', { name: 'Your pools' }),
    ).toBeInTheDocument();
  });

  it('renders a pool card for each item in activePools prop', () => {
    renderHomeLoggedIn({
      activePools: [
        {
          id: 'pool-1',
          title: 'Alex Birthday Gift',
          status: 'OPEN',
          occasionType: 'BIRTHDAY',
          recipientName: 'Alex',
          eventDate: null,
          contributorCount: 2,
        },
        {
          id: 'pool-2',
          title: 'Sam Wedding Gift',
          status: 'DECIDED',
          occasionType: 'WEDDING',
          recipientName: 'Sam',
          eventDate: null,
          contributorCount: 3,
        },
        {
          id: 'pool-3',
          title: 'Jamie Farewell Gift',
          status: 'PURCHASED',
          occasionType: 'FAREWELL',
          recipientName: 'Jamie',
          eventDate: null,
          contributorCount: 4,
        },
      ],
    });

    expect(screen.getAllByTestId('pool-card')).toHaveLength(3);
    expect(
      screen.getByRole('link', { name: /Alex Birthday Gift/i }),
    ).toHaveAttribute('href', '/pools/pool-1');
    expect(
      screen.getByRole('link', { name: /Sam Wedding Gift/i }),
    ).toHaveAttribute('href', '/pools/pool-2');
    expect(
      screen.getByRole('link', { name: /Jamie Farewell Gift/i }),
    ).toHaveAttribute('href', '/pools/pool-3');
  });

  it('pool card shows recipient name when present', () => {
    renderHomeLoggedIn({
      activePools: [
        {
          id: 'pool-1',
          title: 'Alex Birthday Gift',
          status: 'OPEN',
          occasionType: 'BIRTHDAY',
          recipientName: 'Jordan',
          eventDate: null,
          contributorCount: 2,
        },
      ],
    });

    expect(screen.getByText('Jordan')).toBeInTheDocument();
  });

  it('pool card shows status badge text (Open / Decided / Voting / Purchased)', () => {
    renderHomeLoggedIn({
      activePools: [
        {
          id: 'pool-1',
          title: 'Open Pool',
          status: 'OPEN',
          occasionType: 'BIRTHDAY',
          recipientName: null,
          eventDate: null,
          contributorCount: 1,
        },
        {
          id: 'pool-2',
          title: 'Decided Pool',
          status: 'DECIDED',
          occasionType: 'BIRTHDAY',
          recipientName: null,
          eventDate: null,
          contributorCount: 1,
        },
        {
          id: 'pool-3',
          title: 'Voting Pool',
          status: 'VOTING',
          occasionType: 'BIRTHDAY',
          recipientName: null,
          eventDate: null,
          contributorCount: 1,
        },
        {
          id: 'pool-4',
          title: 'Purchased Pool',
          status: 'PURCHASED',
          occasionType: 'BIRTHDAY',
          recipientName: null,
          eventDate: null,
          contributorCount: 1,
        },
      ],
    });

    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Decided')).toBeInTheDocument();
    expect(screen.getByText('Voting')).toBeInTheDocument();
    expect(screen.getByText('Purchased')).toBeInTheDocument();
  });

  it('pool card shows formatted event date when eventDate is non-null', () => {
    renderHomeLoggedIn({
      activePools: [
        {
          id: 'pool-1',
          title: 'Birthday Pool',
          status: 'OPEN',
          occasionType: 'BIRTHDAY',
          recipientName: null,
          eventDate: '2026-06-14T00:00:00.000Z',
          contributorCount: 2,
        },
      ],
    });

    expect(screen.getByText('Jun 14')).toBeInTheDocument();
  });

  it('pool card does NOT show event date row when eventDate is null', () => {
    renderHomeLoggedIn({
      activePools: [
        {
          id: 'pool-1',
          title: 'Birthday Pool',
          status: 'OPEN',
          occasionType: 'BIRTHDAY',
          recipientName: null,
          eventDate: null,
          contributorCount: 2,
        },
      ],
    });

    expect(screen.queryByText('Jun 14')).not.toBeInTheDocument();
  });

  it('shows "No active pools yet" empty state when activePools is empty', () => {
    renderHomeLoggedIn({ activePools: [] });

    expect(screen.getByText('No active pools yet')).toBeInTheDocument();
  });

  it('"+ Start a Pool" button links to /pools/new', () => {
    renderHomeLoggedIn({
      activePools: [
        {
          id: 'pool-1',
          title: 'Birthday Pool',
          status: 'OPEN',
          occasionType: 'BIRTHDAY',
          recipientName: null,
          eventDate: null,
          contributorCount: 2,
        },
      ],
    });

    expect(screen.getByRole('link', { name: '+ Start a Pool' })).toHaveAttribute(
      'href',
      '/pools/new',
    );
  });

  it('"View all pools →" link is shown when activePools.length > 0', () => {
    renderHomeLoggedIn({
      activePools: [
        {
          id: 'pool-1',
          title: 'Birthday Pool',
          status: 'OPEN',
          occasionType: 'BIRTHDAY',
          recipientName: null,
          eventDate: null,
          contributorCount: 2,
        },
      ],
    });

    expect(screen.getByRole('link', { name: 'View all pools →' })).toHaveAttribute(
      'href',
      '/pools',
    );
  });

  it('"View all pools →" link is NOT shown when activePools is empty', () => {
    renderHomeLoggedIn({ activePools: [] });

    expect(
      screen.queryByRole('link', { name: 'View all pools →' }),
    ).not.toBeInTheDocument();
  });

  it('activity empty state contains a link to /pools/new', () => {
    renderHomeLoggedIn({
      activePools: [
        {
          id: 'pool-1',
          title: 'Birthday Pool',
          status: 'OPEN',
          occasionType: 'BIRTHDAY',
          recipientName: null,
          eventDate: null,
          contributorCount: 2,
        },
      ],
    });

    expect(screen.getByRole('link', { name: 'Start a pool' })).toHaveAttribute(
      'href',
      '/pools/new',
    );
  });

  it('birthdays empty state contains a link to /friends', () => {
    renderHomeLoggedIn({
      activePools: [
        {
          id: 'pool-1',
          title: 'Birthday Pool',
          status: 'OPEN',
          occasionType: 'BIRTHDAY',
          recipientName: null,
          eventDate: null,
          contributorCount: 2,
        },
      ],
    });

    expect(screen.getByRole('link', { name: 'Add friends' })).toHaveAttribute(
      'href',
      '/friends',
    );
  });

  it('shows onboarding nudge card for wishlist when wishlistCount === 0', () => {
    renderHomeLoggedIn({ wishlistCount: 0 });

    expect(
      screen.getByText(HOME_COPY.panels.emptyWishlistTitle),
    ).toBeInTheDocument();
  });

  it('shows onboarding nudge card for groups when groupCount === 0', () => {
    renderHomeLoggedIn({ groupCount: 0 });

    expect(
      screen.getByText(HOME_COPY.panels.emptyGroupsTitle),
    ).toBeInTheDocument();
  });

  it('hides both nudge cards when wishlistCount > 0 AND groupCount > 0', () => {
    renderHomeLoggedIn({ wishlistCount: 1, groupCount: 1 });

    expect(
      screen.queryByText(HOME_COPY.panels.emptyWishlistTitle),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(HOME_COPY.panels.emptyGroupsTitle),
    ).not.toBeInTheDocument();
  });
});
