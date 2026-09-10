/**
 * @vitest-environment jsdom
 */
// The exchange page is one component that renders a different page per
// (status × role). These render each of those combinations against a stubbed
// projection — the same shape `getViewerProjection` returns — and assert what
// each viewer may and may not see.
import { render, screen } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ExchangePerson,
  type ExchangeView,
} from '#app/utils/exchanges.server.ts';

const snapshot: {
  view: ExchangeView;
  now: string;
  timeZone: string;
  viewerWishlistItemCount: number | null;
} = {
  view: {} as ExchangeView,
  now: '2026-12-12T12:00:00Z',
  timeZone: 'UTC',
  viewerWishlistItemCount: 3,
};

// Lets a test put a server refusal in front of the page.
const fetcherData: { data: unknown } = { data: undefined };

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return {
    ...actual,
    useRouteLoaderData: () => snapshot,
    useFetcher: () => ({
      Form: ({ children }: { children?: React.ReactNode }) => (
        <form>{children}</form>
      ),
      submit: () => {},
      state: 'idle' as const,
      data: fetcherData.data,
      formData: undefined,
    }),
  };
});

vi.mock('#app/hooks/use-visibility-revalidation.ts', () => ({
  useVisibilityRevalidation: () => {},
}));

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

import ExchangePage from './index.tsx';

const person = (id: string, name: string): ExchangePerson => ({
  id,
  username: id,
  name,
  image: null,
});
const organizer = person('fd', 'Francisco Di Giandomenico');
const np = person('np', 'Nicolas Posse');
const al = person('al', 'Agustin Luque');
const jl = person('jl', 'Juan Longo');

const EVENT = new Date('2026-12-24T00:00:00Z');

