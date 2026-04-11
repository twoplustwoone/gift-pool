/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { describe, expect, it } from 'vitest';

import { DangerZoneDeleteDialog } from './__danger-zone-delete-dialog.tsx';

function renderDialog(username = 'wade') {
  const App = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <DangerZoneDeleteDialog username={username} intent="delete-data" />
      ),
    },
  ]);
  return render(<App initialEntries={['/']} />);
}

describe('<DangerZoneDeleteDialog />', () => {
  it('opens the dialog when the destructive trigger is clicked', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(
      screen.queryByRole('dialog', { name: /delete your account/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /delete all your data/i }),
    );

    expect(
      await screen.findByRole('dialog', { name: /delete your account/i }),
    ).toBeInTheDocument();
  });

  it('keeps the confirm button disabled until the exact username is typed', async () => {
    const user = userEvent.setup();
    renderDialog('wade');

    await user.click(
      screen.getByRole('button', { name: /delete all your data/i }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: /delete your account/i,
    });
    const confirm = dialog.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    const input = dialog.querySelector('input') as HTMLInputElement;

    expect(confirm).toBeDisabled();

    await user.type(input, 'not-wade');
    expect(confirm).toBeDisabled();

    await user.clear(input);
    await user.type(input, 'wade');
    expect(confirm).toBeEnabled();
  });

  it('resets the typed value when the dialog is closed', async () => {
    const user = userEvent.setup();
    renderDialog('wade');

    await user.click(
      screen.getByRole('button', { name: /delete all your data/i }),
    );

    let dialog = await screen.findByRole('dialog', {
      name: /delete your account/i,
    });
    let input = dialog.querySelector('input') as HTMLInputElement;
    await user.type(input, 'wade');
    expect(input.value).toBe('wade');

    await user.click(dialog.querySelector('button[type="button"]')!);

    // Reopen and verify the field is empty again.
    await user.click(
      screen.getByRole('button', { name: /delete all your data/i }),
    );
    dialog = await screen.findByRole('dialog', {
      name: /delete your account/i,
    });
    input = dialog.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});
