import { randomUUID } from 'node:crypto';
import { authSessionStorage } from './session.server.ts';
import { sessionKey } from './auth.server.ts';

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

  return { requestId, sessionId };
}

export function applyRequestIdHeader(
  headers: ResponseInit['headers'] | null | undefined,
  requestId: string,
) {
  const nextHeaders = new Headers(headers ?? undefined);
  nextHeaders.set(REQUEST_ID_HEADER, requestId);
  return nextHeaders;
}
