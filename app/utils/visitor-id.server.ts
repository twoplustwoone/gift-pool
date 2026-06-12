import { randomUUID } from 'node:crypto';
import * as cookie from 'cookie';

// First-party anonymous visitor id for drop-off analytics. Lets us see
// share-link and invite-link landings (and their conversion to signup)
// without an account. Random UUID, no PII, never sent to third parties.
const cookieName = 'gp_visitor';

// 400 days — Chrome's hard cap on cookie lifetime; refreshed on each visit.
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getVisitorId(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  const parsed = cookie.parse(cookieHeader)[cookieName];
  // Only trust well-formed UUIDs so a tampered cookie can't inject junk
  // (or someone else's identifier) into AnalyticsEvent.
  return parsed && UUID_RE.test(parsed) ? parsed : null;
}

export function ensureVisitorId(request: Request): {
  visitorId: string;
  setCookieHeader: string | null;
} {
  const existing = getVisitorId(request);
  const visitorId = existing ?? randomUUID();
  return {
    visitorId,
    // Refresh the cookie even when it exists so active visitors never age out.
    setCookieHeader: cookie.serialize(cookieName, visitorId, {
      path: '/',
      maxAge: VISITOR_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    }),
  };
}
