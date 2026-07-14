import { prisma } from '#app/utils/db.server.ts';
import { sendEmail } from '#app/utils/email.server.ts';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type NotificationType,
} from '#app/utils/notification-catalog.ts';
import { type NotificationChannelMessageMap } from '#app/utils/notification-events.server.tsx';
import {
  hasWebPushCapability,
  sendWebPush,
} from '#app/utils/web-push.server.ts';

export type ChannelCapability =
  | { available: true; destination?: string }
  | { available: false };

export type ChannelAdapterResult =
  | { status: 'delivered' }
  | { status: 'unavailable' }
  | { status: 'failed'; error?: unknown }
  | { status: 'duplicate' };

type ChannelDeliveryInput<C extends NotificationChannel> = {
  userId: string;
  type: NotificationType;
  sourceIdentifier: string;
  message: NotificationChannelMessageMap[C];
  capability: ChannelCapability;
  dedupeVisibleRow: boolean;
};

export type NotificationChannelAdapter<C extends NotificationChannel> = {
  channel: C;
  checkCapability(userId: string): Promise<ChannelCapability>;
  deliver(input: ChannelDeliveryInput<C>): Promise<ChannelAdapterResult>;
};

const inAppAdapter: NotificationChannelAdapter<'IN_APP'> = {
  channel: NOTIFICATION_CHANNELS.IN_APP,
  async checkCapability() {
    return { available: true };
  },
  async deliver({ userId, type, sourceIdentifier, message, dedupeVisibleRow }) {
    if (dedupeVisibleRow) {
      const existing = await prisma.notification.findFirst({
        where: { userId, sourceIdentifier },
        select: { id: true },
      });
      if (existing) return { status: 'duplicate' };
    }

    await prisma.notification.create({
      data: {
        userId,
        type,
        sourceIdentifier,
        status: message.status,
        messageKey: message.messageKey,
        messageParams: message.messageParams,
        targetUrl: message.targetUrl,
        metadata: message.metadata,
        actions: message.actions,
        friendRequestId: message.friendRequestId,
        poolInvitationId: message.poolInvitationId,
      },
    });
    return { status: 'delivered' };
  },
};

const emailAdapter: NotificationChannelAdapter<'EMAIL'> = {
  channel: NOTIFICATION_CHANNELS.EMAIL,
  async checkCapability(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user?.email
      ? { available: true, destination: user.email }
      : { available: false };
  },
  async deliver({ message, capability }) {
    if (!capability.available || !capability.destination) {
      return { status: 'unavailable' };
    }
    const result = await sendEmail({
      to: capability.destination,
      subject: message.subject,
      react: message.react,
    });
    return result.status === 'success'
      ? { status: 'delivered' }
      : { status: 'failed', error: result.error };
  },
};

const webPushAdapter: NotificationChannelAdapter<'WEB_PUSH'> = {
  channel: NOTIFICATION_CHANNELS.WEB_PUSH,
  async checkCapability(userId) {
    return (await hasWebPushCapability(userId))
      ? { available: true }
      : { available: false };
  },
  async deliver({ userId, message }) {
    const result = await sendWebPush(userId, message);
    return { status: result.status };
  },
};

export const notificationChannelAdapters = {
  [NOTIFICATION_CHANNELS.IN_APP]: inAppAdapter,
  [NOTIFICATION_CHANNELS.EMAIL]: emailAdapter,
  [NOTIFICATION_CHANNELS.WEB_PUSH]: webPushAdapter,
};
