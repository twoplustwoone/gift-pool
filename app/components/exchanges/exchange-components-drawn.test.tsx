/**
 * @vitest-environment jsdom
 */
// Second half of the component net: the drawn/revealed-day cards, the reveal
// controls, the roster variants, empty states and the skeleton.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ExchangeOrganizerProgress,
  type ExchangePerson,
  type OwnAssignmentView,
  type RevealedPair,
  type RosterEntry,
} from '#app/utils/exchanges.server.ts';
import { DrawControls } from './draw-controls.tsx';
import { ExchangeEmptyState } from './exchange-empty-state.tsx';
import { ExchangeQuietLine } from './exchange-join-prompt.tsx';
import {
  ExchangeRosterAvatars,
  ExchangeRosterStrip,
} from './exchange-roster.tsx';
import { ExchangeSettingsFields } from './exchange-settings-fields.tsx';
import { ExchangeSkeleton } from './exchange-skeleton.tsx';
import { ReceivedCard } from './received-card.tsx';
import { RevealControls } from './reveal-controls.tsx';
import { RevealedLoop } from './revealed-loop.tsx';
import { YouDrewCard } from './you-drew-card.tsx';
import { YourGifterCard } from './your-gifter-card.tsx';
import { YourPersonCard } from './your-person-card.tsx';

const captured = vi.hoisted(() => ({
  submissions: [] as Array<Record<string, string>>,
  fetcherData: undefined as { ok?: boolean; error?: string } | undefined,
}));

function formDataToRecord(fd: FormData) {
  const out: Record<string, string> = {};
  fd.forEach((v, k) => {
    out[k] = String(v);
  });
  return out;
}

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>();
  const react = await import('react');
  const Form = ({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
    method?: string;
    action?: string;
  }) =>
    react.createElement(
      'form',
      {
        className,
        onSubmit: (e: React.FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          captured.submissions.push(
            formDataToRecord(new FormData(e.currentTarget)),
          );
        },
      },
      children,
    );
  return {
    ...actual,
    Form,
    useFetcher: () => ({
      Form,
      submit: (body: FormData) => {
        captured.submissions.push(formDataToRecord(body));
      },
      state: 'idle' as const,
      data: captured.fetcherData,
      formData: undefined,
    }),
  };
});

vi.mock('#app/components/ui/responsive-dialog.tsx', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  );
  const Open = ({
    children,
    open,
  }: {
    children?: React.ReactNode;
    open?: boolean;
  }) => (open === false ? null : <>{children}</>);
  return {
    ResponsiveDialog: Open,
    ResponsiveDialogTrigger: Pass,
    ResponsiveDialogContent: ({ children }: { children?: React.ReactNode }) => (
      <div role="dialog">{children}</div>
    ),
    ResponsiveDialogHeader: Pass,
    ResponsiveDialogFooter: Pass,
    ResponsiveDialogTitle: ({ children }: { children?: React.ReactNode }) => (
      <h2>{children}</h2>
    ),
    ResponsiveDialogDescription: ({
      children,
    }: {
      children?: React.ReactNode;
    }) => <p>{children}</p>,
    ResponsiveDialogClose: Pass,
  };
});

const person = (id: string, name: string): ExchangePerson => ({
  id,
  username: id,
  name,
  image: null,
});
const fd = person('fd', 'Francisco Di Giandomenico');
const np = person('np', 'Nicolas Posse');
const al = person('al', 'Agustin Luque');
const jl = person('jl', 'Juan Longo');

const roster: RosterEntry[] = [
  { user: fd, status: 'IN', isOrganizer: true },
  { user: np, status: 'IN', isOrganizer: false },
  { user: al, status: 'IN', isOrganizer: false },
  { user: jl, status: 'PENDING', isOrganizer: false },
];

const assignment: OwnAssignmentView = {
  id: 'a1',
  giftee: al,
  giftStage: 'GOT_IT',
  giftStageAt: null,
  giftLabel: null,
  personChangedAt: null,
  wishlistItemCount: 1,
  canViewWishlist: true,
};

const progress: ExchangeOrganizerProgress = {
  total: 5,
  haveGift: 5,
  wrapped: 5,
  given: 5,
  received: 4,
};

const EVENT = '2026-12-24T00:00:00Z';

