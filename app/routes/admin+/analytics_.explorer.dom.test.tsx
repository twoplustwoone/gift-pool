/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { type FormHTMLAttributes, type ReactNode } from 'react';
import type * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const loaderDataSnapshot = {
  chart: 'bar',
  explorer: {
    days: 30,
    eventName: 'client_environment_observed',
    groupBy: 'browser',
    totalEvents: 3,
    uniqueUsers: 1,
    uniqueVisitors: 2,
    series: [
      { date: '2026-06-28', count: 1 },
      { date: '2026-06-29', count: 2 },
    ],
    breakdown: [
      { label: 'Chrome 126', count: 2, percent: 67 },
      { label: 'Safari 17', count: 1, percent: 33 },
    ],
    recentEvents: [
      {
        id: 'event-1',
        eventId: 'client-environment:v1',
        name: 'client_environment_observed',
        source: 'client',
        createdAt: '2026-06-29T12:00:00.000Z',
        userId: 'user-1234567890',
        visitorId: 'visitor-1234567890',
        propertiesPreview: '{"browserFamily":"Chrome"}',
      },
    ],
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
    useLoaderData: () => loaderDataSnapshot,
  };
});

vi.mock('#app/utils/analytics.server.ts', () => ({
  ANALYTICS_EXPLORER_DAY_OPTIONS: [7, 30, 90],
  ANALYTICS_EXPLORER_GROUP_BY_OPTIONS: [
    'event',
    'source',
    'browser',
    'os',
    'device',
    'viewport',
    'displayMode',
    'standalone',
  ],
  getAnalyticsExplorer: vi.fn(),
}));

vi.mock('#app/utils/permissions.server.ts', () => ({
  requireUserWithRole: vi.fn(),
}));

import AnalyticsExplorerRoute from './analytics_.explorer.tsx';

const renderExplorer = () =>
  render(
    <MemoryRouter initialEntries={['/admin/analytics/explorer']}>
      <AnalyticsExplorerRoute />
    </MemoryRouter>,
  );

describe('admin analytics explorer page', () => {
  it('renders controls, trend, breakdown, and recent events', () => {
    renderExplorer();

    expect(
      screen.getByRole('heading', { name: 'Analytics explorer' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Date range')).toBeInTheDocument();
    expect(screen.getByLabelText('Event')).toBeInTheDocument();
    expect(screen.getByLabelText('Group by')).toBeInTheDocument();
    expect(screen.getByLabelText('Chart')).toBeInTheDocument();
    expect(screen.getByText('Matching events')).toBeInTheDocument();
    expect(screen.getByText('Chrome 126')).toBeInTheDocument();
    expect(screen.getByText('Safari 17')).toBeInTheDocument();
    expect(screen.getByText('Recent matching events')).toBeInTheDocument();
    expect(screen.getByText(/browserFamily/)).toBeInTheDocument();
  });
});
