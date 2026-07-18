/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const usersInGiftGroupsFindUnique = vi.fn();
const poolContributorFindUnique = vi.fn();
const poolFindUnique = vi.fn();

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    pool: {
      findUnique: (...args: Array<unknown>) => poolFindUnique(...args),
    },
    poolContributor: {
      findUnique: (...args: Array<unknown>) => poolContributorFindUnique(...args),
    },
    usersInGiftGroups: {
      findUnique: (...args: Array<unknown>) => usersInGiftGroupsFindUnique(...args),
    },
  },
}));

import {
  POOL_STATUS_PREDECESSORS,
  assertPoolStatus,
  canManagePool,
  isGroupAdminOfPool,
  isPoolContributor,
  isPoolOrganizer,
  requireCanManagePool,
  requirePoolContributor,
  requirePoolOrganizer,
  requirePoolVisible,
  type PoolForPermissions,
} from './pool-permissions.server.ts';

const pool: PoolForPermissions = {
  giftGroupId: 'group-1',
  id: 'pool-1',
  organizerId: 'organizer-1',
  status: 'OPEN',
};

beforeEach(() => {
  usersInGiftGroupsFindUnique.mockReset();
  poolContributorFindUnique.mockReset();
  poolFindUnique.mockReset();
});

describe('pool permissions', () => {
  it('detects whether the user is the organizer', () => {
    expect(isPoolOrganizer('organizer-1', pool)).toBe(true);
    expect(isPoolOrganizer('viewer-1', pool)).toBe(false);
  });

  it('treats group owners and admins as managers', async () => {
    usersInGiftGroupsFindUnique.mockResolvedValueOnce({ role: 'OWNER' });
    await expect(isGroupAdminOfPool('viewer-1', pool)).resolves.toBe(true);

    usersInGiftGroupsFindUnique.mockResolvedValueOnce({ role: 'ADMIN' });
    await expect(isGroupAdminOfPool('viewer-1', pool)).resolves.toBe(true);

    usersInGiftGroupsFindUnique.mockResolvedValueOnce({ role: 'MEMBER' });
    await expect(isGroupAdminOfPool('viewer-1', pool)).resolves.toBe(false);
  });

  it('returns false for group admin checks when the pool has no group', async () => {
    await expect(
      isGroupAdminOfPool('viewer-1', { ...pool, giftGroupId: null }),
    ).resolves.toBe(false);
    expect(usersInGiftGroupsFindUnique).not.toHaveBeenCalled();
  });

  it('lets organizers manage the pool without a group lookup', async () => {
    await expect(canManagePool('organizer-1', pool)).resolves.toBe(true);
    expect(usersInGiftGroupsFindUnique).not.toHaveBeenCalled();
  });

  it('checks contributor membership', async () => {
    poolContributorFindUnique.mockResolvedValueOnce({ id: 'contributor-1' });
    await expect(isPoolContributor('viewer-1', 'pool-1')).resolves.toBe(true);

    poolContributorFindUnique.mockResolvedValueOnce(null);
    await expect(isPoolContributor('viewer-1', 'pool-1')).resolves.toBe(false);
  });

  it('requirePoolContributor throws when the user is not a contributor', async () => {
    poolContributorFindUnique.mockResolvedValue(null);

    await expect(requirePoolContributor('viewer-1', 'pool-1')).rejects.toMatchObject({
      init: { status: 403 },
    });
  });

  it('requireCanManagePool throws when the user cannot manage the pool', async () => {
    usersInGiftGroupsFindUnique.mockResolvedValue(null);

    await expect(requireCanManagePool('viewer-1', pool)).rejects.toMatchObject({
      init: { status: 403 },
    });
  });

  it('requirePoolOrganizer throws for non-organizers', () => {
    expect(() => requirePoolOrganizer('viewer-1', pool)).toThrow();
    expect(() => requirePoolOrganizer('organizer-1', pool)).not.toThrow();
  });

  it('requirePoolVisible throws 404 for missing pools and 403 for hidden pools', async () => {
    poolFindUnique.mockResolvedValueOnce(null);
    await expect(requirePoolVisible('viewer-1', 'pool-1')).rejects.toMatchObject({
      init: { status: 404 },
    });

    poolFindUnique.mockResolvedValueOnce({ id: 'pool-1' });
    poolContributorFindUnique.mockResolvedValueOnce(null);
    await expect(requirePoolVisible('viewer-1', 'pool-1')).rejects.toMatchObject({
      init: { status: 403 },
    });
  });

  it('requirePoolVisible resolves when the pool exists and the user is a contributor', async () => {
    poolFindUnique.mockResolvedValueOnce({ id: 'pool-1' });
    poolContributorFindUnique.mockResolvedValueOnce({ id: 'contributor-1' });

    await expect(requirePoolVisible('viewer-1', 'pool-1')).resolves.toBeUndefined();
  });
});

describe('assertPoolStatus', () => {
  it('passes when the status is allowed', () => {
    expect(() =>
      assertPoolStatus({ status: 'OPEN' }, ['OPEN', 'VOTING']),
    ).not.toThrow();
  });

  it('throws 409 when the status is not allowed', () => {
    try {
      assertPoolStatus({ status: 'DECIDED' }, ['OPEN', 'VOTING']);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as { init?: { status?: number } }).init?.status).toBe(409);
    }
  });
});

describe('POOL_STATUS_PREDECESSORS', () => {
  it('encodes a forward-only lifecycle with terminal states', () => {
    // Terminal states have no successors.
    expect(POOL_STATUS_PREDECESSORS.DELIVERED).toEqual(['PURCHASED']);
    expect(POOL_STATUS_PREDECESSORS.OPEN).toEqual([]);
    // CANCELLED reachable from any active status.
    expect(POOL_STATUS_PREDECESSORS.CANCELLED).toContain('OPEN');
    expect(POOL_STATUS_PREDECESSORS.CANCELLED).toContain('PURCHASED');
    // No status lists a terminal state as a predecessor (can't come back).
    for (const preds of Object.values(POOL_STATUS_PREDECESSORS)) {
      expect(preds).not.toContain('DELIVERED');
      expect(preds).not.toContain('CANCELLED');
    }
  });
});
