/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaderDataSnapshot: {
  pools: Array<{
    id: string;
    title: string;
    status: string;
    occasionType: string;
    eventDate: string | null;
    updatedAt: string;
    inviteCode: string | null;
    organizer: { id: string; username: string; name: string | null };
    contributorCount: number;
  }>;
  total: number;
  statusParam: string;
  page: number;
  pageSize: number;
} = { pools: [], total: 0, statusParam: 'stuck', page: 1, pageSize: 25 };

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
  listAdminPools: vi.fn(),
}));

import PoolsRoute from './pools.tsx';

const renderPools = () =>
  render(
    <MemoryRouter initialEntries={['/admin/pools']}>
      <PoolsRoute />
    </MemoryRouter>,
  );

beforeEach(() => {
  loaderDataSnapshot.pools = [];
  loaderDataSnapshot.total = 0;
  loaderDataSnapshot.statusParam = 'stuck';
  loaderDataSnapshot.page = 1;
  loaderDataSnapshot.pageSize = 25;
});

describe('admin pools list page', () => {
  it('renders the heading and status tabs', () => {
    renderPools();
    expect(screen.getByRole('heading', { name: 'Pools' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Stuck' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Delivered' })).toBeInTheDocument();
  });

  it('shows empty state for stuck pools', () => {
    renderPools();
    expect(
      screen.getByText(/No stuck pools. Everything is moving along./),
    ).toBeInTheDocument();
  });

  it('renders pool rows with title, status badge, occasion, and contributor count', () => {
    loaderDataSnapshot.pools = [
      {
        id: 'p1',
        title: "Marco's Birthday",
        status: 'OPEN',
        occasionType: 'BIRTHDAY',
        eventDate: '2026-03-01T00:00:00.000Z',
        updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        inviteCode: null,
        organizer: { id: 'u1', username: 'wade', name: 'Wade' },
        contributorCount: 4,
      },
    ];
    loaderDataSnapshot.total = 1;
    loaderDataSnapshot.statusParam = 'all';
    renderPools();

    expect(screen.getByText("Marco's Birthday")).toBeInTheDocument();
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Birthday').length).toBeGreaterThan(0);
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('overdue')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Marco's Birthday/ }),
    ).toHaveAttribute('href', '/admin/pools/p1');
  });

  it('renders pagination when more than one page', () => {
    loaderDataSnapshot.pools = [
      {
        id: 'p1',
        title: 'Pool 1',
        status: 'OPEN',
        occasionType: 'OTHER',
        eventDate: null,
        updatedAt: new Date().toISOString(),
        inviteCode: null,
        organizer: { id: 'u1', username: 'wade', name: null },
        contributorCount: 1,
      },
    ];
    loaderDataSnapshot.total = 50;
    loaderDataSnapshot.page = 1;
    loaderDataSnapshot.statusParam = 'all';
    renderPools();

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Next/ })).toBeInTheDocument();
  });
});
