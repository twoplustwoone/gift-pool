import { randomUUID } from 'node:crypto';
import * as cookie from 'cookie';
import { secureCookies } from './env.server.ts';

// First-party anonymous visitor id for drop-off analytics. Lets us see
// share-link and invite-link landings (and their conversion to signup)
// without an account. Random UUID, no PII, never sent to third parties.
const cookieName = 'gp_visitor';

// 400 days — Chrome's hard cap on cookie lifetime; refreshed on each visit.
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// On a first visit the cookie doesn't exist yet, but all loaders of that
// document request (root + child) must still agree on one id: the child
// loader logs invite_landed/share_viewed with it while the root loader's
// Set-Cookie persists it. React Router clones the Request per loader, so
// per-Request state can't unify them — the express middleware in
// server/index.ts resolves one id per HTTP request and injects it as the
// x-visitor-id header (inbound values are discarded, so it can't be
// spoofed). The WeakMap is a fallback for contexts without that
// middleware (unit tests, non-express entries) so repeated calls within
// one loader still agree.
const generatedIds = new WeakMap<Request, string>();

export function getVisitorId(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  const parsed = cookieHeader
    ? cookie.parse(cookieHeader)[cookieName]
    : undefined;
  // Only trust well-formed UUIDs so a tampered cookie can't inject junk
  // (or someone else's identifier) into AnalyticsEvent.
  if (parsed && UUID_RE.test(parsed)) return parsed;
  const injected = request.headers.get('x-visitor-id');
  if (injected && UUID_RE.test(injected)) return injected;
  return null;
}

export function ensureVisitorId(request: Request): {
  visitorId: string;
  setCookieHeader: string | null;
} {
  let visitorId = getVisitorId(request) ?? generatedIds.get(request);
  if (!visitorId) {
    visitorId = randomUUID();
    generatedIds.set(request, visitorId);
  }
  return {
    visitorId,
    // Refresh the cookie even when it exists so active visitors never age out.
    setCookieHeader: cookie.serialize(cookieName, visitorId, {
      path: '/',
      maxAge: VISITOR_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
    }),
  };
}
