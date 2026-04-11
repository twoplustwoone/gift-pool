/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

type LoaderUser = {
  id: string;
  name: string | null;
  username: string;
  email: string;
  image: { id: string } | null;
  _count: { sessions: number };
};

const loaderDataSnapshot: {
  user: LoaderUser;
  hasPassword: boolean;
  isTwoFactorEnabled: boolean;
} = {
  user: {
    id: 'user-1',
    name: 'Wade Wilson',
    username: 'wade',
    email: 'wade@example.com',
    image: { id: 'image-1' },
    _count: { sessions: 3 },
  },
  hasPassword: true,
  isTwoFactorEnabled: false,
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>(
    'react-router',
  );
  return {
    ...actual,
    Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
    useLoaderData: () => loaderDataSnapshot,
    useFetcher: () => ({
      state: 'idle',
      data: undefined,
      formData: undefined,
      submit: vi.fn(),
      Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
    }),
  };
});

// The photo sheet lazily imports react-easy-crop which crashes jsdom's
// module system. Stub it out — we exercise the sheet interaction in
// settings-profile e2e, not here.
vi.mock('./__profile-photo-sheet.tsx', () => ({
  ProfilePhotoSheet: () => null,
}));

vi.mock('#app/utils/misc.tsx', async () => {
  const actual =
    await vi.importActual<typeof import('#app/utils/misc.tsx')>(
      '#app/utils/misc.tsx',
    );
  return {
    ...actual,
    getUserImgSrc: (id?: string | null) =>
      id ? `/images/${id}` : '/images/default',
    useDoubleCheck: () => ({
      doubleCheck: false,
      getButtonProps: (props: Record<string, unknown> = {}) => props,
    }),
  };
});

import SettingsProfileHub from './profile.index.tsx';

function renderHub() {
  return render(
    <MemoryRouter>
      <SettingsProfileHub />
    </MemoryRouter>,
  );
}

describe('<SettingsProfileHub />', () => {
  it('renders the Settings header and all card sections', () => {
    renderHub();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Profile' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Account' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Preferences' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Your data' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Danger zone' }),
    ).toBeInTheDocument();
  });

  it('populates the username + name form from loader data', () => {
    const { container } = renderHub();
    const username = container.querySelector(
      'input[name="username"]',
    ) as HTMLInputElement;
    const name = container.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    expect(username.value).toBe('wade');
    expect(name.value).toBe('Wade Wilson');
  });

  it('links Account rows to their sub-routes with state-aware labels', () => {
    renderHub();
    expect(
      screen.getByRole('link', { name: /change email address/i }),
    ).toHaveAttribute('href', '/change-email');
    expect(
      screen.getByRole('link', { name: /^change password$/i }),
    ).toHaveAttribute('href', '/password');
    expect(screen.getByRole('link', { name: /^enable 2fa$/i })).toHaveAttribute(
      'href',
      '/two-factor',
    );
  });

  it('switches the password row to "Create password" when the user has no password', () => {
    loaderDataSnapshot.hasPassword = false;
    renderHub();
    expect(
      screen.getByRole('link', { name: /^create password$/i }),
    ).toHaveAttribute('href', '/password/create');
    loaderDataSnapshot.hasPassword = true;
  });

  it('switches the 2FA row to "Disable 2FA" when 2FA is enabled', () => {
    loaderDataSnapshot.isTwoFactorEnabled = true;
    renderHub();
    expect(
      screen.getByRole('link', { name: /^disable 2fa$/i }),
    ).toHaveAttribute('href', '/two-factor');
    loaderDataSnapshot.isTwoFactorEnabled = false;
  });

  it('shows the sign-out button when there are other active sessions', () => {
    renderHub();
    expect(
      screen.getByRole('button', { name: /sign out of 2 other sessions/i }),
    ).toBeInTheDocument();
  });

  it('shows the singular message when only one other session exists', () => {
    loaderDataSnapshot.user._count.sessions = 2;
    renderHub();
    expect(
      screen.getByRole('button', { name: /sign out of 1 other session/i }),
    ).toBeInTheDocument();
    loaderDataSnapshot.user._count.sessions = 3;
  });

  it('replaces the sign-out button with a note when there are no other sessions', () => {
    loaderDataSnapshot.user._count.sessions = 1;
    renderHub();
    expect(
      screen.queryByRole('button', { name: /sign out of/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/this is your only active session/i),
    ).toBeInTheDocument();
    loaderDataSnapshot.user._count.sessions = 3;
  });
});
