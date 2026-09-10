/**
 * @vitest-environment jsdom
 */
// The server refuses deletion while someone else's pool is still counting on
// this account, and returns that refusal as data rather than throwing — a
// thrown response would take the settings page to the error boundary and the
// person would never read what to do about it. So the dialog has to show it.
import { render, screen } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const fetcherData: { data: unknown } = { data: undefined };

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return {
    ...actual,
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

import { DangerZoneDeleteDialog } from './__danger-zone-delete-dialog.tsx';

const renderDialog = () =>
  render(
    <MemoryRouter initialEntries={['/settings/profile']}>
      <DangerZoneDeleteDialog username="wade" intent="delete-data" />
    </MemoryRouter>,
  );

describe('<DangerZoneDeleteDialog /> refusals', () => {
  it('shows what the server said, and says what to do about it', async () => {
    fetcherData.data = {
      status: 'error',
      error:
        'A group chose your idea "A telescope" for a gift they\'re still working on.',
    };
    const user = (await import('@testing-library/user-event')).default.setup();
    renderDialog();
    await user.click(
      screen.getByRole('button', { name: /delete all your data/i }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A telescope');
    // The dialog stays put, so they can act on it and try again.
    expect(
      screen.getByRole('button', { name: /delete my account/i }),
    ).toBeInTheDocument();
  });

  it('shows nothing when there is nothing to report', async () => {
    fetcherData.data = undefined;
    const user = (await import('@testing-library/user-event')).default.setup();
    renderDialog();
    await user.click(
      screen.getByRole('button', { name: /delete all your data/i }),
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
