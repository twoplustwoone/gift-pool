import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { captureException } from '@sentry/react-router';
import {
  ANALYTIC_EVENT_SET,
  ANALYTIC_EVENT_NAMES,
  CLIENT_ENVIRONMENT_EVENT_NAME,
  type AnalyticEventName,
  type AnalyticsExplorerDays,
  type AnalyticsExplorerEventFilter,
  type AnalyticsExplorerGroupBy,
  type AnalyticsExplorerResult,
  type AnalyticsExplorerSeriesRow,
  PWA_ANALYTIC_EVENT_NAMES,
  USER_REQUIRED_EVENTS,
} from './analytics.ts';
import { prisma } from './db.server.ts';

export type AnalyticEventSource = 'client' | 'server';

export const ANALYTIC_DEDUPE_WINDOW_MS = 1000 * 60 * 5;

type LogEventInput = {
  name: AnalyticEventName;
  userId?: string | null;
  source: AnalyticEventSource;
  requestId?: string | null;
  sessionId?: string | null;
  visitorId?: string | null;
  properties?: Prisma.InputJsonValue | null;
  eventId?: string;
  createdAt?: Date;
};

type LogClientEnvironmentInput = {
  userId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  visitorId: string;
  properties: Prisma.InputJsonValue;
  createdAt?: Date;
};

function serializeProperties(properties?: Prisma.InputJsonValue | null) {
  if (typeof properties === 'undefined' || properties === null) return null;
  try {
    return JSON.stringify(properties);
  } catch (error) {
    console.warn('Failed to serialize analytics properties', error);
    return JSON.stringify({ error: 'serialization_failed' });
  }
}

function assertValidEventName(name: string): asserts name is AnalyticEventName {
  if (!ANALYTIC_EVENT_SET.has(name)) {
    throw new Error(`Invalid analytics event name: ${name}`);
  }
}

export function getClientEnvironmentEventId(
  visitorId: string,
  date = new Date(),
) {
  return `client-environment:${visitorId}:${formatDateKey(date)}`;
}

function isUniqueEventIdError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    (error.meta?.target as Array<string>).includes('eventId')
  );
}

type RecoverFromConflictArgs = {
  resolvedEventId: string;
  source: AnalyticEventSource;
  userId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  visitorId?: string | null;
  serializedProperties: string | null;
};

// Recover from a P2002 unique-violation on `eventId`. If a row already
// exists, prefer the server payload: when the current write is
// `source: 'server'` and the existing row is `source: 'client'`, upgrade
// it in place so richer properties from the loader/action win the race
// against the client echo fired via `/api/analytics`. Otherwise, return
// the existing row unchanged (normal dedup).
async function recoverFromEventIdConflict({
  resolvedEventId,
  source,
  userId,
  requestId,
  sessionId,
  visitorId,
  serializedProperties,
}: RecoverFromConflictArgs) {
  const existing = await prisma.analyticsEvent.findUnique({
    where: { eventId: resolvedEventId },
  });
  if (!existing) return null;
  if (source !== 'server' || existing.source === 'server') return existing;
  return prisma.analyticsEvent.update({
    where: { eventId: resolvedEventId },
    data: {
      source: 'server',
      userId: userId ?? existing.userId,
      requestId: requestId ?? existing.requestId,
      sessionId: sessionId ?? existing.sessionId,
      visitorId: visitorId ?? existing.visitorId,
      properties: serializedProperties ?? existing.properties,
    },
  });
}

