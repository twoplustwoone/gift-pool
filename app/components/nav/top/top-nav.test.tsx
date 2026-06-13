/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { createRoutesStub, NavLink } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

const useOptionalUser = vi.fn();
const useRequestInfo = vi.fn();
const track = vi.fn();

vi.mock('#app/utils/analytics.client.ts', () => ({
  track: (...args: Array<unknown>) => track(...args),
}));

vi.mock('#app/components/logo', () => ({
  Logo: () => <div>GiftPool</div>,
}));

vi.mock('#app/components/notifications/notification-bell.tsx', () => ({
  NotificationBell: () => <div>Notifications</div>,
}));

vi.mock('#app/components/ui/button', () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.HTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button type="button" {...props}>{children}</button>,
}));

vi.mock('#app/components/ui/topNavItem', () => ({
  TopNavItem: ({ to, label }: { to: string; label: string }) => (
    <NavLink to={to}>{label}</NavLink>
  ),
}));

vi.mock('#app/components/user-dropdown', () => ({
  UserDropdown: () => <div>User menu</div>,
}));

vi.mock('#app/routes/resources+/theme-switch', () => ({
  ThemeSwitch: ({ userPreference }: { userPreference: string }) => (
    <div>Theme {userPreference}</div>
  ),
}));

vi.mock('#app/utils/request-info', () => ({
  useRequestInfo: (...args: Array<unknown>) => useRequestInfo(...args),
}));

vi.mock('#app/utils/user', () => ({
  useOptionalUser: (...args: Array<unknown>) => useOptionalUser(...args),
}));

import { TopNav } from './top-nav.tsx';

describe('<TopNav />', () => {
  function renderTopNav(user: { id: string } | null = { id: 'user-1' }) {
    useOptionalUser.mockReturnValue(user);
    useRequestInfo.mockReturnValue({
      userPrefs: { theme: 'light' },
    });

    const App = createRoutesStub([
      {
        path: '/pools',
        Component: () => <TopNav />,
      },
    ]);

    render(<App initialEntries={['/pools']} />);
  }

  afterEach(() => {
    useOptionalUser.mockReset();
    useRequestInfo.mockReset();
    track.mockReset();
  });

  test('renders all primary links for authenticated users', () => {
    renderTopNav({ id: 'user-1' });

    for (const name of ['Home', 'Wishlist', 'Groups', 'Pools', 'Friends']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Theme light')).toBeInTheDocument();
    expect(screen.getByText('User menu')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log In' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument();
  });

  test('renders logged-out navigation with signup and login links', () => {
    renderTopNav(null);

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log In' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
      'href',
      '/signup',
    );
    expect(screen.queryByRole('link', { name: 'Pools' })).not.toBeInTheDocument();
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
    expect(screen.queryByText('User menu')).not.toBeInTheDocument();
  });

  test('tracks the nav signup click', () => {
    renderTopNav(null);

    screen.getByRole('link', { name: 'Sign up' }).click();

    expect(track).toHaveBeenCalledWith('home_cta_clicked', {
      cta: 'nav_signup',
    });
  });
});
