import { type Prisma } from '@prisma/client';
import { data } from 'react-router';
import { prisma } from '#app/utils/db.server.ts';
import {
  channelToColumn,
  getNotificationCategoryTopics,
  getNotificationEventDefinition,
  getNotificationTopicDefinition,
  isNotificationTopic,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_VALUES,
  NOTIFICATION_TOPIC_VALUES,
  NOTIFICATION_TYPE_VALUES,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationContext,
  type NotificationImportance,
  type NotificationPreferenceDefaults,
  type NotificationTopic,
  type NotificationType,
} from '#app/utils/notification-catalog.ts';
import {
  isNotificationActivityLevel,
  NOTIFICATION_ACTIVITY_LEVELS,
  type ContextNotificationAwarenessReason,
  type NotificationActivityLevel,
} from '#app/utils/notification-context.ts';

export {
  isNotificationActivityLevel,
  NOTIFICATION_ACTIVITY_LEVELS,
  type NotificationActivityLevel,
} from '#app/utils/notification-context.ts';

export type CentralPreferenceSource =
  | 'catalog_default'
  | 'category_override'
  | 'topic_override'
  | 'global_channel';

export type CentralChannelPreference = {
  enabled: boolean;
  source: CentralPreferenceSource;
};

export type ResolvedCentralNotificationPreferences = {
  type: NotificationType;
  topic: NotificationTopic;
  category: NotificationCategory;
  channels: Record<NotificationChannel, CentralChannelPreference>;
};

export type ResolvedGlobalChannelPreference = {
  enabled: boolean;
  source: 'application_default' | 'user_override';
};

export type ResolvedNotificationTopicPreferences = {
  topic: NotificationTopic;
  category: NotificationCategory;
  channels: Record<NotificationChannel, CentralChannelPreference>;
};

export type CentralNotificationSettings = {
  channels: Record<NotificationChannel, ResolvedGlobalChannelPreference>;
  topics: Array<ResolvedNotificationTopicPreferences>;
};

export type ResolvedContextNotificationPreference = {
  context: NotificationContext;
  activityLevel: NotificationActivityLevel;
  source: 'application_default' | 'group_override' | 'pool_override';
  customTopics: Array<NotificationTopic>;
  mutedAt: Date | null;
  noticeDismissedAt: Date | null;
  noticeDismissedKey: string | null;
  noticeKey: string | null;
  noticeVisible: boolean;
  controllingContext: NotificationContext | null;
};

export type ContextNotificationAwareness = {
  preference: ResolvedContextNotificationPreference;
  notificationOff: boolean;
  reason: ContextNotificationAwarenessReason | null;
  noticeKey: string | null;
  noticeVisible: boolean;
};

const DEFAULT_GLOBAL_CHANNEL_PREFERENCES: Record<NotificationChannel, boolean> =
  {
    [NOTIFICATION_CHANNELS.IN_APP]: true,
    [NOTIFICATION_CHANNELS.EMAIL]: true,
    [NOTIFICATION_CHANNELS.WEB_PUSH]: true,
  };

type CentralPreferenceState = {
  gates: Map<NotificationChannel, boolean>;
  categories: Map<string, boolean>;
  topics: Map<string, boolean>;
};

export async function resolveCentralNotificationPreferences({
  userId,
  type,
}: {
  userId: string;
  type: NotificationType;
}): Promise<ResolvedCentralNotificationPreferences> {
  return resolveCentralFromState(
    type,
    await loadCentralPreferenceState(userId),
  );
}

export async function getCentralNotificationSettings(
  userId: string,
): Promise<CentralNotificationSettings> {
  const state = await loadCentralPreferenceState(userId);
  return {
    channels: Object.fromEntries(
      NOTIFICATION_CHANNEL_VALUES.map((channel) => [
        channel,
        {
          enabled:
            state.gates.get(channel) ??
            DEFAULT_GLOBAL_CHANNEL_PREFERENCES[channel],
          source: state.gates.has(channel)
            ? ('user_override' as const)
            : ('application_default' as const),
        },
      ]),
    ) as Record<NotificationChannel, ResolvedGlobalChannelPreference>,
    topics: NOTIFICATION_TOPIC_VALUES.map((topic) =>
      resolveTopicFromState(topic, state, false),
    ),
  };
}

