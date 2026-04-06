/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POOL_ACTIVITY_TYPE } from '#app/utils/pool-constants.ts';

const createActivity = vi.fn();

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    poolActivity: {
      create: (...args: Array<unknown>) => createActivity(...args),
    },
  },
}));

import { logPoolActivity } from './pool-activity.server.ts';

describe('logPoolActivity', () => {
  beforeEach(() => {
    createActivity.mockReset().mockResolvedValue(undefined);
  });

  it('writes pool activity entries with serialized payloads', async () => {
    await logPoolActivity('pool-1', POOL_ACTIVITY_TYPE.IDEA_PROPOSED, {
      actorId: 'user-1',
      payload: { ideaId: 'idea-1' },
    });

    expect(createActivity).toHaveBeenCalledWith({
      data: {
        actorId: 'user-1',
        payload: JSON.stringify({ ideaId: 'idea-1' }),
        poolId: 'pool-1',
        type: POOL_ACTIVITY_TYPE.IDEA_PROPOSED,
      },
    });
  });

  it('swallows persistence errors', async () => {
    createActivity.mockRejectedValueOnce(new Error('db is down'));

    await expect(
      logPoolActivity('pool-1', POOL_ACTIVITY_TYPE.POOL_CREATED, {
        payload: { title: 'Pool' },
      }),
    ).resolves.toBeUndefined();
  });
});
