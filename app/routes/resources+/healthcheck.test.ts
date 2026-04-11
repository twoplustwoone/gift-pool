/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.fn();

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    $queryRaw: (...args: Array<unknown>) => queryRaw(...args),
  },
}));

import { loader } from './healthcheck.tsx';

const originalFetch = globalThis.fetch;

function makeArgs(url: string, headers: Record<string, string> = {}) {
  return {
    context: {},
    params: {},
    request: new Request(url, { headers }),
  } as never;
}

describe('app/routes/resources+/healthcheck.tsx', () => {
  beforeEach(() => {
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([{ 1: 1 }]);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns OK when the db ping and self HEAD succeed', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 200 }),
    );
    globalThis.fetch = fetchMock;

    const response = await loader(
      makeArgs('https://giftpool.app/resources/healthcheck', {
        host: 'giftpool.app',
      }),
    );

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('OK');
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchInit] = fetchMock.mock.calls[0]!;
    // The production loader concatenates `protocol + host` as-is, so the
    // `//` delimiter is elided by design — we preserve the shape here.
    expect(String(fetchUrl)).toBe('https:giftpool.app');
    expect(fetchInit).toMatchObject({ method: 'HEAD' });
  });

  it('prefers X-Forwarded-Host over host for the self-probe URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 200 }),
    );
    globalThis.fetch = fetchMock;

    await loader(
      makeArgs('http://127.0.0.1:8080/resources/healthcheck', {
        'X-Forwarded-Host': 'giftpool.app',
        host: '127.0.0.1:8080',
      }),
    );

    const [fetchUrl] = fetchMock.mock.calls[0]!;
    expect(String(fetchUrl)).toBe('http:giftpool.app');
  });

  it('returns 500 when the db query fails', async () => {
    queryRaw.mockRejectedValueOnce(new Error('db down'));
    globalThis.fetch = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;
    const errorSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const response = await loader(
      makeArgs('https://giftpool.app/resources/healthcheck'),
    );

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('ERROR');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('returns 500 when the self-probe HEAD request is not ok', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(null, { status: 503 }),
    ) as unknown as typeof fetch;
    const errorSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const response = await loader(
      makeArgs('https://giftpool.app/resources/healthcheck'),
    );

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('ERROR');
    errorSpy.mockRestore();
  });
});
