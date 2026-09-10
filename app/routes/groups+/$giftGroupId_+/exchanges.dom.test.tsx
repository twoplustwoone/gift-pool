/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { type GroupExchangeArchive } from '#app/utils/exchanges.server.ts';

const snapshot: {
  group: { id: string; name: string };
  archive: GroupExchangeArchive;
} = {
  group: { id: 'g1', name: 'The Painted' },
  archive: { years: [], memory: [], summary: null },
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return { ...actual, useLoaderData: () => snapshot };
});

import GroupExchangesPage from './exchanges.tsx';

const person = (id: string, name: string) => ({
  id,
  username: id,
  name,
  image: null,
});

const renderPage = (archive: GroupExchangeArchive) => {
  snapshot.archive = archive;
  return render(
    <MemoryRouter initialEntries={['/groups/g1/exchanges']}>
      <GroupExchangesPage />
    </MemoryRouter>,
  );
};

describe('group exchange archive', () => {
  it('invites the first one when there is nothing to look back on', () => {
    renderPage({ years: [], memory: [], summary: null });
    expect(screen.getByText('Nothing to look back on yet')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Start an exchange' }),
    ).toHaveAttribute('href', '/exchanges/new?groupId=g1');
  });

  it('leads with the memory, then the years', () => {
    renderPage({
      summary: 'Two exchanges, 2025 to 2026.',
      memory: [
        {
          key: 'repeat-draw',
          person: person('al', 'Agustin Luque'),
          line: "You've drawn Agustin Luque two times out of two.",
        },
      ],
      years: [
        {
          exchangeId: 'x2',
          title: 'The Painted 2026',
          year: 2026,
          occasionType: 'HOLIDAY',
          eventDate: new Date('2026-12-24T00:00:00Z'),
          participantCount: 5,
          secretForever: false,
          yourGifter: person('nb', 'Nicolas Burroni'),
          yourGiftee: person('al', 'Agustin Luque'),
          youGuessedRight: true,
        },
      ],
    });

    // Cross-year memory is the only thing here you cannot get elsewhere, so
    // it goes first.
    const memory = screen.getByTestId('archive-memory');
    expect(memory).toHaveTextContent("You've drawn Agustin Luque");

    const years = screen.getByTestId('archive-years');
    expect(within(years).getByText('2026')).toBeInTheDocument();
    expect(years).toHaveTextContent('Nicolas Burroni had you');
    expect(years).toHaveTextContent('You drew Agustin Luque');
    expect(years).toHaveTextContent('you guessed right');
  });

  it('says a secret year is secret, and names nobody in it', () => {
    renderPage({
      summary: 'One exchange, 2023.',
      memory: [],
      years: [
        {
          exchangeId: 'x0',
          title: 'The Painted 2023',
          year: 2023,
          occasionType: 'HOLIDAY',
          eventDate: new Date('2023-12-24T00:00:00Z'),
          participantCount: 4,
          secretForever: true,
          yourGifter: null,
          yourGiftee: null,
          youGuessedRight: null,
        },
      ],
    });
    const years = screen.getByTestId('archive-years');
    expect(years).toHaveTextContent('Kept secret');
    expect(years).toHaveTextContent('pairings never shown');
    expect(years).not.toHaveTextContent('had you');
    expect(years).not.toHaveTextContent('You drew');
  });

  it('says whose archive this is', () => {
    renderPage({ years: [], memory: [], summary: null });
    expect(
      screen.queryByText(/Built only from exchanges you were in/),
    ).not.toBeInTheDocument();

    renderPage({
      summary: 'One exchange, 2026.',
      memory: [],
      years: [
        {
          exchangeId: 'x1',
          title: 'The Painted 2026',
          year: 2026,
          occasionType: 'HOLIDAY',
          eventDate: new Date('2026-12-24T00:00:00Z'),
          participantCount: 5,
          secretForever: false,
          yourGifter: null,
          yourGiftee: null,
          youGuessedRight: null,
        },
      ],
    });
    // Two people in this group see different pages; the footnote says so.
    expect(
      screen.getByText(/Built only from exchanges you were in/),
    ).toBeInTheDocument();
  });
});
