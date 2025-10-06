import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '#app/utils/notifications.server.ts';

const randomString = () => Math.random().toString(36).slice(2, 10);

describe('notifications server utilities', () => {
  let userId: string;
  let firstNotificationId: string;
  let secondNotificationId: string;

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: {
        email: `${randomString()}@example.com`,
        username: `user_${randomString()}`,
      },
      select: { id: true },
    });
    userId = user.id;

    const first = await prisma.notification.create({
      data: {
        userId,
        type: 'FRIEND_REQUEST_RECEIVED',
        status: 'UNREAD',
        messageKey: 'notifications.friendRequest.message',
        messageParams: JSON.stringify({ name: 'Alex' }),
        targetUrl: '/users/alex',
        metadata: JSON.stringify({ senderUserId: 'alex' }),
        actions: JSON.stringify([
          {
            kind: 'FRIEND_ACCEPT',
            labelKey: 'notifications.friendRequest.accept',
          },
          {
            kind: 'FRIEND_REJECT',
            labelKey: 'notifications.friendRequest.reject',
          },
        ]),
        createdAt: new Date('2024-01-02T00:00:00Z'),
      },
      select: { id: true },
    });
    firstNotificationId = first.id;

    const second = await prisma.notification.create({
      data: {
        userId,
        type: 'FRIEND_REQUEST_RECEIVED',
        status: 'UNREAD',
        messageKey: 'notifications.friendRequest.message',
        messageParams: JSON.stringify({ name: 'Blair' }),
        targetUrl: '/users/blair',
        metadata: JSON.stringify({ senderUserId: 'blair' }),
        actions: JSON.stringify([
          {
            kind: 'FRIEND_ACCEPT',
            labelKey: 'notifications.friendRequest.accept',
          },
        ]),
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
      select: { id: true },
    });
    secondNotificationId = second.id;
  });

  it('lists notifications newest first with parsed payload', async () => {
    const { items, hasMore } = await listNotifications({
      userId,
      status: 'all',
    });

    expect(hasMore).toBe(false);
    expect(items).toHaveLength(2);
    expect(items[0]?.id).toBe(firstNotificationId);
    expect(items[0]?.actions).toHaveLength(2);
    expect(items[0]?.metadata).toMatchObject({ senderUserId: 'alex' });
    expect(items[0]?.messageKey).toBe('notifications.friendRequest.message');
    expect(items[1]?.id).toBe(secondNotificationId);
  });

  it('marks individual notifications as read', async () => {
    await markNotificationRead(userId, firstNotificationId);
    const updated = await prisma.notification.findUniqueOrThrow({
      where: { id: firstNotificationId },
      select: { status: true, readAt: true },
    });
    expect(updated.status).toBe('READ');
    expect(updated.readAt).toBeInstanceOf(Date);
  });

  it('marks all notifications as read', async () => {
    await markAllNotificationsRead(userId);
    const statuses = await prisma.notification.findMany({
      where: { userId },
      select: { status: true },
    });
    expect(statuses.every((item) => item.status === 'READ')).toBe(true);
  });
});
