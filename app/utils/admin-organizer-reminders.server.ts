import { prisma } from '#app/utils/db.server.ts';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TOPICS,
  NOTIFICATION_TYPES,
  type OrganizerNudgeNotificationType,
} from '#app/utils/notification-catalog.ts';
import { NOTIFICATION_ACTIVITY_LEVELS } from '#app/utils/notification-context.ts';
import { type OrganizerNudgeKind } from '#app/utils/organizer-nudges.server.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const PREFERENCE_REDUCTION_WINDOW_MS = 7 * DAY_MS;

const KIND_DEFINITIONS = [
  {
    kind: 'CONTRIBUTION',
    label: 'Contribution',
    notificationType: NOTIFICATION_TYPES.POOL_CONTRIBUTION_REMINDER,
  },
  {
    kind: 'VOTE',
    label: 'Vote',
    notificationType: NOTIFICATION_TYPES.POOL_VOTE_REMINDER,
  },
  {
    kind: 'PURCHASE',
    label: 'Purchase',
    notificationType: NOTIFICATION_TYPES.POOL_PURCHASE_REMINDER,
  },
  {
    kind: 'DELIVERY',
    label: 'Delivery',
    notificationType: NOTIFICATION_TYPES.POOL_DELIVERY_REMINDER,
  },
] as const satisfies ReadonlyArray<{
  kind: OrganizerNudgeKind;
  label: string;
  notificationType: OrganizerNudgeNotificationType;
}>;

type ReminderEventProperties = {
  notificationType?: unknown;
  organizerNudgeId?: unknown;
  poolId?: unknown;
  channels?: unknown;
  kind?: unknown;
  reason?: unknown;
  type?: unknown;
};

type PreferenceAudit = {
  userId: string;
  kind: string;
  preferenceKey: string | null;
  channel: string | null;
  contextKind: string | null;
  contextId: string | null;
  newValue: string | null;
  createdAt: Date;
};

type Delivery = {
  userId: string;
  poolId: string;
  groupId: string | null;
  channels: string[];
  createdAt: Date;
};

export type OrganizerReminderKindMetrics = {
  kind: OrganizerNudgeKind;
  label: string;
  notificationType: OrganizerNudgeNotificationType;
  queued: number;
  targeted: number;
  delivered: number;
  clicks: number;
};

export type OrganizerReminderMetrics = {
  days: number;
  queuedReminders: number;
  targetedRecipients: number;
  deliveredRecipients: number;
  deliveryRate: number;
  notificationClicks: number;
  clickEventRate: number;
  repeatSends: number;
  skippedAttempts: {
    noEligible: number;
    cooldown: number;
    weeklyLimit: number;
  };
  settingsReducedWithin7Days: number;
  byKind: OrganizerReminderKindMetrics[];
};

/**
 * Aggregates the organizer-reminder experiment without returning pool, sender,
 * or recipient identifiers. Clicks are type-level notification events, so the
 * click ratio is directional rather than a per-nudge attribution funnel.
 */
