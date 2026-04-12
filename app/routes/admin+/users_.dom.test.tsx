/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type AdminUserDetail = {
  id: string;
  email: string;
  username: string;
  name: string | null;
  bio: string | null;
  birthday: string | null;
  createdAt: string;
  image: { id: string } | null;
  roles: Array<{ name: string }>;
  sessions: Array<{ id: string; createdAt: string; expirationDate: string }>;
  notificationPreferences: Array<{
    type: string;
    inAppEnabled: boolean;
    emailEnabled: boolean;
  }>;
  counts: {
    wishlistItems: number;
    friendships: number;
    poolsOrganized: number;
    poolsAsPurchaser: number;
    poolsAsDeliverer: number;
    poolsAsRecipient: number;
    poolContributions: number;
    unreadNotifications: number;
  };
  poolContributorStats: { paid: number; unpaid: number };
  recentEvents: Array<{
    id: string;
    name: string;
    createdAt: string;
    source: string;
    properties: string | null;
  }>;
};

const loaderDataSnapshot: { user: AdminUserDetail } = {
  user: {
    id: 'u1',
    email: 'wade@example.com',
    username: 'wade',
    name: 'Wade Wilson',
    bio: 'Mercenary with a mouth.',
    birthday: '1990-01-15T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    image: null,
    roles: [{ name: 'admin' }, { name: 'user' }],
    sessions: [
      {
        id: 'sess-1',
        createdAt: '2026-04-10T12:00:00.000Z',
        expirationDate: '2026-05-10T12:00:00.000Z',
      },
    ],
    notificationPreferences: [
      { type: 'FRIEND_REQUEST_RECEIVED', inAppEnabled: true, emailEnabled: true },
      { type: 'UPCOMING_BIRTHDAY', inAppEnabled: true, emailEnabled: false },
    ],
    counts: {
      wishlistItems: 22,
      friendships: 6,
      poolsOrganized: 3,
      poolsAsPurchaser: 1,
      poolsAsDeliverer: 0,
      poolsAsRecipient: 0,
      poolContributions: 4,
      unreadNotifications: 2,
    },
    poolContributorStats: { paid: 1, unpaid: 3 },
    recentEvents: [
      {
        id: 'evt-1',
        name: 'pool_decided',
        createdAt: '2026-04-10T12:30:00.000Z',
        source: 'server',
        properties: '{"poolId":"pool-1"}',
      },
      {
        id: 'evt-2',
        name: 'user_logged_in',
        createdAt: '2026-04-10T12:00:00.000Z',
        source: 'server',
        properties: null,
      },
    ],
  },
};

const fetcherDataSnapshot: { value: null | { ok: boolean; message: string } } =
  { value: null };

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return {
    ...actual,
    useLoaderData: () => loaderDataSnapshot,
    useSubmit: () => vi.fn(),
    useFetcher: () => ({
      data: fetcherDataSnapshot.value,
      state: 'idle',
      submit: vi.fn(),
    }),
  };
});

vi.mock('#app/utils/permissions.server.ts', () => ({
  requireUserWithRole: vi.fn(),
}));

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: vi.fn(),
}));

vi.mock('#app/utils/admin.server.ts', () => ({
  AdminRoleError: class extends Error {
    code: string;
    constructor(code: string, msg: string) {
      super(msg);
      this.code = code;
    }
  },
  getAdminUserDetail: vi.fn(),
  toggleAdminRole: vi.fn(),
  revokeAllSessionsForUser: vi.fn(),
}));

import AdminUserDetailRoute from './users_.$userId.tsx';

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={['/admin/users/u1']}>
      <AdminUserDetailRoute />
    </MemoryRouter>,
  );

beforeEach(() => {
  fetcherDataSnapshot.value = null;
});

describe('admin user detail page', () => {
  it('renders the user header with name, username, and email', () => {
    renderDetail();
    expect(
      screen.getByRole('heading', { name: 'Wade Wilson' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/@wade · wade@example.com/)).toBeInTheDocument();
  });

  it('renders all 8 section headings', () => {
    renderDetail();
    for (const heading of [
      'Profile',
      'Roles',
      'Sessions',
      'Gifting activity',
      'Wishlist',
      'Friendships',
      'Notification preferences',
      'Recent events',
    ]) {
      expect(
        screen.getByRole('heading', { name: heading }),
      ).toBeInTheDocument();
    }
  });

  it('renders profile fields', () => {
    renderDetail();
    expect(screen.getByText('u1')).toBeInTheDocument();
    expect(screen.getByText('Mercenary with a mouth.')).toBeInTheDocument();
  });

  it('renders role badges and the revoke-admin button (user is admin)', () => {
    renderDetail();
    const adminBadges = screen.getAllByText('admin');
    expect(adminBadges.length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Revoke admin' }),
    ).toBeInTheDocument();
  });

  it('renders sessions count and sign-out button', () => {
    renderDetail();
    expect(screen.getByText(/sess-1/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign out all sessions' }),
    ).toBeInTheDocument();
  });

  it('renders gifting activity counts', () => {
    renderDetail();
    expect(screen.getByText('3')).toBeInTheDocument(); // poolsOrganized
    expect(screen.getByText('1 paid · 3 unpaid')).toBeInTheDocument();
  });

  it('renders notification preferences table', () => {
    renderDetail();
    expect(
      screen.getByText('friend request received'),
    ).toBeInTheDocument();
    expect(screen.getByText('upcoming birthday')).toBeInTheDocument();
  });

  it('renders recent events with name, source, and properties', () => {
    renderDetail();
    expect(screen.getByText('pool_decided')).toBeInTheDocument();
    expect(screen.getByText('user_logged_in')).toBeInTheDocument();
    expect(screen.getByText('{"poolId":"pool-1"}')).toBeInTheDocument();
  });

  it('links back to users list', () => {
    renderDetail();
    const backLink = screen.getByRole('link', { name: /Back to users/ });
    expect(backLink).toHaveAttribute('href', '/admin/users');
  });

  it('links to the public profile', () => {
    renderDetail();
    const profileLink = screen.getByRole('link', { name: /\/users\/wade/ });
    expect(profileLink).toHaveAttribute('href', '/users/wade');
  });

  it('renders a grant-admin button when user is NOT an admin', () => {
    loaderDataSnapshot.user = {
      ...loaderDataSnapshot.user,
      roles: [{ name: 'user' }],
    };
    renderDetail();
    expect(
      screen.getByRole('button', { name: 'Grant admin' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Revoke admin' }),
    ).not.toBeInTheDocument();
  });

  it('disables the session-revoke button when there are no sessions', () => {
    loaderDataSnapshot.user = {
      ...loaderDataSnapshot.user,
      sessions: [],
    };
    renderDetail();
    expect(
      screen.getByRole('button', { name: 'No active sessions' }),
    ).toBeDisabled();
  });

  it('renders the action success banner', () => {
    fetcherDataSnapshot.value = {
      ok: true,
      message: 'Granted admin role.',
    };
    renderDetail();
    // Both fetcher mocks share the same data, so two banners render.
    expect(screen.getAllByText('Granted admin role.').length).toBeGreaterThan(0);
  });

  it('renders the action error banner', () => {
    fetcherDataSnapshot.value = {
      ok: false,
      message: 'Cannot revoke the last admin.',
    };
    renderDetail();
    expect(
      screen.getAllByText('Cannot revoke the last admin.').length,
    ).toBeGreaterThan(0);
  });
});