export async function getNotificationPreferences(userId: string) {
  return (await getNotificationPreferencesForUsers([userId])).get(
    userId,
  ) as Map<NotificationType, NotificationPreferenceDefaults>;
}

/** Bulk resolved read for admin/operations surfaces without N×3 queries. */
export async function getNotificationPreferencesForUsers(userIds: string[]) {
  const states = await loadCentralPreferenceStates(userIds);
  return new Map(
    userIds.map((userId) => {
      const state = states.get(userId) ?? emptyCentralPreferenceState();
      return [
        userId,
        new Map(
          NOTIFICATION_TYPE_VALUES.map((type) => [
            type,
            channelsToLegacyShape(
              resolveCentralFromState(type, state).channels,
            ),
          ]),
        ),
      ];
    }),
  );
}

export async function getNotificationPreferenceForChannels(
  userId: string,
  type: NotificationType,
) {
  const resolved = await resolveCentralNotificationPreferences({
    userId,
    type,
  });
  return channelsToLegacyShape(resolved.channels);
}

/** Compatibility interface for the current per-event settings screen. */
export async function setNotificationPreference(
  userId: string,
  type: NotificationType,
  channel: NotificationChannel,
  enabled: boolean,
  source: string,
) {
  const topic = getNotificationEventDefinition(type).topic;
  await setTopicChannelPreference({
    userId,
    topic,
    channel,
    enabled,
    source,
  });
  return getNotificationPreferenceForChannels(userId, type);
}

export async function setGlobalChannelPreference({
  userId,
  channel,
  enabled,
  source,
}: {
  userId: string;
  channel: NotificationChannel;
  enabled: boolean;
  source: string;
}) {
  const defaultValue = DEFAULT_GLOBAL_CHANNEL_PREFERENCES[channel];
  await prisma.$transaction(async (tx) => {
    const existing = await tx.notificationChannelPreference.findUnique({
      where: { userId_channel: { userId, channel } },
      select: { enabled: true },
    });
    const previousValue = existing?.enabled ?? defaultValue;
    if (previousValue === enabled) return;

    if (enabled === defaultValue) {
      await tx.notificationChannelPreference.deleteMany({
        where: { userId, channel },
      });
    } else {
      await tx.notificationChannelPreference.upsert({
        where: { userId_channel: { userId, channel } },
        create: { userId, channel, enabled },
        update: { enabled },
      });
    }
    await auditPreferenceChange(tx, {
      userId,
      kind: 'GLOBAL_CHANNEL',
      preferenceKey: channel,
      channel,
      previousValue,
      newValue: enabled,
      source,
    });
  });
}

export async function setTopicChannelPreference({
  userId,
  topic,
  channel,
  enabled,
  source,
}: {
  userId: string;
  topic: NotificationTopic;
  channel: NotificationChannel;
  enabled: boolean;
  source: string;
}) {
  await prisma.$transaction(async (tx) => {
    const previousValue = await resolveTopicChannelInTransaction(tx, {
      userId,
      topic,
      channel,
    });
    if (previousValue === enabled) return;

    await tx.notificationTopicPreference.upsert({
      where: { userId_topic_channel: { userId, topic, channel } },
      create: { userId, topic, channel, enabled },
      update: { enabled },
    });
    await auditPreferenceChange(tx, {
      userId,
      kind: 'TOPIC',
      preferenceKey: topic,
      channel,
      previousValue,
      newValue: enabled,
      source,
    });
  });
}

export async function clearTopicChannelPreference({
  userId,
  topic,
  channel,
  source,
}: {
  userId: string;
  topic: NotificationTopic;
  channel: NotificationChannel;
  source: string;
}) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.notificationTopicPreference.findUnique({
      where: { userId_topic_channel: { userId, topic, channel } },
      select: { enabled: true },
    });
    if (!existing) return;
    await tx.notificationTopicPreference.delete({
      where: { userId_topic_channel: { userId, topic, channel } },
    });
    const inheritedValue = await resolveTopicChannelInTransaction(tx, {
      userId,
      topic,
      channel,
    });
    await auditPreferenceChange(tx, {
      userId,
      kind: 'TOPIC',
      preferenceKey: topic,
      channel,
      previousValue: existing.enabled,
      newValue: inheritedValue,
      source,
    });
  });
}