function baseView(overrides: Partial<ExchangeView> = {}): ExchangeView {
  return {
    exchange: {
      id: 'x1',
      title: 'The Painted 2026',
      occasionType: 'HOLIDAY',
      eventDate: EVENT,
      spendingGuideline: 'Around $50',
      status: 'GATHERING',
      stage: 'GATHERING',
      revealMode: 'ORGANIZER',
      autoRevealAt: new Date('2026-12-27T09:00:00Z'),
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
      id: 'np',
      role: 'PARTICIPANT',
      participation: 'IN',
      dismissedJoinPrompt: false,
    },
    roster: [
      { user: organizer, status: 'IN', isOrganizer: true },
      { user: np, status: 'IN', isOrganizer: false },
      { user: al, status: 'IN', isOrganizer: false },
      { user: jl, status: 'PENDING', isOrganizer: false },
    ],
    counts: { in: 3, pending: 1, out: 0 },
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

const renderPage = (view: ExchangeView, wishlistCount: number | null = 3) => {
  snapshot.view = view;
  snapshot.viewerWishlistItemCount = wishlistCount;
  return render(
    <MemoryRouter initialEntries={['/exchanges/x1']}>
      <ExchangePage />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  snapshot.now = '2026-12-12T12:00:00Z';
});

describe('gathering', () => {
  it('gives the organizer the roster, the draw sentence and the secrecy boundary', () => {
    renderPage(
      baseView({
        viewer: {
          id: 'fd',
          role: 'ORGANIZER',
          participation: 'IN',
          dismissedJoinPrompt: false,
        },
        exclusions: [],
        draw: {
          kind: 'ok',
          participantCount: 3,
          names: [
            'Francisco Di Giandomenico',
            'Nicolas Posse',
            'Agustin Luque',
          ],
          repeats: 'NONE',
        },
      }),
    );
    expect(screen.getByRole('list', { name: "Who's in" })).toBeInTheDocument();
    expect(
      screen.getByText(
        /With three people, everyone gets someone new this year/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('One person can still join until you draw.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Secrecy boundary' }),
    ).toHaveTextContent('There are no pairings yet');
    expect(screen.getByTestId('draw-names')).toBeEnabled();
    // Settings summary, not a pairing anywhere.
    expect(screen.getByText('Around $50')).toBeInTheDocument();
    expect(screen.getByText('You · auto 27 Dec')).toBeInTheDocument();
  });

  it('tells the organizer what is blocking the draw', () => {
    renderPage(
      baseView({
        viewer: {
          id: 'fd',
          role: 'ORGANIZER',
          participation: 'IN',
          dismissedJoinPrompt: false,
        },
        exclusions: [],
        counts: { in: 2, pending: 2, out: 0 },
        draw: { kind: 'TOO_FEW', have: 2, need: 3 },
      }),
    );
    expect(
      screen.getByText('An exchange needs three people. One more to go.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('draw-names')).toBeDisabled();
  });

  it('keeps a participant page thin: you are in, one useful action, the roster', () => {
    renderPage(baseView());
    expect(screen.getByText("You're in")).toBeInTheDocument();
    expect(
      screen.getByText(/Francisco will draw names once everyone's answered/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Update your wishlist' }),
    ).toHaveAttribute('href', '/wishlist');
    expect(screen.getByText(/Your wishlist has 3 items/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sit this one out' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Francisco reveals the pairings after 24 Dec/),
    ).toBeInTheDocument();
  });

  it('nudges an empty wishlist differently', () => {
    renderPage(baseView(), 0);
    expect(screen.getByText(/Your wishlist is empty/)).toBeInTheDocument();
  });

  it('lets someone sitting out change their mind, and says so', () => {
    renderPage(
      baseView({
        viewer: {
          id: 'np',
          role: 'MEMBER',
          participation: 'OUT',
          dismissedJoinPrompt: false,
        },
      }),
    );
    expect(screen.getByText("You're sitting this one out")).toBeInTheDocument();
    expect(
      screen.getByText(/You can change your mind until Francisco draws names/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Join back in' }),
    ).toBeInTheDocument();
  });

  it('offers a member both answers and states what is never shown to them', () => {
    renderPage(
      baseView({
        viewer: {
          id: 'jl',
          role: 'MEMBER',
          participation: 'PENDING',
          dismissedJoinPrompt: false,
        },
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Join the exchange' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Not this time' }),
    ).toBeInTheDocument();
    expect(screen.getByText("You're not in this one")).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Never shown here' }),
    ).toHaveTextContent('inverted into a pairing');
  });
});

describe('drawn', () => {
  const drawnView = (overrides: Partial<ExchangeView> = {}) =>
    baseView({
      exchange: { ...baseView().exchange, status: 'DRAWN', stage: 'DRAWN' },
      you: {
        assignment: {
          id: 'a1',
          giftee: al,
          giftStage: 'GOT_IT',
          giftStageAt: null,
          giftLabel: null,
          wishlistItemCount: 4,
          canViewWishlist: true,
        },
        covered: false,
        received: null,
      },
      ...overrides,
    });

  it('leads with your person before the day, and never names anyone else', () => {
    renderPage(drawnView());
    expect(screen.getByTestId('your-person')).toHaveTextContent(
      'Agustin Luque',
    );
    expect(screen.getByTestId('gift-progress')).toBeInTheDocument();
    expect(screen.queryByTestId('organizer-progress')).not.toBeInTheDocument();
    // The other participants' names appear nowhere on a participant's page.
    expect(screen.queryByText('Juan Longo')).not.toBeInTheDocument();
  });

  it('gives a participant both threads and the guessing card', () => {
    renderPage(
      drawnView({
        notes: {
          fromYourGifter: [
            {
              id: 'n1',
              text: "I've got your gift.",
              kind: 'NOTE',
              when: 'Tuesday morning',
              pending: false,
              mine: false,
              from: null,
            },
          ],
          toYourPerson: [],
          remainingToday: 2,
          nextDeliveryLabel: 'tomorrow morning',
        },
        clues: [
          {
            key: 'shared-groups',
            text: "We're in two of the same groups.",
            narrowsTo: 3,
            uniquelyIdentifies: false,
          },
        ],
        guess: null,
      }),
    );
    expect(screen.getByTestId('notes-threads')).toBeInTheDocument();
    expect(screen.getByText("I've got your gift.")).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'To Agustin' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Send a clue' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Make a guess' }),
    ).toBeInTheDocument();
  });

  it('shows a refusal from the server instead of swallowing it', () => {
    // The exchange can be revealed in another tab, or the allowance can go
    // stale between opening the picker and sending. Silence would leave
    // someone believing they sent something they didn't.
    fetcherData.data = { error: "That's your 3 notes for today." };
    renderPage(
      drawnView({
        notes: {
          fromYourGifter: [],
          toYourPerson: [],
          remainingToday: 0,
          nextDeliveryLabel: 'tomorrow morning',
        },
        clues: [],
        guess: null,
      }),
    );
    expect(screen.getByTestId('notes-error')).toHaveTextContent(
      "That's your 3 notes for today.",
    );
    fetcherData.data = undefined;
  });

  it('keeps the notes behind the cover, since the thread names your person', () => {
    renderPage(
      drawnView({
        you: { ...drawnView().you!, covered: true },
        notes: {
          fromYourGifter: [],
          toYourPerson: [],
          remainingToday: 3,
          nextDeliveryLabel: 'tomorrow morning',
        },
        clues: [],
        guess: null,
      }),
    );
    // "To Agustin" would give away the name the cover exists to protect.
    expect(screen.queryByTestId('notes-threads')).not.toBeInTheDocument();
    expect(screen.queryByText(/To Agustin/)).not.toBeInTheDocument();
  });

  it('opens the covered card on arrival without spoiling the name', () => {
    renderPage(drawnView({ you: { ...drawnView().you!, covered: true } }));
    expect(
      screen.getByRole('button', { name: 'Tap to see who you drew' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Names are drawn')).toBeInTheDocument();
    // The giftee is behind the cover: not on screen until it is opened, and
    // not on the page behind it either — otherwise "Later" would hand over
    // the very screen the cover exists to protect.
    expect(screen.queryByTestId('you-drew-result')).not.toBeInTheDocument();
    expect(screen.queryByText('Agustin Luque')).not.toBeInTheDocument();
    expect(screen.queryByTestId('your-person')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gift-progress')).not.toBeInTheDocument();
  });

  it('gives the organizer totals only, plus their own person', () => {
    renderPage(
      drawnView({
        viewer: {
          id: 'fd',
          role: 'ORGANIZER',
          participation: 'IN',
          dismissedJoinPrompt: false,
        },
        progress: { total: 3, haveGift: 2, wrapped: 1, given: 0, received: 0 },
      }),
    );
    const panel = screen.getByTestId('organizer-progress');
    expect(panel).toHaveTextContent('Have their gift2 of 3');
    expect(panel).toHaveTextContent("You can't see who has who");
    expect(screen.getByTestId('your-person')).toBeInTheDocument();
  });

  it('on the day, gift progress and the outcome lead the page', () => {
    snapshot.now = '2026-12-24T10:00:00Z';
    renderPage(
      drawnView({
        exchange: {
          ...baseView().exchange,
          status: 'DRAWN',
          stage: 'TODAY',
        },
      }),
    );
    const cards = screen.getAllByRole('heading', { level: 2 });
    expect(cards[0]).toHaveTextContent('Your gift');
    expect(screen.getByTestId('received-card')).toBeInTheDocument();
  });

  it('shows a non-participant the state and the roster, and nothing else', () => {
    renderPage(
      drawnView({
        viewer: {
          id: 'jl',
          role: 'MEMBER',
          participation: 'PENDING',
          dismissedJoinPrompt: false,
        },
        you: null,
        progress: null,
      }),
    );
    expect(screen.getByText('Names are drawn')).toBeInTheDocument();
    expect(
      screen.getByText(/Next time, join before the draw/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('your-person')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gift-progress')).not.toBeInTheDocument();
    expect(screen.queryByTestId('organizer-progress')).not.toBeInTheDocument();
  });
});

describe('revealed, finished and cancelled', () => {
  it('leads the revealed page with who had you, then the loop', () => {
    renderPage(
      baseView({
        exchange: {
          ...baseView().exchange,
          status: 'REVEALED',
          stage: 'REVEALED',
        },
        yourGifter: organizer,
        loop: [
          {
            gifter: organizer,
            giftee: np,
            giftLabel: 'a record player stand',
            outcome: 'LOVED',
          },
          { gifter: np, giftee: al, giftLabel: null, outcome: null },
          {
            gifter: al,
            giftee: organizer,
            giftLabel: 'brushes',
            outcome: 'OKAY',
          },
        ],
      }),
    );
    expect(screen.getByTestId('your-gifter')).toHaveTextContent(
      'Francisco Di Giandomenico had you',
    );
    expect(screen.getByTestId('revealed-loop')).toHaveTextContent(
      "didn't say what they gave",
    );
  });

  it('says nobody will ever know on a secret-forever exchange, and shows no loop', () => {
    renderPage(
      baseView({
        exchange: {
          ...baseView().exchange,
          status: 'FINISHED',
          stage: 'FINISHED',
          revealMode: 'SECRET_FOREVER',
        },
      }),
    );
    expect(screen.getByText('Nobody will ever know')).toBeInTheDocument();
    expect(screen.queryByTestId('revealed-loop')).not.toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'What stays private' }),
    ).toHaveTextContent('Who had who is not shown');
  });

  it('explains a cancelled exchange and offers the way back', () => {
    renderPage(
      baseView({
        exchange: {
          ...baseView().exchange,
          status: 'CANCELLED',
          stage: 'CANCELLED',
          cancelledAt: new Date('2026-12-13T00:00:00Z'),
        },
      }),
    );
    expect(screen.getByText('This exchange was cancelled')).toBeInTheDocument();
    expect(
      screen.getByText(/Francisco cancelled it on 13 Dec/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to exchanges' }),
    ).toHaveAttribute('href', '/exchanges');
  });
});
