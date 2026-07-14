import { prisma } from '#app/utils/db.server.ts';

export interface NotificationActionPayload {
  kind: string;
  labelKey?: string;
  label?: string;
}

export interface NotificationRecord {
  id: string;
  type: string;
  status: string;
  messageKey: string;
  messageParams?: Record<string, unknown> | null;
  targetUrl?: string | null;
  createdAt: Date;
  readAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  actions: NotificationActionPayload[];
  friendRequestId?: string | null;
  poolInvitationId?: string | null;
}

interface ListNotificationsOptions {
  userId: string;
  status?: 'unread' | 'all';
  cursor?: string;
  take?: number;
}

const DEFAULT_PAGE_SIZE = 20;

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function listNotifications({
  userId,
  status = 'all',
  cursor,
  take = DEFAULT_PAGE_SIZE,
}: ListNotificationsOptions) {
  const where: NonNullable<
    Parameters<typeof prisma.notification.findMany>[0]
  >['where'] = {
    userId,
    ...(status === 'unread' ? { status: 'UNREAD' } : {}),
  };

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = notifications.length > take;
  const items = notifications.slice(0, take).map((notification) => {
    return {
      id: notification.id,
      type: notification.type,
      status: notification.status,
      messageKey: notification.messageKey,
      messageParams: parseJson<Record<string, unknown>>(
        notification.messageParams ?? undefined,
      ),
      targetUrl: notification.targetUrl,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
      metadata: parseJson<Record<string, unknown>>(
        notification.metadata ?? undefined,
      ),
      actions:
        parseJson<NotificationActionPayload[]>(
          notification.actions ?? undefined,
        ) ?? [],
      friendRequestId: notification.friendRequestId,
      poolInvitationId: notification.poolInvitationId,
    } satisfies NotificationRecord;
  });

  const nextCursor = hasMore
    ? notifications[notifications.length - 1]!.id
    : null;
  return { items, hasMore, nextCursor };
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
) {
  const notification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId,
    },
    select: { id: true, status: true },
  });
  if (!notification) {
    throw new Response('Notification not found', { status: 404 });
  }

  if (notification.status === 'UNREAD') {
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: 'READ',
        readAt: new Date(),
      },
    });
  }
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, status: 'UNREAD' },
    data: { status: 'READ', readAt: new Date() },
  });
}

export async function clearNotificationByFriendRequestId(
  userId: string,
  friendRequestId: string,
) {
  await prisma.notification.updateMany({
    where: {
      userId,
      friendRequestId,
    },
    data: {
      status: 'READ',
      readAt: new Date(),
      actions: JSON.stringify([]),
    },
  });
}
