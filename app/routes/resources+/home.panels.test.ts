/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';

const getUserId = vi.fn();
const findMany = vi.fn();

vi.mock('#app/utils/auth.server', () => ({
  getUserId: (...args: Array<unknown>) => getUserId(...args),
}));

vi.mock('#app/utils/db.server', () => ({
  prisma: {
    usersInGiftGroups: {
      findMany: (...args: Array<unknown>) => findMany(...args),
    },
  },
}));

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
                id: 'friend-near',
                name: 'Alex',
                username: 'alex',
              },
            },
            {
              user: {
                birthday: localCalendarDate(1992, 5, 20),
                id: 'friend-far',
                name: 'Distant',
                username: 'distant',
              },
            },
            {
              user: {
                birthday: localCalendarDate(1991, 3, 8),
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
                id: 'friend-near',
                name: 'Alex',
                username: 'alex',
              },
            },
            {
              user: {
                birthday: null,
                id: 'friend-none',
                name: 'No Birthday',
                username: 'nobday',
              },
            },
            {
              user: {
                birthday: localCalendarDate(1993, 3, 3),
                id: 'friend-soon',
                name: null,
                username: 'soon',
              },
            },
          ],
        },
      },
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
});
