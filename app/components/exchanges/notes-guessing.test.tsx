/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  type ExchangePerson,
  type NoteThreads,
  type NoteView,
} from '#app/utils/exchanges.server.ts';

import { GuessCard } from './guess-card.tsx';
import { CluePicker, NoteComposer } from './note-composer.tsx';
import { NotesThreads } from './notes-threads.tsx';

const note = (overrides: Partial<NoteView> = {}): NoteView => ({
  id: 'n1',
  text: "I've got your gift.",
  kind: 'NOTE',
  when: 'Tuesday morning',
  pending: false,
  mine: false,
  from: null,
  ...overrides,
});

const threads = (overrides: Partial<NoteThreads> = {}): NoteThreads => ({
  fromYourGifter: [],
  toYourPerson: [],
  remainingToday: 3,
  ...overrides,
});

const person = (id: string, name: string): ExchangePerson => ({
  id,
  username: id,
  name,
  image: null,
});

describe('<NotesThreads />', () => {
  it('keeps the two conversations apart and never names an inbound sender', () => {
    render(
      <NotesThreads
        threads={threads({
          fromYourGifter: [note({ id: 'in', text: 'I have your gift.' })],
          toYourPerson: [
            note({ id: 'out', text: 'Add more to your wishlist.', mine: true }),
          ],
        })}
        personFirstName="Agustin"
      />,
    );

    const inbound = screen.getByRole('region', {
      name: 'From your secret gifter',
    });
    const outbound = screen.getByRole('region', { name: 'To Agustin' });
    expect(within(inbound).getByText('I have your gift.')).toBeInTheDocument();
    expect(
      within(outbound).getByText('Add more to your wishlist.'),
    ).toBeInTheDocument();
    // The inbound bubble carries a coarse slot and nothing else.
    expect(within(inbound).getByText('Tuesday morning')).toBeInTheDocument();
    expect(inbound.textContent).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it('says what an empty thread means, rather than looking broken', () => {
    render(<NotesThreads threads={threads()} personFirstName="Agustin" />);
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    expect(
      screen.getByText(/If they don't, that's a clue too/),
    ).toBeInTheDocument();
  });

  it('shows a note still on its way as sending', () => {
    render(
      <NotesThreads
        threads={threads({
          toYourPerson: [
            note({
              id: 'p',
              mine: true,
              pending: true,
              when: 'Arrives tomorrow morning',
            }),
          ],
        })}
        personFirstName="Agustin"
      />,
    );
    expect(
      screen.getByText('Sending · arrives tomorrow morning'),
    ).toBeInTheDocument();
  });

  it('names the sender of a thank-you — the one note that carries a name', () => {
    render(
      <NotesThreads
        threads={threads({
          toYourPerson: [
            note({
              id: 't',
              kind: 'THANKS',
              text: 'Thank you — I loved it.',
              from: { id: 'u2', name: 'Agustin Luque', username: 'al' },
            }),
          ],
        })}
        personFirstName="Agustin"
      />,
    );
    expect(screen.getByText(/Agustin Luque ·/)).toBeInTheDocument();
  });
});

describe('<NoteComposer />', () => {
  it('explains the morning batch at the point of sending', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <NoteComposer
        direction="TO_GIFTEE"
        personFirstName="Agustin"
        remainingToday={3}
        pending={false}
        onSend={onSend}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Send a note' }));
    expect(
      screen.getByText(/a 2am note would tell them more than you meant to/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /got your gift/i }));
    await user.click(
      screen.getByRole('button', { name: /send tomorrow morning/i }),
    );
    expect(onSend).toHaveBeenCalledWith('got-it');
  });

  it('closes the door once the allowance is gone, and says why', () => {
    render(
      <NoteComposer
        direction="TO_GIFTEE"
        personFirstName="Agustin"
        remainingToday={0}
        pending={false}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Send a note' })).toBeDisabled();
    expect(
      screen.getByText(/That's your 3 notes for today/),
    ).toBeInTheDocument();
  });
});

describe('<CluePicker />', () => {
  it('shows the exact sentence and how far it narrows, flagging a giveaway', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <CluePicker
        personFirstName="Agustin"
        clues={[
          {
            key: 'shared-groups',
            text: "We're in two of the same groups.",
            narrowsTo: 3,
            uniquelyIdentifies: false,
          },
          {
            key: 'birthday-half',
            text: 'My birthday is in the same half of the year as yours.',
            narrowsTo: 1,
            uniquelyIdentifies: true,
          },
        ]}
        remainingToday={2}
        pending={false}
        onSend={onSend}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Send a clue' }));

    expect(screen.getByText('Narrows it to 3 people')).toBeInTheDocument();
    expect(
      screen.getByText('Gives you away — only you match'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Clues count towards your 3 notes a day/),
    ).toBeInTheDocument();

    // The giveaway is still sendable — declining is the user's call.
    await user.click(screen.getByRole('radio', { name: /Gives you away/ }));
    await user.click(screen.getByRole('button', { name: 'Send this clue' }));
    expect(onSend).toHaveBeenCalledWith('birthday-half');
  });

  it('offers a way forward when Gift Pool knows nothing about the pair', async () => {
    const user = userEvent.setup();
    render(
      <CluePicker
        personFirstName="Agustin"
        clues={[]}
        remainingToday={3}
        pending={false}
        onSend={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Send a clue' }));
    expect(screen.getByText(/A note is the way to go/)).toBeInTheDocument();
  });
});

describe('<GuessCard />', () => {
  const candidates = [
    person('u1', 'Francisco Di Giandomenico'),
    person('u2', 'Nicolas Burroni'),
  ];

  it('invites a guess from what the viewer already has to work with', () => {
    render(
      <GuessCard
        candidates={candidates}
        guess={null}
        threads={threads({
          fromYourGifter: [note({ id: 'a' }), note({ id: 'b' })],
        })}
        pending={false}
        onGuess={vi.fn()}
      />,
    );
    expect(screen.getByText(/2 notes in and no guess yet/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Make a guess' }),
    ).toBeInTheDocument();
  });

  it('keeps the guess visible with how often it changed, and offers a change', async () => {
    const user = userEvent.setup();
    const onGuess = vi.fn();
    render(
      <GuessCard
        candidates={candidates}
        guess={{
          guessedUser: { id: 'u2', name: 'Nicolas Burroni', username: 'nb' },
          changeCount: 2,
        }}
        threads={threads()}
        pending={false}
        onGuess={onGuess}
      />,
    );
    expect(screen.getByText('Nicolas Burroni')).toBeInTheDocument();
    expect(screen.getByText(/changed 2 times/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(
      screen.getByText('Nobody is told you guessed them.'),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('radio', { name: 'Francisco Di Giandomenico' }),
    );
    await user.click(screen.getByRole('button', { name: /Lock in Francisco/ }));
    expect(onGuess).toHaveBeenCalledWith('u1');
  });
});
