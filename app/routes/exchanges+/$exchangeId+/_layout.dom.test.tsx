/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { type ExchangeView } from '#app/utils/exchanges.server.ts';

const snapshot: { view: ExchangeView; now: string } = {
  view: {} as ExchangeView,
  now: '2026-12-12T12:00:00Z',
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return {
    ...actual,
    useLoaderData: () => snapshot,
    Outlet: () => <div data-testid="outlet" />,
  };
});

vi.mock('./__route.server', () => ({ loader: vi.fn(), action: vi.fn() }));

import ExchangeLayout from './_layout.tsx';

const organizer = {
  id: 'fd',
  username: 'fd',
  name: 'Francisco Di Giandomenico',
  image: null,
};

function view(overrides: Partial<ExchangeView> = {}): ExchangeView {
  return {
    exchange: {
      id: 'x1',
      title: 'The Painted 2026',
      occasionType: 'HOLIDAY',
      eventDate: new Date('2026-12-24T00:00:00Z'),
      spendingGuideline: 'Around $50',
      status: 'GATHERING',
      stage: 'GATHERING',
      revealMode: 'ORGANIZER',
      autoRevealAt: null,
      avoidRepeatsLookback: 2,
      giftGroup: { id: 'g1', name: 'The Painted' },
      organizer,
      drawnAt: null,
      revealedAt: null,
      cancelledAt: null,
      cancelReason: null,
      inviteCode: null,
    },
    viewer: {
      id: 'fd',
      role: 'ORGANIZER',
      participation: 'IN',
      dismissedJoinPrompt: false,
    },
    roster: [],
    counts: { in: 0, pending: 0, out: 0 },
    exclusionCount: 0,
    exclusions: null,
    draw: null,
    you: null,
    notes: null,
    clues: null,
    guess: null,
    progress: null,
    loop: null,
    yourGifter: null,
    ...overrides,
  };
}

const renderLayout = (v: ExchangeView) => {
  snapshot.view = v;
  return render(
    <MemoryRouter initialEntries={['/exchanges/x1']}>
      <ExchangeLayout />
    </MemoryRouter>,
  );
};

describe('exchange layout', () => {
  it('heads the page with the title, stage, date and countdown, and links back to the group', () => {
    renderLayout(view());
    expect(screen.getByText('The Painted 2026')).toBeInTheDocument();
    expect(screen.getByTestId('exchange-stage')).toHaveTextContent(
      'Gathering people',
    );
    expect(
      screen.getByText(/Holiday exchange · 24 Dec · 12 days to go/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to The Painted' }),
    ).toHaveAttribute('href', '/groups/g1');
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('offers settings to the organizer only, and only while it can change', () => {
    renderLayout(view());
    expect(
      screen.getByRole('link', { name: 'Exchange settings' }),
    ).toBeInTheDocument();

    renderLayout(
      view({
        viewer: {
          id: 'np',
          role: 'PARTICIPANT',
          participation: 'IN',
          dismissedJoinPrompt: false,
        },
      }),
    );
    expect(
      screen.queryAllByRole('link', { name: 'Exchange settings' }),
    ).toHaveLength(1); // only the first render's organizer link

    renderLayout(
      view({
        exchange: {
          ...view().exchange,
          status: 'REVEALED',
          stage: 'REVEALED',
        },
      }),
    );
    // Still just the one from the organizer/gathering render above.
    expect(
      screen.queryAllByRole('link', { name: 'Exchange settings' }),
    ).toHaveLength(1);
  });

  it('falls back to the exchanges list for a standalone exchange, and drops the countdown once over', () => {
    renderLayout(
      view({
        exchange: {
          ...view().exchange,
          giftGroup: null,
          status: 'REVEALED',
          stage: 'REVEALED',
        },
      }),
    );
    expect(
      screen.getByRole('link', { name: 'Back to Exchanges' }),
    ).toHaveAttribute('href', '/exchanges');
    expect(screen.getByText('Holiday exchange · 24 Dec')).toBeInTheDocument();
  });
});
