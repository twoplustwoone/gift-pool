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
      children?: React.ReactNode;
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
    useRouteLoaderData: () => layoutLoaderData,
  };
});

import GroupMembersRoute from './members.tsx';

describe('Members tab — reduced row', () => {
  it('renders one row per member with name, role and birthday', () => {
    render(<GroupMembersRoute />);
    expect(screen.getByText('Group Members (3)')).toBeInTheDocument();
    expect(screen.getByText('Marco')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    // Owner's own row carries a "you" system label.
    expect(screen.getByText('you')).toBeInTheDocument();
    // Member with no birthday shows the empty state.
    expect(screen.getByText('Birthday not set')).toBeInTheDocument();
  });

  it('links each row to the member profile', () => {
    render(<GroupMembersRoute />);
    expect(
      screen.getByRole('link', { name: /view marco's profile/i }),
    ).toHaveAttribute('href', '/users/marco');
  });

  it('drops the budget, friend, pool and gift-history affordances', () => {
    render(<GroupMembersRoute />);
    expect(screen.queryByText(/gift budget/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /start a pool/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /view pool/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /gift history/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /add friend|friends/i }),
    ).not.toBeInTheDocument();
  });

  it('exposes a manager menu for the owner on other members only', () => {
    render(<GroupMembersRoute />);
    // Owner sees a menu on marco + alex (member rows), but not on their own
    // row. Both desktop and mobile triggers share the aria-label, so each
    // actionable member contributes two trigger buttons.
    const marco = screen.getAllByRole('button', { name: /actions for marco/i });
    expect(marco.length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: /actions for viewer/i }),
    ).not.toBeInTheDocument();
  });
});
