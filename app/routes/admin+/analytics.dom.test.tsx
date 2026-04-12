/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaderDataSnapshot = {
  analytics: {
    totalUsers: 42,
    dau: 5,
    wau: 12,
    mau: 30,
    dailyActive: [
      { date: '2026-03-12', count: 3 },
      { date: '2026-03-13', count: 5 },
    ],
    eventsLast7Days: [
      { name: 'user_logged_in', count: 20 },
      { name: 'wishlist_viewed', count: 8 },
    ],
    eventsLast30Days: [
      { name: 'user_logged_in', count: 60 },
      { name: 'pool_created', count: 3 },
    ],
  },
  funnel: [
    { step: 'Signed up', count: 10, percent: 100 },
    { step: 'Added first wishlist item', count: 8, percent: 80 },
    { step: 'Made first friend', count: 7, percent: 70 },
    { step: 'Contributed to a pool', count: 4, percent: 40 },
    { step: 'Received a delivered gift', count: 0, percent: 0 },
  ],
  retention: [
    {
      cohortWeek: '2026-W14',
      cohortSize: 10,
      weeks: [
        { weekOffset: 0, retainedUsers: 10, retainedPercent: 100 },
        { weekOffset: 1, retainedUsers: 5, retainedPercent: 50 },
      ],
    },
  ],
  optOutMatrix: [
    { type: 'FRIEND_REQUEST_RECEIVED', inAppOptOutPercent: 0, emailOptOutPercent: 0, total: 10 },
    { type: 'UPCOMING_BIRTHDAY', inAppOptOutPercent: 0, emailOptOutPercent: 100, total: 10 },
  ],
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

vi.mock('#app/utils/analytics.server.ts', () => ({
  getAnalyticsCounts: vi.fn(),
}));

vi.mock('#app/utils/admin.server.ts', () => ({
  getActivationFunnel: vi.fn(),
  getWeeklyRetention: vi.fn(),
  getNotificationOptOutMatrix: vi.fn(),
}));

import AnalyticsRoute from './analytics.tsx';

const renderAnalytics = () =>
  render(
    <MemoryRouter initialEntries={['/admin/analytics']}>
      <AnalyticsRoute />
    </MemoryRouter>,
  );

describe('admin analytics page', () => {
  it('renders the page heading', () => {
    renderAnalytics();
    expect(
      screen.getByRole('heading', { name: 'Analytics' }),
    ).toBeInTheDocument();
  });

  it('renders DAU/WAU/MAU summary cards', () => {
    renderAnalytics();
    expect(screen.getByText('Total users')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('DAU (24h)')).toBeInTheDocument();
    expect(screen.getByText('WAU (7d)')).toBeInTheDocument();
    expect(screen.getByText('MAU (30d)')).toBeInTheDocument();
  });

  it('renders the daily active chart', () => {
    renderAnalytics();
    expect(
      screen.getByRole('heading', { name: 'Daily active users' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Peak: 5')).toBeInTheDocument();
  });

  it('renders the activation funnel', () => {
    renderAnalytics();
    expect(
      screen.getByRole('heading', { name: 'Activation funnel' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Signed up')).toBeInTheDocument();
    expect(screen.getByText('Added first wishlist item')).toBeInTheDocument();
    expect(screen.getByText('Made first friend')).toBeInTheDocument();
    expect(screen.getByText('Contributed to a pool')).toBeInTheDocument();
    expect(screen.getByText('Received a delivered gift')).toBeInTheDocument();
    expect(screen.getByText(/8 \(80%\)/)).toBeInTheDocument();
    expect(screen.getByText(/4 \(40%\)/)).toBeInTheDocument();
  });

  it('renders the retention cohort grid', () => {
    renderAnalytics();
    expect(
      screen.getByRole('heading', { name: 'Weekly retention' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2026-W14')).toBeInTheDocument();
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders the notification opt-out matrix', () => {
    renderAnalytics();
    expect(
      screen.getByRole('heading', { name: 'Notification opt-outs' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('friend request received'),
    ).toBeInTheDocument();
    expect(screen.getByText('upcoming birthday')).toBeInTheDocument();
  });

  it('renders event tables', () => {
    renderAnalytics();
    expect(
      screen.getByRole('heading', { name: 'Events (last 7 days)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Events (last 30 days)' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('user logged in').length).toBeGreaterThan(0);
  });
});