/**
 * A category bulk change is atomic and clears more-specific topic rows for the
 * same channel so every topic actually adopts the selected category value.
 */
export async function setCategoryChannelPreference({
  userId,
  category,
  channel,
  enabled,
  source,
}: {
  userId: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
  source: string;
}) {
  const topics = getNotificationCategoryTopics(category);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.notificationCategoryPreference.findUnique({
      where: { userId_category_channel: { userId, category, channel } },
      select: { enabled: true },
    });
    await tx.notificationCategoryPreference.upsert({
      where: { userId_category_channel: { userId, category, channel } },
      create: { userId, category, channel, enabled },
      update: { enabled },
    });
    const clearedTopics = await tx.notificationTopicPreference.deleteMany({
      where: { userId, channel, topic: { in: topics } },
    });
    if (existing?.enabled === enabled && clearedTopics.count === 0) return;
    await auditPreferenceChange(tx, {
      userId,
      kind: 'CATEGORY',
      preferenceKey: category,
      channel,
      previousValue: existing?.enabled ?? null,
      newValue: enabled,
      source,
    });
  });
}

export async function disableEmailForAll(userId: string, source: string) {
  await setGlobalChannelPreference({
    userId,
    channel: NOTIFICATION_CHANNELS.EMAIL,
    enabled: false,
    source,
  });
}

export async function setContextActivityPreference({
  userId,
  context,
  activityLevel,
  customTopics = [],
  source,
}: {
  userId: string;
  context: NotificationContext;
  activityLevel: NotificationActivityLevel;
  customTopics?: Array<NotificationTopic>;
  source: string;
}) {
  const normalizedTopics = normalizeCustomTopics(customTopics);
  const normalizedLevel =
    activityLevel === NOTIFICATION_ACTIVITY_LEVELS.CUSTOM &&
    normalizedTopics.length === 0
      ? NOTIFICATION_ACTIVITY_LEVELS.MUTED
      : activityLevel;

  await prisma.$transaction(async (tx) => {
    await requireContextAccess(tx, userId, context);
    const existing = await findContextPreference(tx, userId, context);
    const wasMuted =
      existing?.activityLevel === NOTIFICATION_ACTIVITY_LEVELS.MUTED;
    const isMuted = normalizedLevel === NOTIFICATION_ACTIVITY_LEVELS.MUTED;
    let mutedAt: Date | null = null;
    if (isMuted) {
      mutedAt = wasMuted ? (existing?.mutedAt ?? new Date()) : new Date();
    }
    const nextTopics =
      normalizedLevel === NOTIFICATION_ACTIVITY_LEVELS.CUSTOM
        ? normalizedTopics
        : [];
    const previousActivity = serializeActivity(existing);
    const nextActivity = serializeActivity({
      activityLevel: normalizedLevel,
      customTopics: serializeTopics(nextTopics),
    });
    if (previousActivity === nextActivity) return;

    await upsertContextPreference(tx, userId, context, {
      activityLevel: normalizedLevel,
      customTopics: serializeTopics(nextTopics),
      mutedAt,
      noticeDismissedAt:
        isMuted && wasMuted ? existing?.noticeDismissedAt : null,
      noticeDismissedKey:
        isMuted && wasMuted ? existing?.noticeDismissedKey : null,
    });
    await auditPreferenceChange(tx, {
      userId,
      kind: 'CONTEXT_ACTIVITY',
      contextKind: context.kind,
      contextId: contextId(context),
      previousValue: previousActivity,
      newValue: nextActivity,
      source,
    });
  });
}

