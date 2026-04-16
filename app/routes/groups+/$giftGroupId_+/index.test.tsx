/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const clipboardWriteText = vi.fn();
const track = vi.fn();

const loaderDataSnapshot = {
  canInvite: true,
  giftGroup: {
    createdAt: '2026-03-31T12:00:00.000Z',
    description: 'Birthday planning',
    id: 'group-1',
    name: 'Family',
  },
  inviteLink: 'https://giftpool.app/groups/join/invite-1' as string | null,
  viewer: {
    contributionCents: 1500,
  },
};

const overviewData = {
  actionQueue: [] as Array<{
    type: string;
    priority: number;
    poolId: string | null;
    poolTitle: string | null;
    recipientName: string;
    eventDate: null;
    daysUntilEvent: null;
    ctaLabel: string;
    ctaUrl: string;
  }>,
  activePools: [] as Array<unknown>,
  upcomingOccasions: [] as Array<unknown>,
  pastGifts: [] as Array<unknown>,
};

const fetcherState = {
  data: undefined as undefined | { inviteUrl?: string; status?: string },
  formData: undefined as FormData | undefined,
  state: 'idle' as 'idle' | 'submitting',
  submit: vi.fn(),
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');

  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useFetcher: () => ({
      Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
      data: fetcherState.data,
      formData: fetcherState.formData,
      state: fetcherState.state,
      submit: fetcherState.submit,
    }),
    useLoaderData: () => overviewData,
    useRouteLoaderData: () => loaderDataSnapshot,
  };
});

vi.mock('#app/utils/analytics.client.ts', () => ({
  track: (...args: Array<unknown>) => track(...args),
}));

vi.mock('#app/components/ui/dialog.tsx', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import GroupsDetailOverview from './index.tsx';

beforeEach(() => {
  clipboardWriteText.mockReset();
  track.mockReset();
  fetcherState.data = undefined;
  fetcherState.formData = undefined;
  fetcherState.state = 'idle';
  fetcherState.submit.mockReset();

  loaderDataSnapshot.canInvite = true;
  loaderDataSnapshot.giftGroup.description = 'Birthday planning';
  loaderDataSnapshot.inviteLink = 'https://giftpool.app/groups/join/invite-1';
  loaderDataSnapshot.viewer.contributionCents = 1500;

  overviewData.actionQueue = [];
  overviewData.activePools = [];
  overviewData.upcomingOccasions = [];
  overviewData.pastGifts = [];

  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: clipboardWriteText,
    },
  });
});

