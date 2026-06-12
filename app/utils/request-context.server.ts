import { randomUUID } from 'node:crypto';
import { sessionKey } from './auth.server.ts';
import { authSessionStorage } from './session.server.ts';
import { getVisitorId } from './visitor-id.server.ts';

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
  const visitorId = getVisitorId(request);

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
