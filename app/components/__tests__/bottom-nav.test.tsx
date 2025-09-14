/**
 * @vitest-environment jsdom
 */

import { createRemixStub } from '@remix-run/testing';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { vi, describe, test, expect } from 'vitest';

// Mock UI primitives so tests are resilient and focused on semantics
vi.mock('../ui/button.tsx', () => ({
  Button: ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('../ui/icon.tsx', () => ({
  Icon: ({ name }: { name: string }) => (
    // Mark decorative by default; the Button should carry the accessible name
    <svg aria-hidden="true" data-testid={`icon-${name}`} />
  ),
}));

import { BottomNav } from '../nav/bottom/bottom-nav.tsx';

describe('<BottomNav />', () => {
  test('renders a navigation landmark', () => {
    const App = createRemixStub([
      {
        path: '/',
        Component: () => <BottomNav />,
      },
    ]);

    render(<App />);
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });

  test('contains a list with exactly three navigation items', () => {
    const App = createRemixStub([
      {
        path: '/',
        Component: () => <BottomNav />,
      },
    ]);

    render(<App />);
    const nav = screen.getByRole('navigation');

    const list = within(nav).getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
  });

  test('buttons have accessible names', () => {
    const App = createRemixStub([
      {
        path: '/',
        Component: () => <BottomNav />,
      },
    ]);

    render(<App />);
    const home = screen.getByRole('link', { name: /home/i });
    const wishlist = screen.getByRole('link', { name: /wishlist/i });
    const groups = screen.getByRole('link', { name: /groups/i });
    expect(home).toBeInTheDocument();
    expect(wishlist).toBeInTheDocument();
    expect(groups).toBeInTheDocument();
  });
});
