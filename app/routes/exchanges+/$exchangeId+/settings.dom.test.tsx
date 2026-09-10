/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ExchangePerson,
  type ExchangeView,
} from '#app/utils/exchanges.server.ts';

const snapshot: { view: ExchangeView; now: string } = {
  view: {} as ExchangeView,
  now: '2026-12-12T12:00:00Z',
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return {
    ...actual,
    useRouteLoaderData: () => snapshot,
    useNavigation: () => ({ state: 'idle' as const }),
    useFetcher: () => ({
      Form: ({ children }: { children?: React.ReactNode }) => (
        <form>{children}</form>
      ),
      submit: () => {},
      state: 'idle' as const,
      data: undefined,
    }),
  };
});

// ConfirmDialog's own behaviour is covered by its unit test; here it is
// flattened so the trigger and the consequence copy are both assertable
// without the dialog's open state getting in the way.
vi.mock('#app/components/ui/confirm-dialog.tsx', () => ({
  ConfirmDialog: ({
    children,
    title,
    description,
    consequences,
  }: {
    children?: React.ReactNode;
    title?: string;
    description?: React.ReactNode;
    consequences?: React.ReactNode[];
  }) => (
    <div data-testid="confirm-dialog">
      {children}
      <p>{title}</p>
      <p>{description}</p>
      <ul>
        {consequences?.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
    </div>
  ),
}));

import ExchangeSettings from './settings.tsx';

const organizer: ExchangePerson = {
  id: 'fd',
  username: 'fd',
  name: 'Francisco Di Giandomenico',
  image: null,
};
const np: ExchangePerson = {
  id: 'np',
  username: 'np',
  name: 'Nicolas Posse',
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
      id: 'fd',
      role: 'ORGANIZER',
      participation: 'IN',
      dismissedJoinPrompt: false,
    },
    roster: [
      { user: organizer, status: 'IN', isOrganizer: true },
      { user: np, status: 'IN', isOrganizer: false },
    ],
    counts: { in: 2, pending: 0, out: 0 },
    exclusionCount: 0,
    exclusions: [],
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

const renderSettings = (v: ExchangeView) => {
  snapshot.view = v;
  return render(
    <MemoryRouter initialEntries={['/exchanges/x1/settings']}>
      <ExchangeSettings />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  snapshot.now = '2026-12-12T12:00:00Z';
});

describe('exchange settings', () => {
  it('lets the organizer edit everything while gathering, and offers cancel', () => {
    renderSettings(view());
    expect(
      screen.getByText('Editable until you draw names.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('The Painted 2026');
    expect(screen.getByLabelText('Name')).toBeEnabled();
    expect(screen.getByLabelText('Exchange date')).toHaveValue('2026-12-24');
    expect(screen.getByLabelText('On')).toHaveValue('2026-12-27');
    expect(
      screen.getByRole('switch', { name: 'Give everyone someone new' }),
    ).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Cancel exchange' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nobody has drawn a name yet/)).toBeInTheDocument();
  });

  it('locks the settings after the draw and warns that cancelling discards pairings', () => {
    renderSettings(
      view({
        exchange: { ...view().exchange, status: 'DRAWN', stage: 'DRAWN' },
      }),
    );
    expect(
      screen.getByText(
        'Names are drawn, so only the auto-reveal date can change.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: 'Reveal for me if I forget' }),
    ).toBeEnabled();
    expect(screen.getByText(/Every pairing is discarded/)).toBeInTheDocument();
  });

  it('shows a non-organizer nothing to edit', () => {
    renderSettings(
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
      screen.getByText(
        'Only Francisco Di Giandomenico can change these settings.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('drops the cancel option once the exchange is over', () => {
    renderSettings(
      view({
        exchange: {
          ...view().exchange,
          status: 'REVEALED',
          stage: 'REVEALED',
        },
      }),
    );
    expect(
      screen.queryByRole('button', { name: 'Cancel exchange' }),
    ).not.toBeInTheDocument();
  });
});