export async function clearContextActivityPreference({
  userId,
  context,
  source,
}: {
  userId: string;
  context: NotificationContext;
  source: string;
}) {
  await prisma.$transaction(async (tx) => {
    await requireContextAccess(tx, userId, context);
    const existing = await findContextPreference(tx, userId, context);
    if (!existing?.activityLevel) return;
    await upsertContextPreference(tx, userId, context, {
      activityLevel: null,
      customTopics: null,
      mutedAt: null,
      noticeDismissedAt: null,
      noticeDismissedKey: null,
    });
    await auditPreferenceChange(tx, {
      userId,
      kind: 'CONTEXT_ACTIVITY',
      contextKind: context.kind,
      contextId: contextId(context),
      previousValue: serializeActivity(existing),
      newValue: null,
      source,
    });
  });
}

export async function dismissContextMutedNotice({
  userId,
  context,
  source,
}: {
  userId: string;
  context: NotificationContext;
  source: string;
}) {
  return dismissContextNotificationNotice({ userId, context, source });
}

export async function dismissContextNotificationNotice({
  userId,
  context,
  source,
}: {
  userId: string;
  context: NotificationContext;
  source: string;
}) {
  await prisma.$transaction(async (tx) => {
    await requireContextAccess(tx, userId, context);
    const awareness = await resolveContextAwarenessInTransaction(
      tx,
      userId,
      context,
    );
    if (!awareness.noticeKey || !awareness.noticeVisible) return;
    const dismissedAt = new Date();
    const existing = await findContextPreference(tx, userId, context);
    await upsertContextPreference(tx, userId, context, {
      activityLevel: existing?.activityLevel ?? null,
      customTopics: existing?.customTopics ?? null,
      mutedAt: existing?.mutedAt ?? null,
      noticeDismissedAt: dismissedAt,
      noticeDismissedKey: awareness.noticeKey,
    });
    await auditPreferenceChange(tx, {
      userId,
      kind: 'MUTED_NOTICE',
      contextKind: context.kind,
      contextId: contextId(context),
      previousValue: existing?.noticeDismissedKey ?? null,
      newValue: awareness.noticeKey,
      source,
    });
  });
}

export async function getContextNotificationPreference({
  userId,
  context,
  requireAccess = true,
}: {
  userId: string;
  context: NotificationContext;
  requireAccess?: boolean;
}): Promise<ResolvedContextNotificationPreference> {
  return prisma.$transaction(async (tx) => {
    if (requireAccess) await requireContextAccess(tx, userId, context);
    return resolveContextInTransaction(tx, userId, context);
  });
}

export async function getContextNotificationAwareness({
  userId,
  context,
  requireAccess = true,
}: {
  userId: string;
  context: NotificationContext;
  requireAccess?: boolean;
}): Promise<ContextNotificationAwareness> {
  return prisma.$transaction(async (tx) => {
    if (requireAccess) await requireContextAccess(tx, userId, context);
    return resolveContextAwarenessInTransaction(tx, userId, context);
  });
}

export function allowsContextActivity(
  preference: ResolvedContextNotificationPreference,
  topic: NotificationTopic,
  importance: NotificationImportance,
) {
  switch (preference.activityLevel) {
    case NOTIFICATION_ACTIVITY_LEVELS.ALL_ACTIVITY:
      return true;
    case NOTIFICATION_ACTIVITY_LEVELS.IMPORTANT_ONLY:
      return importance === 'IMPORTANT';
    case NOTIFICATION_ACTIVITY_LEVELS.MUTED:
      return false;
    case NOTIFICATION_ACTIVITY_LEVELS.CUSTOM:
      return preference.customTopics.includes(topic);
  }
}

async function loadCentralPreferenceState(
  userId: string,
): Promise<CentralPreferenceState> {
  return (await loadCentralPreferenceStates([userId])).get(
    userId,
  ) as CentralPreferenceState;
}

async function loadCentralPreferenceStates(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, CentralPreferenceState>();
  const [gates, categories, topics] = await prisma.$transaction([
    prisma.notificationChannelPreference.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, channel: true, enabled: true },
    }),
    prisma.notificationCategoryPreference.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, category: true, channel: true, enabled: true },
    }),
    prisma.notificationTopicPreference.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, topic: true, channel: true, enabled: true },
    }),
  ]);
  const states = new Map(
    userIds.map((id) => [id, emptyCentralPreferenceState()]),
  );
  for (const row of gates) {
    states
      .get(row.userId)
      ?.gates.set(row.channel as NotificationChannel, row.enabled);
  }
  for (const row of categories) {
    states
      .get(row.userId)
      ?.categories.set(preferenceKey(row.category, row.channel), row.enabled);
  }
  for (const row of topics) {
    states
      .get(row.userId)
      ?.topics.set(preferenceKey(row.topic, row.channel), row.enabled);
  }
  return states;
}

