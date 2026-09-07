/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

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
  dropOff: {
    signup: [
      { step: 'Signup submitted', count: 25, percent: 100 },
      { step: 'Email verified', count: 18, percent: 72 },
      { step: 'Onboarding completed', count: 15, percent: 60 },
    ],
    invites: [
      { inviteType: 'group', landed: 10, deadLinkLandings: 1, completed: 6 },
      { inviteType: 'pool', landed: 8, deadLinkLandings: 0, completed: 2 },
      { inviteType: 'friend', landed: 5, deadLinkLandings: 2, completed: 3 },
    ],
    editor: { opened: 20, added: 14 },
    share: { views: 30, uniqueVisitors: 18, outboundClicks: 9 },
    exchanges: [
      { step: 'Exchange created', count: 4, percent: 100 },
      { step: 'Names drawn', count: 3, percent: 75 },
      { step: 'Pairings revealed', count: 1, percent: 25 },
    ],
  },
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
    {
      type: 'FRIEND_REQUEST_RECEIVED',
      inAppOptOutPercent: 0,
      emailOptOutPercent: 0,
      total: 10,
    },
    {
      type: 'UPCOMING_BIRTHDAY',
      inAppOptOutPercent: 0,
      emailOptOutPercent: 100,
      total: 10,
    },
  ],
  organizerReminders: {
    days: 30,
    queuedReminders: 4,
    targetedRecipients: 10,
    deliveredRecipients: 8,
    deliveryRate: 80,
    notificationClicks: 3,
    clickEventRate: 38,
    repeatSends: 1,
    skippedAttempts: { noEligible: 2, cooldown: 1, weeklyLimit: 1 },
    settingsReducedWithin7Days: 1,
    byKind: [
      {
        kind: 'CONTRIBUTION',
        label: 'Contribution',
        notificationType: 'POOL_CONTRIBUTION_REMINDER',
        queued: 2,
        targeted: 5,
        delivered: 4,
        clicks: 2,
      },
      {
        kind: 'VOTE',
        label: 'Vote',
        notificationType: 'POOL_VOTE_REMINDER',
        queued: 1,
        targeted: 3,
        delivered: 2,
        clicks: 1,
      },
      {
        kind: 'PURCHASE',
        label: 'Purchase',
        notificationType: 'POOL_PURCHASE_REMINDER',
        queued: 1,
        targeted: 2,
        delivered: 2,
        clicks: 0,
      },
      {
        kind: 'DELIVERY',
        label: 'Delivery',
        notificationType: 'POOL_DELIVERY_REMINDER',
        queued: 0,
        targeted: 0,
        delivered: 0,
        clicks: 0,
      },
    ],
  },
  enrichment: {
    attempts: 20,
    successes: 15,
    foundTitle: 14,
    foundPrice: 11,
    foundImage: 12,
    llmAttempted: 4,
    llmRescued: 3,
    avgDurationMs: 850,
    itemsSaved: 9,
    itemsSavedEnriched: 6,
    itemsSavedWithPrice: 5,
  },
  enrichmentFailures: {
    byOutcome: [
      { outcome: 'fetch_failed', count: 3 },
      { outcome: 'timeout', count: 2 },
    ],
    topFailingHosts: [{ host: 'amazon.com', count: 3 }],
  },
  linkClicks: {
    totalClicks: 11,
    taggedClicks: 7,
    itemClicks: 8,
    ideaClicks: 3,
    perDay: [{ day: '2026-03-13', clicks: 11, tagged: 7 }],
  },
  smartLinks: { proposed: 5, fromWishlist: 2, withPrice: 4 },
  environment: {
    totalObservations: 4,
    uniqueVisitors: 3,
    standaloneObservations: 1,
    browserObservations: 3,
    standalonePercent: 25,
    browsers: [
      { label: 'Chrome 120', count: 3, percent: 75 },
      { label: 'Safari 17', count: 1, percent: 25 },
    ],
    operatingSystems: [
      { label: 'macOS', count: 2, percent: 50 },
      { label: 'iOS', count: 2, percent: 50 },
    ],
    deviceTypes: [
      { label: 'desktop', count: 2, percent: 50 },
      { label: 'mobile', count: 2, percent: 50 },
    ],
    viewportBuckets: [
      { label: 'desktop', count: 2, percent: 50 },
      { label: 'mobile', count: 2, percent: 50 },
    ],
    displayModes: [
      { label: 'browser', count: 3, percent: 75 },
      { label: 'standalone', count: 1, percent: 25 },
    ],
    pwaFunnel: [
      { label: 'Prompt available', count: 2, percent: 0 },
      { label: 'Install clicked', count: 1, percent: 0 },
      { label: 'Install accepted', count: 1, percent: 0 },
      { label: 'Install dismissed', count: 0, percent: 0 },
      { label: 'App installed', count: 1, percent: 0 },
      { label: 'Standalone launches', count: 1, percent: 0 },
    ],
  },
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
  getEnvironmentAnalytics: vi.fn(),
}));

