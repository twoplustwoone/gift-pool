/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select.tsx';

const LONG_LABEL =
  'ORIGBELIE External DVD Drive, CD Drive USB 3.0 Type-C Portable Optical Drive';

const renderSelect = () =>
  render(
    <Select>
      <SelectTrigger aria-label="Pick an option">
        <SelectValue placeholder="Pick one" />
      </SelectTrigger>
      <SelectContent data-testid="select-content">
        <SelectItem value="long">{LONG_LABEL}</SelectItem>
      </SelectContent>
    </Select>,
  );

describe('<Select />', () => {
  it('caps the dropdown width to the space available in the viewport', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));

    // A long, unbroken item label sizing the popper to its intrinsic width
    // (rather than the available viewport space) is exactly what caused the
    // dropdown to overflow off-screen on mobile.
    expect(await screen.findByTestId('select-content')).toHaveClass(
      'max-w-[var(--radix-select-content-available-width)]',
    );
  });

  it('truncates a long item label instead of letting it force the row wider', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));

    // Radix also mirrors the label into a visually-hidden native <option>
    // for form bubbling, so scope to the visible listbox option rather than
    // screen.findByText, which could match either node.
    const option = await screen.findByRole('option', { name: LONG_LABEL });
    expect(option.querySelector('.truncate')).toHaveTextContent(LONG_LABEL);
  });
});
