process.env.NODE_ENV ??= 'test';

process.env.LITEFS_DIR ??= '/tmp';
process.env.SESSION_SECRET ??= 'SESSION_SECRET';
process.env.INTERNAL_COMMAND_TOKEN ??= 'INTERNAL_COMMAND_TOKEN';
process.env.HONEYPOT_SECRET ??= 'HONEYPOT_SECRET';
process.env.DATABASE_PATH ??= `./tests/prisma/data.${process.env.VITEST_POOL_ID || 0}.db`;
process.env.CACHE_DATABASE_PATH ??= `./tests/prisma/cache.${process.env.VITEST_POOL_ID || 0}.db`;

await import('dotenv/config');
await import('./db-setup.ts');
await import('#app/utils/env.server.ts');
// we need these to be imported first 👆

const { cleanup } = await import('@testing-library/react');
const vitest = await import('vitest');
const { server } = await import('#tests/mocks/index.ts');
await import('./custom-matchers.ts');

const { afterEach, beforeEach, vi } = vitest;
type ConsoleError = ReturnType<typeof vi.spyOn>;

export let consoleError: ConsoleError;

afterEach(() => server.resetHandlers());
afterEach(() => cleanup());

beforeEach(() => {
  const originalConsoleError = console.error;
  consoleError = vi.spyOn(console, 'error');
  consoleError.mockImplementation(
    (...args: Parameters<typeof console.error>) => {
      originalConsoleError(...args);
      throw new Error(
        'Console error was called. Call consoleError.mockImplementation(() => {}) if this is expected.',
      );
    },
  );
});
