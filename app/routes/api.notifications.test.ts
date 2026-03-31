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
const listNotifications = vi.fn();
const notificationCount = vi.fn();
const getLocaleFromRequest = vi.fn();
const sanitizeTranslationParams = vi.fn();
const translate = vi.fn();
const formatRelativeTime = vi.fn();

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

vi.mock('#app/utils/notifications.server.ts', () => ({
  listNotifications: (...args: Array<unknown>) => listNotifications(...args),
}));

vi.mock('#app/utils/i18n.tsx', () => ({
  formatRelativeTime: (...args: Array<unknown>) => formatRelativeTime(...args),
  getLocaleFromRequest: (...args: Array<unknown>) => getLocaleFromRequest(...args),
  sanitizeTranslationParams: (...args: Array<unknown>) =>
    sanitizeTranslationParams(...args),
  translate: (...args: Array<unknown>) => translate(...args),
}));

import { loader } from './api.notifications.ts';

beforeEach(() => {
  requireUserId.mockReset();
  listNotifications.mockReset();
  notificationCount.mockReset();
  getLocaleFromRequest.mockReset();
  sanitizeTranslationParams.mockReset();
  translate.mockReset();
  formatRelativeTime.mockReset();
});

describe('api notifications loader', () => {
  it('serializes notifications, translations, and unread counts', async () => {
    requireUserId.mockResolvedValue('user-1');
    getLocaleFromRequest.mockReturnValue('en');
    sanitizeTranslationParams.mockImplementation((value) => value);
    translate.mockImplementation((_locale: string, key: string) => `t:${key}`);
    formatRelativeTime.mockReturnValue('2 hours ago');
    listNotifications.mockResolvedValue({
      hasMore: true,
      items: [
        {
          actions: [
            { kind: 'link', label: 'View', labelKey: null },
            {
              kind: 'mutation',
              label: null,
              labelKey: 'notifications.friendRequest.accept',
            },
          ],
          createdAt: new Date('2026-03-31T12:00:00.000Z'),
          friendRequestId: 'request-1',
          id: 'notification-1',
          messageKey: 'notifications.friendRequest.message',
          messageParams: { name: 'Alex' },
          metadata: { source: 'friends' },
          status: 'UNREAD',
          targetUrl: '/friends',
          type: 'FRIEND_REQUEST_RECEIVED',
        },
      ],
      nextCursor: 'cursor-2',
    });
    notificationCount.mockResolvedValue(3);

    const result = await loader(
      toLoaderArgs({
        context: {},
        params: {},
        request: new Request(
          'https://giftpool.app/api/notifications?status=unread&cursor=cursor-1',
        ),
      }),
    );

    expect(listNotifications).toHaveBeenCalledWith({
      cursor: 'cursor-1',
      status: 'unread',
      userId: 'user-1',
    });
    expect(getRouteResultStatus(result)).toBe(200);
    await expect(getRouteResultData(result)).resolves.toEqual({
      hasMore: true,
      nextCursor: 'cursor-2',
      notifications: [
        {
          actions: [
            { kind: 'link', label: 'View', labelKey: null },
            {
              kind: 'mutation',
              label: 't:notifications.friendRequest.accept',
              labelKey: 'notifications.friendRequest.accept',
            },
          ],
          createdAt: '2026-03-31T12:00:00.000Z',
          friendRequestId: 'request-1',
          id: 'notification-1',
          message: 't:notifications.friendRequest.message',
          messageKey: 'notifications.friendRequest.message',
          messageParams: { name: 'Alex' },
          metadata: { source: 'friends' },
          relativeTime: '2 hours ago',
          status: 'UNREAD',
          targetUrl: '/friends',
          type: 'FRIEND_REQUEST_RECEIVED',
        },
      ],
      unreadCount: 3,
    });
  });
});
