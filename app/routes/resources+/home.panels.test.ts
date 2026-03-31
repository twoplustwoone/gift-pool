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
                birthday: new Date('1990-04-05T00:00:00.000Z'),
                id: 'friend-near',
                name: 'Alex',
                username: 'alex',
              },
            },
            {
              user: {
                birthday: new Date('1992-06-20T00:00:00.000Z'),
                id: 'friend-far',
                name: 'Distant',
                username: 'distant',
              },
            },
            {
              user: {
                birthday: new Date('1991-04-08T00:00:00.000Z'),
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
                birthday: new Date('1990-04-05T00:00:00.000Z'),
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
                birthday: new Date('1993-04-03T00:00:00.000Z'),
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
    vi.setSystemTime(new Date('2026-03-31T12:00:00.000Z'));

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
        username: 'soon',
      });
      expect(result.birthdays[1]).toMatchObject({
        username: 'alex',
      });
      for (const birthday of result.birthdays) {
        expect(birthday.dateISO).toMatch(/^2026-04-0[24]$/);
        expect(birthday.dateLabel).toMatch(/^Apr \d{1,2}$/);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