export async function logEvent({
  name,
  userId,
  source,
  requestId,
  sessionId,
  visitorId,
  properties,
  eventId,
  createdAt,
}: LogEventInput) {
  assertValidEventName(name);
  if (USER_REQUIRED_EVENTS.has(name) && !userId) {
    throw new Error(`userId is required for analytics event "${name}"`);
  }

  const resolvedEventId = eventId ?? randomUUID();
  const resolvedCreatedAt = createdAt ?? new Date();
  const serializedProperties = serializeProperties(properties);
  const fallbackDedupeStart = new Date(
    resolvedCreatedAt.getTime() - ANALYTIC_DEDUPE_WINDOW_MS,
  );

  if (!eventId && requestId && userId) {
    const existing = await prisma.analyticsEvent.findFirst({
      where: {
        name,
        requestId,
        userId,
        createdAt: { gte: fallbackDedupeStart },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;
  }

  try {
    return await prisma.analyticsEvent.create({
      data: {
        eventId: resolvedEventId,
        name,
        userId: userId ?? null,
        source,
        requestId: requestId ?? null,
        sessionId: sessionId ?? null,
        visitorId: visitorId ?? null,
        properties: serializedProperties,
        createdAt: resolvedCreatedAt,
      },
    });
  } catch (error) {
    if (!isUniqueEventIdError(error)) throw error;
    const recovered = await recoverFromEventIdConflict({
      resolvedEventId,
      source,
      userId,
      requestId,
      sessionId,
      visitorId,
      serializedProperties,
    });
    if (recovered) return recovered;
    throw error;
  }
}

export async function logClientEnvironmentObservation({
  userId,
  requestId,
  sessionId,
  visitorId,
  properties,
  createdAt,
}: LogClientEnvironmentInput) {
  const resolvedCreatedAt = createdAt ?? new Date();
  const eventId = getClientEnvironmentEventId(visitorId, resolvedCreatedAt);
  const serializedProperties = serializeProperties(properties);

  const updateExisting = async () => {
    const existing = await prisma.analyticsEvent.findUnique({
      where: { eventId },
    });
    if (!existing) return null;
    return prisma.analyticsEvent.update({
      where: { eventId },
      data: {
        userId: userId ?? existing.userId,
        requestId: requestId ?? existing.requestId,
        sessionId: sessionId ?? existing.sessionId,
        visitorId,
        properties: serializedProperties ?? existing.properties,
      },
    });
  };

  const updated = await updateExisting();
  if (updated) return updated;

  try {
    return await prisma.analyticsEvent.create({
      data: {
        eventId,
        name: CLIENT_ENVIRONMENT_EVENT_NAME,
        userId: userId ?? null,
        source: 'client',
        requestId: requestId ?? null,
        sessionId: sessionId ?? null,
        visitorId,
        properties: serializedProperties,
        createdAt: resolvedCreatedAt,
      },
    });
  } catch (error) {
    if (!isUniqueEventIdError(error)) throw error;
    const recovered = await updateExisting();
    if (recovered) return recovered;
    throw error;
  }
}

/**
 * Fire `logEvent` without awaiting the DB write. Pre-generates `eventId`
 * synchronously so action handlers and loaders can echo it back to the
 * client immediately. Errors in the background write are sent to Sentry.
 *
 * Use this on hot paths (action/loader responses). Keep `logEvent` for
 * callers that genuinely need the persisted row before returning — e.g.
 * the `api.analytics` endpoint, which fans out from a `sendBeacon`.
 */
// In-flight background writes, so tests can drain them before resetting the
// database — an un-awaited create colliding with cleanup's DELETE transaction
// produced CI-only failures in whichever test ran next. Negligible runtime
// cost in production (one Set add/delete per queued event).
const inFlightWrites = new Set<Promise<unknown>>();

/** Await every queued background write (test hook — see db-setup). */
export async function drainQueuedAnalytics(): Promise<void> {
  await Promise.allSettled([...inFlightWrites]);
}

export function queueLogEvent(input: LogEventInput): { eventId: string } {
  // Run validation synchronously so misuse surfaces as a fast throw in dev
  // instead of a silent Sentry-only failure.
  assertValidEventName(input.name);
  if (USER_REQUIRED_EVENTS.has(input.name) && !input.userId) {
    throw new Error(`userId is required for analytics event "${input.name}"`);
  }
  const eventId = input.eventId ?? randomUUID();
  const write = logEvent({ ...input, eventId }).catch((error: unknown) => {
    captureException(error);
  });
  inFlightWrites.add(write);
  void write.finally(() => inFlightWrites.delete(write));
  return { eventId };
}

export type AnalyticsCounts = {
  totalUsers: number;
  dau: number;
  wau: number;
  mau: number;
  dailyActive: Array<{ date: string; count: number }>;
  eventsLast7Days: Array<{ name: AnalyticEventName; count: number }>;
  eventsLast30Days: Array<{ name: AnalyticEventName; count: number }>;
};

export type EnvironmentBreakdownRow = {
  label: string;
  count: number;
  percent: number;
};

export type EnvironmentAnalytics = {
  totalObservations: number;
  uniqueVisitors: number;
  standaloneObservations: number;
  browserObservations: number;
  standalonePercent: number;
  browsers: EnvironmentBreakdownRow[];
  operatingSystems: EnvironmentBreakdownRow[];
  deviceTypes: EnvironmentBreakdownRow[];
  viewportBuckets: EnvironmentBreakdownRow[];
  displayModes: EnvironmentBreakdownRow[];
  pwaFunnel: EnvironmentBreakdownRow[];
};

const DAY_MS = 1000 * 60 * 60 * 24;

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseProperties(properties: string | null) {
  if (!properties) return null;
  try {
    return JSON.parse(properties) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function increment(map: Map<string, number>, value: unknown) {
  const label =
    typeof value === 'string' && value.length > 0 ? value : 'Unknown';
  map.set(label, (map.get(label) ?? 0) + 1);
}

function getBrowserLabel(properties: Record<string, unknown> | null) {
  const family =
    typeof properties?.browserFamily === 'string' &&
    properties.browserFamily.length > 0
      ? properties.browserFamily
      : 'Unknown';
  const major =
    typeof properties?.browserMajor === 'number' &&
    Number.isFinite(properties.browserMajor)
      ? Math.trunc(properties.browserMajor)
      : null;
  return major === null || family === 'Unknown' ? family : `${family} ${major}`;
}

function getAnalyticsExplorerWhereSql(
  since: Date,
  eventName: AnalyticsExplorerEventFilter,
) {
  return Prisma.sql`
    createdAt >= ${since.getTime()}
    ${eventName === 'all' ? Prisma.empty : Prisma.sql`AND name = ${eventName}`}
  `;
}

function getJsonTextGroupSql(path: string) {
  return Prisma.sql`
    CASE
      WHEN json_valid(properties)
        THEN COALESCE(NULLIF(json_extract(properties, ${path}), ''), 'Unknown')
      ELSE 'Unknown'
    END
  `;
}

function getBrowserGroupSql() {
  return Prisma.sql`
    CASE
      WHEN json_valid(properties) THEN
        CASE
          WHEN NULLIF(json_extract(properties, '$.browserFamily'), '') IS NULL
            THEN 'Unknown'
          WHEN json_extract(properties, '$.browserFamily') = 'Unknown'
            THEN 'Unknown'
          WHEN typeof(json_extract(properties, '$.browserMajor')) IN ('integer', 'real')
            THEN json_extract(properties, '$.browserFamily') || ' ' || CAST(CAST(json_extract(properties, '$.browserMajor') AS INTEGER) AS TEXT)
          ELSE json_extract(properties, '$.browserFamily')
        END
      ELSE 'Unknown'
    END
  `;
}

function getStandaloneGroupSql() {
  return Prisma.sql`
    CASE
      WHEN json_valid(properties) AND json_extract(properties, '$.isStandalone') = 1
        THEN 'Standalone'
      WHEN json_valid(properties) AND json_extract(properties, '$.isStandalone') = 0
        THEN 'Browser'
      ELSE 'Unknown'
    END
  `;
}

function getExplorerGroupSql(groupBy: AnalyticsExplorerGroupBy) {
  switch (groupBy) {
    case 'event':
      return Prisma.sql`COALESCE(NULLIF(name, ''), 'Unknown')`;
    case 'source':
      return Prisma.sql`COALESCE(NULLIF(source, ''), 'Unknown')`;
    case 'browser':
      return getBrowserGroupSql();
    case 'os':
      return getJsonTextGroupSql('$.osFamily');
    case 'device':
      return getJsonTextGroupSql('$.deviceType');
    case 'viewport':
      return getJsonTextGroupSql('$.viewportBucket');
    case 'displayMode':
      return getJsonTextGroupSql('$.displayMode');
    case 'standalone':
      return getStandaloneGroupSql();
  }
}

function getPropertiesPreview(properties: string | null) {
  if (!properties) return '—';
  const parsed = parseProperties(properties);
  if (!parsed) return 'Invalid JSON';
  const preview = JSON.stringify(parsed);
  return preview.length > 240 ? `${preview.slice(0, 240)}...` : preview;
}

function toBreakdownRows(
  map: Map<string, number>,
  total: number,
): EnvironmentBreakdownRow[] {
  return [...map.entries()]
    .map(([label, count]) => ({
      label,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const PWA_FUNNEL_LABELS: Array<{
  name: (typeof PWA_ANALYTIC_EVENT_NAMES)[number];
  label: string;
}> = [
  { name: 'pwa_prompt_available', label: 'Prompt available' },
  { name: 'pwa_install_clicked', label: 'Install clicked' },
  { name: 'pwa_install_accepted', label: 'Install accepted' },
  { name: 'pwa_install_dismissed', label: 'Install dismissed' },
  { name: 'pwa_appinstalled', label: 'App installed' },
  { name: 'pwa_launched_standalone', label: 'Standalone launches' },
];

export async function getEnvironmentAnalytics({
  days = 30,
  now = new Date(),
}: {
  days?: number;
  now?: Date;
} = {}): Promise<EnvironmentAnalytics> {
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const since = new Date(startOfToday.getTime() - DAY_MS * (days - 1));
  const names = [
    CLIENT_ENVIRONMENT_EVENT_NAME,
    ...PWA_ANALYTIC_EVENT_NAMES,
  ] as Array<AnalyticEventName>;

  const events = await prisma.analyticsEvent.findMany({
    where: {
      name: { in: names },
      createdAt: { gte: since },
    },
    select: {
      eventId: true,
      name: true,
      userId: true,
      visitorId: true,
      properties: true,
    },
  });

  const browserCounts = new Map<string, number>();
  const osCounts = new Map<string, number>();
  const deviceCounts = new Map<string, number>();
  const viewportCounts = new Map<string, number>();
  const displayModeCounts = new Map<string, number>();
  const uniqueVisitors = new Set<string>();
  const pwaCounts = new Map<AnalyticEventName, number>();
  let totalObservations = 0;
  let standaloneObservations = 0;

  for (const event of events) {
    if (event.name !== CLIENT_ENVIRONMENT_EVENT_NAME) {
      const name = event.name as AnalyticEventName;
      pwaCounts.set(name, (pwaCounts.get(name) ?? 0) + 1);
      continue;
    }

    totalObservations += 1;
    uniqueVisitors.add(event.visitorId ?? event.userId ?? event.eventId);
    const properties = parseProperties(event.properties);
    increment(browserCounts, getBrowserLabel(properties));
    increment(osCounts, properties?.osFamily);
    increment(deviceCounts, properties?.deviceType);
    increment(viewportCounts, properties?.viewportBucket);
    increment(displayModeCounts, properties?.displayMode);
    if (properties?.isStandalone === true) {
      standaloneObservations += 1;
    }
  }

  const browserObservations = totalObservations - standaloneObservations;

  return {
    totalObservations,
    uniqueVisitors: uniqueVisitors.size,
    standaloneObservations,
    browserObservations,
    standalonePercent:
      totalObservations > 0
        ? Math.round((standaloneObservations / totalObservations) * 100)
        : 0,
    browsers: toBreakdownRows(browserCounts, totalObservations),
    operatingSystems: toBreakdownRows(osCounts, totalObservations),
    deviceTypes: toBreakdownRows(deviceCounts, totalObservations),
    viewportBuckets: toBreakdownRows(viewportCounts, totalObservations),
    displayModes: toBreakdownRows(displayModeCounts, totalObservations),
    pwaFunnel: PWA_FUNNEL_LABELS.map(({ name, label }) => ({
      label,
      count: pwaCounts.get(name) ?? 0,
      percent: 0,
    })),
  };
}

export async function getAnalyticsExplorer({
  days = 30,
  eventName = 'all',
  groupBy = 'event',
  now = new Date(),
  limit = 50,
}: {
  days?: AnalyticsExplorerDays;
  eventName?: AnalyticsExplorerEventFilter;
  groupBy?: AnalyticsExplorerGroupBy;
  now?: Date;
  limit?: number;
} = {}): Promise<AnalyticsExplorerResult> {
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const since = new Date(startOfToday.getTime() - DAY_MS * (days - 1));
  const requestedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 50;
  const safeLimit = Math.max(1, Math.min(requestedLimit, 100));
  const whereSql = getAnalyticsExplorerWhereSql(since, eventName);
  const groupSql = getExplorerGroupSql(groupBy);

  const [totalRows, seriesRows, breakdownRows, recentEvents] =
    await Promise.all([
      prisma.$queryRaw<
        Array<{
          totalEvents: bigint | number | null;
          uniqueUsers: bigint | number | null;
          uniqueVisitors: bigint | number | null;
        }>
      >`
        SELECT
          COUNT(*) AS totalEvents,
          COUNT(DISTINCT userId) AS uniqueUsers,
          COUNT(DISTINCT visitorId) AS uniqueVisitors
        FROM AnalyticsEvent
        WHERE ${whereSql}
      `,
      prisma.$queryRaw<
        Array<{ date: string | null; count: bigint | number | null }>
      >`
        SELECT date(createdAt / 1000, 'unixepoch') AS date, COUNT(*) AS count
        FROM AnalyticsEvent
        WHERE ${whereSql}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<
        Array<{ label: string | null; count: bigint | number | null }>
      >`
        SELECT ${groupSql} AS label, COUNT(*) AS count
        FROM AnalyticsEvent
        WHERE ${whereSql}
        GROUP BY 1
        ORDER BY count DESC, label ASC
      `,
      prisma.analyticsEvent.findMany({
        where: {
          createdAt: { gte: since },
          ...(eventName === 'all' ? {} : { name: eventName }),
        },
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        select: {
          id: true,
          eventId: true,
          name: true,
          source: true,
          userId: true,
          visitorId: true,
          properties: true,
          createdAt: true,
        },
      }),
    ]);

  const totals = totalRows[0];
  const totalEvents = Number(totals?.totalEvents ?? 0);
  const seriesCounts = new Map(
    seriesRows
      .filter((row): row is { date: string; count: bigint | number | null } =>
        Boolean(row.date),
      )
      .map((row) => [row.date, Number(row.count ?? 0)]),
  );
  const series: AnalyticsExplorerSeriesRow[] = [];
  for (
    let date = new Date(since);
    date <= startOfToday;
    date = new Date(date.getTime() + DAY_MS)
  ) {
    const key = formatDateKey(date);
    series.push({ date: key, count: seriesCounts.get(key) ?? 0 });
  }

  return {
    days,
    eventName,
    groupBy,
    totalEvents,
    uniqueUsers: Number(totals?.uniqueUsers ?? 0),
    uniqueVisitors: Number(totals?.uniqueVisitors ?? 0),
    series,
    breakdown: breakdownRows.map((row) => {
      const count = Number(row.count ?? 0);
      return {
        label: row.label ?? 'Unknown',
        count,
        percent: totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0,
      };
    }),
    recentEvents: recentEvents.map((event) => ({
      id: event.id,
      eventId: event.eventId,
      name: event.name,
      source: event.source,
      createdAt: event.createdAt.toISOString(),
      userId: event.userId,
      visitorId: event.visitorId,
      propertiesPreview: getPropertiesPreview(event.properties),
    })),
  };
}

export async function getAnalyticsCounts(
  now = new Date(),
): Promise<AnalyticsCounts> {
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startOfLast7 = new Date(startOfToday.getTime() - DAY_MS * 6);
  const startOfLast30 = new Date(startOfToday.getTime() - DAY_MS * 29);

  const [recentEvents, totalUsers] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: startOfLast30 } },
      select: { createdAt: true, userId: true, name: true },
    }),
    prisma.user.count(),
  ]);

  const activeToday = new Set<string>();
  const active7 = new Set<string>();
  const active30 = new Set<string>();
  const dailyActive = new Map<string, Set<string>>();
  const eventCounts7 = new Map<AnalyticEventName, number>();
  const eventCounts30 = new Map<AnalyticEventName, number>();

  for (const name of ANALYTIC_EVENT_SET) {
    eventCounts7.set(name as AnalyticEventName, 0);
    eventCounts30.set(name as AnalyticEventName, 0);
  }

  for (const event of recentEvents) {
    const dayKey = formatDateKey(event.createdAt);
    if (event.userId) {
      const daySet = dailyActive.get(dayKey) ?? new Set<string>();
      daySet.add(event.userId);
      dailyActive.set(dayKey, daySet);

      active30.add(event.userId);
      if (event.createdAt >= startOfLast7) {
        active7.add(event.userId);
      }
      if (event.createdAt >= startOfToday) {
        activeToday.add(event.userId);
      }
    }
    const count30 = eventCounts30.get(event.name as AnalyticEventName) ?? 0;
    eventCounts30.set(event.name as AnalyticEventName, count30 + 1);
    if (event.createdAt >= startOfLast7) {
      const count7 = eventCounts7.get(event.name as AnalyticEventName) ?? 0;
      eventCounts7.set(event.name as AnalyticEventName, count7 + 1);
    }
  }

  const dailyActiveSeries: Array<{ date: string; count: number }> = [];
  for (
    let date = new Date(startOfLast30);
    date <= startOfToday;
    date = new Date(date.getTime() + DAY_MS)
  ) {
    const key = formatDateKey(date);
    dailyActiveSeries.push({
      date: key,
      count: dailyActive.get(key)?.size ?? 0,
    });
  }

  const eventsLast7Days = ANALYTIC_EVENT_NAMES.map((name) => ({
    name,
    count: eventCounts7.get(name) ?? 0,
  }));

  const eventsLast30Days = ANALYTIC_EVENT_NAMES.map((name) => ({
    name,
    count: eventCounts30.get(name) ?? 0,
  }));

  return {
    totalUsers,
    dau: activeToday.size,
    wau: active7.size,
    mau: active30.size,
    dailyActive: dailyActiveSeries,
    eventsLast7Days,
    eventsLast30Days,
  };
}
