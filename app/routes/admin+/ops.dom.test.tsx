/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type CleanupPreviewCounts = {
  expiredVerifications: number;
  expiredSessions: number;
  stalePendingFriendRequests: number;
  staleRejectedFriendRequests: number;
  revokedOrExpiredGroupInvitations: number;
  expiredGroupBans: number;
};

type DiskUsageCounts = {
  wishlistItemTotal: number;
  wishlistItemsWithImage: number;
  wishlistImageBytes: number;
};

const loaderDataSnapshot: {
  cleanup: CleanupPreviewCounts;
  disk: DiskUsageCounts;
  instances: Record<string, string>;
  instanceInfo: { currentInstance: string; primaryInstance: string };
} = {
  cleanup: {
    expiredVerifications: 0,
    expiredSessions: 0,
    stalePendingFriendRequests: 0,
    staleRejectedFriendRequests: 0,
    revokedOrExpiredGroupInvitations: 0,
    expiredGroupBans: 0,
  },
  disk: {
    wishlistItemTotal: 0,
    wishlistItemsWithImage: 0,
    wishlistImageBytes: 0,
  },
  instances: {},
  instanceInfo: { currentInstance: 'local', primaryInstance: 'local' },
};

const actionDataSnapshot: {
  value: { ok: false; message: string } | null;
} = { value: null };

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return {
    ...actual,
    useLoaderData: () => loaderDataSnapshot,
    useActionData: () => actionDataSnapshot.value,
    // Form uses useSubmit internally, which requires a data router.
    // In render tests we just want a plain <form> so the hidden
    // <input name="intent"> fields and buttons are queryable.
    Form: ({
      children,
      method,
      className,
    }: {
      children?: React.ReactNode;
      method?: string;
      className?: string;
    }) => (
      <form method={method} className={className}>
        {children}
      </form>
    ),
  };
});

vi.mock('#app/utils/permissions.server.ts', () => ({
  requireUserWithRole: vi.fn(),
}));

vi.mock('#app/utils/admin.server.ts', () => ({
  getCleanupPreviewCounts: vi.fn(),
  getDiskUsageCounts: vi.fn(),
  purgeExpiredVerifications: vi.fn(),
  purgeExpiredSessions: vi.fn(),
  purgeStaleFriendRequests: vi.fn(),
  purgeDeadGroupInvitations: vi.fn(),
  expireGroupBans: vi.fn(),
}));

vi.mock('#app/utils/litefs.server.ts', () => ({
  getAllInstances: vi.fn(),
  getInstanceInfo: vi.fn(),
}));

import OpsRoute from './ops.tsx';

const renderOps = () =>
  render(
    <MemoryRouter initialEntries={['/admin/ops']}>
      <OpsRoute />
    </MemoryRouter>,
  );

beforeEach(() => {
  loaderDataSnapshot.cleanup = {
    expiredVerifications: 0,
    expiredSessions: 0,
    stalePendingFriendRequests: 0,
    staleRejectedFriendRequests: 0,
    revokedOrExpiredGroupInvitations: 0,
    expiredGroupBans: 0,
  };
  loaderDataSnapshot.disk = {
    wishlistItemTotal: 0,
    wishlistItemsWithImage: 0,
    wishlistImageBytes: 0,
  };
  loaderDataSnapshot.instances = {};
  loaderDataSnapshot.instanceInfo = {
    currentInstance: 'local',
    primaryInstance: 'local',
  };
  actionDataSnapshot.value = null;
});

