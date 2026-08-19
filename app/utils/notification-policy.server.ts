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
  getContextNotificationPreferencesForUsers,
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
  // Who this policy was resolved for. Carried so a caller that hands a
  // pre-resolved policy to the dispatcher can be checked against the intent
  // it is dispatching — see dispatchNotification.
  userId: string;
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
  const policies = await resolveNotificationPoliciesForUsers({
    userIds: [userId],
    type,
    context,
  });
  return policies.get(userId)!;
}

// Both halves of a policy cost a fixed number of plain statements no matter
// how many recipients are being resolved: the central half batches into one
// query set (loadCentralPreferenceStates), and the contextual half into one
// round trip (getContextNotificationPreferencesForUsers).
//
// Neither opens an interactive Prisma transaction. That matters more than the
// query count: Prisma opens those with BEGIN IMMEDIATE, which takes SQLite's
// write lock even for pure reads and admits a single holder. Resolving one
// user at a time meant a fan-out that queues notifications without awaiting
// opened one such transaction per recipient in the same tick — they didn't
// parallelize, they queued behind the lock while each one's own 5s timer ran
// from creation, and the tail died with "Transaction already closed"
// (GIFTPOOL-UI-1M/-1P/-1Q/-1R). Serializing the loop only reshapes that into a
// queued timeout; removing the transaction is what fixes it.
//
// So: no interactive transaction and no per-user loop in this path.
export async function resolveNotificationPoliciesForUsers({
  userIds,
  type,
  context,
}: {
  userIds: string[];
  type: NotificationType;
  context?: NotificationContext;
}): Promise<Map<string, ResolvedNotificationPolicy>> {
  // Validate before issuing any query, so a mis-typed context still fails
  // closed rather than after a round trip.
  const definition = requireMatchingContextDefinition(type, context);
  const [centralByUser, contextualByUser] = await Promise.all([
    resolveCentralNotificationPreferencesForUsers({ userIds, type }),
    definition.context !== 'NONE' && context
      ? getContextNotificationPreferencesForUsers({ userIds, context })
      : null,
  ]);

  return new Map(
    userIds.map((userId) => [
      userId,
      buildResolvedPolicy(
        userId,
        type,
        definition,
        centralByUser.get(userId)!,
        contextualByUser?.get(userId) ?? null,
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
  userId: string,
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
    userId,
    type,
    channels: Object.fromEntries(entries) as Record<
      NotificationChannel,
      NotificationChannelPolicy
    >,
  };
}
