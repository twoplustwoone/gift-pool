/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { createRoutesStub } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ComingUpSection,
  selectComingUpFriends,
} from './coming-up-section.tsx';
import { type FriendRowEntry } from './friend-row.tsx';

vi.mock('../ui/avatar.tsx', () => ({
  Avatar: ({ user }: { user: { username: string } }) => (
    <div data-testid="avatar">{user.username}</div>
  ),
}));

// Frozen "today" for every case below. Birthdays are stored at noon UTC, so
// the fixtures construct their dates the same way the app does.
const TODAY = new Date('2026-04-10T12:00:00.000Z');

function makeFriend(
  friendshipId: string,
  username: string,
  overrides: Partial<FriendRowEntry['user']> = {},
): FriendRowEntry {
  return {
    friendshipId,
    mutualGroups: [],
    user: {
      id: `${friendshipId}-user`,
      username,
      name: username,
      birthday: null,
      image: null,
      ...overrides,
    },
  };
}

// A birthday `days` from the frozen today, at noon UTC.
function birthdayIn(days: number) {
  const date = new Date(TODAY);
  date.setUTCDate(date.getUTCDate() + days);
  return new Date(
    Date.UTC(1990, date.getUTCMonth(), date.getUTCDate(), 12, 0, 0),
  );
}

function renderSection(friends: FriendRowEntry[], windowDays?: number) {
  const App = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <ComingUpSection friends={friends} windowDays={windowDays} />
      ),
    },
  ]);
  render(<App initialEntries={['/']} />);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('selectComingUpFriends', () => {
  it('includes friends inside the window, soonest first', () => {
    const far = makeFriend('f-far', 'far', { birthday: birthdayIn(40) });
    const near = makeFriend('f-near', 'near', { birthday: birthdayIn(3) });

    const result = selectComingUpFriends([far, near]);

    expect(result.map((item) => item.entry.user.username)).toEqual([
      'near',
      'far',
    ]);
  });

  it('excludes friends whose birthday falls outside the window', () => {
    const outside = makeFriend('f-1', 'outside', { birthday: birthdayIn(90) });

    expect(selectComingUpFriends([outside])).toHaveLength(0);
  });

  it('honours a narrowed window', () => {
    const friend = makeFriend('f-1', 'mid', { birthday: birthdayIn(30) });

    expect(selectComingUpFriends([friend], 60)).toHaveLength(1);
    expect(selectComingUpFriends([friend], 7)).toHaveLength(0);
  });

  it('excludes friends who hid their birthday from the viewer', () => {
    // `birthdayVisible: false` is the server's canViewBirthday verdict — a
    // date the viewer isn't allowed to see must not leak through the rail.
    const hidden = makeFriend('f-1', 'hidden', {
      birthday: birthdayIn(3),
      birthdayVisible: false,
    });

    expect(selectComingUpFriends([hidden])).toHaveLength(0);
  });

  it('stays permissive for optimistic entries with an unknown visibility', () => {
    const optimistic = makeFriend('f-1', 'optimistic', {
      birthday: birthdayIn(3),
    });

    expect(selectComingUpFriends([optimistic])).toHaveLength(1);
  });

  it('ignores friends with no birthday on file', () => {
    expect(selectComingUpFriends([makeFriend('f-1', 'nobirthday')])).toEqual(
      [],
    );
  });
});

describe('<ComingUpSection />', () => {
  it('renders nothing when no birthday is in range', () => {
    const { container } = render(<ComingUpSection friends={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('points Plan gift at the pool composer with the recipient preselected', () => {
    renderSection([makeFriend('f-1', 'nina', { birthday: birthdayIn(4) })]);

    expect(screen.getByRole('link', { name: /plan gift/i })).toHaveAttribute(
      'href',
      '/pools/new?recipientId=f-1-user',
    );
  });

  it('links the friend through to their profile and reports the window', () => {
    renderSection([makeFriend('f-1', 'nina', { birthday: birthdayIn(4) })], 30);

    expect(screen.getByRole('link', { name: /nina/i })).toHaveAttribute(
      'href',
      '/users/nina',
    );
    expect(
      screen.getByText('Birthdays in the next 30 days'),
    ).toBeInTheDocument();
  });
});
