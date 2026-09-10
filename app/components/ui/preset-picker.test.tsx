/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PresetPicker, type PresetOption } from './preset-picker.tsx';

const options: PresetOption[] = [
  { key: 'a', label: "I've got your gift." },
  { key: 'b', label: 'Add a few more things to your wishlist.' },
];

function renderPicker(
  props: Partial<React.ComponentProps<typeof PresetPicker>> = {},
) {
  const onSend = vi.fn();
  render(
    <PresetPicker
      open
      onOpenChange={() => {}}
      title="Send Agustin a note"
      options={options}
      sendLabel={() => 'Send tomorrow morning'}
      onSend={onSend}
      {...props}
    />,
  );
  return { onSend };
}

describe('<PresetPicker />', () => {
  it('sends the option that was picked, and nothing before one is', async () => {
    const user = userEvent.setup();
    const { onSend } = renderPicker();

    const send = screen.getByRole('button', { name: /pick one first/i });
    expect(send).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: /got your gift/i }));
    const ready = screen.getByRole('button', {
      name: /send tomorrow morning/i,
    });
    await user.click(ready);
    expect(onSend).toHaveBeenCalledWith('a');
  });

  it('shows the allowance as remaining, and only in here', async () => {
    renderPicker({
      allowance: { remaining: 2, total: 3, exhaustedLabel: 'None left today.' },
    });
    expect(screen.getByTestId('preset-allowance')).toHaveTextContent(
      '2 of 3 notes left today',
    );
  });

  it('disables every option once the allowance is used up', async () => {
    const user = userEvent.setup();
    const { onSend } = renderPicker({
      allowance: {
        remaining: 0,
        total: 3,
        exhaustedLabel: "That's your 3 notes for today.",
      },
    });
    expect(screen.getByTestId('preset-allowance')).toHaveTextContent(
      "That's your 3 notes for today.",
    );
    const option = screen.getByRole('radio', { name: /got your gift/i });
    expect(option).toBeDisabled();
    await user.click(option);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('marks a cautionary option without hiding it', () => {
    renderPicker({
      options: [
        {
          key: 'unique',
          label: 'My birthday is in the same half of the year as yours.',
          subtitle: 'Gives you away — only you match',
          caution: true,
        },
      ],
    });
    // Offered, not withheld: declining is one tap.
    const option = screen.getByRole('radio', { name: /gives you away/i });
    expect(option).toBeEnabled();
    expect(
      within(option).getByText('Gives you away — only you match').className,
    ).toContain('text-destructive');
  });

  it('says nothing is available rather than showing an empty list', () => {
    renderPicker({ options: [], emptyLabel: 'Nothing to send just yet.' });
    expect(screen.getByText('Nothing to send just yet.')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('holds both buttons while a send is in flight', () => {
    renderPicker({ pending: true });
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });
});
