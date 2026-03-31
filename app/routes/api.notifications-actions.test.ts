/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  toActionArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const markNotificationRead = vi.fn();
const markAllNotificationsRead = vi.fn();
const notificationCount = vi.fn();
const notificationDeleteMany = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/notifications.server.ts', () => ({
  markAllNotificationsRead: (...args: Array<unknown>) =>
    markAllNotificationsRead(...args),
  markNotificationRead: (...args: Array<unknown>) => markNotificationRead(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    notification: {
      count: (...args: Array<unknown>) => notificationCount(...args),
      deleteMany: (...args: Array<unknown>) => notificationDeleteMany(...args),
    },
  },
}));

import { action as deleteNotificationAction } from './api.notifications.$id.delete.ts';
import { action as readNotificationAction } from './api.notifications..read.ts';
import { action as readAllNotificationsAction } from './api.notifications.read-all.ts';

beforeEach(() => {
  requireUserId.mockReset();
  markNotificationRead.mockReset();
  markAllNotificationsRead.mockReset();
  notificationCount.mockReset();
  notificationDeleteMany.mockReset();

  requireUserId.mockResolvedValue('user-1');
  notificationCount.mockResolvedValue(2);
});

describe('notification action routes', () => {
  it('marks a single notification read and validates method and id', async () => {
    await expect(
      readNotificationAction(
        toActionArgs({
          context: {},
          params: { id: 'notification-1' },
          request: new Request('https://giftpool.app/api/notifications/1/read'),
        }),
      ),
    ).rejects.toMatchObject({ status: 405 });

    await expect(
      readNotificationAction(
        toActionArgs({
          context: {},
          params: {},
          request: new Request(
            'https://giftpool.app/api/notifications/read',
            { method: 'POST' },
          ),
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });

    const result = await readNotificationAction(
      toActionArgs({
        context: {},
        params: { id: 'notification-1' },
        request: new Request(
          'https://giftpool.app/api/notifications/notification-1/read',
          { method: 'POST' },
        ),
      }),
    );

    expect(markNotificationRead).toHaveBeenCalledWith('user-1', 'notification-1');
    expect(result).toEqual({
      success: true,
      unreadCount: 2,
    });
  });

  it('marks all notifications read and enforces POST', async () => {
    await expect(
      readAllNotificationsAction(
        toActionArgs({
          context: {},
          params: {},
          request: new Request('https://giftpool.app/api/notifications/read-all'),
        }),
      ),
    ).rejects.toMatchObject({ status: 405 });

    const result = await readAllNotificationsAction(
      toActionArgs({
        context: {},
        params: {},
        request: new Request(
          'https://giftpool.app/api/notifications/read-all',
          { method: 'POST' },
        ),
      }),
    );

    expect(markAllNotificationsRead).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({
      success: true,
      unreadCount: 0,
    });
  });

  it('deletes a notification for the current user and validates method and id', async () => {
    await expect(
      deleteNotificationAction(
        toActionArgs({
          context: {},
          params: { id: 'notification-1' },
          request: new Request('https://giftpool.app/api/notifications/1/delete'),
        }),
      ),
    ).rejects.toMatchObject({ status: 405 });

    await expect(
      deleteNotificationAction(
        toActionArgs({
          context: {},
          params: {},
          request: new Request(
            'https://giftpool.app/api/notifications/delete',
            { method: 'POST' },
          ),
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });

    const result = await deleteNotificationAction(
      toActionArgs({
        context: {},
        params: { id: 'notification-1' },
        request: new Request(
          'https://giftpool.app/api/notifications/notification-1/delete',
          { method: 'POST' },
        ),
      }),
    );

    expect(notificationDeleteMany).toHaveBeenCalledWith({
      where: {
        id: 'notification-1',
        userId: 'user-1',
      },
    });
    expect(result).toEqual({
      success: true,
      unreadCount: 2,
    });
  });
});
