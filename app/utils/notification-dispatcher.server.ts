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
): Promise<NotificationDispatchResult> {
  const [policy, occurrenceKey] = await Promise.all([
    resolveNotificationPolicy({
      userId: intent.userId,
      type: intent.type,
      context: intent.context,
    }),
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
export function queueNotification(intent: NotificationIntent): void {
  void dispatchNotification(intent).catch((error: unknown) => {
    Sentry.captureException(error);
  });
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
