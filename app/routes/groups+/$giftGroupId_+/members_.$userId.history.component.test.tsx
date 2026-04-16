/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it } from 'vitest';

import MemberGiftHistoryPage from './members_.$userId.history.tsx';

function renderWithLoader(loaderData: unknown) {
  const App = createRoutesStub([
    {
      path: '/groups/:giftGroupId/members/:userId/history',
      loader: async () => loaderData,
      HydrateFallback: () => null,
      Component: MemberGiftHistoryPage,
    },
  ]);
  return render(
    <App initialEntries={['/groups/g1/members/marco/history']} />,
  );
}

describe('MemberGiftHistoryPage component', () => {
  it('renders the empty state when no gifts have been delivered', async () => {
    renderWithLoader({
      member: { id: 'marco', username: 'marco', name: 'Marco' },
      gifts: [],
    });

    expect(await screen.findByText('Gifts for Marco')).toBeInTheDocument();
    expect(
      screen.getByText('Past pools delivered to @marco in this group.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No gifts delivered yet.')).toBeInTheDocument();
  });

  it('renders gift rows with totals, occasion labels, and back link', async () => {
    renderWithLoader({
      member: { id: 'marco', username: 'marco', name: 'Marco' },
      gifts: [
        {
          id: 'pool-1',
          title: "Marco's 30th",
          occasionType: 'BIRTHDAY',
          eventDate: '2025-05-03T00:00:00.000Z',
          deliveredAt: '2025-05-04T00:00:00.000Z',
          giftName: 'Sony WH-1000XM5',
          totalCents: 12500,
        },
        {
          id: 'pool-2',
          title: 'Anniversary thing',
          occasionType: 'ANNIVERSARY',
          eventDate: null,
          deliveredAt: '2024-12-01T00:00:00.000Z',
          giftName: null,
          totalCents: 0,
        },
      ],
    });

    expect(await screen.findByText("Marco's 30th")).toBeInTheDocument();
    expect(screen.getByText('Sony WH-1000XM5')).toBeInTheDocument();
    expect(screen.getByText('$125.00')).toBeInTheDocument();
    expect(
      screen.getByText('No specific gift recorded'),
    ).toBeInTheDocument();
    // Back link is present
    expect(
      screen.getByRole('link', { name: /back to members/i }),
    ).toBeInTheDocument();
    // Both rows link to their pool
    expect(
      screen.getByRole('link', { name: /Marco's 30th/i }),
    ).toHaveAttribute('href', '/pools/pool-1');
  });
});
