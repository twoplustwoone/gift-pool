/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, type Location } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaderDataSnapshot = {
  user: {
    id: 'user-1',
    image: { id: 'image-1' } as { id: string } | null,
    name: 'Taylor',
    username: 'taylor',
  },
  userJoinedDisplay: '3/31/2026',
};

const routeErrorState = {
  error: undefined as unknown,
  params: {} as Record<string, string | undefined>,
};

const useOptionalUser = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');

  return {
    ...actual,
    Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
    useLoaderData: () => loaderDataSnapshot,
    useParams: () => routeErrorState.params,
    useRouteError: () => routeErrorState.error,
  };
});

vi.mock('#app/utils/user.ts', () => ({
  useOptionalUser: (...args: Array<unknown>) => useOptionalUser(...args),
}));

import ProfileIndex, { ErrorBoundary, meta } from './index.tsx';

const location = {
  hash: '',
  key: 'test',
  pathname: '/profile',
  search: '',
  state: null,
  unstable_mask: undefined,
} satisfies Location;

function renderRoute() {
  return render(
    <MemoryRouter>
      <ProfileIndex />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loaderDataSnapshot.user = {
    id: 'user-1',
    image: { id: 'image-1' },
    name: 'Taylor',
    username: 'taylor',
  };
  loaderDataSnapshot.userJoinedDisplay = '3/31/2026';
  routeErrorState.error = undefined;
  routeErrorState.params = {};
  useOptionalUser.mockReset();
});

describe('app/routes/profile+/index.tsx', () => {
  it('renders the signed-in user actions on their own profile', () => {
    useOptionalUser.mockReturnValue({ id: 'user-1' });

    renderRoute();

    expect(screen.getByRole('heading', { name: 'Taylor' })).toBeInTheDocument();
    expect(screen.getByText('Joined 3/31/2026')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /logout/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'My wishlist' }),
    ).toHaveAttribute('href', '/wishlist');
    expect(
      screen.getByRole('link', { name: 'Edit profile' }),
    ).toHaveAttribute('href', '/settings/profile');
  });

  it('renders a public wishlist link when viewing another profile', () => {
    useOptionalUser.mockReturnValue({ id: 'viewer-2' });

    renderRoute();

    expect(
      screen.getByRole('link', { name: "Taylor's wishlist" }),
    ).toHaveAttribute('href', '/wishlist');
    expect(
      screen.queryByRole('button', { name: /logout/i }),
    ).not.toBeInTheDocument();
  });

  it('builds profile metadata from loader data', () => {
    expect(
      meta({
        data: {
          user: {
            createdAt: new Date('2026-03-31T00:00:00.000Z'),
            id: 'user-1',
            image: null,
            name: 'Taylor',
            username: 'taylor',
          },
          userJoinedDisplay: '3/31/2026',
        },
        loaderData: {
          user: {
            createdAt: new Date('2026-03-31T00:00:00.000Z'),
            id: 'user-1',
            image: null,
            name: 'Taylor',
            username: 'taylor',
          },
          userJoinedDisplay: '3/31/2026',
        },
        location,
        matches: [],
        params: {},
      }),
    ).toEqual([
      { title: 'Taylor | GiftPool' },
      {
        content: 'Profile of Taylor on GiftPool',
        name: 'description',
      },
    ]);
  });

  it('renders the profile-specific 404 message from the error boundary', () => {
    routeErrorState.error = {
      data: 'User not found',
      internal: false,
      status: 404,
      statusText: 'Not Found',
    };
    routeErrorState.params = {
      username: 'missing-user',
    };

    render(
      <MemoryRouter>
        <ErrorBoundary />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('No user with the username "missing-user" exists'),
    ).toBeInTheDocument();
  });
});