const wrap = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  captured.submissions = [];
  captured.fetcherData = undefined;
});

describe('YourPersonCard', () => {
  it('names the giftee, links their wishlist with a count, and explains the not-friends grant', () => {
    wrap(
      <YourPersonCard
        assignment={assignment}
        spendingGuideline="Around $50"
        eventDate={EVENT}
        viewerIsFriendOfGiftee={false}
      />,
    );
    const card = screen.getByTestId('your-person');
    expect(card).toHaveTextContent('Agustin Luque');
    expect(card).toHaveTextContent('Around $50 · by 24 Dec');
    expect(
      within(card).getByRole('link', {
        name: /See Agustin's wishlist · 1 item/,
      }),
    ).toHaveAttribute('href', '/users/al/wishlist');
    expect(card).toHaveTextContent("even though you're not friends");
    expect(card).toHaveTextContent("Agustin won't know it was you");
  });

  it('never promises wishlist access the projection denies', () => {
    wrap(
      <YourPersonCard
        assignment={{ ...assignment, canViewWishlist: false }}
        spendingGuideline={null}
        eventDate={EVENT}
      />,
    );
    const card = screen.getByTestId('your-person');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(card).toHaveTextContent('by 24 Dec');
    expect(card).toHaveTextContent(
      "Agustin's wishlist is private to you, so this one is on your own judgement",
    );
    expect(card).not.toHaveTextContent('You can see');
    expect(card).not.toHaveTextContent("won't know it was you");
  });
});

