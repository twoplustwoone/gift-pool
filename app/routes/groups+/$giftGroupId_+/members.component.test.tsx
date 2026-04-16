/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const layoutLoaderData = {
  giftGroup: {
    id: 'group-1',
    groupMembers: [
      {
        user: {
          id: 'viewer-1',
          username: 'viewer',
          name: 'Viewer',
          birthday: new Date('1990-05-01'),
          image: null,
        },
        role: 'OWNER' as const,
        contributionCents: 2000,
        budgetVisibilityOverride: null,
        friendRelationship: {
          state: 'FRIENDS',
          friendshipId: null,
          incomingRequestId: null,
          outgoingRequestId: null,
        },
      },
      {
        user: {
          id: 'marco',
          username: 'marco',
          name: 'Marco',
          birthday: new Date('1992-05-26'),
          image: null,
        },
        role: 'MEMBER' as const,
        contributionCents: 2000,
        budgetVisibilityOverride: null,
        friendRelationship: {
          state: 'NONE',
          friendshipId: null,
          incomingRequestId: null,
          outgoingRequestId: null,
        },
      },
      {
        user: {
          id: 'alex',
          username: 'alex',
          name: 'Alex',
          birthday: null,
          image: null,
        },
        role: 'MEMBER' as const,
        contributionCents: 2000,
        budgetVisibilityOverride: null,
        friendRelationship: {
          state: 'NONE',
          friendshipId: null,
          incomingRequestId: null,
          outgoingRequestId: null,
        },
      },
    ],
  },
  viewer: { userId: 'viewer-1', role: 'OWNER' as const },
};

const overviewLoaderData: {
  activePoolsByRecipient: Record<string, { id: string; title: string }>;
} = {
  activePoolsByRecipient: {
    marco: { id: 'pool-1', title: "Marco's Birthday" },
  },
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
      data: undefined,
      state: 'idle',
      submit: vi.fn(),
    }),
    useFetchers: () => [],
    useLoaderData: () => overviewLoaderData,
    useRouteLoaderData: () => layoutLoaderData,
  };
});

vi.mock('#app/components/friends/friend-action-button.tsx', () => ({
  FriendActionButton: () => <div data-testid="friend-button" />,
}));

import GroupMembersRoute from './members.tsx';

describe('Members tab — PoolActionForMember per row', () => {
  it('shows "View pool" for members with an active pool', () => {
    render(<GroupMembersRoute />);
    const viewLink = screen.getByRole('link', { name: /^view pool$/i });
    expect(viewLink).toHaveAttribute('href', '/pools/pool-1');
    expect(viewLink).toHaveAttribute(
      'title',
      "View pool: Marco's Birthday",
    );
  });

  it('omits the pool action for a member without a birthday and no active pool', () => {
    render(<GroupMembersRoute />);
    // Alex has no birthday and no active pool → no Start a pool link rendered.
    // Marco's row provides the only "View pool" link — see other test.
    const startLinks = screen.queryAllByRole('link', { name: /start a pool/i });
    expect(startLinks).toHaveLength(0);
  });

  it('shows "Start a pool" for members with a birthday and no active pool', () => {
    // Override the overview loader to remove the active pool entry — so
    // Marco (who has a birthday) now needs a Start-a-pool CTA.
    overviewLoaderData.activePoolsByRecipient = {};
    try {
      render(<GroupMembersRoute />);
      const startLink = screen.getByRole('link', { name: /^start a pool$/i });
      expect(startLink).toHaveAttribute(
        'href',
        '/pools/new?groupId=group-1&recipientId=marco',
      );
    } finally {
      overviewLoaderData.activePoolsByRecipient = {
        marco: { id: 'pool-1', title: "Marco's Birthday" },
      };
    }
  });

  it("hides the pool action on the viewer's own row", () => {
    render(<GroupMembersRoute />);
    // Viewer's row shows "viewer (You)" — confirm presence by partial match.
    expect(
      screen.getByText((_, el) => el?.textContent === 'viewer (You)'),
    ).toBeInTheDocument();
    // Total pool action links = 1 (only Marco's "View pool").
    const allLinks = screen.getAllByRole('link');
    const poolLinks = allLinks.filter((link) =>
      /^(start a pool|view pool)$/i.test((link.textContent ?? '').trim()),
    );
    expect(poolLinks).toHaveLength(1);
  });

  it('renders "gift budget" labels for non-viewer rows', () => {
    render(<GroupMembersRoute />);
    const labels = screen.getAllByText(/gift budget/i);
    // 3 members → 3 rows → 3 labels
    expect(labels.length).toBeGreaterThanOrEqual(3);
  });
});
