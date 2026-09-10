import * as Sentry from '@sentry/react-router';
import { prisma } from '#app/utils/db.server.ts';

// `User.timeZone` is what lets a note be scheduled for the recipient's morning
// while they are offline — the request that delivers it is not theirs, so the
// client hint is not available then. The hint IS available on every document
// request they make, so the root loader remembers it here.
//
// Fire-and-forget, like `queueLogEvent`: a page must never fail, or wait, on
// remembering a time zone. The `not` filter means the common case matches no
// rows and writes nothing, so this is a read on all but the rare request where
// someone has actually moved.
export function queueTimeZoneUpdate(
  userId: string | null,
  timeZone: string | null | undefined,
): void {
  if (!userId || !timeZone) return;
  // The hint is client-supplied. Anything Intl can't use is worse than
  // nothing, because it would send every future note to UTC silently.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    return;
  }
  void prisma.user
    .updateMany({
      // `not` alone would never match: SQL comparisons against NULL are not
      // true, and every existing user's column is NULL — which is exactly the
      // population this needs to fill.
      where: {
        id: userId,
        OR: [{ timeZone: null }, { timeZone: { not: timeZone } }],
      },
      data: { timeZone },
    })
    .catch((error: unknown) => {
      Sentry.captureException(error);
    });
}