describe('ReceivedCard', () => {
  it('offers exactly two kind options and posts the chosen outcome', async () => {
    const user = userEvent.setup();
    wrap(<ReceivedCard exchangeId="x1" received={null} />);
    const card = screen.getByTestId('received-card');
    expect(card).toHaveTextContent('Someone gave you something');
    const buttons = within(card).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Loved it',
      "It's good",
    ]);
    await user.click(buttons[0]!);
    expect(captured.submissions).toEqual([
      { intent: 'set-received', exchangeId: 'x1', outcome: 'LOVED' },
    ]);
  });

  it('says so when the outcome is refused instead of rolling back in silence', async () => {
    const user = userEvent.setup();
    captured.fetcherData = {
      error: "This action isn't available while the exchange is revealed.",
    };
    wrap(<ReceivedCard exchangeId="x1" received={null} />);
    await user.click(screen.getByRole('button', { name: 'Loved it' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      "That didn't save. This action isn't available while the exchange is revealed.",
    );
    expect(screen.getByRole('button', { name: 'Loved it' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows the recorded outcome as selected', () => {
    wrap(
      <ReceivedCard
        exchangeId="x1"
        received={{ receivedAt: EVENT, outcome: 'OKAY' }}
      />,
    );
    expect(screen.getByRole('button', { name: "It's good" })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Loved it' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId('received-card')).toHaveTextContent(
      "they'll see this after the reveal",
    );
  });
});

describe('YourGifterCard', () => {
  it('leads with who had you and, once guessing exists, whether you called it', () => {
    const { rerender } = wrap(
      <YourGifterCard gifter={np} guessedRight={null} />,
    );
    expect(screen.getByTestId('your-gifter')).toHaveTextContent(
      'Nicolas Posse had you',
    );
    expect(screen.getByTestId('your-gifter')).not.toHaveTextContent('guessed');
    rerender(
      <MemoryRouter>
        <YourGifterCard gifter={np} guessedRight />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('your-gifter')).toHaveTextContent(
      'You guessed right.',
    );
    rerender(
      <MemoryRouter>
        <YourGifterCard gifter={np} guessedRight={false} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('your-gifter')).toHaveTextContent(
      "You didn't see it coming.",
    );
  });
});

describe('RevealControls', () => {
  const now = new Date('2026-12-25T12:00:00Z');

  it('shows the auto-reveal date from the first day, and posts the reveal after confirmation', async () => {
    const user = userEvent.setup();
    wrap(
      <RevealControls
        exchangeId="x1"
        progress={progress}
        autoRevealAt="2026-12-27T09:00:00Z"
        eventDate={EVENT}
        now={now}
      />,
    );
    const controls = screen.getByTestId('reveal-controls');
    expect(controls).toHaveTextContent('Ready when you are');
    expect(controls).toHaveTextContent('Everyone has given their gift.');
    expect(screen.getByTestId('auto-reveal-line')).toHaveTextContent(
      "If you don't, Gift Pool reveals on 27 Dec — in 2 days.",
    );
    await user.click(
      within(controls).getByRole('button', { name: 'Reveal the pairings' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Show everyone who had who?');
    const items = within(dialog).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('All five of you see the whole loop');
    expect(items[1]).toHaveTextContent("It can't be undone.");
    // Outstanding receipts are a caution, never a block.
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      "One person hasn't said they got their gift yet. Their pairing will still show.",
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Reveal the pairings' }),
    );
    expect(captured.submissions).toEqual([
      { intent: 'reveal', exchangeId: 'x1' },
    ]);
  });

  it('with auto-reveal off says there is no rush and posts the switch as a settings update', async () => {
    const user = userEvent.setup();
    wrap(
      <RevealControls
        exchangeId="x1"
        progress={{ ...progress, received: 5 }}
        autoRevealAt={null}
        eventDate={EVENT}
        now={new Date('2026-12-29T12:00:00Z')}
      />,
    );
    const controls = screen.getByTestId('reveal-controls');
    expect(controls).toHaveTextContent("It's yours to call");
    expect(screen.getByTestId('auto-reveal-line')).toHaveTextContent(
      'Five days since the exchange. No rush.',
    );
    await user.click(
      screen.getByRole('switch', { name: 'Reveal for me if I forget' }),
    );
    expect(captured.submissions).toEqual([
      { intent: 'update-settings', exchangeId: 'x1', autoReveal: 'on' },
    ]);
  });

  it('states outstanding gifts as information when not everyone has given', () => {
    wrap(
      <RevealControls
        exchangeId="x1"
        progress={{ ...progress, given: 3 }}
        autoRevealAt="2026-12-27T09:00:00Z"
        eventDate={EVENT}
        now={now}
        revealMode="SECRET_FOREVER"
      />,
    );
    expect(screen.getByTestId('reveal-controls')).toHaveTextContent(
      'two people still have a gift to give',
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('never promises a loop for a secret-forever exchange', () => {
    wrap(
      <RevealControls
        exchangeId="x1"
        progress={progress}
        autoRevealAt={null}
        eventDate={EVENT}
        now={now}
        revealMode="SECRET_FOREVER"
      />,
    );
    const controls = screen.getByTestId('reveal-controls');
    expect(controls).toHaveTextContent('Ready to close it');
    expect(controls).toHaveTextContent('The pairings are never shown.');
    expect(controls).not.toHaveTextContent('whole loop');
    expect(
      screen.getByRole('button', { name: 'Finish the exchange' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reveal the pairings' }),
    ).not.toBeInTheDocument();
    // The auto-reveal switch has no meaning for an exchange that never reveals.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

describe('roster variants', () => {
  it('the participant strip shows short names, "You", and who is still deciding', () => {
    wrap(<ExchangeRosterStrip roster={roster} viewerId="np" />);
    expect(screen.getByText('Francisco G.')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Juan L. · deciding')).toBeInTheDocument();
  });

  it('the avatar row shows live participants only', () => {
    wrap(<ExchangeRosterAvatars roster={roster} />);
    const row = screen.getByLabelText('People in');
    expect(row.querySelectorAll('img')).toHaveLength(3);
  });
});

describe('empty states and skeleton', () => {
  it('the group empty state carries the one sanctioned Secret Santa line and a group-scoped start link', () => {
    wrap(
      <ExchangeEmptyState
        variant="group"
        groupName="The Painted"
        groupId="g1"
      />,
    );
    expect(
      screen.getByText("The Painted hasn't done one yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A Secret Santa for any occasion/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Start an exchange' }),
    ).toHaveAttribute('href', '/exchanges/new?groupId=g1');
  });

  it('the list empty state offers both ways in', () => {
    wrap(<ExchangeEmptyState variant="list" />);
    expect(
      screen.getByRole('link', { name: 'Start an exchange' }),
    ).toHaveAttribute('href', '/exchanges/new');
    expect(
      screen.getByRole('link', { name: 'See your groups' }),
    ).toHaveAttribute('href', '/groups');
  });

  it('the skeleton shows no counts and no names', () => {
    render(<ExchangeSkeleton />);
    const skeleton = screen.getByLabelText('Loading exchange');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(skeleton.textContent?.trim()).toBe('');
  });

  it('the quiet line keeps a Join link so a stray dismissal is never final', () => {
    wrap(
      <ExchangeQuietLine exchange={{ id: 'x1', title: 'The Painted 2026' }} />,
    );
    expect(screen.getByRole('link', { name: 'Join' })).toHaveAttribute(
      'href',
      '/exchanges/x1',
    );
    expect(screen.getByTestId('exchange-quiet-line')).toHaveTextContent(
      "The Painted 2026 exchange · you're not in it",
    );
  });
});

describe('remaining branches', () => {
  it('YouDrewCard: "Later" closes without revealing or posting anything', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    wrap(
      <YouDrewCard
        exchangeId="x1"
        exchangeTitle="The Painted 2026"
        assignment={{ ...assignment, canViewWishlist: false }}
        organizer={fd}
        spendingGuideline={null}
        eventDate={EVENT}
        exchangeHref="/exchanges/x1"
        viewerIsOrganizer
        open
        onOpenChange={onOpenChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(captured.submissions).toEqual([]);
    // The organizer's own copy omits "Not even X knows".
    await user.click(
      screen.getByRole('button', { name: 'Tap to see who you drew' }),
    );
    expect(screen.getByTestId('you-drew-result')).toHaveTextContent(
      'Only you can see this.',
    );
    expect(screen.getByTestId('you-drew-result')).not.toHaveTextContent(
      'Not even',
    );
    expect(screen.getByTestId('you-drew-result')).toHaveTextContent('—');
  });

  it('RevealedLoop: the empty gift log asks for one contribution and offers the composer', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const loop: RevealedPair[] = [
      { gifter: np, giftee: al, giftLabel: null, outcome: null },
      { gifter: al, giftee: fd, giftLabel: null, outcome: null },
      { gifter: fd, giftee: np, giftLabel: null, outcome: null },
    ];
    wrap(
      <RevealedLoop
        loop={loop}
        viewerId="np"
        canAddGiftLabel
        onAddGiftLabel={onAdd}
      />,
    );
    expect(
      screen.getByText('Nobody wrote down what they gave'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add what you gave' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('DrawControls inline variant renders the button beside its consequence line', () => {
    wrap(
      <DrawControls
        exchangeId="x1"
        variant="inline"
        preview={{
          kind: 'ok',
          participantCount: 3,
          names: ['A', 'B', 'C'],
          repeats: 'SOME',
        }}
      />,
    );
    expect(screen.getByTestId('draw-names')).toBeEnabled();
    expect(screen.getByTestId('draw-consequence')).toHaveTextContent(
      'Nobody can be added after the draw.',
    );
  });

  it('ExchangeSettingsFields: renders exclusions as removable pairs and posts them as JSON', async () => {
    const user = userEvent.setup();
    wrap(
      <ExchangeSettingsFields
        mode="create"
        isGroup
        groupName="The Painted"
        members={[fd, np, al]}
        initialExclusions={[{ userA: np, userB: al }]}
      />,
    );
    expect(document.querySelector('input[name="exclusions"]')).toHaveValue(
      JSON.stringify([['np', 'al']]),
    );
    expect(screen.getByText(/Useful for couples and housemates/)).toBeVisible();
    await user.click(
      screen.getByRole('button', {
        name: /Remove exclusion Nicolas Posse and Agustin Luque/,
      }),
    );
    expect(document.querySelector('input[name="exclusions"]')).toHaveValue(
      '[]',
    );
  });

  it('ExchangeSettingsFields: edit mode locks the fields after the draw but keeps auto-reveal live', () => {
    wrap(
      <ExchangeSettingsFields
        mode="edit"
        isGroup
        groupName="The Painted"
        members={[fd, np, al]}
        locked
        defaults={{
          title: 'The Painted 2026',
          eventDate: '2026-12-24',
          autoReveal: true,
          autoRevealDate: '2026-12-27',
        }}
      />,
    );
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: 'Reveal for me if I forget' }),
    ).toBeEnabled();
    expect(screen.getByLabelText('On')).toHaveValue('2026-12-27');
    expect(
      screen.queryByText("Don't pair these people"),
    ).not.toBeInTheDocument();
  });
});
