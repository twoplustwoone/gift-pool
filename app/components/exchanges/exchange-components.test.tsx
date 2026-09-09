/**
 * @vitest-environment jsdom
 */
// Form-emission and secrecy net for the exchange components. react-router's
// fetcher is mocked to capture what each control SUBMITS, and ResponsiveDialog
// is mocked to pass-through so dialog content renders inline.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type DrawPreview,
  type ExchangeOrganizerProgress,
  type ExchangePerson,
  type OwnAssignmentView,
  type RevealedPair,
  type RosterEntry,
} from '#app/utils/exchanges.server.ts';
import { DrawControls, drawDisabledReason } from './draw-controls.tsx';
import { ExchangeJoinPrompt } from './exchange-join-prompt.tsx';
import { ExchangeRoster } from './exchange-roster.tsx';
import { ExchangeSettingsFields } from './exchange-settings-fields.tsx';
import { ExchangeStatusBadge } from './exchange-status-badge.tsx';
import { GiftProgressStepper } from './gift-progress-stepper.tsx';
import { OrganizerProgressPanel } from './organizer-progress-panel.tsx';
import { RevealedLoop } from './revealed-loop.tsx';
import { YouDrewCard } from './you-drew-card.tsx';

const captured = vi.hoisted(() => ({
  submissions: [] as Array<Record<string, string>>,
  fetcherState: 'idle' as 'idle' | 'submitting',
  fetcherData: undefined as
    { ok?: boolean; error?: string; drawn?: boolean } | undefined,
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
      state: captured.fetcherState,
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
const organizer = person('fd', 'Francisco Di Giandomenico');
const np = person('np', 'Nicolas Posse');
const nb = person('nb', 'Nicolas Burroni');
const al = person('al', 'Agustin Luque');
const jl = person('jl', 'Juan Longo');

const roster: RosterEntry[] = [
  { user: organizer, status: 'IN', isOrganizer: true },
  { user: np, status: 'IN', isOrganizer: false },
  { user: nb, status: 'OUT', isOrganizer: false },
  { user: jl, status: 'PENDING', isOrganizer: false },
];

const wrap = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  captured.submissions = [];
  captured.fetcherState = 'idle';
  captured.fetcherData = undefined;
});

describe('ExchangeStatusBadge', () => {
  it('renders the user-facing stage label', () => {
    render(<ExchangeStatusBadge stage="READY_TO_REVEAL" />);
    expect(screen.getByTestId('exchange-stage')).toHaveTextContent(
      'Ready to reveal',
    );
  });
});

describe('ExchangeRoster', () => {
  it('shows all three statuses and marks the organizer and viewer', () => {
    wrap(<ExchangeRoster roster={roster} viewerId="np" />);
    const list = screen.getByRole('list', { name: "Who's in" });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Organizer');
    expect(items[1]).toHaveTextContent('you');
    expect(items[2]).toHaveTextContent('Sitting this one out');
    expect(items[3]).toHaveTextContent("Hasn't answered");
  });
});

describe('DrawControls', () => {
  const okPreview: DrawPreview = {
    kind: 'ok',
    participantCount: 3,
    names: ['Francisco Di Giandomenico', 'Nicolas Posse', 'Agustin Luque'],
    repeats: 'NONE',
  };

  it('states the disabled reason under the button instead of hiding it', () => {
    wrap(
      <DrawControls
        exchangeId="x1"
        preview={{ kind: 'TOO_FEW', have: 2, need: 3 }}
      />,
    );
    expect(screen.getByTestId('draw-names')).toBeDisabled();
    expect(screen.getByTestId('draw-consequence')).toHaveTextContent(
      'Needs one more person.',
    );
    expect(drawDisabledReason({ kind: 'TOO_FEW', have: 1, need: 3 })).toBe(
      'Needs two more people.',
    );
  });

  it('opens a confirmation with names, consequences and the repeats sentence, then posts the intent', async () => {
    const user = userEvent.setup();
    wrap(<DrawControls exchangeId="x1" preview={okPreview} />);
    await user.click(screen.getByTestId('draw-names'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Draw names for 3 people?');
    expect(dialog).toHaveTextContent(
      'Francisco Di Giandomenico, Nicolas Posse and Agustin Luque.',
    );
    const items = within(dialog).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Nobody can join or leave afterwards');
    expect(items[1]).toHaveTextContent('Everyone gets someone new this year.');
    expect(items[2]).toHaveTextContent("You'll draw a name too");
    await user.click(
      within(dialog).getByRole('button', { name: 'Draw names' }),
    );
    expect(captured.submissions).toEqual([
      { intent: 'draw-names', exchangeId: 'x1' },
    ]);
  });

  it('names the blocked person and offers Remove per exclusion when infeasible', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    wrap(
      <DrawControls
        exchangeId="x1"
        onRemoveExclusion={onRemove}
        preview={{
          kind: 'INFEASIBLE',
          blockedUserId: 'nb',
          blockedName: 'Nicolas Burroni',
          exclusions: [
            { id: 'e1', aName: 'Nicolas Burroni', bName: 'Agustin Luque' },
            { id: 'e2', aName: 'Nicolas Burroni', bName: 'Nicolas Posse' },
          ],
        }}
      />,
    );
    expect(screen.getByTestId('draw-consequence')).toHaveTextContent(
      "These exclusions don't leave a full loop.",
    );
    // The button stays live and opens the explanation, which names the
    // person and the exact exclusions and never says "try again".
    await user.click(screen.getByTestId('draw-names'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveTextContent(/try again/i);
    // `diagnose` names the most constrained person, who may still have one
    // candidate — the copy must not claim nobody is left for them.
    expect(dialog).not.toHaveTextContent(/nobody|rule out everyone/i);
    expect(dialog).toHaveTextContent(
      'leave Nicolas Burroni too few people to give to for the loop to close',
    );
    const removes = within(dialog).getAllByRole('button', { name: 'Remove' });
    expect(removes).toHaveLength(2);
    await user.click(removes[1]!);
    expect(onRemove).toHaveBeenCalledWith('e2');
    expect(
      within(dialog).getByRole('button', { name: 'Add more people instead' }),
    ).toBeInTheDocument();
  });
});

describe('YouDrewCard', () => {
  const assignment: OwnAssignmentView = {
    id: 'a1',
    giftee: al,
    giftStage: 'NONE',
    giftStageAt: null,
    giftLabel: null,
    wishlistItemCount: 4,
    canViewWishlist: true,
  };

  it('keeps the name behind a labelled cover, then announces it once and marks it viewed', async () => {
    const user = userEvent.setup();
    wrap(
      <YouDrewCard
        exchangeId="x1"
        exchangeTitle="The Painted 2026"
        assignment={assignment}
        organizer={organizer}
        spendingGuideline="Around $50"
        eventDate="2026-12-24T00:00:00Z"
        exchangeHref="/exchanges/x1"
        viewerIsOrganizer={false}
        open
        onOpenChange={() => {}}
      />,
    );
    expect(screen.queryByText('Agustin Luque')).not.toBeInTheDocument();
    const cover = screen.getByRole('button', {
      name: 'Tap to see who you drew',
    });
    await user.click(cover);
    expect(screen.getByTestId('you-drew-result')).toHaveTextContent(
      'Agustin Luque',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You drew Agustin Luque.',
    );
    expect(screen.getByText(/Not even Francisco knows/)).toBeInTheDocument();
    expect(captured.submissions).toEqual([
      { intent: 'mark-assignment-viewed', exchangeId: 'x1' },
    ]);
    expect(
      screen.getByRole('link', { name: "See Agustin's wishlist" }),
    ).toHaveAttribute('href', '/users/al/wishlist');
  });
});

describe('GiftProgressStepper', () => {
  it('uses shape as well as colour and posts the next stage', async () => {
    const user = userEvent.setup();
    captured.fetcherData = { ok: true };
    wrap(
      <GiftProgressStepper
        exchangeId="x1"
        stage="GOT_IT"
        gifteeFirstName="Agustin"
      />,
    );
    expect(screen.getByTestId('stage-got_it')).toHaveAttribute(
      'data-state',
      'done',
    );
    expect(screen.getByTestId('stage-wrapped')).toHaveAttribute(
      'data-state',
      'next',
    );
    expect(screen.getByTestId('stage-given')).toHaveAttribute(
      'data-state',
      'later',
    );
    expect(screen.getByTestId('stage-given')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Mark it wrapped' }));
    expect(captured.submissions).toEqual([
      { intent: 'set-gift-stage', exchangeId: 'x1', stage: 'WRAPPED' },
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Marked wrapped.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces a refusal instead of a false success, and shows it inline', async () => {
    const user = userEvent.setup();
    captured.fetcherData = {
      error: "This action isn't available while the exchange is revealed.",
    };
    wrap(
      <GiftProgressStepper
        exchangeId="x1"
        stage="GOT_IT"
        gifteeFirstName="Agustin"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Mark it wrapped' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      "That didn't save. This action isn't available while the exchange is revealed.",
    );
    expect(screen.getByRole('status')).not.toHaveTextContent('Marked wrapped.');
    // The stepper falls back to the authoritative stage, not the tapped one.
    expect(screen.getByTestId('stage-wrapped')).toHaveAttribute(
      'data-state',
      'next',
    );
  });

  it('locks every stage control while the write is in flight', () => {
    captured.fetcherState = 'submitting';
    wrap(
      <GiftProgressStepper
        exchangeId="x1"
        stage="GOT_IT"
        gifteeFirstName="Agustin"
      />,
    );
    for (const id of ['stage-got_it', 'stage-wrapped', 'stage-given']) {
      expect(screen.getByTestId(id)).toBeDisabled();
    }
    expect(
      screen.getByRole('button', { name: 'Mark it wrapped' }),
    ).toBeDisabled();
  });

  it('steps back when a done stage is tapped (reversible)', async () => {
    const user = userEvent.setup();
    wrap(
      <GiftProgressStepper
        exchangeId="x1"
        stage="WRAPPED"
        gifteeFirstName="Agustin"
      />,
    );
    await user.click(screen.getByTestId('stage-wrapped'));
    expect(captured.submissions.at(-1)).toEqual({
      intent: 'set-gift-stage',
      exchangeId: 'x1',
      stage: 'GOT_IT',
    });
  });
});

describe('OrganizerProgressPanel', () => {
  const progress: ExchangeOrganizerProgress = {
    total: 5,
    haveGift: 4,
    wrapped: 2,
    given: 0,
    received: 0,
  };
  it('renders totals only and states the boundary in the product', () => {
    wrap(<OrganizerProgressPanel progress={progress} afterEvent={false} />);
    const panel = screen.getByTestId('organizer-progress');
    expect(panel).toHaveTextContent('Have their gift4 of 5');
    expect(panel).toHaveTextContent('Wrapped2 of 5');
    expect(panel).toHaveTextContent("You can't see who has who");
    for (const name of ['Francisco', 'Nicolas', 'Agustin', 'Juan']) {
      expect(panel).not.toHaveTextContent(name);
    }
  });
});

describe('RevealedLoop', () => {
  const loop: RevealedPair[] = [
    {
      gifter: nb,
      giftee: np,
      giftLabel: 'a record player stand',
      outcome: 'LOVED',
    },
    { gifter: np, giftee: al, giftLabel: null, outcome: null },
    { gifter: al, giftee: nb, giftLabel: 'a set of brushes', outcome: 'OKAY' },
  ];
  it('renders every node with a name, the return link, and honest gaps', () => {
    wrap(<RevealedLoop loop={loop} viewerId="np" canAddGiftLabel={false} />);
    const chain = screen.getByRole('list', { name: 'Who gave to whom' });
    expect(chain).toHaveTextContent('Nicolas Burroni');
    expect(chain).toHaveTextContent('gave a record player stand · Loved it');
    expect(chain).toHaveTextContent("didn't say what they gave");
    expect(chain).toHaveTextContent('back to Nicolas Burroni');
    expect(chain).toHaveTextContent('you');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

describe('ExchangeJoinPrompt', () => {
  it('posts opt-in and dismissal intents to the exchange route', async () => {
    const user = userEvent.setup();
    wrap(
      <ExchangeJoinPrompt
        exchange={{
          id: 'x1',
          title: 'The Painted 2026',
          occasionType: 'HOLIDAY',
          eventDate: '2026-12-24T00:00:00Z',
          organizer,
        }}
        participantCount={5}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Join the exchange' }));
    await user.click(screen.getByRole('button', { name: 'Not this time' }));
    expect(captured.submissions).toEqual([
      { intent: 'opt-in', exchangeId: 'x1' },
      { intent: 'dismiss-join-prompt', exchangeId: 'x1' },
    ]);
    expect(screen.getByTestId('exchange-join-prompt')).toHaveTextContent(
      'Join before Francisco draws names on 24 Dec.',
    );
  });
});

describe('ExchangeSettingsFields', () => {
  const members = [organizer, np, nb, al];
  it('hides the lookback switch for standalone exchanges and posts hidden switch values', () => {
    const { rerender } = wrap(
      <ExchangeSettingsFields
        mode="create"
        isGroup={false}
        members={[organizer]}
      />,
    );
    expect(
      screen.queryByRole('switch', { name: 'Give everyone someone new' }),
    ).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <ExchangeSettingsFields
          mode="create"
          isGroup
          groupName="The Painted"
          members={members}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('switch', { name: 'Give everyone someone new' }),
    ).toBeChecked();
    expect(document.querySelector('input[name="avoidRepeats"]')).toHaveValue(
      'on',
    );
    expect(document.querySelector('input[name="autoReveal"]')).toHaveValue(
      'on',
    );
    expect(document.querySelector('input[name="exclusions"]')).toHaveValue(
      '[]',
    );
  });

  it('secret-forever hides the auto-reveal switch', async () => {
    const user = userEvent.setup();
    wrap(<ExchangeSettingsFields mode="create" isGroup members={members} />);
    await user.click(
      screen.getByRole('radio', { name: /Keep it secret forever/ }),
    );
    expect(
      screen.queryByRole('switch', { name: 'Reveal for me if I forget' }),
    ).not.toBeInTheDocument();
  });
});