function emptyCentralPreferenceState(): CentralPreferenceState {
  return { gates: new Map(), categories: new Map(), topics: new Map() };
}

function resolveCentralFromState(
  type: NotificationType,
  state: CentralPreferenceState,
): ResolvedCentralNotificationPreferences {
  const event = getNotificationEventDefinition(type);
  return {
    type,
    ...resolveTopicFromState(event.topic, state),
  };
}

function resolveTopicFromState(
  topic: NotificationTopic,
  state: CentralPreferenceState,
  applyGlobalGate = true,
): ResolvedNotificationTopicPreferences {
  const topicDefinition = getNotificationTopicDefinition(topic);
  const entries = NOTIFICATION_CHANNEL_VALUES.map((channel) => {
    const gate =
      state.gates.get(channel) ?? DEFAULT_GLOBAL_CHANNEL_PREFERENCES[channel];
    if (applyGlobalGate && !gate) {
      return [
        channel,
        { enabled: false, source: 'global_channel' as const },
      ] as const;
    }
    const topicValue = state.topics.get(preferenceKey(topic, channel));
    if (topicValue !== undefined) {
      return [
        channel,
        { enabled: topicValue, source: 'topic_override' as const },
      ] as const;
    }
    const categoryValue = state.categories.get(
      preferenceKey(topicDefinition.category, channel),
    );
    if (categoryValue !== undefined) {
      return [
        channel,
        { enabled: categoryValue, source: 'category_override' as const },
      ] as const;
    }
    return [
      channel,
      {
        enabled: topicDefinition.defaults[channelToColumn(channel)],
        source: 'catalog_default' as const,
      },
    ] as const;
  });
  return {
    topic,
    category: topicDefinition.category,
    channels: Object.fromEntries(entries) as Record<
      NotificationChannel,
      CentralChannelPreference
    >,
  };
}

function channelsToLegacyShape(
  channels: Record<NotificationChannel, CentralChannelPreference>,
): NotificationPreferenceDefaults {
  return {
    inAppEnabled: channels[NOTIFICATION_CHANNELS.IN_APP].enabled,
    emailEnabled: channels[NOTIFICATION_CHANNELS.EMAIL].enabled,
    pushEnabled: channels[NOTIFICATION_CHANNELS.WEB_PUSH].enabled,
  };
}

async function resolveTopicChannelInTransaction(
  tx: Prisma.TransactionClient,
  {
    userId,
    topic,
    channel,
  }: {
    userId: string;
    topic: NotificationTopic;
    channel: NotificationChannel;
  },
) {
  const definition = getNotificationTopicDefinition(topic);
  const [topicOverride, categoryOverride] = await Promise.all([
    tx.notificationTopicPreference.findUnique({
      where: { userId_topic_channel: { userId, topic, channel } },
      select: { enabled: true },
    }),
    tx.notificationCategoryPreference.findUnique({
      where: {
        userId_category_channel: {
          userId,
          category: definition.category,
          channel,
        },
      },
      select: { enabled: true },
    }),
  ]);
  return (
    topicOverride?.enabled ??
    categoryOverride?.enabled ??
    definition.defaults[channelToColumn(channel)]
  );
}

async function requireContextAccess(
  tx: Prisma.TransactionClient,
  userId: string,
  context: NotificationContext,
) {
  const accessible =
    context.kind === 'GROUP'
      ? await tx.usersInGiftGroups.findFirst({
          where: { userId, giftGroupId: context.groupId, removedAt: null },
          select: { userId: true },
        })
      : await tx.poolContributor.findUnique({
          where: { poolId_userId: { poolId: context.poolId, userId } },
          select: { userId: true },
        });
  if (!accessible) {
    throw data({ error: 'Notification context not found.' }, { status: 404 });
  }
}

