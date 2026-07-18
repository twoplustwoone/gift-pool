import {
  UNSAFE_ErrorResponseImpl,
  type LoaderFunctionArgs,
} from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { testConsole } from '#tests/setup/setup-test-env.ts';
import { handleError } from './entry.server.tsx';

const captureException = vi.fn();
vi.mock('@sentry/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    captureException: (...args: Array<unknown>) => captureException(...args),
  };
});

function loaderArgs(request: Request) {
  return { request, params: {}, context: {} } as unknown as LoaderFunctionArgs;
}

describe('handleError', () => {
  it('does not report router-internal 404s (e.g. scanner URLs with encoded newlines)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Shape produced by react-router's getInternalRouterError when no route
    // matches — not even the splat, whose regex can't cross newlines.
    const error = new UNSAFE_ErrorResponseImpl(
      404,
      'Not Found',
      new Error('No route matches URL "/.env%0d%0a"'),
      true,
    );

    handleError(error, loaderArgs(new Request('https://localhost/.env%0d%0a')));

    expect(captureException).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('still reports 5xx route error responses', () => {
    testConsole.error.mockImplementation(() => {});
    const error = new UNSAFE_ErrorResponseImpl(
      500,
      'Internal Server Error',
      new Error('Unexpected Server Error'),
      true,
    );

    handleError(error, loaderArgs(new Request('https://localhost/')));

    expect(captureException).toHaveBeenCalledOnce();
  });

  it('reports unexpected errors', () => {
    testConsole.error.mockImplementation(() => {});
    const error = new Error('boom');

    handleError(error, loaderArgs(new Request('https://localhost/')));

    expect(captureException).toHaveBeenCalledWith(error);
  });

  it('skips aborted requests entirely', () => {
    const controller = new AbortController();
    controller.abort();
    const request = new Request('https://localhost/', {
      signal: controller.signal,
    });

    handleError(new Error('boom'), loaderArgs(request));

    expect(captureException).not.toHaveBeenCalled();
  });
});
