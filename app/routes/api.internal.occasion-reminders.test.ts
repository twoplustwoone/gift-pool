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
const runOccasionReminderSweep = vi.fn();
const captureException = vi.fn();

vi.mock('#app/utils/litefs.server.ts', () => ({
  ensurePrimary: (...args: Array<unknown>) => ensurePrimary(...args),
}));

vi.mock('#app/utils/occasion-reminders.server.ts', () => ({
  runOccasionReminderSweep: (...args: Array<unknown>) =>
    runOccasionReminderSweep(...args),
}));

vi.mock('@sentry/react-router', () => ({
  captureException: (...args: Array<unknown>) => captureException(...args),
}));

import { action } from './api.internal.occasion-reminders.ts';

const TOKEN = 'test-internal-token';

function postRequest(headers: Record<string, string> = {}) {
  return new Request('https://giftpool.app/api/internal/occasion-reminders', {
    method: 'POST',
    headers,
  });
}

beforeEach(() => {
  process.env.INTERNAL_COMMAND_TOKEN = TOKEN;
  ensurePrimary.mockReset().mockResolvedValue(true);
  runOccasionReminderSweep.mockReset().mockResolvedValue({
    birthdayOwnersConsidered: 2,
    viewersNotified: 3,
    viewersSkipped: 1,
    viewersFailed: 0,
  });
  captureException.mockReset();
});

afterEach(() => {
  Reflect.deleteProperty(process.env, 'INTERNAL_COMMAND_TOKEN');
});

describe('api internal occasion-reminders action', () => {
  it('rejects non-POST methods', async () => {
    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: new Request(
          'https://giftpool.app/api/internal/occasion-reminders',
          { method: 'GET' },
        ),
      }),
    );
    expect(getRouteResultStatus(result)).toBe(405);
    expect(ensurePrimary).not.toHaveBeenCalled();
  });

  it('rejects a missing or incorrect bearer token', async () => {
    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: postRequest({ Authorization: 'Bearer wrong' }),
      }),
    );
    expect(getRouteResultStatus(result)).toBe(401);
    expect(ensurePrimary).not.toHaveBeenCalled();
    expect(runOccasionReminderSweep).not.toHaveBeenCalled();
  });

  it('rejects when INTERNAL_COMMAND_TOKEN is unset — "Bearer undefined" must not authorize', async () => {
    Reflect.deleteProperty(process.env, 'INTERNAL_COMMAND_TOKEN');
    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: postRequest({ Authorization: 'Bearer undefined' }),
      }),
    );
    expect(getRouteResultStatus(result)).toBe(401);
    expect(runOccasionReminderSweep).not.toHaveBeenCalled();
  });

  it('rejects when INTERNAL_COMMAND_TOKEN is empty', async () => {
    process.env.INTERNAL_COMMAND_TOKEN = '';
    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: postRequest({ Authorization: 'Bearer ' }),
      }),
    );
    expect(getRouteResultStatus(result)).toBe(401);
    expect(runOccasionReminderSweep).not.toHaveBeenCalled();
  });

  it('runs the sweep and returns a summary when authorized', async () => {
    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: postRequest({ Authorization: `Bearer ${TOKEN}` }),
      }),
    );
    expect(ensurePrimary).toHaveBeenCalled();
    expect(runOccasionReminderSweep).toHaveBeenCalled();
    expect(getRouteResultStatus(result)).toBe(200);
    const data = await getRouteResultData<{
      success: boolean;
      viewersNotified: number;
    }>(result);
    expect(data.success).toBe(true);
    expect(data.viewersNotified).toBe(3);
  });

  it('captures and reports a 500 when the sweep throws', async () => {
    runOccasionReminderSweep.mockRejectedValue(new Error('boom'));
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
