import {
  getNotificationEventDefinition,
  matchesNotificationContext,
  NOTIFICATION_CHANNEL_VALUES,
  type NotificationChannel,
  type NotificationContext,
  type NotificationType,
} from '#app/utils/notification-catalog.ts';
import {
  allowsContextActivity,
  getContextNotificationPreference,
  resolveCentralNotificationPreferences,
  type CentralPreferenceSource,
} from '#app/utils/notification-preferences.server.ts';

export type NotificationPolicyReason =
  | 'allowed'
  | 'preference_disabled'
  | 'context_muted'
  | 'context_filtered'
  | 'unsupported';

export type NotificationChannelPolicy = {
  channel: NotificationChannel;
  allowed: boolean;
  reason: NotificationPolicyReason;
  source:
    | 'catalog'
    | CentralPreferenceSource
    | 'application_default'
    | 'group_override'
    | 'pool_override';
};

export type ResolvedNotificationPolicy = {
  type: NotificationType;
  channels: Record<NotificationChannel, NotificationChannelPolicy>;
};

/**
 * The policy seam owns central precedence and contextual filtering. The
 * dispatcher submits the same typed intent and remains unaware of storage.
 */
export async function resolveNotificationPolicy({
  userId,
  type,
  context,
}: {
  userId: string;
  type: NotificationType;
  context?: NotificationContext;
}): Promise<ResolvedNotificationPolicy> {
  const definition = getNotificationEventDefinition(type);
  if (!matchesNotificationContext(definition.context, context)) {
    throw new Error(
      `Notification ${type} requires context kind ${definition.context}.`,
    );
  }
  const [central, contextual] = await Promise.all([
    resolveCentralNotificationPreferences({ userId, type }),
    definition.context !== 'NONE' && context
      ? getContextNotificationPreference({
          userId,
          context,
          requireAccess: false,
        })
      : null,
  ]);

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

    const preference = central.channels[channel];
    if (!preference.enabled) {
      return [
        channel,
        {
          channel,
          allowed: false,
          reason: 'preference_disabled',
          source: preference.source,
        },
      ] as const;
    }

    if (
      contextual &&
      !allowsContextActivity(contextual, central.topic, definition.importance)
    ) {
      return [
        channel,
        {
          channel,
          allowed: false,
          reason:
            contextual.activityLevel === 'MUTED'
              ? 'context_muted'
              : 'context_filtered',
          source: contextual.source,
        },
      ] as const;
    }

    return [
      channel,
      {
        channel,
        allowed: true,
        reason: 'allowed',
        source: preference.source,
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
