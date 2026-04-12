/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaderDataSnapshot: {
  query: string;
  results: Array<{
    id: string;
    email: string;
    username: string;
    name: string | null;
    createdAt: string;
    image: { id: string } | null;
    roleNames: Array<string>;
    wishlistItemCount: number;
    friendshipCount: number;
  }>;
} = { query: '', results: [] };

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return {
    ...actual,
    useLoaderData: () => loaderDataSnapshot,
    useSubmit: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    Form: ({
      children,
      method,
      className,
      onChange,
    }: {
      children?: React.ReactNode;
      method?: string;
      className?: string;
      onChange?: React.FormEventHandler;
    }) => (
      <form method={method} className={className} onChange={onChange}>
        {children}
      </form>
    ),
  };
});

vi.mock('#app/utils/permissions.server.ts', () => ({
  requireUserWithRole: vi.fn(),
}));

vi.mock('#app/utils/admin.server.ts', () => ({
  searchAdminUsers: vi.fn(),
}));

import UsersRoute from './users.tsx';

const renderUsers = () =>
  render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <UsersRoute />
    </MemoryRouter>,
  );

beforeEach(() => {
  loaderDataSnapshot.query = '';
  loaderDataSnapshot.results = [];
});

describe('admin users search page', () => {
  it('renders the heading and search prompt when query is empty', () => {
    renderUsers();
    expect(
      screen.getByRole('heading', { name: 'Users' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Enter a query to search.'),
    ).toBeInTheDocument();
  });

  it('renders empty-state when query has results = 0', () => {
    loaderDataSnapshot.query = 'nobody';
    loaderDataSnapshot.results = [];
    renderUsers();
    expect(
      screen.getByText(/No users match/),
    ).toBeInTheDocument();
  });

  it('renders a results table with user data', () => {
    loaderDataSnapshot.query = 'wade';
    loaderDataSnapshot.results = [
      {
        id: 'user-1',
        email: 'wade@example.com',
        username: 'wade',
        name: 'Wade Wilson',
        createdAt: '2026-01-01T00:00:00.000Z',
        image: null,
        roleNames: ['admin', 'user'],
        wishlistItemCount: 22,
        friendshipCount: 6,
      },
      {
        id: 'user-2',
        email: 'marco@example.com',
        username: 'marco',
        name: 'Marco',
        createdAt: '2026-02-01T00:00:00.000Z',
        image: null,
        roleNames: ['user'],
        wishlistItemCount: 7,
        friendshipCount: 3,
      },
    ];
    renderUsers();

    expect(
      screen.getByRole('heading', { name: /Results for "wade"/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 users')).toBeInTheDocument();

    // User details
    expect(screen.getByText('Wade Wilson')).toBeInTheDocument();
    expect(screen.getByText(/@wade · wade@example.com/)).toBeInTheDocument();
    expect(screen.getByText('Marco')).toBeInTheDocument();

    // Role badges
    const adminBadges = screen.getAllByText('admin');
    expect(adminBadges.length).toBeGreaterThan(0);

    // Counts
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();

    // Row links to drill-down
    const link = screen.getByRole('link', { name: /Wade Wilson/ });
    expect(link.closest('a')).toHaveAttribute('href', '/admin/users/user-1');
  });

  it('renders the search input', () => {
    renderUsers();
    const input = screen.getByRole('searchbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('name', 'q');
  });
});
