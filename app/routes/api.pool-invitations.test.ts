/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PoolInvitationError } from '#app/utils/pool-invitations.server.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const notificationCount = vi.fn();
const sendPoolInvitations = vi.fn();
const acceptPoolInvitation = vi.fn();
const declinePoolInvitation = vi.fn();
const cancelPoolInvitation = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    notification: {
      count: (...args: Array<unknown>) => notificationCount(...args),
    },
  },
}));

vi.mock('#app/utils/pool-invitations.server.ts', () => ({
  PoolInvitationError: class PoolInvitationError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
    ) {
      super(message);
      this.name = 'PoolInvitationError';
    }
  },
  sendPoolInvitations: (...args: Array<unknown>) =>
    sendPoolInvitations(...args),
  acceptPoolInvitation: (...args: Array<unknown>) =>
    acceptPoolInvitation(...args),
  declinePoolInvitation: (...args: Array<unknown>) =>
    declinePoolInvitation(...args),
  cancelPoolInvitation: (...args: Array<unknown>) =>
    cancelPoolInvitation(...args),
}));

import { action as acceptAction } from './api.pool-invitations.$invitationId.accept.ts';
import { action as cancelAction } from './api.pool-invitations.$invitationId.cancel.ts';
import { action as declineAction } from './api.pool-invitations.$invitationId.decline.ts';
import { action as sendAction } from './api.pools.$poolId.invitations.ts';

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue('user-1');
  notificationCount.mockResolvedValue(2);
  sendPoolInvitations.mockResolvedValue([
    { id: 'invitation-1', inviteeId: 'invitee-1' },
  ]);
  acceptPoolInvitation.mockResolvedValue({ poolId: 'pool-1' });
  declinePoolInvitation.mockResolvedValue({ poolId: 'pool-1' });
  cancelPoolInvitation.mockResolvedValue({ poolId: 'pool-1' });
});

describe('pool invitation resource actions', () => {
  it('sends a validated batch through the invitation module', async () => {
    const result = await sendAction(
      toActionArgs({
        context: {},
        params: { poolId: 'pool-1' },
        request: jsonRequest('/api/pools/pool-1/invitations', {
          inviteeIds: ['invitee-1'],
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(await getRouteResultData(result)).toMatchObject({ success: true });
    expect(sendPoolInvitations).toHaveBeenCalledWith({
      poolId: 'pool-1',
      managerId: 'user-1',
      inviteeIds: ['invitee-1'],
    });
  });

  it('rejects an invalid send payload before calling the module', async () => {
    const result = await sendAction(
      toActionArgs({
        context: {},
        params: { poolId: 'pool-1' },
        request: jsonRequest('/api/pools/pool-1/invitations', {
          inviteeIds: [],
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(400);
    expect(sendPoolInvitations).not.toHaveBeenCalled();
  });

  it('maps invitation-domain errors to their public status and code', async () => {
    sendPoolInvitations.mockRejectedValue(
      new PoolInvitationError('INVITEE_NOT_ELIGIBLE', 'Not eligible.', 409),
    );
    const result = await sendAction(
      toActionArgs({
        context: {},
        params: { poolId: 'pool-1' },
        request: jsonRequest('/api/pools/pool-1/invitations', {
          inviteeIds: ['invitee-1'],
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(409);
    expect(await getRouteResultData(result)).toMatchObject({
      code: 'INVITEE_NOT_ELIGIBLE',
    });
  });

  it('accepts and returns the updated unread count', async () => {
    const result = await acceptAction(
      invitationActionArgs('/accept'),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(await getRouteResultData(result)).toMatchObject({
      poolId: 'pool-1',
      unreadCount: 2,
    });
    expect(acceptPoolInvitation).toHaveBeenCalledWith(
      'invitation-1',
      'user-1',
    );
  });

  it('declines and returns the updated unread count', async () => {
    const result = await declineAction(
      invitationActionArgs('/decline'),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(await getRouteResultData(result)).toMatchObject({ unreadCount: 2 });
    expect(declinePoolInvitation).toHaveBeenCalledWith(
      'invitation-1',
      'user-1',
    );
  });

  it('lets a manager cancel a pending invitation', async () => {
    const result = await cancelAction(
      invitationActionArgs('/cancel'),
    );

    expect(getRouteResultStatus(result)).toBe(200);
    expect(cancelPoolInvitation).toHaveBeenCalledWith({
      invitationId: 'invitation-1',
      managerId: 'user-1',
    });
  });

  it('preserves invitation-domain statuses for every response action', async () => {
    for (const [operation, routeAction] of [
      [acceptPoolInvitation, acceptAction],
      [declinePoolInvitation, declineAction],
      [cancelPoolInvitation, cancelAction],
    ] as const) {
      operation.mockRejectedValueOnce(
        new PoolInvitationError(
          'INVITATION_NOT_PENDING',
          'No longer pending.',
          409,
        ),
      );
      const result = await routeAction(invitationActionArgs('/response'));
      expect(getRouteResultStatus(result)).toBe(409);
      expect(await getRouteResultData(result)).toMatchObject({
        code: 'INVITATION_NOT_PENDING',
      });
    }
  });

  it('returns not found when a required route id is absent', async () => {
    for (const routeAction of [acceptAction, declineAction, cancelAction]) {
      const result = await routeAction(
        toActionArgs({
          context: {},
          params: {},
          request: new Request('https://giftpool.app/api/pool-invitations', {
            method: 'POST',
          }),
        }),
      );
      expect(getRouteResultStatus(result)).toBe(404);
    }

    const sendResult = await sendAction(
      toActionArgs({
        context: {},
        params: {},
        request: jsonRequest('/api/pools/missing/invitations', {
          inviteeIds: ['invitee-1'],
        }),
      }),
    );
    expect(getRouteResultStatus(sendResult)).toBe(404);
  });
});

function jsonRequest(path: string, body: unknown) {
  return new Request(`https://giftpool.app${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function invitationActionArgs(path: string) {
  return toActionArgs({
    context: {},
    params: { invitationId: 'invitation-1' },
    request: new Request(
      `https://giftpool.app/api/pool-invitations/invitation-1${path}`,
      { method: 'POST' },
    ),
  });
}
