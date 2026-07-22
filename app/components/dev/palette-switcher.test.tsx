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
  shouldShowPaletteSwitcher,
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

  it('reasserts the palette class after something else overwrites <html>.className', async () => {
    const user = userEvent.setup();
    render(<PaletteSwitcher />);

    await user.click(screen.getByRole('button', { name: 'Fête' }));
    await waitFor(() =>
      expect(document.documentElement).toHaveClass(PALETTE_CLASS),
    );

    // Simulate a theme toggle: React rewrites <html>'s className wholesale,
    // dropping the imperatively-added palette class.
    document.documentElement.className = 'dark min-h-full overflow-x-hidden';
    expect(document.documentElement).not.toHaveClass(PALETTE_CLASS);

    await waitFor(() =>
      expect(document.documentElement).toHaveClass(PALETTE_CLASS),
    );
  });
});

describe('shouldShowPaletteSwitcher', () => {
  it('shows for any user in dev, admin or not', () => {
    expect(shouldShowPaletteSwitcher(true, null)).toBe(true);
    expect(shouldShowPaletteSwitcher(true, { roles: [] })).toBe(true);
  });

  it('hides in production for a signed-out or non-admin user', () => {
    expect(shouldShowPaletteSwitcher(false, null)).toBe(false);
    expect(
      shouldShowPaletteSwitcher(false, {
        roles: [{ name: 'user', permissions: [] }],
      }),
    ).toBe(false);
  });

  it('shows in production for an admin', () => {
    expect(
      shouldShowPaletteSwitcher(false, {
        roles: [{ name: 'admin', permissions: [] }],
      }),
    ).toBe(true);
  });
});
