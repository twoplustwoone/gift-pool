/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, type Location } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LoaderUser = {
  id: string;
  image: { id: string } | null;
  name: string | null;
  username: string;
  birthday: Date | null;
  createdAt: Date;
};

const loaderDataSnapshot: {
  user: LoaderUser;
  userJoinedDisplay: string;
  wishlistPreview: {
    items: Array<{
      id: string;
      title: string;
      url: string | null;
      hasImage: boolean;
      updatedAt: Date;
    }>;
    totalCount: number;
  };
} = {
  user: {
    id: 'user-1',
    image: { id: 'image-1' },
    name: 'Taylor',
    username: 'taylor',
    birthday: null,
    createdAt: new Date('2026-03-31T00:00:00.000Z'),
  },
  userJoinedDisplay: '3/31/2026',
  wishlistPreview: {
    items: [],
    totalCount: 0,
  },
};

const routeErrorState = {
  error: undefined as unknown,
  params: {} as Record<string, string | undefined>,
};

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

import ProfileIndex, { ErrorBoundary, meta } from './index.tsx';

const location = {
  hash: '',
  key: 'test',
  pathname: '/me',
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
    birthday: null,
    createdAt: new Date('2026-03-31T00:00:00.000Z'),
  };
  loaderDataSnapshot.userJoinedDisplay = '3/31/2026';
  loaderDataSnapshot.wishlistPreview = { items: [], totalCount: 0 };
  routeErrorState.error = undefined;
  routeErrorState.params = {};
});

describe('app/routes/profile+/index.tsx', () => {
  it('renders the signed-in user hero, actions, and wishlist preview shell', () => {
    renderRoute();

    expect(screen.getByRole('heading', { name: 'Taylor' })).toBeInTheDocument();
    expect(screen.getByText('Joined 3/31/2026')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /logout/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My wishlist' })).toHaveAttribute(
      'href',
      '/wishlist',
    );
    expect(
      screen.getByRole('link', { name: 'Edit profile' }),
    ).toHaveAttribute('href', '/settings/profile');
  });

  it('prompts the user to add a birthday when one is not set', () => {
    renderRoute();
    expect(
      screen.getByText(/Add your birthday in/i),
    ).toBeInTheDocument();
  });

  it('hides the birthday prompt when the user already has one set', () => {
    loaderDataSnapshot.user.birthday = new Date('2026-06-15T00:00:00.000Z');
    renderRoute();
    expect(
      screen.queryByText(/Add your birthday in/i),
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
            birthday: null,
          },
          userJoinedDisplay: '3/31/2026',
          wishlistPreview: { items: [], totalCount: 0 },
        },
        loaderData: {
          user: {
            createdAt: new Date('2026-03-31T00:00:00.000Z'),
            id: 'user-1',
            image: null,
            name: 'Taylor',
            username: 'taylor',
            birthday: null,
          },
          userJoinedDisplay: '3/31/2026',
          wishlistPreview: { items: [], totalCount: 0 },
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
