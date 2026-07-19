/**
 * @vitest-environment node
 */
import { type AppLoadContext } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const requireUserIdInGroup = vi.fn();
const deleteGiftGroup = vi.fn();
const leaveGroup = vi.fn();
const createInviteLink = vi.fn();
const destroyInviteLink = vi.fn();
const getInviteLink = vi.fn();
const userHasGroupPermission = vi.fn();
const createToastHeaders = vi.fn();
const redirectWithToast = vi.fn();

const giftGroupFindUnique = vi.fn();
const friendshipFindMany = vi.fn();
const friendRequestFindMany = vi.fn();
const viewerMembershipFindUnique = vi.fn();
const groupInvitationFindFirst = vi.fn();
const getContextNotificationAwareness = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/groups.server.ts', () => ({
  deleteGiftGroup: (...args: Array<unknown>) => deleteGiftGroup(...args),
  leaveGroup: (...args: Array<unknown>) => leaveGroup(...args),
  requireUserIdInGroup: (...args: Array<unknown>) =>
    requireUserIdInGroup(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    friendRequest: {
      findMany: (...args: Array<unknown>) => friendRequestFindMany(...args),
    },
    friendship: {
      findMany: (...args: Array<unknown>) => friendshipFindMany(...args),
    },
    giftGroup: {
      findUnique: (...args: Array<unknown>) => giftGroupFindUnique(...args),
    },
    groupInvitation: {
      findFirst: (...args: Array<unknown>) => groupInvitationFindFirst(...args),
    },
    usersInGiftGroups: {
      findUnique: (...args: Array<unknown>) =>
        viewerMembershipFindUnique(...args),
    },
  },
}));

vi.mock('#app/utils/group-permissions.server.ts', () => ({
  userHasGroupPermission: (...args: Array<unknown>) =>
    userHasGroupPermission(...args),
}));

vi.mock('#app/utils/group-invitations.server.ts', () => ({
  createInviteLink: (...args: Array<unknown>) => createInviteLink(...args),
  destroyInviteLink: (...args: Array<unknown>) => destroyInviteLink(...args),
  getInviteLink: (...args: Array<unknown>) => getInviteLink(...args),
}));

vi.mock('#app/utils/toast.server.ts', () => ({
  createToastHeaders: (...args: Array<unknown>) => createToastHeaders(...args),
  redirectWithToast: (...args: Array<unknown>) => redirectWithToast(...args),
}));

vi.mock('#app/utils/notification-preferences.server.ts', () => ({
  getContextNotificationAwareness: (...args: Array<unknown>) =>
    getContextNotificationAwareness(...args),
}));

import { action, loader } from './__route.server.ts';

const context = {
  cspNonce: undefined,
  serverBuild: undefined,
} as unknown as AppLoadContext;

function createFormRequest(form: Record<string, string>) {
  return new Request('https://giftpool.app/groups/group-1', {
    body: new URLSearchParams(form),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });
}

beforeEach(() => {
  requireUserId.mockReset();
  requireUserIdInGroup.mockReset();
  deleteGiftGroup.mockReset();
  leaveGroup.mockReset();
  createInviteLink.mockReset();
  destroyInviteLink.mockReset();
  getInviteLink.mockReset();
  userHasGroupPermission.mockReset();
  createToastHeaders.mockReset();
  redirectWithToast.mockReset();
  giftGroupFindUnique.mockReset();
  friendshipFindMany.mockReset();
  friendRequestFindMany.mockReset();
  viewerMembershipFindUnique.mockReset();
  groupInvitationFindFirst.mockReset();
  getContextNotificationAwareness.mockReset().mockResolvedValue({
    notificationOff: false,
    noticeVisible: false,
    reason: null,
    preference: { activityLevel: 'IMPORTANT_ONLY' },
  });

  createToastHeaders.mockResolvedValue(new Headers({ 'x-toast': 'ok' }));
  redirectWithToast.mockImplementation(
    async (to: string) =>
      new Response(null, {
        headers: {
          Location: to,
        },
        status: 302,
      }),
  );
});

