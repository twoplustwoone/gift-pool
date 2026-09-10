// Trigger endpoint for the hourly exchange sweeps (auto-reveal now; the
// morning note batch in Phase B). Called by a Fly scheduled Machine — see
// other/trigger-exchange-sweeps.js for the caller and the `fly machine run
// --schedule=hourly` command that creates it.
//
// Same shape as api.internal.occasion-reminders.ts: gated by
// INTERNAL_COMMAND_TOKEN, then ensurePrimary() so the writes happen on the
// LiteFS primary. Callers MUST reach this route through the public hostname —
// fly-replay is only honored by Fly's edge proxy.
import * as Sentry from '@sentry/react-router';
import { data, type ActionFunctionArgs } from 'react-router';
import { runAutoRevealSweep } from '#app/utils/exchanges.server.ts';
import { verifyInternalCommandToken } from '#app/utils/internal-command.server.ts';
import { ensurePrimary } from '#app/utils/litefs.server.ts';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  if (!verifyInternalCommandToken(request)) {
    return data({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensurePrimary();

  try {
    const autoReveal = await runAutoRevealSweep();
    return data({ success: true, autoReveal });
  } catch (error) {
    Sentry.captureException(error);
    return data({ success: false, error: 'Sweep failed' }, { status: 500 });
  }
}
