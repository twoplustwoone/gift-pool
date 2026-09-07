/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Switch, SwitchRow } from './switch.tsx';

describe('Switch', () => {
  it('is a labelled switch that reports the next value on click', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Switch
        label="Auto-reveal"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    const control = screen.getByRole('switch', { name: 'Auto-reveal' });
    expect(control).not.toBeChecked();
    await user.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('does nothing while disabled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Switch
        label="Auto-reveal"
        checked
        disabled
        onCheckedChange={onCheckedChange}
      />,
    );
    await user.click(screen.getByRole('switch', { name: 'Auto-reveal' }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});

describe('SwitchRow', () => {
  it('labels the control with the visible title and describes it with the description', () => {
    render(
      <SwitchRow
        id="someone-new"
        title="Give everyone someone new"
        description="Avoids anyone you drew in the last two draws."
        checked
        onCheckedChange={vi.fn()}
      />,
    );
    const control = screen.getByRole('switch', {
      name: 'Give everyone someone new',
    });
    expect(control).toHaveAccessibleDescription(
      'Avoids anyone you drew in the last two draws.',
    );
    expect(control).toBeChecked();
  });
});
