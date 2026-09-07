/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';

const ensurePrimary = vi.fn();
const runAutoRevealSweep = vi.fn();
const captureException = vi.fn();

vi.mock('#app/utils/litefs.server.ts', () => ({
  ensurePrimary: (...args: Array<unknown>) => ensurePrimary(...args),
}));

vi.mock('#app/utils/exchanges.server.ts', () => ({
  runAutoRevealSweep: (...args: Array<unknown>) => runAutoRevealSweep(...args),
}));

vi.mock('@sentry/react-router', () => ({
  captureException: (...args: Array<unknown>) => captureException(...args),
}));

import { action } from './api.internal.exchange-sweeps.ts';

const TOKEN = 'test-internal-token';

function postRequest(headers: Record<string, string> = {}) {
  return new Request('https://giftpool.app/api/internal/exchange-sweeps', {
    method: 'POST',
    headers,
  });
}

beforeEach(() => {
  process.env.INTERNAL_COMMAND_TOKEN = TOKEN;
  ensurePrimary.mockReset().mockResolvedValue(true);
  runAutoRevealSweep.mockReset().mockResolvedValue({
    considered: 2,
    revealed: 1,
    skipped: 1,
    failed: 0,
  });
  captureException.mockReset();
});

afterEach(() => {
  Reflect.deleteProperty(process.env, 'INTERNAL_COMMAND_TOKEN');
});

describe('api internal exchange-sweeps action', () => {
  it('rejects non-POST methods', async () => {
    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: new Request(
          'https://giftpool.app/api/internal/exchange-sweeps',
          { method: 'GET' },
        ),
      }),
    );
    expect(getRouteResultStatus(result)).toBe(405);
    expect(ensurePrimary).not.toHaveBeenCalled();
  });

  it('rejects a missing, wrong, or "Bearer undefined" token', async () => {
    for (const auth of ['Bearer wrong', 'Bearer undefined', '']) {
      const result = await action(
        toActionArgs({
          context: {},
          params: {},
          request: postRequest(auth ? { Authorization: auth } : {}),
        }),
      );
      expect(getRouteResultStatus(result)).toBe(401);
    }
    Reflect.deleteProperty(process.env, 'INTERNAL_COMMAND_TOKEN');
    const unset = await action(
      toActionArgs({
        context: {},
        params: {},
        request: postRequest({ Authorization: 'Bearer undefined' }),
      }),
    );
    expect(getRouteResultStatus(unset)).toBe(401);
    expect(runAutoRevealSweep).not.toHaveBeenCalled();
  });

  it('runs on the primary and returns the sweep summary when authorized', async () => {
    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: postRequest({ Authorization: `Bearer ${TOKEN}` }),
      }),
    );
    expect(ensurePrimary).toHaveBeenCalled();
    expect(runAutoRevealSweep).toHaveBeenCalled();
    expect(getRouteResultStatus(result)).toBe(200);
    const body = await getRouteResultData<{
      success: boolean;
      autoReveal: { revealed: number };
    }>(result);
    expect(body.success).toBe(true);
    expect(body.autoReveal.revealed).toBe(1);
  });

  it('captures and reports a 500 when the sweep throws', async () => {
    runAutoRevealSweep.mockRejectedValue(new Error('boom'));
    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: postRequest({ Authorization: `Bearer ${TOKEN}` }),
      }),
    );
    expect(getRouteResultStatus(result)).toBe(500);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error));
  });
});
