/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { formatAbsoluteDate } from '#app/utils/dates.ts';

const requireUserId = vi.fn();
const findFirst = vi.fn();
const findMany = vi.fn();
const count = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    user: {
      findFirst: (...args: Array<unknown>) => findFirst(...args),
    },
    wishlistItem: {
      findMany: (...args: Array<unknown>) => findMany(...args),
      count: (...args: Array<unknown>) => count(...args),
    },
  },
}));

import { loader } from './index.tsx';

describe('app/routes/profile+/index.tsx loader', () => {
  it('loads the signed-in profile summary with wishlist preview', async () => {
    requireUserId.mockResolvedValue('user-1');
    findFirst.mockResolvedValue({
      createdAt: new Date('2024-05-12T00:00:00.000Z'),
      id: 'user-1',
      image: { id: 'image-1' },
      name: 'Taylor',
      username: 'taylor',
      bio: null,
      birthday: null,
      birthdayVisibility: 'FRIENDS',
    });
    findMany.mockResolvedValue([
      {
        id: 'item-1',
        title: 'Cast iron skillet',
        url: 'https://example.com/skillet',
        hasImage: false,
        updatedAt: new Date('2024-05-10T00:00:00.000Z'),
      },
    ]);
    count.mockResolvedValue(3);

    const result = await loader({
      context: {},
      params: {},
      request: new Request('https://giftpool.app/me'),
    } as never);

    expect(findFirst).toHaveBeenCalledWith({
      select: {
        bio: true,
        birthday: true,
        birthdayVisibility: true,
        createdAt: true,
        id: true,
        image: { select: { id: true } },
        name: true,
        username: true,
      },
      where: { id: 'user-1' },
    });

    expect(result).toEqual({
      user: {
        createdAt: new Date('2024-05-12T00:00:00.000Z'),
        id: 'user-1',
        image: { id: 'image-1' },
        name: 'Taylor',
        username: 'taylor',
        bio: null,
        birthday: null,
        birthdayVisibility: 'FRIENDS',
      },
      userJoinedDisplay: formatAbsoluteDate(new Date('2024-05-12T00:00:00.000Z')),
      wishlistPreview: {
        items: [
          {
            id: 'item-1',
            title: 'Cast iron skillet',
            url: 'https://example.com/skillet',
            hasImage: false,
            updatedAt: new Date('2024-05-10T00:00:00.000Z'),
          },
        ],
        totalCount: 3,
      },
    });
  });

  it('throws a 404 when the signed-in user no longer exists', async () => {
    requireUserId.mockResolvedValue('missing-user');
    findFirst.mockResolvedValue(null);
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    try {
      await loader({
        context: {},
        params: {},
        request: new Request('https://giftpool.app/me'),
      } as never);
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(404);
      await expect((error as Response).text()).resolves.toBe('User not found');
      return;
    }

    throw new Error('Expected loader to throw a 404 response');
  });
});
