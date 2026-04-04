/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const useOptionalUser = vi.fn();

vi.mock('#app/utils/user.ts', () => ({
  useOptionalUser: () => useOptionalUser(),
}));

vi.mock('#app/components/friends/friend-action-button.tsx', () => ({
  FriendActionButton: ({ targetUserName }: { targetUserName: string }) => (
    <button type="button">Add {targetUserName}</button>
  ),
}));

vi.mock('#app/components/friends/friend-gate-card.tsx', () => ({
  FriendGateCard: ({
    description,
    returnLinkLabel,
    title,
  }: {
    description: string;
    returnLinkLabel: string;
    title: string;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      <a href="/friends">{returnLinkLabel}</a>
    </div>
  ),
}));

vi.mock('#app/utils/misc.tsx', async () => {
  const actual = await vi.importActual('#app/utils/misc.tsx');
  return {
    ...actual,
    getUserImgSrc: (id?: string | null) =>
      id ? `/images/${id}` : '/images/default',
  };
});

import ProfileRoute, { meta } from './$username_+/index.tsx';

describe('/users/:username route component', () => {
  it('renders the friend gate when the profile is not visible', async () => {
    useOptionalUser.mockReturnValue(null);
    const App = createRoutesStub([
      {
        Component: ProfileRoute,
        HydrateFallback: () => null,
        loader: async () => ({
          canViewProfile: false,
          relationship: {
            friendshipId: null,
            incomingRequestId: null,
            outgoingRequestId: null,
            state: 'NONE',
          },
          user: {
            id: 'user-1',
            name: 'Taylor',
            username: 'taylor',
          },
        }),
        path: '/users/:username',
      },
    ]);

    render(<App initialEntries={['/users/taylor']} />);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Add Taylor as a friend to continue',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Send a friend request to view Taylor's profile details.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to friends' })).toHaveAttribute(
      'href',
      '/friends',
    );
  });

  it('renders self profile actions when the logged-in user matches the profile', async () => {
    useOptionalUser.mockReturnValue({ id: 'user-1' });
    const App = createRoutesStub([
      {
        Component: ProfileRoute,
        HydrateFallback: () => null,
        loader: async () => ({
          canViewProfile: true,
          relationship: {
            friendshipId: null,
            incomingRequestId: null,
            outgoingRequestId: null,
            state: 'FRIENDS',
          },
          user: {
            createdAt: new Date('2026-03-31T00:00:00.000Z'),
            id: 'user-1',
            image: { id: 'image-1' },
            name: 'Taylor',
            username: 'taylor',
          },
          userJoinedDisplay: '3/31/2026',
        }),
        path: '/users/:username',
      },
    ]);

    render(<App initialEntries={['/users/taylor']} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Taylor' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Joined 3/31/2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My wishlist' })).toHaveAttribute(
      'href',
      '/users/taylor/wishlist',
    );
    expect(screen.getByRole('link', { name: 'Edit profile' })).toHaveAttribute(
      'href',
      '/settings/profile',
    );
  });

  it('renders friend actions for another visible profile', async () => {
    useOptionalUser.mockReturnValue({ id: 'viewer-1' });
    const App = createRoutesStub([
      {
        Component: ProfileRoute,
        HydrateFallback: () => null,
        loader: async () => ({
          canViewProfile: true,
          relationship: {
            friendshipId: 'friendship-1',
            incomingRequestId: null,
            outgoingRequestId: null,
            state: 'FRIENDS',
          },
          user: {
            createdAt: new Date('2026-03-31T00:00:00.000Z'),
            id: 'user-2',
            image: { id: 'image-2' },
            name: 'Taylor',
            username: 'taylor',
          },
          userJoinedDisplay: '3/31/2026',
        }),
        path: '/users/:username',
      },
    ]);

    render(<App initialEntries={['/users/taylor']} />);

    expect(
      await screen.findByRole('button', { name: 'Add Taylor' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: "Taylor's wishlist" }),
    ).toHaveAttribute('href', '/users/taylor/wishlist');
    expect(
      screen.queryByRole('button', { name: 'Logout' }),
    ).not.toBeInTheDocument();
  });

  it('builds route meta from data and params', () => {
    expect(
      meta({
        data: { user: { name: 'Taylor' } },
        params: { username: 'taylor' },
      } as never),
    ).toEqual([
      { title: 'Taylor | GiftPool' },
      {
        content: 'Profile of Taylor on GiftPool',
        name: 'description',
      },
    ]);
    expect(
      meta({ data: undefined, params: { username: 'alex' } } as never),
    ).toContainEqual({
      title: 'alex | GiftPool',
    });
  });
});
