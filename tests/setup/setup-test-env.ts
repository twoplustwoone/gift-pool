process.env.NODE_ENV ??= 'test';

process.env.LITEFS_DIR ??= '/tmp';
process.env.SESSION_SECRET ??= 'SESSION_SECRET';
process.env.INTERNAL_COMMAND_TOKEN ??= 'INTERNAL_COMMAND_TOKEN';
process.env.HONEYPOT_SECRET ??= 'HONEYPOT_SECRET';
// Emails in tests must go through the MSW resend mock. Without a key,
// sendEmail's fallback branch calls console.error — and because email fanout
// is fire-and-forget, that async tail lands during whichever test happens to
// be running and its console-error guard fails it. Locally .env supplies a
// key via dotenv below; CI has no .env, which made this a CI-only,
// random-victim flake (the "dismisses one mute cycle" failures).
process.env.RESEND_API_KEY ??= 'test-resend-key';
process.env.DATABASE_PATH ??= `./tests/prisma/data.${process.env.VITEST_POOL_ID || 0}.db`;
process.env.CACHE_DATABASE_PATH ??= `./tests/prisma/cache.${process.env.VITEST_POOL_ID || 0}.db`;

await import('dotenv/config');
await import('./db-setup.ts');
// we need these to be imported first 👆

// jsdom doesn't implement pointer capture or scrollIntoView, which Radix
// Select (and other Radix primitives using its positioning logic) call
// unconditionally when opening — without this, clicking a Select trigger in
// a jsdom-environment test throws "hasPointerCapture is not a function".
// Guarded because this file also runs for node-environment tests with no DOM.
if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}

const { cleanup } = await import('@testing-library/react');
const vitest = await import('vitest');
const { server } = await import('#tests/mocks/index.ts');
await import('./custom-matchers.ts');

const { afterEach, beforeEach, vi } = vitest;
type ConsoleError = ReturnType<typeof vi.spyOn>;

let consoleErrorSpy: ConsoleError;

export const testConsole = {
  get error() {
    return consoleErrorSpy;
  },
};

afterEach(() => server.resetHandlers());
afterEach(() => cleanup());

beforeEach(() => {
  const originalConsoleError = console.error;
  consoleErrorSpy = vi.spyOn(console, 'error');
  consoleErrorSpy.mockImplementation(
    (...args: Parameters<typeof console.error>) => {
      originalConsoleError(...args);
      throw new Error(
        'Console error was called. Call consoleError.mockImplementation(() => {}) if this is expected.',
      );
    },
  );
});
