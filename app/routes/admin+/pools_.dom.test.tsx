/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const loaderDataSnapshot = {
  pool: {
    id: 'pool-1',
    title: "Marco's Birthday",
    status: 'OPEN' as const,
    occasionType: 'BIRTHDAY',
    eventDate: '2026-05-15T00:00:00.000Z',
    decisionMode: 'ORGANIZER_PICKS',
    inviteCode: 'abc123',
    finalPriceCents: 2500,
    chosenIdeaId: 'idea-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-04-10T00:00:00.000Z',
    organizer: { id: 'u1', username: 'wade', name: 'Wade Wilson' },
    purchaser: null,
    deliverer: null,
    recipientUser: { id: 'u2', username: 'marco', name: 'Marco' },
    recipientName: null,
    contributors: [
      {
        userId: 'u1',
        username: 'wade',
        name: 'Wade Wilson',
        contributionCents: 1000,
        hasPaid: true,
      },
      {
        userId: 'u3',
        username: 'sofia',
        name: 'Sofia',
        contributionCents: null,
        hasPaid: false,
      },
    ],
    ideas: [
      {
        id: 'idea-1',
        name: 'Nice watch',
        estimatedPriceCents: 2500,
        proposedBy: { username: 'wade' },
        voteCount: 2,
      },
      {
        id: 'idea-2',
        name: 'Book set',
        estimatedPriceCents: 1500,
        proposedBy: { username: 'sofia' },
        voteCount: 0,
      },
    ],
    activities: [
      {
        id: 'act-1',
        type: 'pool.created',
        actorId: 'u1',
        payload: '{"title":"Marco\'s Birthday"}',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'act-2',
        type: 'idea.proposed',
        actorId: 'u1',
        payload: null,
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ],
  },
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return {
    ...actual,
    useLoaderData: () => loaderDataSnapshot,
    useFetcher: () => ({ data: null, state: 'idle', submit: vi.fn() }),
  };
});

vi.mock('#app/utils/permissions.server.ts', () => ({
  requireUserWithRole: vi.fn(),
}));

vi.mock('#app/utils/admin.server.ts', () => ({
  getAdminPoolDetail: vi.fn(),
}));

vi.mock('#app/utils/pool.server.ts', () => ({
  cancelPool: vi.fn(),
}));

vi.mock('#app/utils/pool-activity.server.ts', () => ({
  logPoolActivity: vi.fn(),
}));

import PoolDetailRoute from './pools_.$poolId.tsx';

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={['/admin/pools/pool-1']}>
      <PoolDetailRoute />
    </MemoryRouter>,
  );

describe('admin pool detail page', () => {
  it('renders the pool title and status line', () => {
    renderDetail();
    expect(
      screen.getByRole('heading', { name: "Marco's Birthday" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Open/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Birthday/).length).toBeGreaterThan(0);
  });

  it('renders all section headings', () => {
    renderDetail();
    for (const heading of [
      'Details',
      'Contributors (2)',
      'Ideas (2)',
      'Admin actions',
      'Activity timeline (2)',
    ]) {
      expect(
        screen.getByRole('heading', { name: heading }),
      ).toBeInTheDocument();
    }
  });

  it('renders contributor table with paid/unpaid badges', () => {
    renderDetail();
    expect(screen.getByText('Wade Wilson')).toBeInTheDocument();
    expect(screen.getByText('Sofia')).toBeInTheDocument();
    expect(screen.getByText('paid')).toBeInTheDocument();
    expect(screen.getByText('unpaid')).toBeInTheDocument();
  });

  it('renders ideas with vote counts and chosen highlight', () => {
    renderDetail();
    expect(screen.getByText('Nice watch')).toBeInTheDocument();
    expect(screen.getByText('Book set')).toBeInTheDocument();
    expect(screen.getByText('chosen')).toBeInTheDocument();
    expect(screen.getByText('2 votes')).toBeInTheDocument();
    expect(screen.getByText('0 votes')).toBeInTheDocument();
  });

  it('renders activity timeline rows', () => {
    renderDetail();
    expect(screen.getByText('pool.created')).toBeInTheDocument();
    expect(screen.getByText('idea.proposed')).toBeInTheDocument();
  });

  it('renders the cancel button for cancellable pools', () => {
    renderDetail();
    expect(
      screen.getByRole('button', { name: 'Cancel pool' }),
    ).toBeInTheDocument();
  });

  it('does NOT render cancel button for delivered pools', () => {
    loaderDataSnapshot.pool = {
      ...loaderDataSnapshot.pool,
      status: 'DELIVERED' as const,
    };
    renderDetail();
    expect(
      screen.queryByRole('button', { name: 'Cancel pool' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/no admin actions available/),
    ).toBeInTheDocument();
  });

  it('links back to the pools list', () => {
    renderDetail();
    const link = screen.getByRole('link', { name: /Back to pools/ });
    expect(link).toHaveAttribute('href', '/admin/pools');
  });

  it('renders the detail fields', () => {
    renderDetail();
    expect(screen.getByText('pool-1')).toBeInTheDocument();
    expect(screen.getAllByText('wade').length).toBeGreaterThan(0);
    expect(screen.getByText('abc123')).toBeInTheDocument();
    expect(screen.getAllByText('$25.00').length).toBeGreaterThan(0);
  });
});