vi.mock('#app/utils/admin.server.ts', () => ({
  getActivationFunnel: vi.fn(),
  getDropOffFunnels: vi.fn(),
  getWeeklyRetention: vi.fn(),
  getNotificationOptOutMatrix: vi.fn(),
  getEnrichmentFunnel: vi.fn(),
  getEnrichmentFailures: vi.fn(),
  getLinkClickStats: vi.fn(),
  getSmartLinkAdoption: vi.fn(),
}));

vi.mock('#app/utils/admin-organizer-reminders.server.ts', () => ({
  getOrganizerReminderMetrics: vi.fn(),
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
    expect(screen.getByRole('link', { name: 'Open explorer' })).toHaveAttribute(
      'href',
      '/admin/analytics/explorer',
    );
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

  it('renders the drop-off funnels section', () => {
    renderAnalytics();
    expect(
      screen.getByRole('heading', { name: 'Drop-off funnels' }),
    ).toBeInTheDocument();
    // Signup funnel steps with percents relative to submissions.
    expect(screen.getByText('Signup submitted')).toBeInTheDocument();
    expect(screen.getByText(/18 \(72%\)/)).toBeInTheDocument();
    expect(screen.getByText(/15 \(60%\)/)).toBeInTheDocument();
    // Exchange lifecycle funnel, counted per exchange.
    expect(screen.getByText('Gift exchanges')).toBeInTheDocument();
    expect(screen.getByText('Names drawn')).toBeInTheDocument();
    expect(screen.getByText('Pairings revealed')).toBeInTheDocument();
    // Invite table: per-type landings, joins, conversion, dead links.
    expect(screen.getByText('Invite links')).toBeInTheDocument();
    expect(screen.getByText('Dead-link landings')).toBeInTheDocument();
    expect(screen.getByText('group')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument(); // pool: 2 of 8
    // Editor conversion card: 14 of 20 = 70%.
    expect(screen.getByText('Add-item editor')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
    // Share reach cards.
    expect(screen.getByText('Share-link views')).toBeInTheDocument();
    expect(screen.getByText('18 unique visitors')).toBeInTheDocument();
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
    expect(screen.getByText('friend request received')).toBeInTheDocument();
    expect(screen.getByText('upcoming birthday')).toBeInTheDocument();
  });

  it('renders aggregate organizer reminder outcomes and caveats', () => {
    renderAnalytics();
    expect(
      screen.getByRole('heading', { name: 'Organizer reminders' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Reminders queued')).toBeInTheDocument();
    expect(screen.getByText('Recipients delivered')).toBeInTheDocument();
    expect(screen.getByText('Rate-limited attempts')).toBeInTheDocument();
    expect(screen.getByText('1 cooldown · 1 weekly limit')).toBeInTheDocument();
    expect(screen.getByText('Contribution')).toBeInTheDocument();
    expect(screen.getByText('Delivery')).toBeInTheDocument();
    expect(screen.getByText(/not per-nudge attribution/i)).toBeInTheDocument();
    expect(
      screen.getByText(/not proof the reminder caused/i),
    ).toBeInTheDocument();
  });

  it('renders the environment analytics section', () => {
    renderAnalytics();
    expect(
      screen.getByRole('heading', { name: 'Environment' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Environment snapshots')).toBeInTheDocument();
    expect(screen.getByText('Chrome 120')).toBeInTheDocument();
    expect(screen.getByText('Safari 17')).toBeInTheDocument();
    expect(screen.getByText('Prompt available')).toBeInTheDocument();
    expect(screen.getAllByText('Standalone launches').length).toBeGreaterThan(
      0,
    );
  });

  it('renders the link enrichment & affiliate section', () => {
    renderAnalytics();
    expect(
      screen.getByRole('heading', { name: 'Link enrichment & affiliate' }),
    ).toBeInTheDocument();
    // Funnel cards: 15/20 success, 11/20 price found, 6/9 kept at save.
    expect(screen.getByText('Unfurl attempts')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    // Failure breakdown + failing hosts.
    expect(screen.getByText('fetch failed')).toBeInTheDocument();
    expect(screen.getByText('amazon.com')).toBeInTheDocument();
    // Click reconciliation.
    expect(screen.getByText('Tagged clicks')).toBeInTheDocument();
    expect(
      screen.getByText(/compare “Tagged” with the click report/i),
    ).toBeInTheDocument();
    // Smart-link adoption: 2/5 = 40%.
    expect(screen.getByText('Ideas from wishlists')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
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
