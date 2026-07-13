import { type NotificationType } from '#app/utils/notification-catalog.ts';

export type { NotificationType } from '#app/utils/notification-catalog.ts';

export type NotificationStatus = 'UNREAD' | 'READ' | 'ARCHIVED';

export interface NotificationAction {
  kind: 'FRIEND_ACCEPT' | 'FRIEND_REJECT';
  label: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  status: NotificationStatus;
  message: string;
  targetUrl?: string;
  createdAt: string;
  actions?: NotificationAction[];
  metadata?: {
    senderUserId?: string;
    senderDisplayName?: string;
    senderAvatarUrl?: string;
  };
}

export function markNotificationRead(
  notifications: Notification[],
  id: string,
): void {
  const n = notifications.find((n) => n.id === id);
  if (n) {
    n.status = 'READ';
  }
}

export function markAllNotificationsRead(notifications: Notification[]): void {
  notifications.forEach((n) => {
    n.status = 'READ';
  });
}

export function createFriendRequestNotification(opts: {
  toUserId: string;
  from: { id: string; displayName?: string; avatarUrl?: string };
}): Notification {
  return {
    id: crypto.randomUUID(),
    type: 'FRIEND_REQUEST_RECEIVED',
    status: 'UNREAD',
    message: `${opts.from.displayName ?? 'Someone'} sent you a friend request`,
    targetUrl: `/users/${opts.from.id}`,
    createdAt: new Date().toISOString(),
    actions: [
      { kind: 'FRIEND_ACCEPT', label: 'Accept' },
      { kind: 'FRIEND_REJECT', label: 'Reject' },
    ],
    metadata: {
      senderUserId: opts.from.id,
      senderDisplayName: opts.from.displayName,
      senderAvatarUrl: opts.from.avatarUrl,
    },
  };
}
