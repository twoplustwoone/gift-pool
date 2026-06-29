import { type Prisma } from '@prisma/client';
import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import {
  logClientEnvironmentObservation,
  logEvent,
} from '#app/utils/analytics.server.ts';
import {
  type AnalyticEventName,
  ANALYTIC_EVENT_NAMES,
  CLIENT_ENVIRONMENT_EVENT_NAME,
  USER_REQUIRED_EVENTS,
} from '#app/utils/analytics.ts';
import { getUserId } from '#app/utils/auth.server.ts';
import {
  applyRequestIdHeader,
  getRequestContext,
} from '#app/utils/request-context.server.ts';
const AnalyticsEventSchema = z.object({
  name: z.enum(ANALYTIC_EVENT_NAMES),
  properties: z.unknown().optional(),
  requestId: z.string().optional(),
  sessionId: z.string().optional(),
  eventId: z.string().optional(),
});

const ClientEnvironmentPropertiesSchema = z
  .object({
    browserFamily: z.string().min(1).max(40),
    browserMajor: z.number().int().min(0).max(999).nullable(),
    osFamily: z.string().min(1).max(40),
    deviceType: z.enum(['mobile', 'tablet', 'desktop', 'unknown']),
    viewportBucket: z.enum(['mobile', 'tablet', 'desktop', 'unknown']),
    displayMode: z.enum([
      'browser',
      'fullscreen',
      'minimal-ui',
      'standalone',
      'window-controls-overlay',
    ]),
    isStandalone: z.boolean(),
    serviceWorkerSupported: z.boolean(),
    notificationPermission: z.enum([
      'default',
      'denied',
      'granted',
      'unsupported',
    ]),
    observedAt: z.string().datetime(),
  })
  .strict();
export async function loader() {
  return data(
    {
      error: 'Method not allowed',
    },
    {
      status: 405,
    },
  );
}
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return data(
      {
        error: 'Method not allowed',
      },
      {
        status: 405,
      },
    );
  }
  const userId = await getUserId(request);
  const {
    requestId: contextRequestId,
    sessionId,
    visitorId,
  } = await getRequestContext(request);
  let payload: z.infer<typeof AnalyticsEventSchema>;
  try {
    const raw = await request.json();
    const result = AnalyticsEventSchema.safeParse(raw);
    if (!result.success) {
      return data(
        {
          error: 'Invalid payload',
          details: result.error.flatten(),
        },
        {
          status: 400,
        },
      );
    }
    payload = result.data;
  } catch (error) {
    return data(
      {
        error: 'Invalid payload',
        details: (error as Error).message,
      },
      {
        status: 400,
      },
    );
  }
  // Anonymous visitors may post events that don't require a user (e.g.
  // share-page views, invite landings). Anything user-required still 401s.
  if (!userId && USER_REQUIRED_EVENTS.has(payload.name)) {
    return data(
      {
        error: 'Unauthorized',
      },
      {
        status: 401,
      },
    );
  }

  if (payload.name === CLIENT_ENVIRONMENT_EVENT_NAME) {
    const properties = ClientEnvironmentPropertiesSchema.safeParse(
      payload.properties,
    );
    if (!properties.success) {
      return data(
        {
          error: 'Invalid environment payload',
          details: properties.error.flatten(),
        },
        {
          status: 400,
        },
      );
    }
    const event = await logClientEnvironmentObservation({
      userId,
      requestId: payload.requestId ?? contextRequestId,
      sessionId: sessionId ?? payload.sessionId ?? null,
      visitorId,
      properties: properties.data as Prisma.InputJsonValue,
    });
    return data(
      {
        ok: true,
        eventId: event.eventId,
      },
      {
        headers: applyRequestIdHeader(null, contextRequestId),
      },
    );
  }

  const event = await logEvent({
    name: payload.name as AnalyticEventName,
    userId,
    source: 'client',
    requestId: payload.requestId ?? contextRequestId,
    sessionId: sessionId ?? payload.sessionId ?? null,
    visitorId,
    properties: payload.properties as Prisma.InputJsonValue | undefined,
    eventId: payload.eventId,
  });
  return data(
    {
      ok: true,
      eventId: event.eventId,
    },
    {
      headers: applyRequestIdHeader(null, contextRequestId),
    },
  );
}
