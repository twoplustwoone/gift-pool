/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  budgetLine: null,
  wishlistSource: [],
  ideation: {
    giftHistory: [],
    proposedUnused: [],
    notes: [],
    savedIdeas: [],
  },
  openPools: [],
  postOccasion: null,
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
      await screen.findByRole('heading', { level: 1, name: 'Taylor' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Save an idea')).toBeInTheDocument();
    expect(screen.getByText('Add a note')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add Taylor' }),
    ).toBeInTheDocument();
  });

  it('opens cold-state idea and note capture dialogs', async () => {
    const user = userEvent.setup();
    renderWith({
      ...unlockedBase,
      temporalState: 'cold',
      occasion: null,
      organizeGroups: [],
    });

    await user.click(
      await screen.findByRole('button', {
        name: /Save an idea\s+for when it counts/,
      }),
    );
    expect(
      screen.getByRole('heading', { name: /Save an idea for Taylor/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: /Add a note/ }));
    expect(
      screen.getByRole('heading', { name: /Add a note about Taylor/ }),
    ).toBeInTheDocument();
  });

  it('renders wishlist and circle-private memory sections', async () => {
    renderWith({
      ...unlockedBase,
      temporalState: 'cold',
      occasion: null,
      organizeGroups: [],
      budgetLine: { groupName: 'The Crew', cents: 18000 },
      wishlistSource: [
        {
          id: 'wish-1',
          title: 'Vintage espresso machine',
          url: 'https://example.com/espresso',
          priceCents: 12000,
          currency: 'USD',
          claimed: false,
          claimedByViewer: false,
        },
      ],
      ideation: {
        giftHistory: [
          {
            id: 'gift-1',
            name: 'Pizza oven',
            year: 2025,
            contributorCount: 4,
            priceCents: 24000,
          },
        ],
        proposedUnused: [{ id: 'idea-old', name: 'Running vest', year: 2024 }],
        notes: [{ id: 'note-1', body: 'Started running this spring.' }],
        savedIdeas: [
          {
            id: 'saved-1',
            name: 'Trail shoes',
            url: null,
            priceCents: 9000,
            currency: 'USD',
          },
        ],
      },
      openPools: [{ id: 'pool-1', title: "Taylor's birthday" }],
    });

    expect(await screen.findByText('Their wishlist')).toBeInTheDocument();
    expect(screen.getByText('Vintage espresso machine')).toBeInTheDocument();
    expect(
      screen.getByText('What this circle gave before'),
    ).toBeInTheDocument();
    expect(screen.getByText('Pizza oven')).toBeInTheDocument();
    expect(screen.getByText('We almost got them…')).toBeInTheDocument();
    expect(screen.getByText('Running vest')).toBeInTheDocument();
    expect(screen.getByText('Your notes · private')).toBeInTheDocument();
    expect(
      screen.getByText('Started running this spring.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Your saved ideas · private')).toBeInTheDocument();
    expect(screen.getByText('Trail shoes')).toBeInTheDocument();
    expect(screen.getByText(/The Crew can cover/)).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Propose to pool' }),
    ).toHaveLength(2);
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

  it('post-occasion state shows the did-it-land confirm + recorded note', async () => {
    renderWith({
      ...unlockedBase,
      birthdayVisible: true,
      temporalState: 'post-occasion',
      occasion: null,
      organizeGroups: [],
      postOccasion: {
        occasionLabel: 'was Aug 14 · a few days ago',
        gift: { kind: 'pool', id: 'pool-1', name: 'Trail running shoes' },
        recordedGroupPoolName: 'Weber pizza oven',
      },
    });

    expect(await screen.findByText('How did it go?')).toBeInTheDocument();
    expect(
      screen.getByText(/Your gift · Trail running shoes/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /They loved it/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'It was okay' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Skip for now' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Weber pizza oven/)).toBeInTheDocument();
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
