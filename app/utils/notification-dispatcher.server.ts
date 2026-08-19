import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/react-router';
import { prisma } from '#app/utils/db.server.ts';
import {
  getNotificationEventDefinition,
  NOTIFICATION_CHANNEL_VALUES,
  type NotificationChannel,
  type NotificationIntent,
} from '#app/utils/notification-catalog.ts';
import {
  notificationChannelAdapters,
  type ChannelAdapterResult,
  type NotificationChannelAdapter,
} from '#app/utils/notification-channel-adapters.server.ts';
import {
  getNotificationOccurrenceKey,
  recordNotificationDelivery,
  renderNotificationChannel,
} from '#app/utils/notification-events.server.tsx';
import {
  resolveNotificationPolicy,
  type NotificationPolicyReason,
  type ResolvedNotificationPolicy,
} from '#app/utils/notification-policy.server.ts';

export type NotificationDispatchStatus =
  | 'delivered'
  | 'failed'
  | 'unavailable'
  | 'duplicate'
  | NotificationPolicyReason;

export type NotificationChannelDispatchResult = {
  channel: NotificationChannel;
  status: NotificationDispatchStatus;
};

/**
 * Lets an audience-wide fan-out resolve one policy per recipient in a single
 * batched read (resolveNotificationPoliciesForUsers) and hand each one in,
 * instead of every dispatch resolving its own.
 */
export type NotificationDispatchOptions = {
  policy?: ResolvedNotificationPolicy;
};

export type NotificationDispatchResult = {
  channels: Record<NotificationChannel, NotificationChannelDispatchResult>;
  deliveredChannels: Array<NotificationChannel>;
  failedChannels: Array<NotificationChannel>;
};

/**
 * Deep delivery module: callers submit one typed intent and do not coordinate
 * preferences, rendering, idempotency, adapters, isolation, or analytics.
 */
export async function dispatchNotification(
  intent: NotificationIntent,
  options?: NotificationDispatchOptions,
): Promise<NotificationDispatchResult> {
  const [policy, occurrenceKey] = await Promise.all([
    resolvePolicyForIntent(intent, options),
    Promise.resolve(getNotificationOccurrenceKey(intent)),
  ]);
  const definition = getNotificationEventDefinition(intent.type);
  const channelResults: Array<NotificationChannelDispatchResult> = [];

  for (const channel of NOTIFICATION_CHANNEL_VALUES) {
    const decision = policy.channels[channel];
    if (!decision.allowed) {
      channelResults.push({ channel, status: decision.reason });
      continue;
    }

    channelResults.push(
      await dispatchChannel({
        intent,
        channel,
        occurrenceKey,
        useLedger: definition.deliveryStrategy === 'PER_CHANNEL_LEDGER',
      }),
    );
  }

  const deliveredChannels = channelResults
    .filter((result) => result.status === 'delivered')
    .map((result) => result.channel);
  const failedChannels = channelResults
    .filter((result) => result.status === 'failed')
    .map((result) => result.channel);

  recordNotificationDelivery(intent, deliveredChannels);

  return {
    channels: Object.fromEntries(
      channelResults.map((result) => [result.channel, result]),
    ) as Record<NotificationChannel, NotificationChannelDispatchResult>,
    deliveredChannels,
    failedChannels,
  };
}

/** Fire after the domain transaction commits; unexpected setup failures tail to Sentry. */
export function queueNotification(
  intent: NotificationIntent,
  options?: NotificationDispatchOptions,
): void {
  void dispatchNotification(intent, options).catch((error: unknown) => {
    Sentry.captureException(error);
  });
}

async function resolvePolicyForIntent(
  intent: NotificationIntent,
  options?: NotificationDispatchOptions,
): Promise<ResolvedNotificationPolicy> {
  const provided = options?.policy;
  if (!provided) {
    return resolveNotificationPolicy({
      userId: intent.userId,
      type: intent.type,
      context: intent.context,
    });
  }
  // A fan-out hands us a policy it looked up by user id in a Map. If it
  // mis-indexes that Map we would deliver under someone else's preferences —
  // silently, and specifically to people who muted the context. Cheap to
  // check, so never trust the caller's indexing.
  if (provided.userId !== intent.userId || provided.type !== intent.type) {
    throw new Error(
      `Pre-resolved policy for ${provided.type}/${provided.userId} does not match intent ${intent.type}/${intent.userId}.`,
    );
  }
  return provided;
}

async function dispatchChannel<C extends NotificationChannel>({
  intent,
  channel,
  occurrenceKey,
  useLedger,
}: {
  intent: NotificationIntent;
  channel: C;
  occurrenceKey: string;
  useLedger: boolean;
}): Promise<NotificationChannelDispatchResult> {
  const adapter = notificationChannelAdapters[channel] as unknown as
    | NotificationChannelAdapter<C>
    | undefined;
  if (!adapter) return { channel, status: 'unsupported' };

  try {
    const capability = await adapter.checkCapability(intent.userId);
    if (!capability.available) return { channel, status: 'unavailable' };

    const sourceIdentifier = useLedger
      ? `${occurrenceKey}:${channel}`
      : occurrenceKey;
    if (
      useLedger &&
      !(await claimNotificationDelivery({
        userId: intent.userId,
        type: intent.type,
        sourceIdentifier,
      }))
    ) {
      return { channel, status: 'duplicate' };
    }

    const message = await renderNotificationChannel(intent, channel);
    const outcome = await adapter.deliver({
      userId: intent.userId,
      type: intent.type,
      sourceIdentifier,
      message,
      capability,
      dedupeVisibleRow: !useLedger,
    });
    captureAdapterFailure(outcome, intent, channel);
    return { channel, status: outcome.status };
  } catch (error) {
    Sentry.captureException(error);
    return { channel, status: 'failed' };
  }
}

function captureAdapterFailure(
  outcome: ChannelAdapterResult,
  intent: NotificationIntent,
  channel: NotificationChannel,
) {
  if (outcome.status !== 'failed') return;
  const error =
    outcome.error ??
    new Error(`Notification ${intent.type} failed on ${channel}`);
  Sentry.captureException(error);
}

async function claimNotificationDelivery({
  userId,
  type,
  sourceIdentifier,
}: {
  userId: string;
  type: NotificationIntent['type'];
  sourceIdentifier: string;
}): Promise<boolean> {
  const existing = await prisma.notificationDelivery.findUnique({
    where: { userId_sourceIdentifier: { userId, sourceIdentifier } },
    select: { userId: true },
  });
  if (existing) return false;

  try {
    await prisma.notificationDelivery.create({
      data: { userId, type, sourceIdentifier },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return false;
    }
    throw error;
  }
}