async function resolveContextInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  context: NotificationContext,
): Promise<ResolvedContextNotificationPreference> {
  if (context.kind === 'GROUP') {
    const row = await tx.groupNotificationPreference.findUnique({
      where: { userId_giftGroupId: { userId, giftGroupId: context.groupId } },
    });
    return resolvedContext({
      context,
      row,
      source: row?.activityLevel ? 'group_override' : 'application_default',
      controllingContext: row?.activityLevel ? context : null,
      noticeDismissedAt: row?.noticeDismissedAt ?? null,
      noticeDismissedKey: row?.noticeDismissedKey ?? null,
    });
  }

  const [pool, poolRow] = await Promise.all([
    tx.pool.findUnique({
      where: { id: context.poolId },
      select: { giftGroupId: true },
    }),
    tx.poolNotificationPreference.findUnique({
      where: { userId_poolId: { userId, poolId: context.poolId } },
    }),
  ]);
  if (!pool) {
    throw data({ error: 'Notification context not found.' }, { status: 404 });
  }
  if (poolRow?.activityLevel) {
    return resolvedContext({
      context,
      row: poolRow,
      source: 'pool_override',
      controllingContext: context,
      noticeDismissedAt: poolRow.noticeDismissedAt,
      noticeDismissedKey: poolRow.noticeDismissedKey,
    });
  }
  const groupContext = pool.giftGroupId
    ? ({ kind: 'GROUP', groupId: pool.giftGroupId } as const)
    : null;
  const groupRow = groupContext
    ? await tx.groupNotificationPreference.findUnique({
        where: {
          userId_giftGroupId: {
            userId,
            giftGroupId: groupContext.groupId,
          },
        },
      })
    : null;
  return resolvedContext({
    context,
    row: groupRow,
    source: groupRow?.activityLevel ? 'group_override' : 'application_default',
    controllingContext: groupRow?.activityLevel ? groupContext : null,
    noticeDismissedAt: poolRow?.noticeDismissedAt ?? null,
    noticeDismissedKey: poolRow?.noticeDismissedKey ?? null,
  });
}

async function resolveContextAwarenessInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  context: NotificationContext,
): Promise<ContextNotificationAwareness> {
  const preference = await resolveContextInTransaction(tx, userId, context);
  if (preference.activityLevel === NOTIFICATION_ACTIVITY_LEVELS.MUTED) {
    return {
      preference,
      notificationOff: true,
      reason:
        preference.source === 'group_override' && context.kind === 'POOL'
          ? 'inherited_mute'
          : 'explicit_mute',
      noticeKey: preference.noticeKey,
      noticeVisible: preference.noticeVisible,
    };
  }

  const channelRows = await tx.notificationChannelPreference.findMany({
    where: { userId },
    select: { channel: true, enabled: true, updatedAt: true },
  });
  const disabledChannels = new Map(
    channelRows.map((row) => [row.channel, row] as const),
  );
  const allChannelsDisabled = NOTIFICATION_CHANNEL_VALUES.every(
    (channel) => disabledChannels.get(channel)?.enabled === false,
  );
  if (!allChannelsDisabled) {
    return {
      preference,
      notificationOff: false,
      reason: null,
      noticeKey: null,
      noticeVisible: false,
    };
  }

  const revision = channelRows.reduce(
    (latest, row) => (row.updatedAt > latest ? row.updatedAt : latest),
    new Date(0),
  );
  const noticeKey = `no_channels:GLOBAL:${userId}:${revision.toISOString()}`;
  return {
    preference,
    notificationOff: true,
    reason: 'no_channels',
    noticeKey,
    noticeVisible: preference.noticeDismissedKey !== noticeKey,
  };
}

