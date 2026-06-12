import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { captureException } from '@sentry/react-router';
import {
  ANALYTIC_EVENT_SET,
  ANALYTIC_EVENT_NAMES,
  type AnalyticEventName,
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

/**
 * Fire `logEvent` without awaiting the DB write. Pre-generates `eventId`
 * synchronously so action handlers and loaders can echo it back to the
 * client immediately. Errors in the background write are sent to Sentry.
 *
 * Use this on hot paths (action/loader responses). Keep `logEvent` for
 * callers that genuinely need the persisted row before returning — e.g.
 * the `api.analytics` endpoint, which fans out from a `sendBeacon`.
 */
export function queueLogEvent(input: LogEventInput): { eventId: string } {
  // Run validation synchronously so misuse surfaces as a fast throw in dev
  // instead of a silent Sentry-only failure.
  assertValidEventName(input.name);
  if (USER_REQUIRED_EVENTS.has(input.name) && !input.userId) {
    throw new Error(`userId is required for analytics event "${input.name}"`);
  }
  const eventId = input.eventId ?? randomUUID();
  void logEvent({ ...input, eventId }).catch((error: unknown) => {
    captureException(error);
  });
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

const DAY_MS = 1000 * 60 * 60 * 24;

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
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
