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
  resolveCentralNotificationPreferencesForUsers,
  type CentralPreferenceSource,
  type ResolvedCentralNotificationPreferences,
  type ResolvedContextNotificationPreference,
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
  const definition = requireMatchingContextDefinition(type, context);
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

  return buildResolvedPolicy(type, definition, central, contextual);
}

// Resolving one user at a time (central + contextual, each its own SQLite
// transaction) scales concurrent DB transactions with recipient count when
// callers fan out over Promise.all — a large audience (e.g. every
// contributor in a pool) can burst enough concurrent transactions to time
// out against SQLite's single-writer connection (see GIFTPOOL-UI-1M). This
// batches the central half into one query set for every user.
//
// The contextual half is NOT batched the same way, and deliberately isn't
// run with any Promise.all concurrency either: getContextNotificationPreference
// opens an interactive Prisma transaction, and SQLite's BEGIN IMMEDIATE
// grants only one such transaction at a time — a "concurrent" batch here
// doesn't parallelize, it just queues N-1 of them behind the lock while
// each one's own interactive-transaction timeout clock keeps running,
// trading the original burst-timeout for a queued-timeout of the same
// shape. Sequential awaiting is what actually removes the contention.
export async function resolveNotificationPoliciesForUsers({
  userIds,
  type,
  context,
}: {
  userIds: string[];
  type: NotificationType;
  context?: NotificationContext;
}): Promise<Map<string, ResolvedNotificationPolicy>> {
  const definition = requireMatchingContextDefinition(type, context);
  const centralByUser = await resolveCentralNotificationPreferencesForUsers({
    userIds,
    type,
  });

  const contextualByUser = new Map<
    string,
    ResolvedContextNotificationPreference | null
  >();
  if (definition.context !== 'NONE' && context) {
    for (const userId of userIds) {
      contextualByUser.set(
        userId,
        await getContextNotificationPreference({
          userId,
          context,
          requireAccess: false,
        }),
      );
    }
  }

  return new Map(
    userIds.map((userId) => [
      userId,
      buildResolvedPolicy(
        type,
        definition,
        centralByUser.get(userId)!,
        contextualByUser.get(userId) ?? null,
      ),
    ]),
  );
}

function requireMatchingContextDefinition(
  type: NotificationType,
  context?: NotificationContext,
) {
  const definition = getNotificationEventDefinition(type);
  if (!matchesNotificationContext(definition.context, context)) {
    throw new Error(
      `Notification ${type} requires context kind ${definition.context}.`,
    );
  }
  return definition;
}

function buildResolvedPolicy(
  type: NotificationType,
  definition: ReturnType<typeof getNotificationEventDefinition>,
  central: ResolvedCentralNotificationPreferences,
  contextual: ResolvedContextNotificationPreference | null,
): ResolvedNotificationPolicy {
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
