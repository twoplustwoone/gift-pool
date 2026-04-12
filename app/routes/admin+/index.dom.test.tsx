/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type OverviewCounts = {
  users: { total: number; last24h: number; last7d: number; last30d: number };
  pools: {
    total: number;
    byStatus: Record<string, number>;
    stuck: number;
    active: number;
  };
  wishlist: {
    items: number;
    active: number;
    archived: number;
    purchases: number;
  };
  friendships: { total: number; pendingRequestsOverThreshold: number };
  notifications: { unread24h: number };
};

type StuckPool = {
  id: string;
  title: string;
  status: 'OPEN' | 'VOTING' | 'DECIDED' | 'PURCHASED' | 'DELIVERED' | 'CANCELLED';
  eventDate: Date | null;
  updatedAt: Date;
  reason: 'open_overdue' | 'voting_stalled' | 'decided_stalled';
  organizer: { id: string; username: string; name: string | null };
  contributorCount: number;
};

type CleanupPreviewCounts = {
  expiredVerifications: number;
  expiredSessions: number;
  stalePendingFriendRequests: number;
  staleRejectedFriendRequests: number;
  revokedOrExpiredGroupInvitations: number;
  expiredGroupBans: number;
};

type RecentActivityRow = {
  kind: 'user' | 'pool' | 'wishlist_item' | 'friendship';
  id: string;
  actor: { id: string; username: string; name: string | null } | null;
  subject: string;
  timestamp: Date;
};

const loaderDataSnapshot: {
  overview: OverviewCounts;
  stuckPools: StuckPool[];
  cleanup: CleanupPreviewCounts;
  activity: RecentActivityRow[];
} = {
  overview: {
    users: { total: 0, last24h: 0, last7d: 0, last30d: 0 },
    pools: {
      total: 0,
      byStatus: {
        OPEN: 0,
        VOTING: 0,
        DECIDED: 0,
        PURCHASED: 0,
        DELIVERED: 0,
        CANCELLED: 0,
      },
      stuck: 0,
      active: 0,
    },
    wishlist: { items: 0, active: 0, archived: 0, purchases: 0 },
    friendships: { total: 0, pendingRequestsOverThreshold: 0 },
    notifications: { unread24h: 0 },
  },
  stuckPools: [],
  cleanup: {
    expiredVerifications: 0,
    expiredSessions: 0,
    stalePendingFriendRequests: 0,
    staleRejectedFriendRequests: 0,
    revokedOrExpiredGroupInvitations: 0,
    expiredGroupBans: 0,
  },
  activity: [],
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return {
    ...actual,
    useLoaderData: () => loaderDataSnapshot,
  };
});

vi.mock('#app/utils/permissions.server.ts', () => ({
  requireUserWithRole: vi.fn(),
}));

vi.mock('#app/utils/admin.server.ts', () => ({
  getOverviewCounts: vi.fn(),
  getStuckPools: vi.fn(),
  getCleanupPreviewCounts: vi.fn(),
  getRecentActivity: vi.fn(),
}));

import AdminIndexRoute from './index.tsx';

const renderOverview = () =>
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <AdminIndexRoute />
    </MemoryRouter>,
  );

const setOverview = (partial: {
  overview?: Partial<OverviewCounts>;
  stuckPools?: StuckPool[];
  cleanup?: Partial<CleanupPreviewCounts>;
  activity?: RecentActivityRow[];
}) => {
  if (partial.overview) {
    loaderDataSnapshot.overview = {
      ...loaderDataSnapshot.overview,
      ...partial.overview,
    };
  }
  if (partial.stuckPools) loaderDataSnapshot.stuckPools = partial.stuckPools;
  if (partial.cleanup) {
    loaderDataSnapshot.cleanup = {
      ...loaderDataSnapshot.cleanup,
      ...partial.cleanup,
    };
  }
  if (partial.activity) loaderDataSnapshot.activity = partial.activity;
};

beforeEach(() => {
  // Reset to fully-zero state before each test.
  loaderDataSnapshot.overview = {
    users: { total: 0, last24h: 0, last7d: 0, last30d: 0 },
    pools: {
      total: 0,
      byStatus: {
        OPEN: 0,
        VOTING: 0,
        DECIDED: 0,
        PURCHASED: 0,
        DELIVERED: 0,
        CANCELLED: 0,
      },
      stuck: 0,
      active: 0,
    },
    wishlist: { items: 0, active: 0, archived: 0, purchases: 0 },
    friendships: { total: 0, pendingRequestsOverThreshold: 0 },
    notifications: { unread24h: 0 },
  };
  loaderDataSnapshot.stuckPools = [];
  loaderDataSnapshot.cleanup = {
    expiredVerifications: 0,
    expiredSessions: 0,
    stalePendingFriendRequests: 0,
    staleRejectedFriendRequests: 0,
    revokedOrExpiredGroupInvitations: 0,
    expiredGroupBans: 0,
  };
  loaderDataSnapshot.activity = [];
});

