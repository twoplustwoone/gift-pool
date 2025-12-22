import { ANALYTIC_EVENT_SET, type AnalyticEventName } from './analytics.ts';

type TrackOptions = {
  properties?: Record<string, unknown>;
  requestId?: string | null;
  eventId?: string;
  sessionId?: string | null;
};

const RETRY_DELAY_MS = 400;

function generateId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function postAnalytics(
  payload: {
    name: AnalyticEventName;
    eventId: string;
    properties?: Record<string, unknown>;
    requestId?: string | null;
    sessionId?: string | null;
  },
  attempt = 0,
) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        requestId: payload.requestId ?? undefined,
        sessionId: payload.sessionId ?? undefined,
      }),
      keepalive: true,
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (error) {
    if (attempt >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    await postAnalytics(payload, attempt + 1);
  }
}

export function track(
  name: AnalyticEventName,
  properties?: Record<string, unknown>,
  options: TrackOptions = {},
) {
  if (typeof document === 'undefined') return null;
  if (!ANALYTIC_EVENT_SET.has(name)) return null;

  const eventId = options.eventId ?? generateId();

  void postAnalytics({
    name,
    eventId,
    properties,
    requestId: options.requestId ?? undefined,
    sessionId: options.sessionId ?? undefined,
  });

  return eventId;
}
