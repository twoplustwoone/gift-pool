/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaderDataSnapshot = {
  canManage: true,
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
  pool: {
    id: 'pool-1',
    occasionType: 'BIRTHDAY',
    recipientName: null as string | null,
    recipientUser: { name: 'Alex', username: 'alex' } as {
      name: string | null;
      username: string;
    } | null,
    status: 'VOTING',
    title: 'Alex Birthday Pool',
  },
};

vi.mock('#app/components/notifications/context-notification-controls.tsx', () => ({
  ContextNotificationControl: () => <button>Important</button>,
  ContextNotificationAwarenessNotice: () => null,
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>(
    'react-router',
  );

  return {
    ...actual,
    Outlet: () => <div>Pool overview content</div>,
    useLoaderData: () => loaderDataSnapshot,
  };
});

import PoolLayout from './_layout.tsx';

describe('app/routes/pools+/$poolId+/_layout.tsx', () => {
  beforeEach(() => {
    loaderDataSnapshot.pool.recipientName = null;
    loaderDataSnapshot.pool.recipientUser = {
      name: 'Alex',
      username: 'alex',
    };
    loaderDataSnapshot.pool.status = 'VOTING';
    loaderDataSnapshot.pool.title = 'Alex Birthday Pool';
  });

  it('renders the pool header and outlet content', () => {
    render(
      <MemoryRouter initialEntries={['/pools/pool-1']}>
        <PoolLayout />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /pools/i })).toHaveAttribute(
      'href',
      '/pools',
    );
    expect(screen.getByText('Alex Birthday Pool')).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === 'Birthday for Alex'),
    ).toBeInTheDocument();
    expect(screen.getByText('Voting')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Important' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Pool overview content')).toBeInTheDocument();
  });

  it('falls back to the username when no recipient name is present', () => {
    loaderDataSnapshot.pool.recipientUser = { name: null, username: 'jamie' };

    render(
      <MemoryRouter initialEntries={['/pools/pool-1']}>
        <PoolLayout />
      </MemoryRouter>,
    );

    expect(screen.getByText('Birthday for jamie')).toBeInTheDocument();
  });
});
