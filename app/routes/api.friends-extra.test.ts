/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getRouteResultData,
  getRouteResultStatus,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const getActiveFriendInvite = vi.fn();
const getActiveFriendInviteUrl = vi.fn();
const createFriendInvite = vi.fn();
const prismaUserFindMany = vi.fn();
const prismaGiftGroupFindMany = vi.fn();
const prismaGiftGroupCount = vi.fn();
const getRelationshipDetails = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/friend-invitations.server.ts', () => ({
  createFriendInvite: (...args: Array<unknown>) => createFriendInvite(...args),
  getActiveFriendInvite: (...args: Array<unknown>) => getActiveFriendInvite(...args),
  getActiveFriendInviteUrl: (...args: Array<unknown>) => getActiveFriendInviteUrl(...args),
}));

vi.mock('#app/utils/friends.server.ts', () => ({
  getRelationshipDetails: (...args: Array<unknown>) => getRelationshipDetails(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    giftGroup: {
      count: (...args: Array<unknown>) => prismaGiftGroupCount(...args),
      findMany: (...args: Array<unknown>) => prismaGiftGroupFindMany(...args),
    },
    user: {
      findMany: (...args: Array<unknown>) => prismaUserFindMany(...args),
    },
  },
}));

import { action, loader } from './api.friends.invite.ts';
import { loader as mutualLoader } from './api.friends.mutual.ts';
import { loader as searchLoader } from './api.users.search.ts';

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('viewer-1');
  getActiveFriendInvite.mockReset().mockResolvedValue({ id: 'invite-1' });
  getActiveFriendInviteUrl.mockReset().mockResolvedValue(
    'https://giftpool.app/friends/accept/invite-1',
  );
  createFriendInvite.mockReset().mockResolvedValue(
    'https://giftpool.app/friends/accept/invite-2',
  );
  getRelationshipDetails.mockReset().mockResolvedValue({
    friendship: null,
    incoming: null,
    outgoing: null,
    state: 'NONE',
  });
  prismaUserFindMany.mockReset().mockResolvedValue([
    {
      id: 'other-1',
      image: null,
      username: 'alex',
    },
  ]);
  prismaGiftGroupFindMany.mockReset().mockResolvedValue([
    { id: 'group-1', name: 'Group 1' },
    { id: 'group-2', name: 'Group 2' },
    { id: 'group-3', name: 'Group 3' },
  ]);
  prismaGiftGroupCount.mockReset().mockResolvedValue(4);
});

function loaderArgs(url: string) {
  return toLoaderArgs({
    context: {} as never,
    params: {},
    request: new Request(url),
  });
}

describe('friends extra route modules', () => {
  it('loads and creates friend invites', async () => {
    const loadResult = await loader(loaderArgs('https://giftpool.app/api/friends/invite'));
    expect(getRouteResultStatus(loadResult)).toBe(200);
    expect(await getRouteResultData(loadResult)).toEqual({
      invitation: { id: 'invite-1' },
      inviteUrl: 'https://giftpool.app/friends/accept/invite-1',
    });

    const actionResult = await action({
      ...loaderArgs('https://giftpool.app/api/friends/invite'),
      request: new Request('https://giftpool.app/api/friends/invite', {
        body: JSON.stringify({ days: 5 }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    });
    expect(await getRouteResultData(actionResult)).toEqual({
      inviteUrl: 'https://giftpool.app/friends/accept/invite-2',
    });
    expect(createFriendInvite).toHaveBeenCalledWith(expect.any(Request), 5);
  });

  it('parses form invite creation and rejects invalid methods', async () => {
    const formData = new FormData();
    formData.set('days', '7');
    await action({
      ...loaderArgs('https://giftpool.app/api/friends/invite'),
      request: new Request('https://giftpool.app/api/friends/invite', {
        body: formData,
        method: 'POST',
      }),
    });
    expect(createFriendInvite).toHaveBeenLastCalledWith(expect.any(Request), 7);

    await expect(
      action({
        ...loaderArgs('https://giftpool.app/api/friends/invite'),
        request: new Request('https://giftpool.app/api/friends/invite', {
          method: 'GET',
        }),
      }),
    ).rejects.toMatchObject({ status: 405 });
  });

  it('short-circuits user search for short queries and maps relationship details', async () => {
    const shortQueryResult = await searchLoader(
      loaderArgs('https://giftpool.app/api/users/search?q=a'),
    );
    expect(await getRouteResultData(shortQueryResult)).toEqual({ results: [] });
    expect(prismaUserFindMany).not.toHaveBeenCalled();

    const searchResult = await searchLoader(
      loaderArgs('https://giftpool.app/api/users/search?q=al'),
    );
    expect(await getRouteResultData(searchResult)).toEqual({
      results: [
        {
          relationship: {
            friendship: null,
            incoming: null,
            outgoing: null,
            state: 'NONE',
          },
          user: {
            id: 'other-1',
            image: null,
            username: 'alex',
          },
        },
      ],
    });
    expect(prismaUserFindMany).toHaveBeenCalledWith({
      orderBy: { username: 'asc' },
      select: {
        id: true,
        image: {
          select: {
            altText: true,
            id: true,
          },
        },
        username: true,
      },
      take: 10,
      where: {
        AND: [
          { id: { not: 'viewer-1' } },
          { username: { contains: 'al' } },
        ],
      },
    });
    expect(getRelationshipDetails).toHaveBeenCalledWith('viewer-1', 'other-1');
  });

  it('deduplicates ids and returns mutual groups with overflow count', async () => {
    const result = await mutualLoader(
      loaderArgs('https://giftpool.app/api/friends/mutual?ids=friend-1,friend-1,friend-2'),
    );

    expect(await getRouteResultData(result)).toEqual({
      mutuals: {
        'friend-1': {
          groups: [
            { id: 'group-1', name: 'Group 1' },
            { id: 'group-2', name: 'Group 2' },
          ],
          more: 2,
        },
        'friend-2': {
          groups: [
            { id: 'group-1', name: 'Group 1' },
            { id: 'group-2', name: 'Group 2' },
          ],
          more: 2,
        },
      },
    });
    expect(prismaGiftGroupFindMany).toHaveBeenCalledTimes(2);
    expect(prismaGiftGroupCount).toHaveBeenCalledTimes(2);
  });

  it('returns empty mutuals for empty id input', async () => {
    const result = await mutualLoader(
      loaderArgs('https://giftpool.app/api/friends/mutual?ids='),
    );
    expect(await getRouteResultData(result)).toEqual({ mutuals: {} });
    expect(prismaGiftGroupFindMany).not.toHaveBeenCalled();
  });
});

