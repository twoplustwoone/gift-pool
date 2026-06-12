import { randomUUID } from 'node:crypto';
import { sessionKey } from './auth.server.ts';
import { authSessionStorage } from './session.server.ts';
import { ensureVisitorId } from './visitor-id.server.ts';

export const REQUEST_ID_HEADER = 'X-Request-ID';

function readIncomingRequestId(request: Request) {
  return (
    request.headers.get(REQUEST_ID_HEADER) ??
    request.headers.get(REQUEST_ID_HEADER.toLowerCase())
  );
}

export async function getRequestContext(request: Request) {
  const requestId = readIncomingRequestId(request) ?? randomUUID();
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie'),
  );
  const sessionId = authSession.get(sessionKey) ?? null;
  // ensure (not just read): on a first visit the cookie doesn't exist yet,
  // but events logged during that request must carry the same id the root
  // loader is about to set. See visitor-id.server.ts.
  const { visitorId } = ensureVisitorId(request);

  return { requestId, sessionId, visitorId };
}

export function applyRequestIdHeader(
  headers: ResponseInit['headers'] | null | undefined,
  requestId: string,
) {
  const nextHeaders = new Headers(headers ?? undefined);
  nextHeaders.set(REQUEST_ID_HEADER, requestId);
  return nextHeaders;
}