function resolvedContext({
  context,
  row,
  source,
  controllingContext,
  noticeDismissedAt,
  noticeDismissedKey,
}: {
  context: NotificationContext;
  row: {
    activityLevel: string | null;
    customTopics: string | null;
    mutedAt: Date | null;
  } | null;
  source: ResolvedContextNotificationPreference['source'];
  controllingContext: NotificationContext | null;
  noticeDismissedAt: Date | null;
  noticeDismissedKey: string | null;
}): ResolvedContextNotificationPreference {
  const activityLevel = isNotificationActivityLevel(row?.activityLevel)
    ? row.activityLevel
    : NOTIFICATION_ACTIVITY_LEVELS.IMPORTANT_ONLY;
  const customTopics = deserializeTopics(row?.customTopics);
  const mutedAt =
    activityLevel === NOTIFICATION_ACTIVITY_LEVELS.MUTED
      ? (row?.mutedAt ?? null)
      : null;
  const noticeKey =
    mutedAt && controllingContext
      ? `mute:${controllingContext.kind}:${contextId(controllingContext)}:${mutedAt.toISOString()}`
      : null;
  return {
    context,
    activityLevel,
    source,
    customTopics,
    mutedAt,
    noticeDismissedAt,
    noticeDismissedKey,
    noticeKey,
    noticeVisible: Boolean(noticeKey && noticeDismissedKey !== noticeKey),
    controllingContext,
  };
}

async function findContextPreference(
  tx: Prisma.TransactionClient,
  userId: string,
  context: NotificationContext,
) {
  return context.kind === 'GROUP'
    ? tx.groupNotificationPreference.findUnique({
        where: {
          userId_giftGroupId: { userId, giftGroupId: context.groupId },
        },
      })
    : tx.poolNotificationPreference.findUnique({
        where: { userId_poolId: { userId, poolId: context.poolId } },
      });
}

async function upsertContextPreference(
  tx: Prisma.TransactionClient,
  userId: string,
  context: NotificationContext,
  values: {
    activityLevel: string | null;
    customTopics: string | null;
    mutedAt: Date | null;
    noticeDismissedAt: Date | null | undefined;
    noticeDismissedKey: string | null | undefined;
  },
) {
  const data = {
    activityLevel: values.activityLevel,
    customTopics: values.customTopics,
    mutedAt: values.mutedAt,
    noticeDismissedAt: values.noticeDismissedAt ?? null,
    noticeDismissedKey: values.noticeDismissedKey ?? null,
  };
  if (context.kind === 'GROUP') {
    return tx.groupNotificationPreference.upsert({
      where: { userId_giftGroupId: { userId, giftGroupId: context.groupId } },
      create: { userId, giftGroupId: context.groupId, ...data },
      update: data,
    });
  }
  return tx.poolNotificationPreference.upsert({
    where: { userId_poolId: { userId, poolId: context.poolId } },
    create: { userId, poolId: context.poolId, ...data },
    update: data,
  });
}

function normalizeCustomTopics(topics: Array<NotificationTopic>) {
  return [...new Set(topics)].filter((topic) =>
    NOTIFICATION_TOPIC_VALUES.includes(topic),
  );
}

function serializeTopics(topics: Array<NotificationTopic>) {
  return topics.length ? JSON.stringify(topics) : null;
}

function deserializeTopics(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isNotificationTopic) : [];
  } catch {
    return [];
  }
}

function contextId(context: NotificationContext) {
  return context.kind === 'GROUP' ? context.groupId : context.poolId;
}

function preferenceKey(key: string, channel: string) {
  return `${key}:${channel}`;
}

function serializeActivity(
  value:
    | { activityLevel: string | null; customTopics: string | null }
    | null
    | undefined,
) {
  if (!value?.activityLevel) return null;
  return JSON.stringify({
    activityLevel: value.activityLevel,
    customTopics: deserializeTopics(value.customTopics),
  });
}

type PreferenceAuditValue = string | boolean | null;

async function auditPreferenceChange(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    kind: string;
    preferenceKey?: string | null;
    channel?: string | null;
    contextKind?: string | null;
    contextId?: string | null;
    previousValue: PreferenceAuditValue;
    newValue: PreferenceAuditValue;
    source: string;
  },
) {
  await tx.notificationPreferenceAudit.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      preferenceKey: input.preferenceKey ?? null,
      channel: input.channel ?? null,
      contextKind: input.contextKind ?? null,
      contextId: input.contextId ?? null,
      previousValue: serializeAuditValue(input.previousValue),
      newValue: serializeAuditValue(input.newValue),
      source: input.source,
    },
  });
}

function serializeAuditValue(value: PreferenceAuditValue) {
  return typeof value === 'boolean' ? String(value) : value;
}
