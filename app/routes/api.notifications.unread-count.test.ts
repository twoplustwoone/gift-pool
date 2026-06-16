/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRouteResultData,
  getRouteResultStatus,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const notificationCount = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    notification: {
      count: (...args: Array<unknown>) => notificationCount(...args),
    },
  },
}));

import { loader } from './api.notifications.unread-count.ts';

beforeEach(() => {
  requireUserId.mockReset();
  notificationCount.mockReset();
});

describe('api notifications unread-count loader', () => {
  it('returns the unread count for the current user', async () => {
    requireUserId.mockResolvedValue('user-1');
    notificationCount.mockResolvedValue(4);

    const result = await loader(
      toLoaderArgs({
        context: {},
        params: {},
        request: new Request(
          'https://giftpool.app/api/notifications/unread-count',
        ),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    await expect(getRouteResultData(result)).resolves.toEqual({
      unreadCount: 4,
    });
    expect(notificationCount).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'UNREAD' },
    });
  });
});
