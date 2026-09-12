/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DateField, type DateFieldProps } from './date-field.tsx';

function Controlled(props: Omit<DateFieldProps, 'value' | 'onChange'>) {
  const [value, setValue] = useState('');
  return <DateField {...props} value={value} onChange={setValue} />;
}

describe('DateField', () => {
  it('shows a placeholder when empty and the formatted value when filled', () => {
    const { rerender } = render(
      <DateField label="Exchange date" value="" onChange={vi.fn()} />,
    );
    expect(screen.getByPlaceholderText('mm/dd/yyyy')).toHaveValue('');

    rerender(
      <DateField label="Exchange date" value="2026-12-24" onChange={vi.fn()} />,
    );
    expect(screen.getByPlaceholderText('mm/dd/yyyy')).toHaveValue(
      '24 Dec 2026',
    );
  });

  it('resolves a typed date on blur and reports it through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateField label="Exchange date" value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('mm/dd/yyyy');
    await user.type(input, '24 Dec 2026');
    await user.tab();
    expect(onChange).toHaveBeenCalledWith('2026-12-24');
  });

  it('shows a muted hint while typing something not yet parseable, no error', async () => {
    const user = userEvent.setup();
    render(<DateField label="Exchange date" value="" onChange={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('mm/dd/yyyy'), 'hello');
    expect(
      screen.getByText(/24 Dec 2026, 12\/24\/2026 and 2026-12-24 all work/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error on commit when the text never resolves to a date', async () => {
    const user = userEvent.setup();
    render(<DateField label="Exchange date" value="" onChange={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('mm/dd/yyyy'), 'not a date');
    await user.tab();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Use a format like 24 Dec 2026',
    );
  });

  it('shows an error on commit when the date is outside min/max, and keeps the value visible', async () => {
    const user = userEvent.setup();
    render(
      <DateField
        label="Reveal matches on"
        value=""
        onChange={vi.fn()}
        min="2026-12-24"
      />,
    );
    const input = screen.getByPlaceholderText('mm/dd/yyyy');
    await user.type(input, '20 Dec 2026');
    await user.tab();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Pick a date on or after 24 Dec 2026',
    );
    expect(input).toHaveValue('20 Dec 2026');
  });

  it('an external error prop takes precedence over the component’s own', () => {
    render(
      <DateField
        label="Exchange date"
        value=""
        onChange={vi.fn()}
        error="Pick a real date."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a real date.');
  });

  it('opens the calendar, picks a day, and closes', async () => {
    const user = userEvent.setup();
    render(<Controlled label="Exchange date" />);
    await user.click(screen.getByRole('button', { name: /open calendar/i }));
    const day = await screen.findByRole('button', { name: /^15 /i });
    const label = day.getAttribute('aria-label')!;
    await user.click(day);
    expect(screen.getByPlaceholderText('mm/dd/yyyy')).toHaveValue(label);
    expect(
      screen.queryByRole('button', { name: /previous month/i }),
    ).not.toBeInTheDocument();
  });

  it('disables out-of-range calendar days', async () => {
    const user = userEvent.setup();
    render(
      <DateField
        label="Reveal matches on"
        value=""
        onChange={vi.fn()}
        min="2026-12-24"
      />,
    );
    await user.click(screen.getByRole('button', { name: /open calendar/i }));
    const earlyDay = await screen.findByRole('button', {
      name: /23 /i,
      hidden: true,
    });
    expect(earlyDay).toBeDisabled();
  });

  it('shows a clear control only when filled, and clears the value', async () => {
    const user = userEvent.setup();
    render(<Controlled label="Exchange date" />);
    expect(
      screen.queryByRole('button', { name: /clear/i }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('mm/dd/yyyy'), '24 Dec 2026');
    await user.tab();
    const clearBtn = await screen.findByRole('button', { name: /clear/i });
    await user.click(clearBtn);
    expect(screen.getByPlaceholderText('mm/dd/yyyy')).toHaveValue('');
    expect(
      screen.queryByRole('button', { name: /clear/i }),
    ).not.toBeInTheDocument();
  });

  it('is inert when disabled', () => {
    render(
      <DateField
        label="Exchange date"
        value="2026-12-24"
        onChange={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByPlaceholderText('mm/dd/yyyy')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /open calendar/i }),
    ).toBeDisabled();
  });
});
