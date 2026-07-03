/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';

import {
  canViewBirthday,
  type BirthdayVisibilityFacts,
} from './birthday-visibility.server.ts';

const NONE: BirthdayVisibilityFacts = {
  isDirectFriend: false,
  isMutualFriend: false,
  sharesActiveBirthdayGroup: false,
};

function facts(overrides: Partial<BirthdayVisibilityFacts>): BirthdayVisibilityFacts {
  return { ...NONE, ...overrides };
}

describe('canViewBirthday', () => {
  it('NOBODY is hidden unconditionally — even from a direct friend or shared birthday-group', () => {
    expect(
      canViewBirthday(
        { birthdayVisibility: 'NOBODY' },
        facts({ isDirectFriend: true, sharesActiveBirthdayGroup: true }),
      ),
    ).toBe(false);
  });

  it('FRIENDS is visible to a direct friend and hidden from a friend-of-friend', () => {
    expect(
      canViewBirthday({ birthdayVisibility: 'FRIENDS' }, facts({ isDirectFriend: true })),
    ).toBe(true);
    expect(
      canViewBirthday({ birthdayVisibility: 'FRIENDS' }, facts({ isMutualFriend: true })),
    ).toBe(false);
    expect(canViewBirthday({ birthdayVisibility: 'FRIENDS' }, NONE)).toBe(false);
  });

  it('FRIENDS_OF_FRIENDS is visible to direct and mutual friends, hidden from strangers', () => {
    expect(
      canViewBirthday(
        { birthdayVisibility: 'FRIENDS_OF_FRIENDS' },
        facts({ isDirectFriend: true }),
      ),
    ).toBe(true);
    expect(
      canViewBirthday(
        { birthdayVisibility: 'FRIENDS_OF_FRIENDS' },
        facts({ isMutualFriend: true }),
      ),
    ).toBe(true);
    expect(
      canViewBirthday({ birthdayVisibility: 'FRIENDS_OF_FRIENDS' }, NONE),
    ).toBe(false);
  });

  it('EVERYONE is visible to a stranger', () => {
    expect(canViewBirthday({ birthdayVisibility: 'EVERYONE' }, NONE)).toBe(true);
  });

  it('a shared active birthday-group grants any non-NOBODY target regardless of friendship', () => {
    for (const visibility of ['EVERYONE', 'FRIENDS_OF_FRIENDS', 'FRIENDS']) {
      expect(
        canViewBirthday(
          { birthdayVisibility: visibility },
          facts({ sharesActiveBirthdayGroup: true }),
        ),
      ).toBe(true);
    }
  });

  it('an unrecognised visibility value falls back to the most-restrictive FRIENDS behaviour', () => {
    expect(
      canViewBirthday({ birthdayVisibility: 'WHATEVER' }, facts({ isDirectFriend: true })),
    ).toBe(true);
    expect(
      canViewBirthday({ birthdayVisibility: 'WHATEVER' }, facts({ isMutualFriend: true })),
    ).toBe(false);
  });
});
