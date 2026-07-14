/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const layoutLoaderData = {
  giftGroup: {
    id: 'group-1',
    name: 'Family',
    groupMembers: [
      { user: { id: 'viewer-1', username: 'ada', name: 'Ada', image: null } },
      { user: { id: 'marco', username: 'marco', name: 'Marco', image: null } },
    ],
  },
  viewer: { userId: 'viewer-1', role: 'OWNER' as const },
  notificationAwareness: {
    notificationOff: false,
    noticeVisible: false,
    reason: null,
    preference: {
      activityLevel: 'IMPORTANT_ONLY',
      source: 'application_default',
      customTopics: [],
    },
  },
  notificationTopics: [],
};

const location = { pathname: '/groups/group-1' };

// The layout re-exports the server loader/action; stub it so importing the
// component never pulls the server module into the jsdom test.
vi.mock('./__route.server', () => ({ loader: vi.fn(), action: vi.fn() }));

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
    NavLink: ({
      to,
      children,
      className,
    }: {
      to: string;
      children?: React.ReactNode;
      className?: (state: { isActive: boolean }) => string;
    }) => (
      <a href={to} className={className?.({ isActive: false })}>
        {children}
      </a>
    ),
    Outlet: () => <div data-testid="outlet" />,
    useLoaderData: () => layoutLoaderData,
    useLocation: () => location,
  };
});

vi.mock('#app/components/groups/group-avatar-cluster.tsx', () => ({
  GroupAvatarCluster: () => <div data-testid="avatar-cluster" />,
}));

vi.mock('#app/components/groups/RoleBadge.tsx', () => ({
  RoleBadge: ({ role }: { role: string }) => <span>{role}</span>,
}));

vi.mock(
  '#app/components/notifications/context-notification-controls.tsx',
  () => ({
    ContextNotificationControl: () => <button>Important</button>,
    ContextNotificationAwarenessNotice: () => null,
  }),
);

import GroupLayout from './_layout.tsx';

beforeEach(() => {
  location.pathname = '/groups/group-1';
});

describe('group layout shell', () => {
  it('renders the group header, tab bar and shell on a tab route', () => {
    render(<GroupLayout />);

    // The shell carries the overflow-guarding container.
    expect(screen.getByTestId('group-shell')).toBeInTheDocument();
    // Group header (not the settings header) with the group name.
    expect(screen.getByText('Family')).toBeInTheDocument();
    expect(screen.getByText('2 members')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Important' }),
    ).toBeInTheDocument();
    // Two-tab bar, Activity removed.
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Members' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Activity' }),
    ).not.toBeInTheDocument();
    // Gear link to settings lives in the header for every member.
    expect(
      screen.getByRole('link', { name: /group settings/i }),
    ).toHaveAttribute('href', '/groups/group-1/settings');
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('renders the distinct settings header with no tab bar on the settings route', () => {
    location.pathname = '/groups/group-1/settings';
    render(<GroupLayout />);

    expect(screen.getByTestId('group-shell')).toBeInTheDocument();
    expect(screen.getByText('Group settings')).toBeInTheDocument();
    // Back affordance returns to the group, not the groups list.
    expect(
      screen.getByRole('link', { name: /back to family/i }),
    ).toHaveAttribute('href', '/groups/group-1');
    // The tab bar is suppressed on the settings sub-page.
    expect(
      screen.queryByRole('link', { name: 'Overview' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Members' }),
    ).not.toBeInTheDocument();
  });
});
