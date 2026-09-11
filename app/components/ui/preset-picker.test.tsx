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

  // This repo's first arrow-key tests. A radio group that only responds to
  // clicks is unusable with a keyboard, and the guess picker is the core
  // interaction of the guessing game.
  describe('keyboard', () => {
    const sectioned = {
      options: [
        { key: 'a', label: 'Alpha' },
        { key: 'b', label: 'Bravo' },
        { key: 'c', label: 'Charlie' },
      ],
      // Visual order is sections first, then whatever is left over — which is
      // NOT the order of `options`.
      sections: [{ label: 'From what Gift Pool knows', keys: ['c', 'b'] }],
    };

    it('puts exactly one option in the tab order', () => {
      renderPicker();
      const [first, ...rest] = screen.getAllByRole('radio');
      // One tab stop for the whole group; the rest are reached with arrows.
      expect(first).toHaveAttribute('tabindex', '0');
      for (const option of rest) {
        expect(option).toHaveAttribute('tabindex', '-1');
      }
    });

    it('moves through the list with arrows, selecting as it goes', async () => {
      const user = userEvent.setup();
      renderPicker();
      screen.getAllByRole('radio')[0]!.focus();
      await user.keyboard('{ArrowDown}');

      const second = screen.getByRole('radio', { name: /wishlist/i });
      expect(second).toHaveFocus();
      expect(second).toBeChecked();
      // Right/Left are the same axis for a vertical list.
      await user.keyboard('{ArrowUp}');
      expect(
        screen.getByRole('radio', { name: /got your gift/i }),
      ).toBeChecked();
    });

    it('wraps at both ends, and Home/End jump', async () => {
      const user = userEvent.setup();
      renderPicker();
      screen.getAllByRole('radio')[0]!.focus();
      // Up from the first lands on the last.
      await user.keyboard('{ArrowUp}');
      expect(screen.getByRole('radio', { name: /wishlist/i })).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(
        screen.getByRole('radio', { name: /got your gift/i }),
      ).toHaveFocus();
      await user.keyboard('{End}');
      expect(screen.getByRole('radio', { name: /wishlist/i })).toHaveFocus();
      await user.keyboard('{Home}');
      expect(
        screen.getByRole('radio', { name: /got your gift/i }),
      ).toHaveFocus();
    });

    it('follows the order options are SHOWN in, not the order they are given in', async () => {
      const user = userEvent.setup();
      renderPicker(sectioned);
      // A section renders its members in `options` order, so Bravo sits above
      // Charlie on screen even though the section lists Charlie first — and
      // the leftover Alpha trails both. Arrow order has to match the screen.
      expect(screen.getByRole('radio', { name: 'Bravo' })).toHaveAttribute(
        'tabindex',
        '0',
      );
      screen.getByRole('radio', { name: 'Bravo' }).focus();
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('radio', { name: 'Charlie' })).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveFocus();
      // And it wraps back to the top of the section, not to Alpha's group.
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('radio', { name: 'Bravo' })).toHaveFocus();
    });

    it('steps over an option that cannot be picked', async () => {
      const user = userEvent.setup();
      renderPicker({
        options: [
          { key: 'a', label: 'Alpha' },
          { key: 'b', label: 'Bravo', disabled: true },
          { key: 'c', label: 'Charlie' },
        ],
      });
      screen.getByRole('radio', { name: 'Alpha' }).focus();
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('radio', { name: 'Charlie' })).toHaveFocus();
    });

    it('offers no tab stop at all when nothing can be picked', () => {
      renderPicker({
        allowance: {
          remaining: 0,
          total: 3,
          exhaustedLabel: "That's your 3 notes for today.",
        },
      });
      // Every option is disabled, so there is nothing to rove to — focus must
      // pass the group by rather than land on something unusable.
      for (const option of screen.getAllByRole('radio')) {
        expect(option).toBeDisabled();
        expect(option).toHaveAttribute('tabindex', '-1');
      }
    });

    it("says what was picked, in the caller's words", async () => {
      const user = userEvent.setup();
      renderPicker({
        announceSelection: (option) => `Your guess is now ${option.label}`,
      });
      // Silent until there is something to say.
      expect(screen.getByRole('status')).toHaveTextContent('');
      await user.click(screen.getByRole('radio', { name: /wishlist/i }));
      expect(screen.getByRole('status')).toHaveTextContent(
        'Your guess is now Add a few more things to your wishlist.',
      );
    });

    it('falls back to a plain sentence when the caller gives no wording', async () => {
      const user = userEvent.setup();
      renderPicker();
      await user.click(screen.getByRole('radio', { name: /got your gift/i }));
      expect(screen.getByRole('status')).toHaveTextContent(
        "I've got your gift. selected",
      );
    });
  });
});