export async function getOrganizerReminderMetrics({
  days = 30,
  now = new Date(),
}: {
  days?: number;
  now?: Date;
} = {}): Promise<OrganizerReminderMetrics> {
  const since = new Date(now.getTime() - days * DAY_MS);
  const [nudges, events, audits] = await Promise.all([
    prisma.organizerNudge.findMany({
      where: { createdAt: { gte: since, lte: now } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        poolId: true,
        pool: { select: { giftGroupId: true } },
        kind: true,
        targetCount: true,
      },
    }),
    prisma.analyticsEvent.findMany({
      where: {
        name: {
          in: [
            'organizer_reminder_sent',
            'organizer_reminder_skipped',
            'notification_clicked',
          ],
        },
        createdAt: { gte: since, lte: now },
      },
      select: {
        name: true,
        userId: true,
        properties: true,
        createdAt: true,
      },
    }),
    prisma.notificationPreferenceAudit.findMany({
      where: {
        createdAt: { gte: since, lte: now },
        kind: {
          in: ['GLOBAL_CHANNEL', 'TOPIC', 'CATEGORY', 'CONTEXT_ACTIVITY'],
        },
      },
      select: {
        userId: true,
        kind: true,
        preferenceKey: true,
        channel: true,
        contextKind: true,
        contextId: true,
        newValue: true,
        createdAt: true,
      },
    }),
  ]);

  const nudgesById = new Map(nudges.map((nudge) => [nudge.id, nudge]));
  const kindByNotificationType = new Map(
    KIND_DEFINITIONS.map((definition) => [
      definition.notificationType,
      definition.kind,
    ]),
  );
  const countsByKind = new Map(
    KIND_DEFINITIONS.map((definition) => [
      definition.kind,
      { queued: 0, targeted: 0, delivered: 0, clicks: 0 },
    ]),
  );

  const seenPoolKinds = new Set<string>();
  let repeatSends = 0;
  for (const nudge of nudges) {
    const counts = countsByKind.get(nudge.kind as OrganizerNudgeKind);
    if (counts) {
      counts.queued += 1;
      counts.targeted += nudge.targetCount;
    }
    const repeatKey = `${nudge.poolId}:${nudge.kind}`;
    if (seenPoolKinds.has(repeatKey)) repeatSends += 1;
    seenPoolKinds.add(repeatKey);
  }

  const deliveries: Delivery[] = [];
  let notificationClicks = 0;
  const skippedAttempts = { noEligible: 0, cooldown: 0, weeklyLimit: 0 };

  for (const event of events) {
    const properties = parseProperties(event.properties);
    if (!properties) continue;

    if (event.name === 'organizer_reminder_sent') {
      const nudge =
        typeof properties.organizerNudgeId === 'string'
          ? nudgesById.get(properties.organizerNudgeId)
          : undefined;
      if (
        !event.userId ||
        !nudge ||
        properties.poolId !== nudge.poolId ||
        !Array.isArray(properties.channels)
      ) {
        continue;
      }
      const kind = kindByNotificationType.get(
        properties.notificationType as OrganizerNudgeNotificationType,
      );
      const counts = kind ? countsByKind.get(kind) : undefined;
      if (!counts) continue;
      counts.delivered += 1;
      deliveries.push({
        userId: event.userId,
        poolId: nudge.poolId,
        groupId: nudge.pool.giftGroupId,
        channels: properties.channels.filter(
          (channel): channel is string => typeof channel === 'string',
        ),
        createdAt: event.createdAt,
      });
      continue;
    }

    if (event.name === 'notification_clicked') {
      const kind = kindByNotificationType.get(
        properties.type as OrganizerNudgeNotificationType,
      );
      const counts = kind ? countsByKind.get(kind) : undefined;
      if (!counts) continue;
      counts.clicks += 1;
      notificationClicks += 1;
      continue;
    }

    if (event.name === 'organizer_reminder_skipped') {
      if (!countsByKind.has(properties.kind as OrganizerNudgeKind)) continue;
      if (properties.reason === 'NO_ELIGIBLE') skippedAttempts.noEligible += 1;
      if (properties.reason === 'COOLDOWN') skippedAttempts.cooldown += 1;
      if (properties.reason === 'WEEKLY_LIMIT')
        skippedAttempts.weeklyLimit += 1;
    }
  }

  const targetedRecipients = nudges.reduce(
    (total, nudge) => total + nudge.targetCount,
    0,
  );
  const deliveredRecipients = deliveries.length;

  return {
    days,
    queuedReminders: nudges.length,
    targetedRecipients,
    deliveredRecipients,
    deliveryRate: percentOf(deliveredRecipients, targetedRecipients),
    notificationClicks,
    clickEventRate: percentOf(notificationClicks, deliveredRecipients),
    repeatSends,
    skippedAttempts,
    settingsReducedWithin7Days: countPreferenceReductions(deliveries, audits),
    byKind: KIND_DEFINITIONS.map((definition) => ({
      ...definition,
      ...countsByKind.get(definition.kind)!,
    })),
  };
}

function countPreferenceReductions(
  deliveries: Delivery[],
  audits: PreferenceAudit[],
) {
  const auditsByUser = new Map<string, PreferenceAudit[]>();
  for (const audit of audits) {
    const userAudits = auditsByUser.get(audit.userId) ?? [];
    userAudits.push(audit);
    auditsByUser.set(audit.userId, userAudits);
  }

  const usersWhoReducedSettings = new Set<string>();
  for (const delivery of deliveries) {
    const deadline =
      delivery.createdAt.getTime() + PREFERENCE_REDUCTION_WINDOW_MS;
    const reducedSettings = (auditsByUser.get(delivery.userId) ?? []).some(
      (audit) =>
        audit.createdAt >= delivery.createdAt &&
        audit.createdAt.getTime() <= deadline &&
        auditReducesReminderDelivery(audit, delivery),
    );
    if (reducedSettings) usersWhoReducedSettings.add(delivery.userId);
  }
  return usersWhoReducedSettings.size;
}

function auditReducesReminderDelivery(
  audit: PreferenceAudit,
  delivery: Delivery,
) {
  if (audit.kind === 'CONTEXT_ACTIVITY') {
    const matchesDeliveryContext =
      (audit.contextKind === 'POOL' && audit.contextId === delivery.poolId) ||
      (delivery.groupId !== null &&
        audit.contextKind === 'GROUP' &&
        audit.contextId === delivery.groupId);
    return (
      matchesDeliveryContext &&
      contextValueDisablesOrganizerReminders(audit.newValue)
    );
  }

  if (audit.newValue !== 'false' || !audit.channel) return false;
  if (!delivery.channels.includes(audit.channel)) return false;
  return (
    audit.kind === 'GLOBAL_CHANNEL' ||
    (audit.kind === 'TOPIC' &&
      audit.preferenceKey === NOTIFICATION_TOPICS.ORGANIZER_NUDGES) ||
    (audit.kind === 'CATEGORY' &&
      audit.preferenceKey === NOTIFICATION_CATEGORIES.POOL_COORDINATION)
  );
}

function contextValueDisablesOrganizerReminders(value: string | null) {
  if (!value) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return false;
    if (parsed.activityLevel === NOTIFICATION_ACTIVITY_LEVELS.MUTED)
      return true;
    return (
      parsed.activityLevel === NOTIFICATION_ACTIVITY_LEVELS.CUSTOM &&
      Array.isArray(parsed.customTopics) &&
      !parsed.customTopics.includes(NOTIFICATION_TOPICS.ORGANIZER_NUDGES)
    );
  } catch {
    return false;
  }
}

function parseProperties(value: string | null): ReminderEventProperties | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function percentOf(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
