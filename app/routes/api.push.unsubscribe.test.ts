/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const deleteMany = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    pushSubscription: {
      deleteMany: (...args: Array<unknown>) => deleteMany(...args),
    },
  },
}));

import { action } from './api.push.unsubscribe.ts';

function postRequest(body: unknown) {
  return new Request('https://giftpool.app/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireUserId.mockReset();
  deleteMany.mockReset();
  requireUserId.mockResolvedValue('user-1');
  deleteMany.mockResolvedValue({ count: 1 });
});

describe('api push unsubscribe action', () => {
  it('deletes only the current user’s subscription for the endpoint', async () => {
    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: postRequest({ endpoint: 'https://push.example/abc' }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://push.example/abc', userId: 'user-1' },
    });
  });

  it('rejects an invalid endpoint', async () => {
    const result = await action(
      toActionArgs({
        context: {},
        params: {},
        request: postRequest({ endpoint: 'nope' }),
      }),
    );
    expect(getRouteResultStatus(result)).toBe(400);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
