/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#app/components/friends/friend-action-button.tsx', () => ({
  FriendActionButton: ({ targetUserName }: { targetUserName: string }) => (
    <button type="button">Add {targetUserName}</button>
  ),
}));

vi.mock('#app/components/friends/friend-gate-card.tsx', () => ({
  FriendGateCard: ({
    targetUserName,
    context,
  }: {
    targetUserName: string;
    context: string;
  }) => (
    <div>
      <h1>{`See ${targetUserName}'s ${context}`}</h1>
      <a href="/friends">Go to friends</a>
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

const emptyProfileData = {
  mutualGroups: [],
  mutualFriends: [],
  wishlistPreview: { items: [], totalCount: 0 },
};

describe('/users/:username route component', () => {
  it('renders the friend gate when the profile is not visible', async () => {
    const App = createRoutesStub([
      {
        Component: ProfileRoute,
        HydrateFallback: () => null,
        loader: async () => ({
          unlocked: false,
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
            image: null,
          },
        }),
        path: '/users/:username',
      },
    ]);

    render(<App initialEntries={['/users/taylor']} />);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: "See Taylor's profile",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to friends' })).toHaveAttribute(
      'href',
      '/friends',
    );
  });

  it('renders the friend profile view with wishlist CTA', async () => {
    const App = createRoutesStub([
      {
        Component: ProfileRoute,
        HydrateFallback: () => null,
        loader: async () => ({
          unlocked: true,
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
            bio: null,
            birthday: null,
            birthdayVisibility: 'FRIENDS',
          },
          userJoinedDisplay: '3/31/2026',
          isFriend: true,
          birthdayVisible: true,
          canViewWishlist: true,
          ...emptyProfileData,
        }),
        path: '/users/:username',
      },
    ]);

    render(<App initialEntries={['/users/taylor']} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Taylor' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Joined 3/31/2026')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: "Taylor's wishlist" }),
    ).toHaveAttribute('href', '/users/taylor/wishlist');
    expect(
      screen.getByRole('button', { name: 'Add Taylor' }),
    ).toBeInTheDocument();
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
