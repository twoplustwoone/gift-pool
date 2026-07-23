/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const previewOrganizerNudge = vi.fn();
const sendOrganizerNudge = vi.fn();
const captureException = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('@sentry/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    captureException: (...args: Array<unknown>) => captureException(...args),
  };
});

vi.mock('#app/utils/organizer-nudges.server.ts', () => ({
  OrganizerNudgeError: class OrganizerNudgeError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = 'OrganizerNudgeError';
    }
  },
  isOrganizerNudgeKind: (value: unknown) =>
    ['CONTRIBUTION', 'VOTE', 'PURCHASE', 'DELIVERY'].includes(String(value)),
  previewOrganizerNudge: (...args: Array<unknown>) =>
    previewOrganizerNudge(...args),
  sendOrganizerNudge: (...args: Array<unknown>) => sendOrganizerNudge(...args),
}));

import { OrganizerNudgeError } from '#app/utils/organizer-nudges.server.ts';
import { action, loader } from './api.pools.$poolId.reminders.ts';

beforeEach(() => {
  vi.clearAllMocks();
  captureException.mockReset();
  requireUserId.mockResolvedValue('manager-1');
  previewOrganizerNudge.mockResolvedValue({
    status: 'AVAILABLE',
    kind: 'VOTE',
    eligibleCount: 3,
    latestNudge: null,
  });
  sendOrganizerNudge.mockResolvedValue({
    status: 'QUEUED',
    kind: 'VOTE',
    nudgeId: 'nudge-1',
    queuedCount: 3,
  });
});

describe('organizer reminder resource route', () => {
  it('loads an aggregate preview through the nudge module', async () => {
    const result = await loader(
      toLoaderArgs({
        context: {},
        params: { poolId: 'pool-1' },
        request: new Request(
          'https://giftpool.app/api/pools/pool-1/reminders?kind=VOTE',
        ),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(await getRouteResultData(result)).toMatchObject({
      status: 'AVAILABLE',
      eligibleCount: 3,
    });
    expect(previewOrganizerNudge).toHaveBeenCalledWith({
      poolId: 'pool-1',
      senderId: 'manager-1',
      kind: 'VOTE',
    });
  });

  it('sends a validated idempotent request through the same module', async () => {
    const result = await action(
      toActionArgs({
        context: {},
        params: { poolId: 'pool-1' },
        request: formRequest({
          kind: 'VOTE',
          idempotencyKey: 'client-mutation-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(sendOrganizerNudge).toHaveBeenCalledWith({
      poolId: 'pool-1',
      senderId: 'manager-1',
      kind: 'VOTE',
      idempotencyKey: 'client-mutation-1',
    });
  });

  it('rejects invalid kinds and idempotency keys before the module', async () => {
    for (const values of [
      { kind: 'MESSAGE', idempotencyKey: 'client-mutation-1' },
      { kind: 'VOTE', idempotencyKey: '' },
    ]) {
      const result = await action(
        toLoaderArgs({
          context: {},
          params: { poolId: 'pool-1' },
          request: formRequest(values),
        }),
      );
      expect(getRouteResultStatus(result)).toBe(400);
    }
    expect(sendOrganizerNudge).not.toHaveBeenCalled();
  });

  it('maps privacy, permission, and stale-task errors without flattening them', async () => {
    for (const [code, status] of [
      ['POOL_NOT_FOUND', 404],
      ['FORBIDDEN', 403],
      ['TASK_UNAVAILABLE', 409],
      ['IDEMPOTENCY_CONFLICT', 409],
    ] as const) {
      previewOrganizerNudge.mockRejectedValueOnce(
        new OrganizerNudgeError(code, `error:${code}`),
      );
      const result = await loader(
        toActionArgs({
          context: {},
          params: { poolId: 'pool-1' },
          request: new Request(
            'https://giftpool.app/api/pools/pool-1/reminders?kind=VOTE',
          ),
        }),
      );
      expect(getRouteResultStatus(result)).toBe(status);
      expect(await getRouteResultData(result)).toMatchObject({ code });
    }
  });

  // Regression for GIFTPOOL-UI-1M: a transient DB timeout (or any exception
  // that isn't an OrganizerNudgeError) must resolve as a typed error
  // response, not propagate as an unhandled loader exception. This route's
  // only route-tree ancestor is root, so an unhandled throw here doesn't
  // just fail the reminder widget's fetcher.load() call — react-router
  // renders root's ErrorBoundary in its place, blanking the entire app for
  // what should have been a recoverable, retry-able preview failure.
  it('converts an unexpected error into a typed response instead of throwing', async () => {
    previewOrganizerNudge.mockRejectedValueOnce(
      new Error('Operations timed out after `N/A`.'),
    );

    const result = await loader(
      toLoaderArgs({
        context: {},
        params: { poolId: 'pool-1' },
        request: new Request(
          'https://giftpool.app/api/pools/pool-1/reminders?kind=VOTE',
        ),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(500);
    expect(await getRouteResultData(result)).toMatchObject({
      error: expect.any(String),
    });
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('captures and converts an unexpected error on send too', async () => {
    sendOrganizerNudge.mockRejectedValueOnce(new Error('boom'));

    const result = await action(
      toActionArgs({
        context: {},
        params: { poolId: 'pool-1' },
        request: formRequest({
          kind: 'VOTE',
          idempotencyKey: 'client-mutation-1',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(500);
    expect(await getRouteResultData(result)).toMatchObject({
      error: expect.any(String),
    });
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

function formRequest(values: Record<string, string>) {
  return new Request('https://giftpool.app/api/pools/pool-1/reminders', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values).toString(),
  });
}
