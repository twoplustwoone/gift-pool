import {
  channelToColumn,
  getNotificationEventDefinition,
  NOTIFICATION_CHANNEL_VALUES,
  type NotificationChannel,
  type NotificationType,
} from '#app/utils/notification-catalog.ts';
import { getNotificationPreferenceForChannels } from '#app/utils/notification-preferences.server.ts';

export type NotificationPolicyReason =
  | 'allowed'
  | 'preference_disabled'
  | 'unsupported';

export type NotificationChannelPolicy = {
  channel: NotificationChannel;
  allowed: boolean;
  reason: NotificationPolicyReason;
  source: 'catalog' | 'legacy_event_preference';
};

export type ResolvedNotificationPolicy = {
  type: NotificationType;
  channels: Record<NotificationChannel, NotificationChannelPolicy>;
};

/**
 * The policy seam already returns explainable per-channel decisions even
 * though milestone 4 reads the legacy per-event rows underneath it. Scoped
 * preference storage can replace that implementation without widening the
 * dispatcher's interface.
 */
export async function resolveNotificationPolicy({
  userId,
  type,
}: {
  userId: string;
  type: NotificationType;
}): Promise<ResolvedNotificationPolicy> {
  const definition = getNotificationEventDefinition(type);
  const preferences = await getNotificationPreferenceForChannels(userId, type);

  const entries = NOTIFICATION_CHANNEL_VALUES.map((channel) => {
    if (!definition.supportedChannels.includes(channel)) {
      return [
        channel,
        {
          channel,
          allowed: false,
          reason: 'unsupported',
          source: 'catalog',
        },
      ] as const;
    }

    const allowed = preferences[channelToColumn(channel)];
    return [
      channel,
      {
        channel,
        allowed,
        reason: allowed ? 'allowed' : 'preference_disabled',
        source: 'legacy_event_preference',
      },
    ] as const;
  });

  return {
    type,
    channels: Object.fromEntries(entries) as Record<
      NotificationChannel,
      NotificationChannelPolicy
    >,
  };
}
