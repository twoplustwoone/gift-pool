/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { gateBirthday } from './public-user.server.ts';

const DATE = new Date('1990-05-01');
const facts = (over: Partial<Parameters<typeof gateBirthday>[1]> = {}) => ({
  isDirectFriend: false,
  isMutualFriend: false,
  sharesActiveBirthdayGroup: false,
  ...over,
});

describe('gateBirthday', () => {
  it('nulls the birthday for a NOBODY target regardless of relationship', () => {
    const user = { birthday: DATE, birthdayVisibility: 'NOBODY', name: 'A' };
    expect(
      gateBirthday(user, facts({ isDirectFriend: true })).birthday,
    ).toBeNull();
    expect(
      gateBirthday(user, facts({ sharesActiveBirthdayGroup: true })).birthday,
    ).toBeNull();
  });

  it('nulls a FRIENDS birthday for a non-friend but keeps it for a direct friend', () => {
    const user = { birthday: DATE, birthdayVisibility: 'FRIENDS', name: 'A' };
    expect(gateBirthday(user, facts()).birthday).toBeNull();
    expect(
      gateBirthday(user, facts({ isDirectFriend: true })).birthday,
    ).toEqual(DATE);
  });

  it('keeps an EVERYONE birthday even for a stranger', () => {
    const user = { birthday: DATE, birthdayVisibility: 'EVERYONE', name: 'A' };
    expect(gateBirthday(user, facts()).birthday).toEqual(DATE);
  });

  it('honors the group-share override', () => {
    const user = { birthday: DATE, birthdayVisibility: 'FRIENDS', name: 'A' };
    expect(
      gateBirthday(user, facts({ sharesActiveBirthdayGroup: true })).birthday,
    ).toEqual(DATE);
  });

  it('preserves all other fields', () => {
    const user = {
      birthday: DATE,
      birthdayVisibility: 'NOBODY',
      name: 'A',
      id: 'u1',
    };
    const result = gateBirthday(user, facts());
    expect(result).toMatchObject({ name: 'A', id: 'u1', birthday: null });
  });
});
