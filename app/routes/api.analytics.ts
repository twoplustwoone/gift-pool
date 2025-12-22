import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { z } from 'zod';
import { type AnalyticEventName, ANALYTIC_EVENT_NAMES } from '#app/utils/analytics.ts';
import { logEvent } from '#app/utils/analytics.server.ts';
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

export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const userId = await getUserId(request);
  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { requestId: contextRequestId, sessionId } =
    await getRequestContext(request);

  let payload: z.infer<typeof AnalyticsEventSchema>;
  try {
    const raw = await request.json();
    const result = AnalyticsEventSchema.safeParse(raw);
    if (!result.success) {
      return json(
        { error: 'Invalid payload', details: result.error.flatten() },
        { status: 400 },
      );
    }
    payload = result.data;
  } catch (error) {
    return json(
      { error: 'Invalid payload', details: (error as Error).message },
      { status: 400 },
    );
  }

  const event = await logEvent({
    name: payload.name as AnalyticEventName,
    userId,
    source: 'client',
    requestId: payload.requestId ?? contextRequestId,
    sessionId: sessionId ?? payload.sessionId ?? null,
    properties: payload.properties,
    eventId: payload.eventId,
  });

  return json(
    { ok: true, eventId: event.eventId },
    { headers: applyRequestIdHeader(null, contextRequestId) },
  );
}
