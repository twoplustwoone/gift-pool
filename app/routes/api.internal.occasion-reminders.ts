// Trigger endpoint for the daily occasion-reminder sweep (see
// occasion-reminders.server.ts and docs/product/giftpool-vision-spine.md,
// "beat 2"). Called by a Fly scheduled Machine — see
// other/trigger-occasion-reminders.js for the caller and the `fly machine
// run --schedule=daily` command that creates it.
//
// Not exposed to the browser: gated by INTERNAL_COMMAND_TOKEN (the same
// bearer-token pattern used by admin+/cache_.sqlite.server.ts), and by
// ensurePrimary() so it always executes the actual DB writes on the LiteFS
// primary. NOTE: the fly-replay response ensurePrimary throws is only
// honored by Fly's edge proxy — callers MUST reach this route through the
// public hostname, not over 6PN/.internal, or a replica will answer with a
// raw 409 instead of replaying (see other/trigger-occasion-reminders.js).
import * as Sentry from '@sentry/react-router';
import { data, type ActionFunctionArgs } from 'react-router';
import { ensurePrimary } from '#app/utils/litefs.server.ts';
import { runOccasionReminderSweep } from '#app/utils/occasion-reminders.server.ts';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  // The Boolean(token) guard matters: env validation should make an unset
  // token unreachable, but without it a missing env var would make
  // `Bearer undefined` a valid credential.
  const token = process.env.INTERNAL_COMMAND_TOKEN;
  const isAuthorized =
    Boolean(token) &&
    request.headers.get('Authorization') === `Bearer ${token}`;
  if (!isAuthorized) {
    return data({ error: 'Unauthorized' }, { status: 401 });
  }

  // Throws a fly-replay response if this instance isn't primary; Fly's edge
  // proxy re-issues the request there and only the final response reaches
  // the caller, so this is safe to call from any instance.
  await ensurePrimary();

  try {
    const summary = await runOccasionReminderSweep();
    return data({ success: true, ...summary });
  } catch (error) {
    Sentry.captureException(error);
    return data({ success: false, error: 'Sweep failed' }, { status: 500 });
  }
}
