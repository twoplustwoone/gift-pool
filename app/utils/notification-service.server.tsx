import { type Notification as PrismaNotification } from '@prisma/client';
import React from 'react';
import { FriendRequestAcceptedEmail } from '#app/emails/friend-request-accepted.tsx';
import { FriendRequestReceivedEmail } from '#app/emails/friend-request-received.tsx';
import { buildAppUrl } from '#app/utils/app-url.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { sendEmail } from '#app/utils/email.server.ts';
import {
  createPreferenceToken,
  getPreferenceManagementUrl,
} from '#app/utils/notification-preference-token.server.ts';
import {
  ensureNotificationPreferencesForUser,
  getNotificationPreferenceForChannels,
} from '#app/utils/notification-preferences.server.ts';
import {
  NOTIFICATION_TYPES,
  type NotificationPayload,
  type NotificationType,
  type NotificationChannel,
  type FriendRelationshipSnapshot,
  NOTIFICATION_CHANNELS,
} from '#app/utils/notification-registry.ts';

const appName = 'GiftPool';

export interface NotifyUserOptions<T extends NotificationType> {
  userId: string;
  type: T;
  payload: NotificationPayload<T>;
  sourceIdentifier?: string;
  friendRelationshipSnapshot?: FriendRelationshipSnapshot;
}

export async function notifyUser<T extends NotificationType>(
  options: NotifyUserOptions<T>,
) {
  switch (options.type) {
    case NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED:
      return notifyFriendRequestReceived(
        options as NotifyUserOptions<'FRIEND_REQUEST_RECEIVED'>,
      );
    case NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED:
      return notifyFriendRequestAccepted(
        options as NotifyUserOptions<'FRIEND_REQUEST_ACCEPTED'>,
      );
    case NOTIFICATION_TYPES.UPCOMING_BIRTHDAY:
      // Placeholder for future implementation
      return;
    default: {
      // Exhaustive check
      const neverType: never = options.type;
      throw new Error(`Unhandled notification type: ${neverType}`);
    }
  }
}

async function notifyFriendRequestReceived(
  options: NotifyUserOptions<'FRIEND_REQUEST_RECEIVED'>,
) {
  const { userId, payload } = options;
  await ensureNotificationPreferencesForUser(userId);
  const prefs = await getNotificationPreferenceForChannels(
    userId,
    NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
  );

  if (prefs.inAppEnabled) {
    await createNotificationIfNeeded({
      userId,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      sourceIdentifier:
        options.sourceIdentifier ??
        `friend-request:${payload.friendRequestId}:received`,
      data: {
        status: 'UNREAD',
        messageKey: 'notifications.friendRequest.message',
        messageParams: JSON.stringify({
          name: payload.actorDisplayName,
        }),
        targetUrl: `/friends#incoming-requests`,
        metadata: JSON.stringify({
          senderUserId: payload.actorUserId,
          senderDisplayName: payload.actorDisplayName,
          senderAvatarId: payload.actorAvatarId ?? null,
        }),
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
        friendRequestId: payload.friendRequestId,
      },
    });
  }

  if (prefs.emailEnabled) {
    await sendFriendRequestReceivedEmail(options);
  }
}

async function notifyFriendRequestAccepted(
  options: NotifyUserOptions<'FRIEND_REQUEST_ACCEPTED'>,
) {
  const { userId, payload } = options;
  await ensureNotificationPreferencesForUser(userId);
  const prefs = await getNotificationPreferenceForChannels(
    userId,
    NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
  );

  if (prefs.inAppEnabled) {
    await createNotificationIfNeeded({
      userId,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
      sourceIdentifier:
        options.sourceIdentifier ??
        `friend-request:${payload.friendRequestId}:accepted`,
      data: {
        status: 'UNREAD',
        messageKey: 'notifications.friendRequestAccepted.message',
        messageParams: JSON.stringify({
          name: payload.actorDisplayName,
        }),
        targetUrl: `/friends`,
        metadata: JSON.stringify({
          senderUserId: payload.actorUserId,
          senderDisplayName: payload.actorDisplayName,
          senderAvatarId: payload.actorAvatarId ?? null,
        }),
        // Do not set friendRequestId here because it's unique and a
        // FRIEND_REQUEST_RECEIVED notification already uses it.
        // Keeping this null avoids unique constraint conflicts and we rely
        // on sourceIdentifier for idempotency.
        friendRequestId: null,
      },
    });
  }

  if (prefs.emailEnabled) {
    await sendFriendRequestAcceptedEmail(options);
  }
}

type NotificationInsert = {
  status: string;
  messageKey: string;
  messageParams?: string | null;
  targetUrl?: string | null;
  metadata?: string | null;
  actions?: string | null;
  friendRequestId?: string | null;
};

async function createNotificationIfNeeded({
  userId,
  type,
  sourceIdentifier,
  data,
}: {
  userId: string;
  type: NotificationType;
  sourceIdentifier?: string;
  data: NotificationInsert;
}): Promise<PrismaNotification> {
  if (sourceIdentifier) {
    const existing = await prisma.notification.findFirst({
      where: { userId, sourceIdentifier },
    });
    if (existing) return existing;
  }

  return prisma.notification.create({
    data: {
      userId,
      type,
      status: data.status,
      messageKey: data.messageKey,
      messageParams: data.messageParams,
      targetUrl: data.targetUrl,
      metadata: data.metadata,
      actions: data.actions,
      friendRequestId: data.friendRequestId,
      sourceIdentifier,
    },
  });
}

async function sendFriendRequestReceivedEmail(
  options: NotifyUserOptions<'FRIEND_REQUEST_RECEIVED'>,
) {
  const { userId, payload } = options;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, username: true },
  });
  if (!user?.email) return;

  const preferencesUrl = await buildManagePreferencesUrl(
    userId,
    NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
  );
  const profileUrl = buildAppUrl(`/users/${payload.actorUsername}`);

  await sendEmail({
    to: user.email,
    subject: `${payload.actorDisplayName} sent you a friend request on ${appName}`,
    react: (
      <FriendRequestReceivedEmail
        appName={appName}
        actorDisplayName={payload.actorDisplayName}
        actorProfileUrl={profileUrl}
        managePreferencesUrl={preferencesUrl}
      />
    ),
  });
}

async function sendFriendRequestAcceptedEmail(
  options: NotifyUserOptions<'FRIEND_REQUEST_ACCEPTED'>,
) {
  const { userId, payload } = options;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, username: true },
  });
  if (!user?.email) return;

  const preferencesUrl = await buildManagePreferencesUrl(
    userId,
    NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
  );
  const profileUrl = buildAppUrl(`/users/${payload.actorUsername}`);

  await sendEmail({
    to: user.email,
    subject: `${payload.actorDisplayName} accepted your friend request on ${appName}`,
    react: (
      <FriendRequestAcceptedEmail
        appName={appName}
        actorDisplayName={payload.actorDisplayName}
        actorProfileUrl={profileUrl}
        managePreferencesUrl={preferencesUrl}
      />
    ),
  });
}

async function buildManagePreferencesUrl(
  userId: string,
  type: NotificationType,
) {
  const token = await createPreferenceToken({ userId, type });
  return getPreferenceManagementUrl(token);
}

export function channelToColumn(channel: NotificationChannel) {
  return channel === NOTIFICATION_CHANNELS.EMAIL
    ? 'emailEnabled'
    : 'inAppEnabled';
}
