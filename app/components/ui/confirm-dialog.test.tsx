/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  it('opens the dialog from its trigger button', async () => {
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        title="Delete item"
        description={<p>This action cannot be undone.</p>}
        confirmText="Delete"
        onConfirm={vi.fn()}
      >
        <Button type="button">Open dialog</Button>
      </ConfirmDialog>,
    );

    await user.click(screen.getByRole('button', { name: /open dialog/i }));

    expect(
      await screen.findByRole('dialog', { name: /delete item/i }),
    ).toBeVisible();
  });
});