describe('group detail overview route', () => {
  it('renders group essentials and copies invite link on demand', async () => {
    clipboardWriteText.mockResolvedValue(undefined);

    render(<GroupsDetailOverview />);

    expect(screen.getByText('Group info')).toBeInTheDocument();
    expect(screen.getByText('Birthday planning')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /copy invite link/i }),
    );

    expect(clipboardWriteText).toHaveBeenCalledWith(
      'https://giftpool.app/groups/join/invite-1',
    );
  });

  it('renders the create invite flow and updates after the fetcher succeeds', async () => {
    clipboardWriteText.mockResolvedValue(undefined);
    loaderDataSnapshot.inviteLink = null;

    const { rerender } = render(<GroupsDetailOverview />);

    expect(
      screen.getByRole('button', { name: /create invite link/i }),
    ).toBeInTheDocument();

    const pendingFormData = new FormData();
    pendingFormData.set('intent', 'create-invite-link');
    fetcherState.formData = pendingFormData;
    fetcherState.state = 'submitting';
    rerender(<GroupsDetailOverview />);

    expect(
      screen.getByRole('button', { name: /creating\.\.\./i }),
    ).toBeDisabled();

    fetcherState.state = 'idle';
    fetcherState.data = {
      inviteUrl: 'https://giftpool.app/groups/join/invite-2',
    };
    rerender(<GroupsDetailOverview />);

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(
        'https://giftpool.app/groups/join/invite-2',
      );
    });
    expect(
      screen.getByRole('button', { name: /copy invite link/i }),
    ).toBeInTheDocument();
  });

  it('does not throw when clipboard.writeText rejects after fetcher resolves', async () => {
    clipboardWriteText.mockRejectedValue(
      new DOMException(
        'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.',
        'NotAllowedError',
      ),
    );
    loaderDataSnapshot.inviteLink = null;

    const { rerender } = render(<GroupsDetailOverview />);

    fetcherState.state = 'idle';
    fetcherState.data = {
      inviteUrl: 'https://giftpool.app/groups/join/invite-3',
    };
    rerender(<GroupsDetailOverview />);

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(
        'https://giftpool.app/groups/join/invite-3',
      );
    });

    expect(
      screen.getByRole('button', { name: /copy invite link/i }),
    ).toBeInTheDocument();
  });

  it('shows the admin-only fallback when invite creation is unavailable', () => {
    loaderDataSnapshot.canInvite = false;
    loaderDataSnapshot.inviteLink = null;

    render(<GroupsDetailOverview />);

    expect(
      screen.getByText('No active invite link. Ask an admin to create one.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /create invite link/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the For You section with action items', () => {
    overviewData.actionQueue = [
      {
        type: 'CAST_VOTE',
        priority: 1,
        poolId: 'pool-1',
        poolTitle: 'Birthday Gift',
        recipientName: 'Marco',
        eventDate: null,
        daysUntilEvent: null,
        ctaLabel: 'Cast your vote',
        ctaUrl: '/pools/pool-1',
      },
    ];

    render(<GroupsDetailOverview />);

    expect(screen.getByText('For you')).toBeInTheDocument();
    expect(screen.getByText("Vote on Marco's gift")).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /cast your vote/i }),
    ).toBeInTheDocument();
  });

  it('shows empty state when action queue is empty', () => {
    render(<GroupsDetailOverview />);

    expect(screen.getByText('For you')).toBeInTheDocument();
    expect(
      screen.getByText(/all caught up/i),
    ).toBeInTheDocument();
  });

  it('past gifts section toggles open and closed on click', async () => {
    overviewData.pastGifts = [
      {
        id: 'past-1',
        title: 'Birthday Gift',
        status: 'DELIVERED',
        occasionType: 'BIRTHDAY',
        updatedAt: '2026-01-15T00:00:00.000Z',
        recipientName: 'Alex',
        recipientUsername: 'alex',
        chosenIdeaName: 'Headphones',
        totalCents: 5000,
      },
    ];

    render(<GroupsDetailOverview />);

    const toggle = screen.getByRole('button', { name: /past gifts/i });
    expect(toggle).toBeInTheDocument();

    // Initially collapsed — no gift row visible
    expect(screen.queryByText('Headphones')).not.toBeInTheDocument();

    // Click to expand
    await userEvent.click(toggle);
    expect(screen.getByText('Headphones')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();

    // Click again to collapse
    await userEvent.click(toggle);
    expect(screen.queryByText('Headphones')).not.toBeInTheDocument();
  });

  it('renders the active pools section with status chips and viewer role', () => {
    overviewData.activePools = [
      {
        id: 'pool-1',
        title: "Marco's Birthday",
        occasionType: 'BIRTHDAY',
        eventDate: '2026-05-03T00:00:00.000Z',
        status: 'OPEN',
        recipientName: 'Marco',
        recipientUsername: 'marco',
        ideaCount: 3,
        contributorCount: 4,
        paidCount: 0,
        viewerRole: 'organizing' as const,
        viewerContributionCents: 2500,
      },
    ];

    render(<GroupsDetailOverview />);

    expect(screen.getByText('Active pools')).toBeInTheDocument();
    expect(screen.getByText("Marco's Birthday")).toBeInTheDocument();
    expect(screen.getByText(/birthday for/i)).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Organizing')).toBeInTheDocument();
  });

  it('renders the upcoming occasions section with start-pool links', () => {
    overviewData.upcomingOccasions = [
      {
        userId: 'leo',
        name: 'Leo',
        username: 'leo',
        daysUntil: 12,
        imageId: null,
        groupId: 'group-1',
      },
    ];

    render(<GroupsDetailOverview />);

    expect(screen.getByText('Coming up')).toBeInTheDocument();
    expect(screen.getByText('Leo')).toBeInTheDocument();
    expect(
      screen.getAllByText((_, el) =>
        /birthday in 12 days/i.test(el?.textContent ?? ''),
      ).length,
    ).toBeGreaterThan(0);
    const startLink = screen.getByRole('link', { name: /start a pool/i });
    expect(startLink).toHaveAttribute(
      'href',
      '/pools/new?groupId=group-1&recipientId=leo',
    );
  });

  it('renders different action types with correct CTA labels and descriptions', () => {
    overviewData.actionQueue = [
      {
        type: 'MARK_PAID',
        priority: 2,
        poolId: 'pool-1',
        poolTitle: 'P',
        recipientName: 'Marco',
        eventDate: null,
        daysUntilEvent: null,
        ctaLabel: 'Mark as paid',
        ctaUrl: '/pools/pool-1',
        amountCents: 2500,
      },
      {
        type: 'CHOOSE_GIFT',
        priority: 1,
        poolId: 'pool-2',
        poolTitle: 'P2',
        recipientName: 'Leo',
        eventDate: null,
        daysUntilEvent: null,
        ctaLabel: 'Choose a gift',
        ctaUrl: '/pools/pool-2',
      },
      {
        type: 'IDEA_CHOSEN',
        priority: 3,
        poolId: 'pool-3',
        poolTitle: 'P3',
        recipientName: 'Sofia',
        eventDate: null,
        daysUntilEvent: null,
        ctaLabel: 'View pool',
        ctaUrl: '/pools/pool-3',
      },
      {
        type: 'POOL_STUCK',
        priority: 0,
        poolId: 'pool-4',
        poolTitle: 'P4',
        recipientName: 'Ana',
        eventDate: null,
        daysUntilEvent: 3,
        ctaLabel: 'Close voting',
        ctaUrl: '/pools/pool-4',
        description: '2 of 3 haven\'t voted yet — close voting?',
      },
    ];

    render(<GroupsDetailOverview />);

    expect(
      screen.getByText("You owe $25.00 for Marco's gift"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ideas are in — pick Leo's gift"),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your idea was picked for Sofia!'),
    ).toBeInTheDocument();
    // Server-provided description for POOL_STUCK
    expect(
      screen.getByText("2 of 3 haven't voted yet — close voting?"),
    ).toBeInTheDocument();
    // P0 urgency badge
    expect(screen.getByText(/in 3 days/i)).toBeInTheDocument();
  });
});
