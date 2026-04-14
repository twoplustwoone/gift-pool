/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';

const getUserId = vi.fn();
const findMany = vi.fn();
const friendshipFindMany = vi.fn();

vi.mock('#app/utils/auth.server', () => ({
  getUserId: (...args: Array<unknown>) => getUserId(...args),
}));

vi.mock('#app/utils/db.server', () => ({
  prisma: {
    usersInGiftGroups: {
      findMany: (...args: Array<unknown>) => findMany(...args),
    },
    friendship: {
      findMany: (...args: Array<unknown>) => friendshipFindMany(...args),
    },
  },
}));

import * as HomePanelsModule from './home.panels.tsx';
import { loader } from './home.panels.tsx';

function localCalendarDate(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day, 12);
}

function expectedBirthdayOutput(monthIndex: number, day: number) {
  const nextBirthday = new Date(2026, monthIndex, day);
  return {
    dateISO: nextBirthday.toISOString().slice(0, 10),
    dateLabel: new Intl.DateTimeFormat('en', {
      day: 'numeric',
      month: 'short',
    }).format(nextBirthday),
  };
}

describe('app/routes/resources+/home.panels.tsx', () => {
  it('returns mocked empty and data responses when requested', async () => {
    await expect(
      loader({
        context: {},
        params: {},
        request: new Request('https://giftpool.app/resources/home.panels?mock=empty'),
      } as never),
    ).resolves.toEqual({
      activity: [],
      birthdays: [],
    });

    const result = await loader({
      context: {},
      params: {},
      request: new Request('https://giftpool.app/resources/home.panels?mock=data'),
    } as never);

    expect(result.birthdays).toHaveLength(1);
    expect(result.birthdays[0]).toMatchObject({
      groupId: 'g_mock_1',
      name: 'Alex Johnson',
      username: 'alex',
    });
    expect(result.activity).toEqual([
      expect.objectContaining({
        description: 'Jamie added “Noise-cancelling headphones” to Family Gifts',
        id: 'a_mock_1',
      }),
    ]);
  });

  it('returns empty panels for signed-out viewers', async () => {
    getUserId.mockResolvedValue(null);

    await expect(
      loader({
        context: {},
        params: {},
        request: new Request('https://giftpool.app/resources/home.panels'),
      } as never),
    ).resolves.toEqual({
      activity: [],
      birthdays: [],
    });

    expect(findMany).not.toHaveBeenCalled();
  });

  it('maps upcoming shared-group birthdays and filters duplicates, self, and distant dates', async () => {
    getUserId.mockResolvedValue('viewer-1');
    findMany.mockResolvedValue([
      {
        giftGroup: {
          id: 'group-1',
          groupMembers: [
            {
              user: {
                birthday: localCalendarDate(1990, 3, 5),
                birthdayVisibility: 'FRIENDS',
                id: 'friend-near',
                name: 'Alex',
                username: 'alex',
              },
            },
            {
              user: {
                birthday: localCalendarDate(1992, 5, 20),
                birthdayVisibility: 'FRIENDS',
                id: 'friend-far',
                name: 'Distant',
                username: 'distant',
              },
            },
            {
              user: {
                birthday: localCalendarDate(1991, 3, 8),
                birthdayVisibility: 'FRIENDS',
                id: 'viewer-1',
                name: 'Viewer',
                username: 'viewer',
              },
            },
          ],
        },
      },
      {
        giftGroup: {
          id: 'group-2',
          groupMembers: [
            {
              user: {
                birthday: localCalendarDate(1990, 3, 5),
                birthdayVisibility: 'FRIENDS',
                id: 'friend-near',
                name: 'Alex',
                username: 'alex',
              },
            },
            {
              user: {
                birthday: null,
                birthdayVisibility: 'FRIENDS',
                id: 'friend-none',
                name: 'No Birthday',
                username: 'nobday',
              },
            },
            {
              user: {
                birthday: localCalendarDate(1993, 3, 3),
                birthdayVisibility: 'FRIENDS',
                id: 'friend-soon',
                name: null,
                username: 'soon',
              },
            },
          ],
        },
      },
    ]);

    // Viewer is friends with every candidate so FRIENDS visibility passes
    // through. Separate tests exercise the friendship gate below.
    friendshipFindMany.mockResolvedValue([
      { userAId: 'viewer-1', userBId: 'friend-near' },
      { userAId: 'viewer-1', userBId: 'friend-far' },
      { userAId: 'viewer-1', userBId: 'friend-none' },
      { userAId: 'viewer-1', userBId: 'friend-soon' },
    ]);

    vi.useFakeTimers();
    vi.setSystemTime(localCalendarDate(2026, 2, 31));

    try {
      const result = await loader({
        context: {},
        params: {},
        request: new Request('https://giftpool.app/resources/home.panels'),
      } as never);

      expect(findMany).toHaveBeenCalledWith({
        select: {
          giftGroup: {
            select: {
              groupMembers: {
                select: {
                  user: {
                    select: {
                      birthday: true,
                      birthdayVisibility: true,
                      id: true,
                      name: true,
                      username: true,
                    },
                  },
                },
              },
              id: true,
            },
          },
        },
        where: {
          userId: 'viewer-1',
        },
      });

      expect(result.activity).toEqual([]);
      expect(result.birthdays).toHaveLength(2);
      expect(result.birthdays.map((birthday) => birthday.id)).toEqual([
        'friend-soon',
        'friend-near',
      ]);
      expect(result.birthdays.map((birthday) => birthday.groupId)).toEqual([
        'group-2',
        'group-1',
      ]);
      expect(result.birthdays.map((birthday) => birthday.name)).toEqual([
        'soon',
        'Alex',
      ]);
      expect(result.birthdays[0]).toMatchObject({
        ...expectedBirthdayOutput(3, 3),
        username: 'soon',
      });
      expect(result.birthdays[1]).toMatchObject({
        ...expectedBirthdayOutput(3, 5),
        username: 'alex',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('enforces birthdayVisibility: FRIENDS_OF_FRIENDS shown only when mutual friend exists', async () => {
    getUserId.mockResolvedValue('viewer-1');
    findMany.mockResolvedValue([
      {
        giftGroup: {
          id: 'group-1',
          groupMembers: [
            {
              // Has a mutual friend with viewer → should appear
              user: {
                birthday: localCalendarDate(1990, 3, 1),
                birthdayVisibility: 'FRIENDS_OF_FRIENDS',
                id: 'fof-yes',
                name: 'FOF Yes',
                username: 'fof_yes',
              },
            },
            {
              // No mutual friend → should be hidden
              user: {
                birthday: localCalendarDate(1990, 3, 2),
                birthdayVisibility: 'FRIENDS_OF_FRIENDS',
                id: 'fof-no',
                name: 'FOF No',
                username: 'fof_no',
              },
            },
            {
              // Direct friend with FRIENDS_OF_FRIENDS → should appear (friendIds path)
              user: {
                birthday: localCalendarDate(1990, 3, 3),
                birthdayVisibility: 'FRIENDS_OF_FRIENDS',
                id: 'direct-friend',
                name: 'Direct',
                username: 'direct',
              },
            },
          ],
        },
      },
    ]);

    // First call: viewer's direct friendships (only direct-friend is a direct friend)
    friendshipFindMany.mockResolvedValueOnce([
      { userAId: 'viewer-1', userBId: 'direct-friend' },
    ]);
    // Second call: mutual-link check for fof-yes and fof-no candidates.
    // Only fof-yes shares a mutual friend (mutual-friend-1) with viewer.
    friendshipFindMany.mockResolvedValueOnce([
      { userAId: 'fof-yes', userBId: 'mutual-friend-1' },
    ]);

    vi.useFakeTimers();
    vi.setSystemTime(localCalendarDate(2026, 2, 31));

    try {
      const result = await loader({
        context: {},
        params: {},
        request: new Request('https://giftpool.app/resources/home.panels'),
      } as never);

      const ids = result.birthdays.map((b: { id: string }) => b.id).sort();
      expect(ids).toContain('direct-friend');
      expect(ids).toContain('fof-yes');
      expect(ids).not.toContain('fof-no');
    } finally {
      vi.useRealTimers();
    }
  });

  it('enforces birthdayVisibility: NOBODY hidden, FRIENDS needs friendship, EVERYONE always shown', async () => {
    getUserId.mockResolvedValue('viewer-1');
    findMany.mockResolvedValue([
      {
        giftGroup: {
          id: 'group-1',
          groupMembers: [
            {
              user: {
                birthday: localCalendarDate(1990, 3, 1),
                birthdayVisibility: 'NOBODY',
                id: 'hidden',
                name: 'Hidden',
                username: 'hidden',
              },
            },
            {
              user: {
                birthday: localCalendarDate(1990, 3, 2),
                birthdayVisibility: 'FRIENDS',
                id: 'friend-ok',
                name: 'Friend OK',
                username: 'friend_ok',
              },
            },
            {
              user: {
                birthday: localCalendarDate(1990, 3, 3),
                birthdayVisibility: 'FRIENDS',
                id: 'stranger',
                name: 'Group-mate Stranger',
                username: 'stranger',
              },
            },
            {
              user: {
                birthday: localCalendarDate(1990, 3, 4),
                birthdayVisibility: 'EVERYONE',
                id: 'public',
                name: 'Public',
                username: 'public',
              },
            },
          ],
        },
      },
    ]);
    // Viewer is friends with friend-ok, but NOT with stranger or public.
    friendshipFindMany.mockResolvedValue([
      { userAId: 'viewer-1', userBId: 'friend-ok' },
    ]);

    vi.useFakeTimers();
    vi.setSystemTime(localCalendarDate(2026, 2, 31));

    try {
      const result = await loader({
        context: {},
        params: {},
        request: new Request('https://giftpool.app/resources/home.panels'),
      } as never);

      const ids = result.birthdays.map((b) => b.id).sort();
      expect(ids).toEqual(['friend-ok', 'public']);
      expect(ids).not.toContain('hidden');
      expect(ids).not.toContain('stranger');
    } finally {
      vi.useRealTimers();
    }
  });

  it('regression GIFTPOOL-UI-13: default export is not null (would crash SSR renderer)', () => {
    // React Router SSR calls renderToString on the default export for every
    // route module. An explicit `export default null` causes the renderer to
    // throw "Element type is invalid … but got: null".  Resource-only routes
    // must have NO default export (undefined), not null.
    expect((HomePanelsModule as Record<string, unknown>)['default']).toBeUndefined();
  });
});
