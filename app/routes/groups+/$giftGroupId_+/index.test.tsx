/**
 * @vitest-environment jsdom
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
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
    groupMembers: [
      {
        user: {
          id: 'viewer-1',
          username: 'ada',
          name: 'Ada',
          birthday: new Date('1990-12-10'),
          image: null,
        },
        role: 'OWNER' as const,
      },
      {
        user: {
          id: 'marco',
          username: 'marco',
          name: 'Marco',
          birthday: new Date('1992-07-04'),
          image: null,
        },
        role: 'MEMBER' as const,
      },
    ],
  },
  inviteLink: 'https://giftpool.app/groups/join/invite-1' as string | null,
  viewer: {
    userId: 'viewer-1',
    role: 'OWNER' as const,
    contributionCents: 1500,
  },
};

type ActionItemFixture = {
  type: string;
  priority: number;
  poolId: string | null;
  poolTitle: string | null;
  recipientName: string;
  eventDate: string | null;
  daysUntilEvent: number | null;
  ctaLabel: string;
  ctaUrl: string;
  description?: string;
  amountCents?: number;
};

const overviewData = {
  actionQueue: [] as ActionItemFixture[],
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
    Link: ({
      to,
      children,
      ...rest
    }: {
      to: string;
      children: React.ReactNode;
    }) => (
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
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// The members rail's full row (Radix menu + confirm dialog) is covered by
// member-actions-menu.test / members.component.test — stub it here so this
// overview test stays focused on the dashboard layout.
vi.mock('#app/components/groups/members-list.tsx', () => ({
  MembersList: ({
    members,
  }: {
    members: Array<{
      user: { id: string; name: string | null; username: string };
    }>;
  }) => (
    <ul data-testid="members-rail-list">
      {members.map((m) => (
        <li key={m.user.id}>{m.user.name ?? m.user.username}</li>
      ))}
    </ul>
  ),
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
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
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
    expect(screen.getByText('May 3')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Organizing')).toBeInTheDocument();
  });

  it('hydrates midnight-UTC pool dates without shifting the calendar day', async () => {
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

    const originalTimeZone = process.env.TZ;
    const container = document.createElement('div');
    document.body.append(container);
    const recoverableErrors: Array<unknown> = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;

    try {
      process.env.TZ = 'UTC';
      container.innerHTML = renderToString(<GroupsDetailOverview />);

      process.env.TZ = 'America/New_York';
      await act(async () => {
        root = hydrateRoot(container, <GroupsDetailOverview />, {
          onRecoverableError: (error) => recoverableErrors.push(error),
        });
        await Promise.resolve();
      });

      expect(container).toHaveTextContent('May 3');
      expect(container).not.toHaveTextContent('May 2');
      expect(recoverableErrors).toEqual([]);
    } finally {
      if (root) {
        await act(async () => root?.unmount());
      }
      container.remove();
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
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
        description: "2 of 3 haven't voted yet — close voting?",
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

  it('renders the desktop members rail with every member', () => {
    render(<GroupsDetailOverview />);
    expect(screen.getByText('Members (2)')).toBeInTheDocument();
    const rail = screen.getByTestId('members-rail-list');
    expect(rail).toHaveTextContent('Ada');
    expect(rail).toHaveTextContent('Marco');
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      '/groups/group-1/members',
    );
  });

  it('edits the per-gift cap inline — no modal for a single number', async () => {
    render(<GroupsDetailOverview />);
    // Read mode shows the current cap.
    expect(screen.getByTestId('budget-amount')).toHaveTextContent('$15.00');

    await userEvent.click(
      screen.getByRole('button', { name: /edit your budget/i }),
    );

    // Edit reveals an inline input — not a dialog.
    expect(
      screen.getByRole('textbox', { name: /your budget/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
