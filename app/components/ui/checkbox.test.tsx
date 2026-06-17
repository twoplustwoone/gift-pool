/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from './checkbox.tsx';

describe('Checkbox', () => {
  it('renders an unchecked checkbox with no visible checkmark', () => {
    render(<Checkbox aria-label="Agree" />);

    const box = screen.getByRole('checkbox', { name: 'Agree' });
    expect(box).toHaveAttribute('data-state', 'unchecked');
    // Radix only mounts the Indicator (and our SVG) once checked.
    expect(box.querySelector('svg')).toBeNull();
  });

  it('renders the checkmark SVG when checked', () => {
    render(<Checkbox aria-label="Agree" checked />);

    const box = screen.getByRole('checkbox', { name: 'Agree' });
    expect(box).toHaveAttribute('data-state', 'checked');

    const svg = box.querySelector('svg');
    expect(svg).not.toBeNull();
    // Explicit size is what makes the check visible rather than a bare square.
    expect(svg).toHaveClass('h-3', 'w-3');
    expect(svg!.querySelector('path')).not.toBeNull();
  });

  it('merges a custom className onto the root', () => {
    render(<Checkbox aria-label="Agree" className="custom-class" />);

    expect(screen.getByRole('checkbox', { name: 'Agree' })).toHaveClass(
      'custom-class',
    );
  });

  it('toggles when clicked', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="Agree" onCheckedChange={onCheckedChange} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Agree' }));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('does not toggle when disabled', async () => {
    const onCheckedChange = vi.fn();
    render(
      <Checkbox aria-label="Agree" disabled onCheckedChange={onCheckedChange} />,
    );

    const box = screen.getByRole('checkbox', { name: 'Agree' });
    expect(box).toBeDisabled();
    await userEvent.click(box);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
