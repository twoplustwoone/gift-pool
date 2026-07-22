/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PALETTE_CLASS,
  PALETTE_STORAGE_KEY,
  PaletteSwitcher,
} from './palette-switcher.tsx';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove(PALETTE_CLASS);
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove(PALETTE_CLASS);
});

describe('<PaletteSwitcher />', () => {
  it('defaults to the current palette when nothing is stored', async () => {
    render(<PaletteSwitcher />);

    const current = await screen.findByRole('button', { name: 'Current' });
    expect(current).toHaveStyle({ background: '#fff' });
    expect(document.documentElement).not.toHaveClass(PALETTE_CLASS);
  });

  it('reads a previously stored palette on mount', async () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'fete');

    render(<PaletteSwitcher />);

    const fete = await screen.findByRole('button', { name: 'Fête' });
    await waitFor(() =>
      expect(document.documentElement).toHaveClass(PALETTE_CLASS),
    );
    expect(fete).toHaveStyle({ background: '#fff' });
  });

  it('switches palette, toggles the root class, and persists the choice', async () => {
    const user = userEvent.setup();
    render(<PaletteSwitcher />);

    await screen.findByRole('button', { name: 'Current' });
    await user.click(screen.getByRole('button', { name: 'Fête' }));

    await waitFor(() =>
      expect(document.documentElement).toHaveClass(PALETTE_CLASS),
    );
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('fete');

    await user.click(screen.getByRole('button', { name: 'Current' }));

    await waitFor(() =>
      expect(document.documentElement).not.toHaveClass(PALETTE_CLASS),
    );
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('current');
  });
});