describe('admin ops page — cleanup jobs', () => {
  it('renders all five cleanup job cards with their titles and descriptions', () => {
    renderOps();

    expect(
      screen.getByRole('heading', { name: 'Ops' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Cleanup queue' }),
    ).toBeInTheDocument();

    // Each job card has a title
    expect(
      screen.getByRole('heading', { name: 'Expired verifications' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Expired sessions' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Stale friend requests' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Dead group invitations' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Expired group bans' }),
    ).toBeInTheDocument();
  });

  it('disables cleanup buttons when counts are zero', () => {
    renderOps();
    const buttons = screen.getAllByRole('button', { name: 'Nothing to do' });
    expect(buttons).toHaveLength(5);
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });

  it('enables buttons and shows the action verb + count when counts are non-zero', () => {
    loaderDataSnapshot.cleanup = {
      expiredVerifications: 3,
      expiredSessions: 7,
      stalePendingFriendRequests: 2,
      staleRejectedFriendRequests: 1,
      revokedOrExpiredGroupInvitations: 4,
      expiredGroupBans: 5,
    };
    renderOps();

    // verifications (3) + friend requests (2+1=3) → two "Delete 3" buttons
    expect(screen.getAllByRole('button', { name: 'Delete 3' })).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Delete 7' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Delete 4' }),
    ).toBeEnabled();
    // Expire 5 — group bans (verb = "Lift", count = 5)
    expect(screen.getByRole('button', { name: 'Lift 5' })).toBeEnabled();
    // None of the cleanup buttons should be the disabled "Nothing to do" one
    expect(
      screen.queryByRole('button', { name: 'Nothing to do' }),
    ).not.toBeInTheDocument();
  });

  it('surfaces each cleanup intent via a hidden form field', () => {
    const { container } = renderOps();
    const intents = Array.from(
      container.querySelectorAll('input[name="intent"]'),
    ).map((el) => el.getAttribute('value'));
    expect(intents).toEqual(
      expect.arrayContaining([
        'purge_verifications',
        'purge_sessions',
        'purge_friend_requests',
        'purge_group_invitations',
        'expire_group_bans',
      ]),
    );
    expect(intents).toHaveLength(5);
  });
});

describe('admin ops page — disk usage', () => {
  it('renders the disk usage summary cards', () => {
    loaderDataSnapshot.disk = {
      wishlistItemTotal: 64,
      wishlistItemsWithImage: 16,
      wishlistImageBytes: 351883,
    };
    renderOps();

    expect(
      screen.getByRole('heading', { name: 'Disk usage' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Wishlist items')).toBeInTheDocument();
    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.getByText(/16 with inline image/)).toBeInTheDocument();
    // 351883 bytes → 343.6 KB
    expect(screen.getByText('343.6 KB')).toBeInTheDocument();
    // Average = 351883 / 16 ≈ 21.5 KB
    expect(screen.getByText('21.5 KB')).toBeInTheDocument();
  });

  it('renders an em-dash when no items have inline images', () => {
    renderOps();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('admin ops page — instance panel', () => {
  it('renders the LiteFS instances with current + primary tags', () => {
    loaderDataSnapshot.instances = {
      'inst-a': 'ord',
      'inst-b': 'fra',
    };
    loaderDataSnapshot.instanceInfo = {
      currentInstance: 'inst-a',
      primaryInstance: 'inst-a',
    };
    renderOps();

    expect(
      screen.getByRole('heading', { name: 'LiteFS instances' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/inst-a/)).toBeInTheDocument();
    expect(screen.getByText(/inst-b/)).toBeInTheDocument();
    expect(screen.getByText('current')).toBeInTheDocument();
    expect(screen.getByText('primary')).toBeInTheDocument();
  });

  it('falls back to a single-instance message when no instances exist', () => {
    renderOps();
    expect(
      screen.getByText(/Single-instance mode/),
    ).toBeInTheDocument();
  });
});

describe('admin ops page — cache inspector link', () => {
  it('links to /admin/cache', () => {
    renderOps();
    const link = screen.getByRole('link', { name: /Open/ });
    expect(link).toHaveAttribute('href', '/admin/cache');
  });
});

describe('admin ops page — action error banner', () => {
  it('renders the error banner when the action returns ok: false', () => {
    actionDataSnapshot.value = {
      ok: false,
      message: 'Cleanup failed: something went wrong.',
    };
    renderOps();
    expect(
      screen.getByText('Cleanup failed: something went wrong.'),
    ).toBeInTheDocument();
  });
});
