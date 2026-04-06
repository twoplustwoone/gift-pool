/**
 * @vitest-environment jsdom
 */

import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { createRoutesStub } from 'react-router';
import { afterEach, vi, describe, test, expect } from 'vitest';

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

vi.mock('#app/utils/user.ts', () => ({
  useOptionalUser: vi.fn(),
}));

import { useOptionalUser } from '#app/utils/user.ts';

import { BottomNav } from '../nav/bottom/bottom-nav.tsx';

describe('<BottomNav />', () => {
  function renderBottomNav(user: { id: string } | null = { id: 'user1' }) {
    vi.mocked(useOptionalUser).mockReturnValue(user as any);

    const App = createRoutesStub([
      {
        path: '/',
        Component: () => <BottomNav />,
      },
    ]);

    render(<App initialEntries={['/']} />);
  }

  afterEach(() => {
    vi.mocked(useOptionalUser).mockReset();
  });

  test('renders a navigation landmark', () => {
    renderBottomNav();
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });

  test('renders exactly five items when authenticated', () => {
    renderBottomNav({ id: 'user1' });
    const nav = screen.getByRole('navigation');

    const list = within(nav).getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(5);
  });

  test('renders exactly one item when unauthenticated', () => {
    renderBottomNav(null);
    const nav = screen.getByRole('navigation');

    const list = within(nav).getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(1);
  });

  test('all five items have accessible labels', () => {
    renderBottomNav({ id: 'user1' });

    for (const name of ['Home', 'Wishlist', 'Groups', 'Pools', 'Friends']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });
});
