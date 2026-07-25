/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { createRoutesStub } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FriendRow, type FriendRowEntry } from './friend-row.tsx';

vi.mock('../ui/avatar.tsx', () => ({
  Avatar: ({ user }: { user: { username: string } }) => (
    <div data-testid="avatar">{user.username}</div>
  ),
}));

const baseUser: FriendRowEntry['user'] = {
  id: 'user-1',
  username: 'alex',
  name: 'Alex Carter',
  birthday: null,
  image: null,
};

const baseFriend: FriendRowEntry = {
  friendshipId: 'friendship-1',
  user: baseUser,
  mutualGroups: [],
};

function renderRow(override: Partial<FriendRowEntry> = {}, onRemove = vi.fn()) {
  const friend: FriendRowEntry = {
    ...baseFriend,
    ...override,
    user: { ...baseUser, ...(override.user ?? {}) },
  };
  const App = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <FriendRow
          friend={friend}
          displayName={friend.user.name ?? friend.user.username}
          onRemove={onRemove}
        />
      ),
    },
    {
      path: '/users/:username/wishlist',
      Component: () => <div>wishlist for friend</div>,
    },
    {
      path: '/users/:username',
      Component: () => <div>profile for friend</div>,
    },
  ]);
  render(<App initialEntries={['/']} />);
  return { onRemove };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-10T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('<FriendRow />', () => {
  it('renders the displayName and @username', () => {
    renderRow();
    expect(screen.getByText('Alex Carter')).toBeInTheDocument();
    expect(screen.getByText('@alex')).toBeInTheDocument();
  });

  it('exposes a click target on the whole card via an aria-labelled link', () => {
    renderRow();
    const link = screen.getByRole('link', {
      name: "View Alex Carter's profile",
    });
    expect(link).toHaveAttribute('href', '/users/alex');
  });

  it('shows a birthday badge for friends within the 60-day window', () => {
    // Birthday in 5 days (Apr 15) — should surface
    renderRow({
      user: {
        ...baseUser,
        birthday: new Date(1990, 3, 15),
      },
    });
    expect(screen.getByText('Apr 15')).toBeInTheDocument();
  });

  it('hides the birthday badge when the server marks it not visible (NOBODY)', () => {
    // Birthday would be within the window, but birthdayVisible=false (e.g. the
    // owner set birthdayVisibility=NOBODY) must suppress the pill.
    renderRow({
      user: {
        ...baseUser,
        birthday: new Date(1990, 3, 15),
        birthdayVisible: false,
      },
    });
    expect(screen.queryByText('Apr 15')).not.toBeInTheDocument();
  });

  it('renders a "Tomorrow" badge when the birthday is exactly 1 day away', () => {
    renderRow({
      user: {
        ...baseUser,
        birthday: new Date(1990, 3, 11),
      },
    });
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
  });

  it('does not render a birthday badge when the next birthday is far in the future', () => {
    // Birthday in ~80 days
    renderRow({
      user: {
        ...baseUser,
        birthday: new Date(1990, 5, 30),
      },
    });
    // Just check there's no cake-emoji label.
    expect(screen.queryByText(/Jun 30/)).not.toBeInTheDocument();
  });

  it('renders mutual group chips', () => {
    renderRow({
      mutualGroups: [
        { id: 'g1', name: 'The Crew' },
        { id: 'g2', name: 'Book Club' },
      ],
    });
    expect(screen.getByText('The Crew')).toBeInTheDocument();
    expect(screen.getByText('Book Club')).toBeInTheDocument();
  });

  it('caps mutual group chips at 3 with a +N indicator', () => {
    renderRow({
      mutualGroups: [
        { id: 'g1', name: 'A' },
        { id: 'g2', name: 'B' },
        { id: 'g3', name: 'C' },
        { id: 'g4', name: 'D' },
        { id: 'g5', name: 'E' },
      ],
    });
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('D')).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('opens the remove confirm dialog from the actions menu and calls onRemove', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const { onRemove } = renderRow();

    await user.click(
      screen.getByRole('button', { name: 'Actions for Alex Carter' }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: /remove friend/i }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Remove friend' }),
    );

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('offers wishlist, profile and remove in the actions menu — and nothing else', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    renderRow();

    await user.click(
      screen.getByRole('button', { name: 'Actions for Alex Carter' }),
    );

    expect(
      await screen.findByRole('menuitem', { name: /view wishlist/i }),
    ).toHaveAttribute('href', '/users/alex/wishlist');
    expect(
      screen.getByRole('menuitem', { name: /view profile/i }),
    ).toHaveAttribute('href', '/users/alex');
    expect(
      screen.getByRole('menuitem', { name: /remove friend/i }),
    ).toBeInTheDocument();

    // Messaging/nudging a friend is a separate, undecided feature — this
    // menu must not grow one by accident.
    expect(
      screen.queryByRole('menuitem', { name: /message|nudge|remind/i }),
    ).not.toBeInTheDocument();
    // And "Add to a group" stays out until a real add-to-group flow exists
    // (groups are join-by-invite/request only today).
    expect(
      screen.queryByRole('menuitem', { name: /add to a group/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  });
});
