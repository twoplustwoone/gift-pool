/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
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

  it('renders consequences in order, then the outcome preview, then the caution', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        title="Draw names for 5 people?"
        description="Francisco, Nicolas and Agustin."
        consequences={[
          'Nobody can join or leave afterwards.',
          "You'll draw a name too.",
        ]}
        outcomePreview="Everyone gets someone new this year."
        caution="One person hasn't answered yet."
        confirmText="Draw names"
        onConfirm={vi.fn()}
      >
        <Button type="button">Draw</Button>
      </ConfirmDialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Draw' }));
    const dialog = await screen.findByRole('dialog');
    const items = within(dialog).getAllByRole('listitem');
    expect(items.map((li) => li.textContent?.replace('•', '').trim())).toEqual([
      'Nobody can join or leave afterwards.',
      "You'll draw a name too.",
    ]);
    const text = dialog.textContent ?? '';
    expect(text.indexOf('Nobody can join')).toBeLessThan(
      text.indexOf('Everyone gets someone new'),
    );
    expect(text.indexOf('Everyone gets someone new')).toBeLessThan(
      text.indexOf("hasn't answered"),
    );
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      "One person hasn't answered yet.",
    );
  });

  it('while pending: disables both buttons, swaps the label, announces politely, and stays open', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Draw names?"
        confirmText="Draw names"
        pending
        pendingLabel="Drawing names…"
        pendingHint="Hang on — this only happens once."
        onConfirm={onConfirm}
        open
      />,
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('button', { name: 'Drawing names…' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled();
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Drawing names…',
    );
    expect(within(dialog).getByText(/only happens once/)).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('stays open after confirm when the caller owns closing (closeOnConfirm=false)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        title="Draw names?"
        confirmText="Draw names"
        closeOnConfirm={false}
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'Draw names' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('keeps the description associated with the dialog', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        title="Cancel this pool?"
        description="Contributors will no longer be able to act on it."
        onConfirm={vi.fn()}
      >
        <Button type="button">Open</Button>
      </ConfirmDialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('dialog')).toHaveAccessibleDescription(
      'Contributors will no longer be able to act on it.',
    );
  });

  it('closes itself after a non-pending confirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Cancel this pool?"
        confirmText="Cancel pool"
        onConfirm={onConfirm}
      >
        <Button type="button">Open</Button>
      </ConfirmDialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(
      await screen.findByRole('button', { name: 'Cancel pool' }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the typed-confirmation gate', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        title="Delete"
        confirmText="Delete pool"
        requireText="DELETE"
        onConfirm={vi.fn()}
      >
        <Button type="button">Open</Button>
      </ConfirmDialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const confirm = await screen.findByRole('button', { name: 'Delete pool' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/Type "DELETE"/), 'DELETE');
    expect(confirm).toBeEnabled();
  });
});
