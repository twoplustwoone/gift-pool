import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as Sentry from '@sentry/react-router';
import { afterAll, expect, test } from 'vitest';

// Sentry keeps one isolation scope per request through OpenTelemetry's async
// context. That only works if every Sentry package talks to the SAME copy of
// @opentelemetry/api: with two copies the context manager registers on one
// and the other falls back to a no-op, so all concurrent server requests share
// a single scope. `Sentry.setUser` in getUserId would then tag errors with
// whichever user's request touched the scope last. This happened in Nov 2026
// when a Renovate automerge lifted the API to 1.10 while @sentry/node pinned
// <1.10 (and .npmrc's legacy-peer-deps hid the conflict). See renovate.json.

const SENTRY_OTEL_CONSUMERS = [
  '@sentry/node',
  '@sentry/node-core',
  '@sentry/opentelemetry',
];

function packageDir(name: string, from: string) {
  const entry = createRequire(from).resolve(name);
  let dir = path.dirname(entry);
  while (!dir.endsWith(path.join('node_modules', ...name.split('/')))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Could not locate ${name}`);
    dir = parent;
  }
  return dir;
}

test('every Sentry server package resolves one shared @opentelemetry/api', () => {
  const sentryNode = packageDir('@sentry/node', import.meta.url);
  const resolved = Object.fromEntries(
    SENTRY_OTEL_CONSUMERS.map((name) => {
      const dir =
        name === '@sentry/node'
          ? sentryNode
          : packageDir(name, path.join(sentryNode, 'package.json'));
      const api = packageDir(
        '@opentelemetry/api',
        path.join(dir, 'package.json'),
      );
      return [name, realpathSync(api)];
    }),
  );

  // On failure the diff names the package that resolved a different copy.
  const shared = resolved['@sentry/node'];
  expect(resolved).toEqual(
    Object.fromEntries(SENTRY_OTEL_CONSUMERS.map((name) => [name, shared])),
  );
});

const captured: Sentry.ErrorEvent[] = [];
Sentry.init({
  dsn: 'https://public@o0.ingest.sentry.io/0',
  defaultIntegrations: false,
  tracesSampleRate: 0,
  beforeSend(event) {
    captured.push(event);
    return null;
  },
});

afterAll(async () => {
  await Sentry.close(0);
});

test('concurrent isolation scopes keep their own user', async () => {
  const users = ['a', 'b', 'c', 'd', 'e'];
  await Promise.all(
    users.map((id, i) =>
      Sentry.withIsolationScope(async () => {
        Sentry.setUser({ id });
        // Interleave: later-starting scopes finish first.
        await new Promise((resolve) => setTimeout(resolve, (5 - i) * 5));
        Sentry.captureException(new Error(id));
      }),
    ),
  );
  await Sentry.flush(0);

  const pairs = captured.map((event) => [
    event.exception?.values?.[0]?.value,
    event.user?.id,
  ]);
  expect(pairs).toHaveLength(users.length);
  for (const [errorFor, userId] of pairs) expect(userId).toBe(errorFor);
});