describe('groups detail route server module', () => {
  it('maps loader data, permissions, invite state, and friend relationships', async () => {
    requireUserIdInGroup.mockResolvedValue('viewer-1');
    giftGroupFindUnique.mockResolvedValue({
      createdAt: new Date('2026-03-31T12:00:00.000Z'),
      description: 'Birthday planning',
      giftPlans: [],
      groupMembers: [
        {
          contributionCents: 1000,
          role: 'OWNER',
          user: {
            birthday: null,
            id: 'viewer-1',
            image: null,
            name: 'Viewer',
            username: 'viewer',
          },
        },
        {
          contributionCents: 2000,
          role: 'MEMBER',
          user: {
            birthday: null,
            id: 'friend-1',
            image: null,
            name: 'Alex',
            username: 'alex',
          },
        },
        {
          contributionCents: 3000,
          role: 'MEMBER',
          user: {
            birthday: null,
            id: 'incoming-1',
            image: null,
            name: 'Taylor',
            username: 'taylor',
          },
        },
      ],
      id: 'group-1',
      name: 'Family',
    });
    friendshipFindMany.mockResolvedValue([
      { id: 'friendship-1', userAId: 'viewer-1', userBId: 'friend-1' },
    ]);
    friendRequestFindMany.mockResolvedValue([
      { fromUserId: 'incoming-1', id: 'request-1', toUserId: 'viewer-1' },
    ]);
    viewerMembershipFindUnique.mockResolvedValue({
      contributionCents: 1500,
      role: 'OWNER',
    });
    groupInvitationFindFirst.mockResolvedValue({
      code: 'invite-code',
      id: 'invite-1',
    });
    getInviteLink.mockReturnValue(
      'https://giftpool.app/groups/join/invite-code',
    );
    userHasGroupPermission.mockImplementation(
      async (_userId: string, _groupId: string, permission: string) =>
        ({
          deleteGroup: true,
          leaveGroup: true,
          lockGiftPlan: false,
          manageInvites: true,
          manageSettings: false,
        })[permission] ?? false,
    );

    const result = await loader(
      toLoaderArgs({
        context,
        params: { giftGroupId: 'group-1' },
        request: new Request('https://giftpool.app/groups/group-1'),
      }),
    );

    expect(result.canDelete).toBe(true);
    expect(result.canInvite).toBe(true);
    expect(result.canLeave).toBe(true);
    expect(result.canLockPlan).toBe(false);
    expect(result.canSettings).toBe(false);
    expect(result.inviteLink).toBe(
      'https://giftpool.app/groups/join/invite-code',
    );
    expect(result.groupInvitationId).toBe('invite-1');
    expect(result.viewer).toEqual({
      contributionCents: 1500,
      role: 'OWNER',
      userId: 'viewer-1',
    });

    const membersById = new Map(
      result.giftGroup.groupMembers.map((member) => [member.user.id, member]),
    );
    expect(membersById.get('viewer-1')?.friendRelationship.state).toBe(
      'FRIENDS',
    );
    expect(membersById.get('friend-1')?.friendRelationship).toEqual({
      friendshipId: 'friendship-1',
      incomingRequestId: null,
      outgoingRequestId: null,
      state: 'FRIENDS',
    });
    expect(membersById.get('incoming-1')?.friendRelationship).toEqual({
      friendshipId: null,
      incomingRequestId: 'request-1',
      outgoingRequestId: null,
      state: 'PENDING_INCOMING',
    });
  });

  it('throws a 404 response when the group does not exist', async () => {
    requireUserIdInGroup.mockResolvedValue('viewer-1');
    giftGroupFindUnique.mockResolvedValue(null);

    await expect(
      loader(
        toLoaderArgs({
          context,
          params: { giftGroupId: 'missing-group' },
          request: new Request('https://giftpool.app/groups/missing-group'),
        }),
      ),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('returns a 400 result for invalid action payloads', async () => {
    requireUserId.mockResolvedValue('viewer-1');

    const result = await action(
      toActionArgs({
        context,
        params: { giftGroupId: 'group-1' },
        request: createFormRequest({}),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(400);
  });

  it('creates an invite link and returns the latest absolute invite url', async () => {
    requireUserId.mockResolvedValue('viewer-1');
    groupInvitationFindFirst.mockResolvedValue({
      code: 'new-code',
      id: 'invite-2',
    });
    getInviteLink.mockReturnValue('https://giftpool.app/groups/join/new-code');

    const result = await action(
      toActionArgs({
        context,
        params: { giftGroupId: 'group-1' },
        request: createFormRequest({
          expiresInDays: '7',
          giftGroupId: 'group-1',
          intent: 'create-invite-link',
        }),
      }),
    );

    expect(createInviteLink).toHaveBeenCalled();
    expect(getRouteResultStatus(result)).toBe(200);
    await expect(getRouteResultData(result)).resolves.toMatchObject({
      inviteUrl: 'https://giftpool.app/groups/join/new-code',
    });
  });

  it('destroys an invite link and returns a success result', async () => {
    requireUserId.mockResolvedValue('viewer-1');

    const result = await action(
      toActionArgs({
        context,
        params: { giftGroupId: 'group-1' },
        request: createFormRequest({
          giftGroupId: 'group-1',
          groupInvitationId: 'invite-1',
          intent: 'destroy-invite-link',
        }),
      }),
    );

    expect(destroyInviteLink).toHaveBeenCalledWith(
      expect.any(Request),
      'group-1',
      expect.objectContaining({
        giftGroupId: 'group-1',
        groupInvitationId: 'invite-1',
      }),
    );
    expect(getRouteResultStatus(result)).toBe(200);
  });

  it('deletes or leaves the group through toast-backed redirects', async () => {
    requireUserId.mockResolvedValue('viewer-1');

    const deleteResult = await action(
      toActionArgs({
        context,
        params: { giftGroupId: 'group-1' },
        request: createFormRequest({
          giftGroupId: 'group-1',
          intent: 'delete-gift-group',
        }),
      }),
    );
    const leaveResult = await action(
      toActionArgs({
        context,
        params: { giftGroupId: 'group-1' },
        request: createFormRequest({
          giftGroupId: 'group-1',
          intent: 'leave-gift-group',
        }),
      }),
    );

    expect(deleteGiftGroup).toHaveBeenCalled();
    expect(leaveGroup).toHaveBeenCalledWith(expect.any(Request), 'group-1');
    expect(deleteResult).toBeInstanceOf(Response);
    expect((deleteResult as Response).headers.get('Location')).toBe('/groups');
    expect((leaveResult as Response).headers.get('Location')).toBe('/groups');
  });
});
