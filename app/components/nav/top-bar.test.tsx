/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('#app/components/nav/top/top-nav', () => ({
  TopNav: () => <div data-testid="top-nav" />,
}));

import { TopBar } from './top-bar.tsx';

describe('<TopBar />', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--top-bar-height');
  });

  test('renders the top nav', () => {
    render(<TopBar />);
    expect(screen.getByTestId('top-nav')).toBeInTheDocument();
  });

  test('is visible by default', () => {
    render(<TopBar />);
    const header = screen.getByTestId('top-bar');
    expect(header).not.toHaveClass('-translate-y-full');
    expect(header).not.toHaveClass('pointer-events-none');
    expect(header).not.toHaveClass('opacity-0');
  });

  test('applies hidden classes when hidden=true', () => {
    render(<TopBar hidden />);
    const header = screen.getByTestId('top-bar');
    expect(header).toHaveClass('-translate-y-full');
    expect(header).toHaveClass('pointer-events-none');
    expect(header).toHaveClass('opacity-0');
  });

  test('uses the shared top-bar height variable without runtime positioning', () => {
    render(<TopBar />);
    const header = screen.getByTestId('top-bar');
    expect(header).toHaveClass('top-0');
    expect(header).toHaveClass('h-[var(--top-bar-height)]');
    expect(header).toHaveClass('items-center');
    expect(header).not.toHaveAttribute('style');
  });

  test('does not overwrite --top-bar-height after mount', () => {
    render(<TopBar />);
    expect(
      document.documentElement.style.getPropertyValue('--top-bar-height'),
    ).toBe('');
  });
});
