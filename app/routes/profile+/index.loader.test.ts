/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';

const requireUserId = vi.fn();
const findFirst = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    user: {
      findFirst: (...args: Array<unknown>) => findFirst(...args),
    },
  },
}));

import { loader } from './index.tsx';

describe('app/routes/profile+/index.tsx loader', () => {
  it('loads the signed-in profile summary', async () => {
    requireUserId.mockResolvedValue('user-1');
    findFirst.mockResolvedValue({
      createdAt: new Date('2024-05-12T00:00:00.000Z'),
      id: 'user-1',
      image: { id: 'image-1' },
      name: 'Taylor',
      username: 'taylor',
    });

    const result = await loader({
      context: {},
      params: {},
      request: new Request('https://giftpool.app/profile'),
    } as never);

    expect(findFirst).toHaveBeenCalledWith({
      select: {
        createdAt: true,
        id: true,
        image: {
          select: {
            id: true,
          },
        },
        name: true,
        username: true,
      },
      where: {
        id: 'user-1',
      },
    });
    expect(result).toEqual({
      user: {
        createdAt: new Date('2024-05-12T00:00:00.000Z'),
        id: 'user-1',
        image: { id: 'image-1' },
        name: 'Taylor',
        username: 'taylor',
      },
      userJoinedDisplay: new Date('2024-05-12T00:00:00.000Z').toLocaleDateString(),
    });
  });

  it('throws a 404 when the signed-in user no longer exists', async () => {
    requireUserId.mockResolvedValue('missing-user');
    findFirst.mockResolvedValue(null);

    try {
      await loader({
        context: {},
        params: {},
        request: new Request('https://giftpool.app/profile'),
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