describe('admin overview page — empty state', () => {
  it('renders all empty-state rows when every list is empty', () => {
    renderOverview();

    // Headings
    expect(
      screen.getByRole('heading', { name: 'Overview' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Pools needing attention' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Cleanup queue' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Recent activity (last 48h)' }),
    ).toBeInTheDocument();

    // Empty messages
    expect(
      screen.getByText(/No stuck pools. Nothing to do here./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing to clean up./)).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing in the last 48 hours./),
    ).toBeInTheDocument();
  });

  it('renders metric labels even when values are zero', () => {
    renderOverview();
    for (const label of [
      'Users',
      'Active pools',
      'Wishlist items',
      'Friendships',
      'Stuck pools',
      'Wishlist purchases',
      'Unread notifications (24h)',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe('admin overview page — populated state', () => {
  it('renders metric values, stuck pool rows, cleanup items, and recent activity', () => {
    setOverview({
      overview: {
        users: { total: 42, last24h: 2, last7d: 5, last30d: 12 },
        pools: {
          total: 10,
          byStatus: {
            OPEN: 3,
            VOTING: 1,
            DECIDED: 2,
            PURCHASED: 0,
            DELIVERED: 4,
            CANCELLED: 0,
          },
          stuck: 2,
          active: 6,
        },
        wishlist: { items: 80, active: 70, archived: 10, purchases: 15 },
        friendships: { total: 30, pendingRequestsOverThreshold: 1 },
        notifications: { unread24h: 7 },
      },
      stuckPools: [
        {
          id: 'pool-1',
          title: 'Marco Birthday',
          status: 'OPEN',
          eventDate: new Date('2026-04-01'),
          updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          reason: 'open_overdue',
          organizer: { id: 'u1', username: 'wade', name: 'Wade Wilson' },
          contributorCount: 3,
        },
        {
          id: 'pool-2',
          title: 'Ana Farewell',
          status: 'VOTING',
          eventDate: null,
          updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          reason: 'voting_stalled',
          organizer: { id: 'u2', username: 'marco', name: 'Marco' },
          contributorCount: 5,
        },
      ],
      cleanup: {
        expiredVerifications: 3,
        expiredSessions: 4,
        stalePendingFriendRequests: 1,
        staleRejectedFriendRequests: 0,
        revokedOrExpiredGroupInvitations: 2,
        expiredGroupBans: 0,
      },
      activity: [
        {
          kind: 'user',
          id: 'u99',
          actor: { id: 'u99', username: 'newbie', name: 'Newbie Name' },
          subject: 'signed up',
          timestamp: new Date(Date.now() - 60 * 60 * 1000),
        },
        {
          kind: 'pool',
          id: 'p99',
          actor: { id: 'u1', username: 'wade', name: 'Wade Wilson' },
          subject: 'created pool "Launch party"',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
        {
          kind: 'friendship',
          id: 'f99',
          actor: { id: 'u3', username: 'zoe', name: null },
          subject: 'became friends with hana',
          timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
        },
      ],
    });

    renderOverview();

    // Metric values — use getAllByText since numbers may appear multiple times
    // (e.g. "2" as stuck-pool count and also as contributor count badge).
    expect(screen.getAllByText('42').length).toBeGreaterThan(0); // users total
    expect(screen.getAllByText('6').length).toBeGreaterThan(0); // active pools
    expect(screen.getAllByText('80').length).toBeGreaterThan(0); // wishlist items
    expect(screen.getAllByText('15').length).toBeGreaterThan(0); // purchases
    expect(screen.getAllByText('7').length).toBeGreaterThan(0); // unread notifs
    // Cleanup total: 3+4+1+0+2+0 = 10
    expect(screen.getAllByText('10').length).toBeGreaterThan(0);

    // Stuck pool rows
    expect(screen.getByText('Marco Birthday')).toBeInTheDocument();
    expect(screen.getByText('Ana Farewell')).toBeInTheDocument();
    expect(
      screen.getByText(/Event date past, still OPEN/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/VOTING with no votes >7d/),
    ).toBeInTheDocument();

    // Cleanup rows (only non-zero ones render)
    expect(screen.getByText('Expired verification rows')).toBeInTheDocument();
    expect(screen.getByText('Expired sessions')).toBeInTheDocument();
    expect(
      screen.getByText('Stale pending friend requests (>30d)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Revoked or expired group invitations'),
    ).toBeInTheDocument();
    // Zero-value rows should NOT be rendered
    expect(
      screen.queryByText('Stale rejected friend requests (>90d)'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Expired group bans (ready to lift)'),
    ).not.toBeInTheDocument();

    // Activity feed
    expect(screen.getByText('signed up')).toBeInTheDocument();
    expect(
      screen.getByText('created pool "Launch party"'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('became friends with hana'),
    ).toBeInTheDocument();
  });

  it('links stuck pool rows to their drill-down routes', () => {
    setOverview({
      stuckPools: [
        {
          id: 'pool-xyz',
          title: 'Something stuck',
          status: 'DECIDED',
          eventDate: null,
          updatedAt: new Date(),
          reason: 'decided_stalled',
          organizer: { id: 'u1', username: 'wade', name: null },
          contributorCount: 1,
        },
      ],
    });

    renderOverview();

    const link = screen.getByRole('link', { name: /Something stuck/ });
    expect(link).toHaveAttribute('href', '/admin/pools/pool-xyz');
  });

  it('links the alert callout to the stuck-pools filter', () => {
    renderOverview();
    const viewAll = screen.getByRole('link', { name: /View all/ });
    expect(viewAll).toHaveAttribute('href', '/admin/pools?status=stuck');
  });
});
