/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { type FormHTMLAttributes, type ReactNode } from 'react';
import type * as ReactRouter from 'react-router';
import { createRoutesStub, data, MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const loaderDataSnapshot = {
  cacheKeys: {
    lru: ['admin:overview:counts:v1', 'admin:analytics:environment:v1:30'],
    sqlite: ['admin:dropoff:v1:30'],
  },
  instance: 'app-primary',
  instances: {
    'app-primary': 'iad',
    'app-replica': 'sjc',
  },
  currentInstanceInfo: {
    currentInstance: 'app-primary',
    primaryInstance: 'app-primary',
  },
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  const MockForm = ({
    children,
    ...props
  }: FormHTMLAttributes<HTMLFormElement> & {
    children: ReactNode;
  }) => <form {...props}>{children}</form>;
  return {
    ...actual,
    Form: MockForm,
    useFetcher: () => ({
      state: 'idle',
      Form: MockForm,
    }),
    useLoaderData: () => loaderDataSnapshot,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useSubmit: () => vi.fn(),
  };
});

vi.mock('#app/utils/cache.server.ts', () => ({
  cache: { delete: vi.fn() },
  getAllCacheKeys: vi.fn(),
  lruCache: { delete: vi.fn() },
  searchCacheKeys: vi.fn(),
}));

vi.mock('#app/utils/litefs.server.ts', () => ({
  ensureInstance: vi.fn(),
  getAllInstances: vi.fn(),
  getInstanceInfo: vi.fn(),
}));

vi.mock('#app/utils/permissions.server.ts', () => ({
  requireUserWithRole: vi.fn(),
}));

import CacheAdminRoute, { ErrorBoundary } from './cache.tsx';

const renderCache = () =>
  render(
    <MemoryRouter initialEntries={['/admin/cache']}>
      <CacheAdminRoute />
    </MemoryRouter>,
  );

describe('admin cache page', () => {
  it('renders cache summary cards, filters, and grouped cache keys', () => {
    renderCache();

    expect(screen.getByRole('heading', { name: 'Cache' })).toBeInTheDocument();
    expect(screen.getByText('Entries shown')).toBeInTheDocument();
    expect(screen.getByText('LRU entries')).toBeInTheDocument();
    expect(screen.getByText('SQLite entries')).toBeInTheDocument();
    expect(screen.getByText('Selected instance')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('admin:analytics, user id, route...'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'LRU cache' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'SQLite cache' }),
    ).toBeInTheDocument();
    expect(screen.getByText('admin:overview:counts:v1')).toBeInTheDocument();
    expect(screen.getByText('admin:dropoff:v1:30')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'View' })).toHaveLength(3);
  });
});

describe('admin cache page error boundary', () => {
  it('renders a lock icon and the permission message on a 403', async () => {
    const Stub = createRoutesStub([
      {
        path: '/admin/cache',
        loader() {
          throw data({ message: 'Unauthorized: required role admin' }, { status: 403 });
        },
        Component: () => null,
        ErrorBoundary,
      },
    ]);
    render(<Stub initialEntries={['/admin/cache']} />);

    expect(
      await screen.findByRole('heading', {
        name: 'You are not allowed to do that',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Unauthorized: required role admin'),
    ).toBeInTheDocument();
  });
});
