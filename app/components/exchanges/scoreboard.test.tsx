/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  type ExchangePerson,
  type Scoreboard as ScoreboardData,
} from '#app/utils/exchanges.server.ts';

import { Scoreboard, ThankYouComposer } from './scoreboard.tsx';

const person = (id: string, name: string): ExchangePerson => ({
  id,
  username: id,
  name,
  image: null,
});

const board = (overrides: Partial<ScoreboardData> = {}): ScoreboardData => ({
  awards: [
    {
      kind: 'BEST_GUESSER',
      title: 'Best guesser',
      line: 'Got it first try',
      person: person('fc', 'Francisco Ceriani'),
    },
    {
      kind: 'WAVERED',
      title: 'Wavered',
      line: 'Changed their mind five times',
      person: person('fd', 'Francisco Di Giandomenico'),
    },
  ],
  correctCount: 2,
  guesserCount: 5,
  participantCount: 5,
  summary: '2 of 5 guessed right this year.',
  ...overrides,
});

describe('<Scoreboard />', () => {
  it('says something about each person, with their name beside their avatar', () => {
    render(<Scoreboard scoreboard={board()} />);
    const section = screen.getByRole('region', { name: 'Guesses' });
    expect(within(section).getByText('Francisco Ceriani')).toBeInTheDocument();
    expect(within(section).getByText('Got it first try')).toBeInTheDocument();
    expect(within(section).getByText('Best guesser')).toBeInTheDocument();
    // Affectionate, not a ranking anyone loses.
    expect(
      within(section).getByText('Changed their mind five times'),
    ).toBeInTheDocument();
    expect(
      within(section).getByText('2 of 5 guessed right this year.'),
    ).toBeInTheDocument();
  });

  it('says plainly when nobody played, rather than showing an empty box', () => {
    render(
      <Scoreboard
        scoreboard={board({
          awards: [],
          correctCount: 0,
          guesserCount: 0,
          summary: 'Nobody put a name down this year.',
        })}
      />,
    );
    expect(
      screen.getByText('Nobody put a name down this year.'),
    ).toBeInTheDocument();
  });
});

describe('<ThankYouComposer />', () => {
  const gifter = person('nb', 'Nicolas Burroni');

  it('offers the one note that carries a name, and says so', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <ThankYouComposer
        gifter={gifter}
        alreadySent={false}
        pending={false}
        onSend={onSend}
      />,
    );
    expect(
      screen.getByText("They'll see your name on it now."),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Say thanks to Nicolas' }),
    );
    await user.click(screen.getByRole('radio', { name: /I loved it/ }));
    await user.click(screen.getByRole('button', { name: 'Send it' }));
    expect(onSend).toHaveBeenCalledWith('loved-it');
  });

  it('becomes a receipt once sent, rather than inviting a second one', () => {
    render(
      <ThankYouComposer
        gifter={gifter}
        alreadySent
        pending={false}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByTestId('thanks-sent')).toHaveTextContent(
      'You thanked Nicolas.',
    );
    expect(
      screen.queryByRole('button', { name: /Say thanks/ }),
    ).not.toBeInTheDocument();
  });
});
