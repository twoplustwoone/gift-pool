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

const baseUser = {
  id: 'user-2',
  image: null,
  name: 'Taylor',
  username: 'taylor',
  bio: null,
  birthday: null,
};

const emptyBody = {
  mutualGroups: [],
  mutualFriends: [],
  wishlistPreview: { items: [], totalCount: 0 },
};

const unlockedBase = {
  unlocked: true,
  relationship: {
    friendshipId: 'friendship-1',
    incomingRequestId: null,
    outgoingRequestId: null,
    state: 'FRIENDS',
  },
  user: baseUser,
  userJoinedDisplay: '3/31/2026',
  isFriend: true,
  birthdayVisible: false,
  canViewWishlist: true,
  declined: false,
  ...emptyBody,
};

function renderWith(loaderData: unknown) {
  const App = createRoutesStub([
    {
      Component: ProfileRoute,
      HydrateFallback: () => null,
      loader: async () => loaderData,
      path: '/users/:username',
    },
  ]);
  render(<App initialEntries={['/users/taylor']} />);
}

describe('/users/:username person surface component', () => {
  it('renders the friend gate when not unlocked', async () => {
    renderWith({
      unlocked: false,
      relationship: {
        friendshipId: null,
        incomingRequestId: null,
        outgoingRequestId: null,
        state: 'NONE',
      },
      user: { id: 'user-1', name: 'Taylor', username: 'taylor', image: null },
    });

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

  it('cold state leads with identity + capture card', async () => {
    renderWith({
      ...unlockedBase,
      temporalState: 'cold',
      occasion: null,
      organizeGroups: [],
    });

    expect(
      await screen.findByText('Taylor', { selector: 'div' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Save an idea')).toBeInTheDocument();
    expect(screen.getByText('Add a note')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add Taylor' }),
    ).toBeInTheDocument();
  });

  it('occasion-near state shows the occasion header + full action row', async () => {
    renderWith({
      ...unlockedBase,
      birthdayVisible: true,
      temporalState: 'occasion-near',
      occasion: { label: 'Aug 14', daysUntil: 42 },
      organizeGroups: [
        { id: 'g1', name: 'The Crew', memberCount: 3, budgetCents: 18000 },
      ],
    });

    expect(
      await screen.findByRole('button', { name: /Organize with The Crew/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Birthday · Aug 14/)).toBeInTheDocument();
    expect(screen.getByText('Just me')).toBeInTheDocument();
    expect(screen.getByText('Save idea')).toBeInTheDocument();
    expect(screen.getByText('Not this time')).toBeInTheDocument();
  });

  it('declined state shows the quiet sitting-out header with undo', async () => {
    renderWith({
      ...unlockedBase,
      birthdayVisible: true,
      temporalState: 'declined',
      occasion: { label: 'Aug 14', daysUntil: 42 },
      declined: true,
      organizeGroups: [],
    });

    expect(
      await screen.findByText("You're sitting this one out"),
    ).toBeInTheDocument();
    expect(screen.getByText('Only you can see this')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
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
