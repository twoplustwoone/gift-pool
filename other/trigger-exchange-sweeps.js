#!/usr/bin/env node
// Entry point for the Fly scheduled Machine that drives the hourly exchange
// sweeps (see app/utils/exchanges.server.ts `runAutoRevealSweep` and
// app/routes/api.internal.exchange-sweeps.ts). Hourly rather than daily
// because the auto-reveal moment is 09:00 in the organizer's time zone, and
// Fly's scheduler only offers hourly/daily/monthly buckets, not exact times.
//
// Like trigger-occasion-reminders.js this script does almost nothing on
// purpose: one authenticated POST. The "only run on the LiteFS primary" logic
// lives in the route via ensurePrimary().
//
// One-time setup (run once from a machine with flyctl + access to this Fly
// app — this script does not do this itself):
//
//   fly machine run . \
//     --app gift-pool-c7cf \
//     --dockerfile other/Dockerfile \
//     --schedule hourly \
//     --region ord \
//     --entrypoint "node other/trigger-exchange-sweeps.js" \
//     --vm-cpu-kind shared --vm-cpus 1 --vm-memory 256 \
//     --restart no
//
// --dockerfile is required: `fly machine run` does NOT read fly.toml's [build]
// dockerfile setting. Run from the repo root so `other/Dockerfile` resolves.
//
// Manual test from a shell with INTERNAL_COMMAND_TOKEN set:
//   node other/trigger-exchange-sweeps.js

const appName = process.env.FLY_APP_NAME;
const token = process.env.INTERNAL_COMMAND_TOKEN;

if (!token) {
  console.error(
    'trigger-exchange-sweeps: INTERNAL_COMMAND_TOKEN is not set, refusing to run.',
  );
  process.exit(1);
}

// The public hostname, deliberately NOT `${appName}.internal` — see
// trigger-occasion-reminders.js for why (fly-replay is proxy-only, and
// .internal resolves to this scheduled machine too).
const targetUrl =
  process.env.EXCHANGE_SWEEPS_URL ??
  (appName
    ? `https://${appName}.fly.dev/api/internal/exchange-sweeps`
    : 'http://localhost:3000/api/internal/exchange-sweeps');

function sanitizeForLog(text) {
  return text.replace(/\s+/g, ' ').slice(0, 2000);
}

async function main() {
  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5 * 60_000),
  });
  const body = sanitizeForLog(await res.text());
  if (!res.ok) {
    console.error(
      `trigger-exchange-sweeps: sweep failed (${res.status}): ${body}`,
    );
    process.exit(1);
  }
  console.log(`trigger-exchange-sweeps: ${body}`);
}

try {
  await main();
} catch (error) {
  if (error?.name === 'TimeoutError') {
    console.error(
      'trigger-exchange-sweeps: request timed out after 5 minutes — the sweep may be hung; check the app logs.',
    );
  } else {
    console.error('trigger-exchange-sweeps: request failed', error);
  }
  process.exit(1);
}
