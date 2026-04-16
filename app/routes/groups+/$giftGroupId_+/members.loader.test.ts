/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toLoaderArgs } from '#tests/route-module-test-utils.ts';

const requireUserIdInGroup = vi.fn();
const poolFindMany = vi.fn();

vi.mock('#app/utils/groups.server.ts', () => ({
  requireUserIdInGroup: (...args: Array<unknown>) =>
    requireUserIdInGroup(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    pool: {
      findMany: (...args: Array<unknown>) => poolFindMany(...args),
    },
  },
}));

import { loader } from './members.tsx';

beforeEach(() => {
  requireUserIdInGroup.mockReset().mockResolvedValue('viewer-1');
  poolFindMany.mockReset().mockResolvedValue([]);
});

describe('members tab loader — active pool cross-reference', () => {
  it('returns an empty map when there are no active pools', async () => {
    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { giftGroupId: 'group-1' },
        request: new Request('https://giftpool.app/groups/group-1/members'),
      }),
    );

    expect(result).toEqual({ activePoolsByRecipient: {} });
  });

  it('indexes active pools by recipient user id', async () => {
    poolFindMany.mockResolvedValue([
      { id: 'pool-1', title: "Marco's Birthday", recipientUserId: 'marco' },
      { id: 'pool-2', title: "Leo's Graduation", recipientUserId: 'leo' },
    ]);

    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { giftGroupId: 'group-1' },
        request: new Request('https://giftpool.app/groups/group-1/members'),
      }),
    );

    expect(result).toEqual({
      activePoolsByRecipient: {
        marco: { id: 'pool-1', title: "Marco's Birthday" },
        leo: { id: 'pool-2', title: "Leo's Graduation" },
      },
    });
  });

  it('skips pools without a recipient user id (standalone / name-only recipients)', async () => {
    poolFindMany.mockResolvedValue([
      { id: 'pool-1', title: 'Name-only recipient', recipientUserId: null },
      { id: 'pool-2', title: "Marco's Birthday", recipientUserId: 'marco' },
    ]);

    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { giftGroupId: 'group-1' },
        request: new Request('https://giftpool.app/groups/group-1/members'),
      }),
    );

    expect(result.activePoolsByRecipient).toEqual({
      marco: { id: 'pool-2', title: "Marco's Birthday" },
    });
  });

  it('enforces the privacy filter in the query (recipient must not see their own pool)', async () => {
    await loader(
      toLoaderArgs({
        context: {} as never,
        params: { giftGroupId: 'group-1' },
        request: new Request('https://giftpool.app/groups/group-1/members'),
      }),
    );

    expect(poolFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          giftGroupId: 'group-1',
          recipientUserId: { not: 'viewer-1' },
        }),
      }),
    );
  });

  it('only queries non-terminal pools (not DELIVERED or CANCELLED)', async () => {
    await loader(
      toLoaderArgs({
        context: {} as never,
        params: { giftGroupId: 'group-1' },
        request: new Request('https://giftpool.app/groups/group-1/members'),
      }),
    );

    const call = poolFindMany.mock.calls[0]?.[0] as
      | { where: { status: { notIn: string[] } } }
      | undefined;
    expect(call?.where.status.notIn).toEqual(
      expect.arrayContaining(['DELIVERED', 'CANCELLED']),
    );
  });
});
