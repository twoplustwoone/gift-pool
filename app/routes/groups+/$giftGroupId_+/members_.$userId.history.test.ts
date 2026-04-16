/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toLoaderArgs } from '#tests/route-module-test-utils.ts';

const requireUserIdInGroup = vi.fn();
const usersInGiftGroupsFindUnique = vi.fn();
const poolFindMany = vi.fn();

vi.mock('#app/utils/groups.server.ts', () => ({
  requireUserIdInGroup: (...args: Array<unknown>) =>
    requireUserIdInGroup(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    usersInGiftGroups: {
      findUnique: (...args: Array<unknown>) =>
        usersInGiftGroupsFindUnique(...args),
    },
    pool: {
      findMany: (...args: Array<unknown>) => poolFindMany(...args),
    },
  },
}));

import { loader } from './members_.$userId.history.tsx';

beforeEach(() => {
  requireUserIdInGroup.mockReset();
  usersInGiftGroupsFindUnique.mockReset();
  poolFindMany.mockReset().mockResolvedValue([]);
});

describe('member gift history loader', () => {
  it('throws 404 when the viewer is the target member (privacy — no self-lookup)', async () => {
    requireUserIdInGroup.mockResolvedValue('viewer-1');

    await expect(
      loader(
        toLoaderArgs({
          context: {} as never,
          params: { giftGroupId: 'group-1', userId: 'viewer-1' },
          request: new Request(
            'https://giftpool.app/groups/group-1/members/viewer-1/history',
          ),
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });

    // Must not even query the DB for membership — the privacy check
    // short-circuits before any data access.
    expect(usersInGiftGroupsFindUnique).not.toHaveBeenCalled();
    expect(poolFindMany).not.toHaveBeenCalled();
  });

  it('throws 404 when the target user is not a member of the group', async () => {
    requireUserIdInGroup.mockResolvedValue('viewer-1');
    usersInGiftGroupsFindUnique.mockResolvedValue(null);

    await expect(
      loader(
        toLoaderArgs({
          context: {} as never,
          params: { giftGroupId: 'group-1', userId: 'stranger' },
          request: new Request(
            'https://giftpool.app/groups/group-1/members/stranger/history',
          ),
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(poolFindMany).not.toHaveBeenCalled();
  });

  it('returns delivered pools where the target was the recipient, shaped with gift details', async () => {
    requireUserIdInGroup.mockResolvedValue('viewer-1');
    usersInGiftGroupsFindUnique.mockResolvedValue({
      user: { id: 'marco', username: 'marco', name: 'Marco Rodríguez' },
    });
    poolFindMany.mockResolvedValue([
      {
        id: 'pool-1',
        title: "Marco's 30th Birthday",
        occasionType: 'BIRTHDAY',
        eventDate: new Date('2025-05-03T00:00:00.000Z'),
        updatedAt: new Date('2025-05-04T00:00:00.000Z'),
        finalPriceCents: 15000,
        chosenIdea: { name: 'Sony headphones' },
        contributors: [
          { contributionCents: 5000 },
          { contributionCents: 5000 },
          { contributionCents: 5000 },
        ],
      },
    ]);

    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { giftGroupId: 'group-1', userId: 'marco' },
        request: new Request(
          'https://giftpool.app/groups/group-1/members/marco/history',
        ),
      }),
    );

    expect(result).toMatchObject({
      member: { id: 'marco', username: 'marco', name: 'Marco Rodríguez' },
      gifts: [
        {
          id: 'pool-1',
          title: "Marco's 30th Birthday",
          occasionType: 'BIRTHDAY',
          giftName: 'Sony headphones',
          totalCents: 15000,
        },
      ],
    });
  });

  it('queries only DELIVERED pools scoped to this group and this recipient', async () => {
    requireUserIdInGroup.mockResolvedValue('viewer-1');
    usersInGiftGroupsFindUnique.mockResolvedValue({
      user: { id: 'marco', username: 'marco', name: 'Marco' },
    });
    poolFindMany.mockResolvedValue([]);

    await loader(
      toLoaderArgs({
        context: {} as never,
        params: { giftGroupId: 'group-1', userId: 'marco' },
        request: new Request(
          'https://giftpool.app/groups/group-1/members/marco/history',
        ),
      }),
    );

    expect(poolFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          giftGroupId: 'group-1',
          recipientUserId: 'marco',
          status: 'DELIVERED',
        },
        orderBy: { updatedAt: 'desc' },
      }),
    );
  });

  it('falls back to summed contributions when finalPriceCents is null', async () => {
    requireUserIdInGroup.mockResolvedValue('viewer-1');
    usersInGiftGroupsFindUnique.mockResolvedValue({
      user: { id: 'marco', username: 'marco', name: 'Marco' },
    });
    poolFindMany.mockResolvedValue([
      {
        id: 'pool-1',
        title: 'Old pool',
        occasionType: 'BIRTHDAY',
        eventDate: null,
        updatedAt: new Date('2025-01-01'),
        finalPriceCents: null,
        chosenIdea: null,
        contributors: [
          { contributionCents: 2000 },
          { contributionCents: 3000 },
          { contributionCents: null },
        ],
      },
    ]);

    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { giftGroupId: 'group-1', userId: 'marco' },
        request: new Request(
          'https://giftpool.app/groups/group-1/members/marco/history',
        ),
      }),
    );

    expect(result.gifts[0]?.totalCents).toBe(5000);
  });
});
