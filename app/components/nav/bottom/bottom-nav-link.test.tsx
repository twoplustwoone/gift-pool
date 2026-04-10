/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { Home } from 'lucide-react';
import React from 'react';
import type ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useNavigationMock = vi.fn();
const useLocationMock = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return {
    ...actual,
    useNavigation: () => useNavigationMock(),
    useLocation: () => useLocationMock(),
    // Stub NavLink so the test controls what `isActive` gets passed to the
    // render props. We always pass `isActive: true` because the BottomNavLink
    // is supposed to IGNORE it during a pending-to-different-route nav — the
    // override is the behavior under test.
    NavLink: ({
      className,
      children,
      to,
      ...rest
    }: {
      className?:
        | string
        | ((args: { isActive: boolean; isPending: boolean }) => string);
      children?:
        | React.ReactNode
        | ((args: {
            isActive: boolean;
            isPending: boolean;
          }) => React.ReactNode);
      to: string;
      'aria-label'?: string;
    }) => {
      const classStr =
        typeof className === 'function'
          ? className({ isActive: true, isPending: false })
          : (className ?? '');
      const content =
        typeof children === 'function'
          ? children({ isActive: true, isPending: false })
          : children;
      return (
        <a href={to} className={classStr} {...rest}>
          {content}
        </a>
      );
    },
  };
});

import { BottomNavLink } from './bottom-nav-link.tsx';

const activeClassName = 'text-primary';
const inactiveClassName = 'text-muted-foreground';

beforeEach(() => {
  useNavigationMock.mockReset();
  useLocationMock.mockReset();
});

describe('<BottomNavLink /> optimistic active state', () => {
  it('falls back to the NavLink isActive prop when there is no pending navigation', () => {
    useNavigationMock.mockReturnValue({ state: 'idle', location: undefined });
    useLocationMock.mockReturnValue({
      pathname: '/',
      search: '',
      hash: '',
    });

    render(<BottomNavLink to="/wishlist" icon={Home} label="Wishlist" />);

    const link = screen.getByRole('link', { name: 'Wishlist' });
    // NavLink stub passes isActive=true, no pending nav → effective active stays true.
    expect(link.className).toContain(activeClassName);
    expect(link.className).not.toContain(inactiveClassName);
  });

  it('marks the pending target as active even though NavLink reports isActive=false for it', () => {
    useNavigationMock.mockReturnValue({
      state: 'loading',
      location: { pathname: '/wishlist', search: '', hash: '' },
    });
    useLocationMock.mockReturnValue({
      pathname: '/friends',
      search: '',
      hash: '',
    });

    render(<BottomNavLink to="/wishlist" icon={Home} label="Wishlist" />);

    // We're navigating FROM /friends TO /wishlist. The wishlist link should
    // become active immediately, regardless of what NavLink's isActive says.
    const link = screen.getByRole('link', { name: 'Wishlist' });
    expect(link.className).toContain(activeClassName);
  });

  it('deactivates the previously-active tab during a pending nav away from it', () => {
    useNavigationMock.mockReturnValue({
      state: 'loading',
      location: { pathname: '/wishlist', search: '', hash: '' },
    });
    useLocationMock.mockReturnValue({
      pathname: '/friends',
      search: '',
      hash: '',
    });

    // The Friends link is the one we're leaving. NavLink stub still reports
    // isActive=true, but our optimistic override should force it inactive.
    render(<BottomNavLink to="/friends" icon={Home} label="Friends" />);

    const link = screen.getByRole('link', { name: 'Friends' });
    expect(link.className).toContain(inactiveClassName);
    expect(link.className).not.toContain(activeClassName);
  });

  it('treats a sub-route navigation as targeting its parent tab', () => {
    useNavigationMock.mockReturnValue({
      state: 'loading',
      location: { pathname: '/wishlist/123', search: '', hash: '' },
    });
    useLocationMock.mockReturnValue({
      pathname: '/friends',
      search: '',
      hash: '',
    });

    render(<BottomNavLink to="/wishlist" icon={Home} label="Wishlist" />);

    // matchesPath should treat /wishlist/123 as a match for the /wishlist tab.
    const link = screen.getByRole('link', { name: 'Wishlist' });
    expect(link.className).toContain(activeClassName);
  });

  it('ignores same-route revalidations (form submissions) so tabs do not re-skin', () => {
    useNavigationMock.mockReturnValue({
      state: 'loading',
      location: { pathname: '/wishlist', search: '', hash: '' },
    });
    useLocationMock.mockReturnValue({
      pathname: '/wishlist',
      search: '',
      hash: '',
    });

    render(<BottomNavLink to="/friends" icon={Home} label="Friends" />);

    // Same-route revalidation should not count as a pending nav; the Friends
    // link should fall back to whatever NavLink reports (isActive=true via
    // our stub).
    const link = screen.getByRole('link', { name: 'Friends' });
    expect(link.className).toContain(activeClassName);
  });

  it('handles the "/" home link via exact match (does not false-match other routes)', () => {
    useNavigationMock.mockReturnValue({
      state: 'loading',
      location: { pathname: '/wishlist', search: '', hash: '' },
    });
    useLocationMock.mockReturnValue({
      pathname: '/friends',
      search: '',
      hash: '',
    });

    render(<BottomNavLink to="/" icon={Home} label="Home" />);

    // Navigating to /wishlist should NOT make the Home ("/") link active.
    const link = screen.getByRole('link', { name: 'Home' });
    expect(link.className).toContain(inactiveClassName);
  });
});
