/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OrganizerReminderAction,
  type OrganizerReminderAvailability,
} from './organizer-reminder-action.tsx';

const previewFetcher = {
  data: undefined as unknown,
  load: vi.fn(),
  state: 'idle',
};
const sendFetcher = {
  data: undefined as unknown,
  state: 'idle',
  submit: vi.fn(),
};
let previewResult: unknown;
let sendResult: unknown;

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return {
    ...actual,
    useFetcher: ({ key }: { key: string }) =>
      key.includes('-preview-') ? previewFetcher : sendFetcher,
  };
});

vi.mock('#app/utils/client-mutation-id.ts', () => ({
  createClientMutationId: () => 'ui-reminder-request-1',
}));

beforeEach(() => {
  previewResult = {
    eligibleCount: 1,
    kind: 'VOTE',
    latestNudge: null,
    status: 'AVAILABLE',
  };
  sendResult = {
    availableAt: '2026-07-15T15:00:00.000Z',
    createdAt: '2026-07-14T15:00:00.000Z',
    kind: 'VOTE',
    latestNudge: {
      createdAt: '2026-07-14T15:00:00.000Z',
      status: 'QUEUED',
      targetCount: 1,
    },
    nudgeId: 'nudge-1',
    queuedCount: 1,
    status: 'QUEUED',
  };
  previewFetcher.data = undefined;
  previewFetcher.state = 'idle';
  previewFetcher.load.mockReset().mockImplementation(() => {
    previewFetcher.data = previewResult;
  });
  sendFetcher.data = undefined;
  sendFetcher.state = 'idle';
  sendFetcher.submit.mockReset().mockImplementation(() => {
    sendFetcher.data = sendResult;
  });
});

describe('OrganizerReminderAction', () => {
  it('resolves the aggregate count only after opening and queues the preset reminder', async () => {
    renderReminder();
    expect(previewFetcher.load).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Remind voters' }),
    );

    expect(
      await screen.findByText('1 person can currently be notified.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Taylor reminded you to vote in Alex Birthday Pool'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /notification preferences and delivery channels stay private/i,
      ),
    ).toBeInTheDocument();
    expect(previewFetcher.load).toHaveBeenCalledTimes(1);

    await userEvent.click(
      screen.getByRole('button', { name: 'Send reminder' }),
    );
    expect(
      await screen.findByText('Reminder queued for 1 person.'),
    ).toBeInTheDocument();

    expect(sendFetcher.submit).toHaveBeenCalledWith(
      { idempotencyKey: 'ui-reminder-request-1', kind: 'VOTE' },
      { action: '/api/pools/pool-1/reminders', method: 'post' },
    );
    for (const unlockCopy of screen.getAllByText(/Available again at/)) {
      expect(unlockCopy).not.toHaveTextContent(/tomorrow/i);
    }
  });

  it('keeps a rate-limited reminder visible and disabled with an exact unlock time', () => {
    renderReminder({
      availability: {
        availableAt: '2026-07-16T18:30:00.000Z',
        kind: 'VOTE',
        latestNudge: {
          createdAt: '2026-07-14T15:00:00.000Z',
          status: 'QUEUED',
          targetCount: 2,
        },
        status: 'WEEKLY_LIMIT',
      },
    });

    expect(
      screen.getByRole('button', { name: 'Remind voters' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Rolling seven-day reminder limit reached/),
    ).toHaveTextContent(/Available again at/);
    expect(previewFetcher.load).not.toHaveBeenCalled();
  });

  it('shows a privacy-safe no-op when preferences leave no eligible recipients', async () => {
    previewResult = {
      kind: 'VOTE',
      latestNudge: null,
      status: 'NO_ELIGIBLE',
    };
    renderReminder();

    await userEvent.click(
      screen.getByRole('button', { name: 'Remind voters' }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'No one can be notified right now',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/didn't count toward your limits/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send reminder' }),
    ).not.toBeInTheDocument();
    expect(sendFetcher.submit).not.toHaveBeenCalled();
  });

  it('replaces confirmation with a neutral stale-task state', async () => {
    sendResult = {
      code: 'TASK_UNAVAILABLE',
      error: 'The vote reminder is no longer available.',
    };
    renderReminder();

    await userEvent.click(
      screen.getByRole('button', { name: 'Remind voters' }),
    );
    await screen.findByText('1 person can currently be notified.');
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reminder' }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'This reminder is no longer available',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry' }),
    ).not.toBeInTheDocument();
  });
});

function renderReminder({
  availability = {
    kind: 'VOTE',
    latestNudge: null,
    status: 'AVAILABLE',
  },
}: {
  availability?: OrganizerReminderAvailability;
} = {}) {
  render(
    <MemoryRouter>
      <OrganizerReminderAction
        availability={availability}
        kind="VOTE"
        poolId="pool-1"
        poolTitle="Alex Birthday Pool"
        senderDisplayName="Taylor"
      />
    </MemoryRouter>,
  );
}
