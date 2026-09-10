/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ExchangeList } from '#app/utils/exchanges.server.ts';

const snapshot: ExchangeList & { now: string } = {
  active: [],
  past: [],
  now: '2026-12-12T12:00:00Z',
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return { ...actual, useLoaderData: () => snapshot };
});

import ExchangesIndex from './index.tsx';

const organizer = {
  id: 'fd',
  username: 'fd',
  name: 'Francisco Di Giandomenico',
  image: null,
};

const item = (
  overrides: Partial<ExchangeList['active'][number]> = {},
): ExchangeList['active'][number] => ({
  id: 'x1',
  title: 'The Painted 2026',
  occasionType: 'HOLIDAY',
  eventDate: new Date('2026-12-24T00:00:00Z'),
  status: 'GATHERING',
  stage: 'GATHERING',
  giftGroup: { id: 'g1', name: 'The Painted' },
  organizer,
  isOrganizer: false,
  participation: 'PENDING',
  participantCount: 5,
  ...overrides,
});

const renderList = () =>
  render(
    <MemoryRouter initialEntries={['/exchanges']}>
      <ExchangesIndex />
    </MemoryRouter>,
  );

beforeEach(() => {
  snapshot.active = [];
  snapshot.past = [];
});

describe('exchanges list', () => {
  it('offers both ways in when there is nothing yet', () => {
    renderList();
    expect(screen.getByText('No exchanges yet')).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Start an exchange' })[0],
    ).toHaveAttribute('href', '/exchanges/new');
    expect(
      screen.getByRole('link', { name: 'See your groups' }),
    ).toHaveAttribute('href', '/groups');
  });

  it('splits happening-now from past and describes each from the viewer angle', () => {
    snapshot.active = [item()];
    snapshot.past = [
      item({
        id: 'x0',
        title: 'The Painted 2025',
        status: 'REVEALED',
        stage: 'REVEALED',
        participation: 'IN',
        eventDate: new Date('2025-12-24T00:00:00Z'),
      }),
    ];
    renderList();
    const now = screen.getByRole('region', { name: 'Happening now' });
    expect(within(now).getByText('The Painted 2026')).toBeInTheDocument();
    expect(within(now).getByText(/12 days to go/)).toBeInTheDocument();
    expect(within(now).getByText(/Join before the draw/)).toBeInTheDocument();
    expect(within(now).getByText('Gathering people')).toBeInTheDocument();

    const past = screen.getByRole('region', { name: 'Past' });
    expect(within(past).getByText('The Painted 2025')).toBeInTheDocument();
    expect(within(past).getByText('Revealed')).toBeInTheDocument();
    // A finished exchange gets no countdown.
    expect(within(past).queryByText(/to go/)).not.toBeInTheDocument();
  });

  it('labels the viewer role and names the organizer for a standalone exchange', () => {
    snapshot.active = [
      item({ isOrganizer: true, participation: 'IN' }),
      item({
        id: 'x2',
        title: 'Studio Christmas',
        giftGroup: null,
        participation: 'IN',
      }),
    ];
    renderList();
    expect(screen.getByText(/You organize this one/)).toBeInTheDocument();
    expect(
      screen.getByText(/Organized by Francisco Di Giandomenico/),
    ).toBeInTheDocument();
    expect(screen.getByText(/You're in/)).toBeInTheDocument();
  });

  it('keeps the Gifting segments on the page with Exchanges current', () => {
    renderList();
    const segments = screen.getByRole('navigation', { name: 'Gifting' });
    expect(
      within(segments).getByRole('link', { name: 'Exchanges' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(segments).getByRole('link', { name: 'Pools' }),
    ).not.toHaveAttribute('aria-current');
  });
});
