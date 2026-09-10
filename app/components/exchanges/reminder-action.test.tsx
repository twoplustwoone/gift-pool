/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ExchangeReminderAction } from './reminder-action.tsx';

describe('<ExchangeReminderAction />', () => {
  it('offers one preset and says how many, never who', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <ExchangeReminderAction
        availability={{ status: 'AVAILABLE', kind: 'ANSWER', eligibleCount: 3 }}
        pending={false}
        onSend={onSend}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remind' }));

    expect(
      screen.getByText(/3 people haven't answered yet/),
    ).toBeInTheDocument();
    expect(screen.getByText(/you won't be told who/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Who received it, and whether they opened it, stays private.',
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('radio', { name: /Answer before the draw/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Send the reminder' }));
    expect(onSend).toHaveBeenCalled();
  });

  it('says why it is unavailable instead of a dead button', () => {
    const { unmount } = render(
      <ExchangeReminderAction
        availability={{
          status: 'COOLDOWN',
          kind: 'ANSWER',
          availableAt: new Date(),
        }}
        pending={false}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByTestId('reminder-state')).toHaveTextContent(
      'You reminded them today',
    );
    expect(screen.queryByRole('button', { name: 'Remind' })).toBeNull();
    unmount();

    render(
      <ExchangeReminderAction
        availability={{ status: 'NO_ELIGIBLE', kind: 'ANSWER' }}
        pending={false}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByTestId('reminder-state')).toHaveTextContent(
      'Everyone has answered.',
    );
  });

  it('disappears once reminding to answer means nothing', () => {
    const { container } = render(
      <ExchangeReminderAction
        availability={{ status: 'NOT_APPLICABLE', kind: 'ANSWER' }}
        pending={false}
        onSend={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
