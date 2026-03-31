/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireUserId = vi.fn();
const getRelationshipState = vi.fn();
const getDomainUrl = vi.fn();
const nanoid = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();
const upsert = vi.fn();
const transaction = vi.fn();

vi.mock('nanoid', () => ({
  nanoid: () => nanoid(),
}));

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/friends.server.ts', () => ({
  getRelationshipState: (...args: Array<unknown>) => getRelationshipState(...args),
}));

vi.mock('#app/utils/misc.tsx', () => ({
  getDomainUrl: (...args: Array<unknown>) => getDomainUrl(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    $transaction: (callback: (tx: typeof txMock) => Promise<unknown>) => transaction(callback),
    friendInvitation: {
      create: (...args: Array<unknown>) => create(...args),
      findFirst: (...args: Array<unknown>) => findFirst(...args),
      update: (...args: Array<unknown>) => update(...args),
      updateMany: (...args: Array<unknown>) => updateMany(...args),
    },
  },
}));

const txMock = {
  friendInvitation: {
    update: (...args: Array<unknown>) => update(...args),
  },
  friendship: {
    upsert: (...args: Array<unknown>) => upsert(...args),
  },
};

import {
  acceptFriendInvite,
  createFriendInvite,
  disableFriendInvite,
  getActiveFriendInvite,
  getActiveFriendInviteUrl,
  getFriendInviteLink,
  requireFriendInvitationNotExpired,
  rotateFriendInvite,
} from './friend-invitations.server.ts';

beforeEach(() => {
  process.env.BASE_URL = 'https://giftpool.app';
  requireUserId.mockReset().mockResolvedValue('viewer-1');
  getRelationshipState.mockReset().mockResolvedValue('NONE');
  getDomainUrl.mockReset().mockReturnValue('https://giftpool.app');
  nanoid.mockReset().mockReturnValue('invite-code');
  findFirst.mockReset();
  create.mockReset().mockResolvedValue({ code: 'invite-code' });
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  update.mockReset().mockResolvedValue(undefined);
  upsert.mockReset().mockResolvedValue(undefined);
  transaction.mockReset().mockImplementation(async (callback) => callback(txMock));
});

describe('friend invitation utilities', () => {
  it('builds absolute or fallback friend invite links', () => {
    expect(getFriendInviteLink('abc')).toBe('https://giftpool.app/friends/accept/abc');
    expect(
      getFriendInviteLink(
        'xyz',
        new Request('https://example.com/friends', {
          headers: { host: 'example.com' },
        }),
      ),
    ).toBe('https://giftpool.app/friends/accept/xyz');

    getDomainUrl.mockImplementationOnce(() => {
      throw new Error('bad origin');
    });
    expect(
      getFriendInviteLink('fallback', new Request('https://example.com/friends')),
    ).toBe('/friends/accept/fallback');
  });

  it('loads the active invite and invite URL for the current user', async () => {
    findFirst
      .mockResolvedValueOnce({ id: 'invite-1', code: 'invite-1' })
      .mockResolvedValueOnce({ id: 'invite-2', code: 'invite-2' });

    await expect(getActiveFriendInvite(new Request('https://giftpool.app/friends'))).resolves.toEqual({
      code: 'invite-1',
      id: 'invite-1',
    });

    await expect(
      getActiveFriendInviteUrl(new Request('https://giftpool.app/friends')),
    ).resolves.toBe('https://giftpool.app/friends/accept/invite-2');
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('creates a friend invite for the authenticated user', async () => {
    const url = await createFriendInvite(new Request('https://giftpool.app/friends'), 3);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: 'invite-code',
        createdById: 'viewer-1',
      }),
    });
    expect(url).toBe('https://giftpool.app/friends/accept/invite-code');
  });

  it('requires a non-expired invitation', async () => {
    findFirst.mockResolvedValueOnce({
      code: 'invite-code',
      createdBy: {
        id: 'creator-1',
        image: null,
        name: 'Creator',
        username: 'creator',
      },
      createdById: 'creator-1',
      id: 'invite-1',
    });

    await expect(requireFriendInvitationNotExpired('invite-code')).resolves.toMatchObject({
      code: 'invite-code',
      createdById: 'creator-1',
    });

    findFirst.mockResolvedValueOnce(null);
    await expect(requireFriendInvitationNotExpired('missing')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rotates and disables active invites', async () => {
    await rotateFriendInvite(new Request('https://giftpool.app/friends'));
    expect(updateMany).toHaveBeenCalledWith({
      data: { revokedAt: expect.any(Date) },
      where: expect.objectContaining({
        createdById: 'viewer-1',
      }),
    });
    expect(create).toHaveBeenCalledTimes(1);

    create.mockClear();
    updateMany.mockClear();

    await expect(disableFriendInvite(new Request('https://giftpool.app/friends'))).resolves.toBeNull();
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects accepting your own invite or an existing friendship', async () => {
    findFirst.mockResolvedValue({
      code: 'invite-code',
      createdBy: {
        id: 'viewer-1',
        image: null,
        name: 'Viewer',
        username: 'viewer',
      },
      createdById: 'viewer-1',
      id: 'invite-1',
    });

    await expect(acceptFriendInvite('invite-code', 'viewer-1')).rejects.toMatchObject({
      status: 400,
    });

    findFirst.mockResolvedValue({
      code: 'invite-code',
      createdBy: {
        id: 'creator-1',
        image: null,
        name: 'Creator',
        username: 'creator',
      },
      createdById: 'creator-1',
      id: 'invite-2',
    });
    getRelationshipState.mockResolvedValueOnce('FRIENDS');

    await expect(acceptFriendInvite('invite-code', 'viewer-1')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('accepts a valid invite and creates the friendship in a transaction', async () => {
    findFirst.mockResolvedValue({
      code: 'invite-code',
      createdBy: {
        id: 'creator-1',
        image: null,
        name: 'Creator',
        username: 'creator',
      },
      createdById: 'creator-1',
      id: 'invite-3',
    });

    await expect(acceptFriendInvite('invite-code', 'viewer-1')).resolves.toMatchObject({
      id: 'invite-3',
    });
    expect(update).toHaveBeenCalledWith({
      data: {
        usedAt: expect.any(Date),
        usedById: 'viewer-1',
      },
      where: { id: 'invite-3' },
    });
    expect(upsert).toHaveBeenCalledWith({
      create: {
        userAId: 'creator-1',
        userBId: 'viewer-1',
      },
      update: {},
      where: {
        userAId_userBId: {
          userAId: 'creator-1',
          userBId: 'viewer-1',
        },
      },
    });
  });
});

