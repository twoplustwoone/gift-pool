/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireUserId = vi.fn();
const findMany = vi.fn();
const loaderDataSnapshot: {
  active: Array<{
    _count: { contributors: number; ideas: number };
    eventDate: string | null;
    giftGroup: { id: string; name: string } | null;
    id: string;
    occasionType: string;
    organizer: { id: string };
    recipientName: string | null;
    recipientUser: { name: string | null; username: string } | null;
    status: string;
    title: string;
  }>;
  completed: Array<{
    _count: { contributors: number; ideas: number };
    eventDate: string | null;
    giftGroup: { id: string; name: string } | null;
    id: string;
    occasionType: string;
    organizer: { id: string };
    recipientName: string | null;
    recipientUser: { name: string | null; username: string } | null;
    status: string;
    title: string;
  }>;
} = {
  active: [],
  completed: [],
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>(
    'react-router',
  );

  return {
    ...actual,
    useLoaderData: () => loaderDataSnapshot,
  };
});

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    pool: {
      findMany: (...args: Array<unknown>) => findMany(...args),
    },
  },
}));

import PoolsIndex, { loader } from './index.tsx';

describe('app/routes/pools+/index.tsx', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('viewer-1');
    findMany.mockReset();
    loaderDataSnapshot.active = [];
    loaderDataSnapshot.completed = [];
  });

  function renderRoute(
    overrides: Partial<typeof loaderDataSnapshot> = {},
  ) {
    loaderDataSnapshot.active = overrides.active ?? [];
    loaderDataSnapshot.completed = overrides.completed ?? [];

    return render(
      <MemoryRouter initialEntries={['/pools']}>
        <PoolsIndex />
      </MemoryRouter>,
    );
  }

  it('splits active and completed pools in the loader', async () => {
    findMany.mockResolvedValue([
      {
        _count: { contributors: 2, ideas: 1 },
        eventDate: new Date('2026-06-14T00:00:00.000Z'),
        giftGroup: null,
        id: 'pool-open',
        occasionType: 'BIRTHDAY',
        organizer: { id: 'viewer-1' },
        recipientName: 'Alex',
        recipientUser: null,
        status: 'OPEN',
        title: 'Open Pool',
      },
      {
        _count: { contributors: 3, ideas: 2 },
        eventDate: null,
        giftGroup: { id: 'group-1', name: 'Family' },
        id: 'pool-delivered',
        occasionType: 'WEDDING',
        organizer: { id: 'viewer-2' },
        recipientName: null,
        recipientUser: { name: 'Sam', username: 'sam' },
        status: 'DELIVERED',
        title: 'Delivered Pool',
      },
      {
        _count: { contributors: 4, ideas: 0 },
        eventDate: null,
        giftGroup: null,
        id: 'pool-cancelled',
        occasionType: 'HOLIDAY',
        organizer: { id: 'viewer-3' },
        recipientName: null,
        recipientUser: { name: null, username: 'jamie' },
        status: 'CANCELLED',
        title: 'Cancelled Pool',
      },
    ]);

    await expect(
      loader({
        context: {},
        params: {},
        request: new Request('https://giftpool.app/pools'),
      } as never),
    ).resolves.toMatchObject({
      active: [{ id: 'pool-open' }],
      completed: [
        { id: 'pool-delivered' },
        { id: 'pool-cancelled' },
      ],
      userId: 'viewer-1',
    });
  });

  it('renders the empty state when there are no pools', () => {
    renderRoute();

    expect(screen.getByText('No pools yet.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /start your first pool/i }),
    ).toHaveAttribute('href', '/pools/new');
  });

  it('renders active and completed pool sections', () => {
    const eventDate = '2026-06-14T00:00:00.000Z';

    renderRoute({
      active: [
        {
          _count: { contributors: 2, ideas: 1 },
          eventDate,
          giftGroup: null,
          id: 'pool-open',
          occasionType: 'BIRTHDAY',
          organizer: { id: 'viewer-1' },
          recipientName: 'Alex',
          recipientUser: null,
          status: 'OPEN',
          title: 'Alex Birthday Pool',
        },
      ],
      completed: [
        {
          _count: { contributors: 3, ideas: 2 },
          eventDate: null,
          giftGroup: { id: 'group-1', name: 'Family' },
          id: 'pool-delivered',
          occasionType: 'WEDDING',
          organizer: { id: 'viewer-2' },
          recipientName: null,
          recipientUser: { name: 'Sam', username: 'sam' },
          status: 'DELIVERED',
          title: 'Sam Wedding Pool',
        },
      ],
    });

    // Tab bar renders with both tabs
    expect(screen.getByRole('tab', { name: /^Active/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Past/ })).toBeInTheDocument();

    // Active tab is selected by default — shows active pool
    expect(
      screen.getByRole('link', { name: /Alex Birthday Pool/i }),
    ).toHaveAttribute('href', '/pools/pool-open');
    expect(
      screen.getByText((_, element) => element?.textContent === 'Birthday for Alex'),
    ).toBeInTheDocument();
    expect(screen.getByText('June 14, 2026')).toBeInTheDocument();
    expect(screen.getByText('Collect ideas')).toBeInTheDocument();

    // Switch to Past tab — shows completed pool
    fireEvent.click(screen.getByRole('tab', { name: /^Past/ }));
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('Family')).toBeInTheDocument();
  });
});
