#!/usr/bin/env node
// Entry point for the Fly scheduled Machine that drives the daily
// occasion-reminder sweep (see app/utils/occasion-reminders.server.ts and
// app/routes/api.internal.occasion-reminders.ts).
//
// This script does almost nothing on purpose: it's just the thing Fly's
// scheduler (schedule=daily, a native Fly Machines feature — see
// docs/product below) wakes up once a day to make one authenticated POST.
// All the actual work (and the "only run on the LiteFS primary" logic)
// lives in the route via ensurePrimary(). Runs against the same image as
// the main app process, so INTERNAL_COMMAND_TOKEN and FLY_APP_NAME are
// already present without any extra secrets.
//
// One-time setup (run once from a machine with flyctl + access to this Fly
// app — this script does not do this itself):
//
//   fly machine run . \
//     --app gift-pool-c7cf \
//     --schedule daily \
//     --region ord \
//     --entrypoint "node other/trigger-occasion-reminders.js" \
//     --vm-cpu-kind shared --vm-cpus 1 --vm-memory 256 \
//     --restart no
//
// (Scheduled Machines only support hourly/daily/monthly buckets, not exact
// times — see https://fly.io/docs/blueprints/task-scheduling/.)
//
// Manual test from a shell with INTERNAL_COMMAND_TOKEN set:
//   node other/trigger-occasion-reminders.js

const appName = process.env.FLY_APP_NAME;
const token = process.env.INTERNAL_COMMAND_TOKEN;

if (!token) {
  console.error(
    'trigger-occasion-reminders: INTERNAL_COMMAND_TOKEN is not set, refusing to run.',
  );
  process.exit(1);
}

// The public hostname, deliberately NOT `${appName}.internal`. Two reasons:
// 1. The route relies on ensurePrimary() throwing a fly-replay response when
//    a replica answers, and fly-replay is only honored by Fly's edge proxy —
//    direct 6PN traffic bypasses the proxy, so a replica would answer with a
//    raw 409 instead of the request being re-issued on the primary.
// 2. `.internal` DNS resolves to every started machine in the app —
//    including THIS scheduled machine while the script runs, which isn't
//    listening on any port.
// Fall back to an explicit override for local/manual testing.
const targetUrl =
  process.env.OCCASION_REMINDERS_URL ??
  (appName
    ? `https://${appName}.fly.dev/api/internal/occasion-reminders`
    : 'http://localhost:3000/api/internal/occasion-reminders');

// The body comes from an HTTP response: if the server were ever compromised,
// embedded newlines could forge extra log lines in the scheduler's output
// (Sonar S5145). Collapse whitespace and bound the length.
function sanitizeForLog(text) {
  return text.replace(/\s+/g, ' ').slice(0, 2000);
}

async function main() {
  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    // Bound the run: without this, a hung sweep leaves the scheduled Machine
    // alive (and billed) until someone kills it. The sweep normally finishes
    // in seconds; five minutes is generous.
    signal: AbortSignal.timeout(5 * 60_000),
  });
  const body = sanitizeForLog(await res.text());
  if (!res.ok) {
    console.error(
      `trigger-occasion-reminders: sweep failed (${res.status}): ${body}`,
    );
    process.exit(1);
  }
  console.log(`trigger-occasion-reminders: ${body}`);
}

try {
  await main();
} catch (error) {
  if (error?.name === 'TimeoutError') {
    console.error(
      'trigger-occasion-reminders: request timed out after 5 minutes — the sweep may be hung; check the app logs.',
    );
  } else {
    console.error('trigger-occasion-reminders: request failed', error);
  }
  process.exit(1);
}
