/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const getRelationshipDetails = vi.fn();
const sendFriendRequest = vi.fn();
const acceptFriendRequest = vi.fn();
const rejectFriendRequest = vi.fn();
const cancelOutgoingRequest = vi.fn();
const removeFriend = vi.fn();
const notificationCount = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/friends.server.ts', () => ({
  acceptFriendRequest: (...args: Array<unknown>) => acceptFriendRequest(...args),
  cancelOutgoingRequest: (...args: Array<unknown>) => cancelOutgoingRequest(...args),
  getRelationshipDetails: (...args: Array<unknown>) => getRelationshipDetails(...args),
  rejectFriendRequest: (...args: Array<unknown>) => rejectFriendRequest(...args),
  removeFriend: (...args: Array<unknown>) => removeFriend(...args),
  sendFriendRequest: (...args: Array<unknown>) => sendFriendRequest(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    notification: {
      count: (...args: Array<unknown>) => notificationCount(...args),
    },
  },
}));

import { action as acceptAction } from './api.friends.requests..accept.ts';
import { action as cancelAction } from './api.friends.requests..cancel.ts';
import { action as rejectAction } from './api.friends.requests..reject.ts';
import { action as removeAction } from './api.friends.remove.ts';
import { action as requestAction } from './api.friends.requests.ts';

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('viewer-1');
  getRelationshipDetails.mockReset().mockResolvedValue({
    friendship: null,
    incoming: null,
    outgoing: null,
    state: 'NONE',
  });
  sendFriendRequest.mockReset().mockResolvedValue({ id: 'request-1' });
  acceptFriendRequest.mockReset().mockResolvedValue({
    fromUserId: 'other-1',
    toUserId: 'viewer-1',
  });
  rejectFriendRequest.mockReset().mockResolvedValue({
    fromUserId: 'other-1',
    toUserId: 'viewer-1',
  });
  cancelOutgoingRequest.mockReset().mockResolvedValue({
    toUserId: 'other-1',
  });
  removeFriend.mockReset().mockResolvedValue(undefined);
  notificationCount.mockReset().mockResolvedValue(3);
});

function actionArgs({
  body,
  contentType,
  method = 'POST',
  params = {},
}: {
  body?: BodyInit | null;
  contentType?: string;
  method?: string;
  params?: Record<string, string | undefined>;
}) {
  return toActionArgs({
    context: {} as never,
    params,
    request: new Request('https://www.giftpool.app/friends', {
      body,
      headers: contentType ? { 'Content-Type': contentType } : undefined,
      method,
    }),
  });
}

describe('friends mutation routes', () => {
  it('handles request creation from JSON and form bodies', async () => {
    const jsonResult = await requestAction(
      actionArgs({
        body: JSON.stringify({ toUserId: 'other-1' }),
        contentType: 'application/json',
      }),
    );
    expect(getRouteResultStatus(jsonResult)).toBe(200);
    expect(await getRouteResultData(jsonResult)).toEqual({
      relationship: {
        friendship: null,
        incoming: null,
        outgoing: null,
        state: 'NONE',
      },
      requestId: 'request-1',
      success: true,
    });
    expect(sendFriendRequest).toHaveBeenCalledWith('viewer-1', 'other-1');

    const formData = new FormData();
    formData.set('toUserId', 'other-2');
    await requestAction(
      actionArgs({
        body: formData,
      }),
    );
    expect(sendFriendRequest).toHaveBeenLastCalledWith('viewer-1', 'other-2');
  });

  it('rejects invalid request creation payloads and methods', async () => {
    await expect(
      requestAction(actionArgs({ method: 'GET' })),
    ).rejects.toMatchObject({ status: 405 });

    await expect(
      requestAction(
        actionArgs({
          body: JSON.stringify({}),
          contentType: 'application/json',
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });

    const badForm = new FormData();
    badForm.set('toUserId', '');
    await expect(
      requestAction(
        actionArgs({
          body: badForm,
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('accepts a friend request and returns unread count', async () => {
    const result = await acceptAction(
      actionArgs({
        params: { id: 'request-1' },
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(await getRouteResultData(result)).toEqual({
      relationship: {
        friendship: null,
        incoming: null,
        outgoing: null,
        state: 'NONE',
      },
      success: true,
      unreadCount: 3,
    });
    expect(acceptFriendRequest).toHaveBeenCalledWith('request-1', 'viewer-1');
    expect(getRelationshipDetails).toHaveBeenCalledWith('viewer-1', 'other-1');
    expect(notificationCount).toHaveBeenCalledWith({
      where: {
        status: 'UNREAD',
        userId: 'viewer-1',
      },
    });
  });

  it('rejects a friend request and returns unread count', async () => {
    const result = await rejectAction(
      actionArgs({
        params: { id: 'request-2' },
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(await getRouteResultData(result)).toEqual({
      relationship: {
        friendship: null,
        incoming: null,
        outgoing: null,
        state: 'NONE',
      },
      success: true,
      unreadCount: 3,
    });
    expect(rejectFriendRequest).toHaveBeenCalledWith('request-2', 'viewer-1');
  });

  it('cancels an outgoing friend request', async () => {
    const result = await cancelAction(
      actionArgs({
        params: { id: 'request-3' },
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(await getRouteResultData(result)).toEqual({
      relationship: {
        friendship: null,
        incoming: null,
        outgoing: null,
        state: 'NONE',
      },
      success: true,
    });
    expect(cancelOutgoingRequest).toHaveBeenCalledWith('viewer-1', 'request-3');
  });

  it('removes a friend from JSON and form payloads', async () => {
    const jsonResult = await removeAction(
      actionArgs({
        body: JSON.stringify({ userId: 'other-1' }),
        contentType: 'application/json',
      }),
    );
    expect(getRouteResultStatus(jsonResult)).toBe(200);
    expect(await getRouteResultData(jsonResult)).toEqual({
      relationship: {
        state: 'NONE',
      },
      success: true,
    });
    expect(removeFriend).toHaveBeenCalledWith('viewer-1', 'other-1');

    const formData = new FormData();
    formData.set('userId', 'other-2');
    await removeAction(
      actionArgs({
        body: formData,
      }),
    );
    expect(removeFriend).toHaveBeenLastCalledWith('viewer-1', 'other-2');
  });

  it('rejects missing ids and invalid methods across mutation routes', async () => {
    await expect(
      acceptAction(actionArgs({ method: 'GET', params: { id: 'request-1' } })),
    ).rejects.toMatchObject({ status: 405 });
    await expect(acceptAction(actionArgs({ params: {} }))).rejects.toMatchObject({
      status: 400,
    });

    await expect(
      rejectAction(actionArgs({ method: 'GET', params: { id: 'request-1' } })),
    ).rejects.toMatchObject({ status: 405 });
    await expect(rejectAction(actionArgs({ params: {} }))).rejects.toMatchObject({
      status: 400,
    });

    await expect(
      cancelAction(actionArgs({ method: 'GET', params: { id: 'request-1' } })),
    ).rejects.toMatchObject({ status: 405 });
    await expect(cancelAction(actionArgs({ params: {} }))).rejects.toMatchObject({
      status: 400,
    });

    await expect(removeAction(actionArgs({ method: 'GET' }))).rejects.toMatchObject({
      status: 405,
    });
    await expect(
      removeAction(
        actionArgs({
          body: JSON.stringify({}),
          contentType: 'application/json',
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
