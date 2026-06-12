/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toActionArgs, toLoaderArgs } from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const getUserId = vi.fn();
const requireInvitationNotExpired = vi.fn();
const requireUserIdNotInGroup = vi.fn();
const addUserToGroup = vi.fn();
const submitJoinRequest = vi.fn();
const invitationUpdate = vi.fn();
const redirectWithToast = vi.fn();
const queueLogEvent = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  getUserId: (...args: Array<unknown>) => getUserId(...args),
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    groupInvitation: {
      update: (...args: Array<unknown>) => invitationUpdate(...args),
    },
  },
}));

vi.mock('#app/utils/group-invitations.server.ts', () => ({
  addUserToGroup: (...args: Array<unknown>) => addUserToGroup(...args),
  requireInvitationNotExpired: (...args: Array<unknown>) =>
    requireInvitationNotExpired(...args),
  submitJoinRequest: (...args: Array<unknown>) => submitJoinRequest(...args),
}));

vi.mock('#app/utils/groups.server.ts', () => ({
  requireUserIdNotInGroup: (...args: Array<unknown>) =>
    requireUserIdNotInGroup(...args),
}));

vi.mock('#app/utils/toast.server.ts', () => ({
  redirectWithToast: (...args: Array<unknown>) => redirectWithToast(...args),
}));

vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: (...args: Array<unknown>) => queueLogEvent(...args),
}));

vi.mock('#app/utils/request-context.server.ts', () => ({
  getRequestContext: vi.fn(async () => ({
    requestId: 'req-1',
    sessionId: null,
    visitorId: 'visitor-1',
  })),
}));

import { action, loader } from './join.$code.tsx';

function createInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invitation-1',
    giftGroupId: 'group-1',
    giftGroup: { id: 'group-1', name: 'Birthday Crew' },
    requireApproval: false,
    roleGranted: 'MEMBER',
    ...overrides,
  };
}

describe('app/routes/groups+/join.$code.tsx', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('viewer-1');
    getUserId.mockReset().mockResolvedValue('viewer-1');
    requireInvitationNotExpired
      .mockReset()
      .mockResolvedValue(createInvitation());
    requireUserIdNotInGroup.mockReset().mockResolvedValue('viewer-1');
    addUserToGroup.mockReset().mockResolvedValue(undefined);
    submitJoinRequest.mockReset().mockResolvedValue(undefined);
    invitationUpdate.mockReset().mockResolvedValue(undefined);
    queueLogEvent.mockReset().mockReturnValue({ eventId: 'evt-1' });
    redirectWithToast.mockReset().mockReturnValue(
      new Response(null, {
        headers: { Location: '/groups/group-1' },
        status: 302,
      }),
    );
  });

  it('redirects to /groups when the URL is missing a code param', async () => {
    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: {},
        request: new Request('https://giftpool.app/groups/join'),
      }),
    );
    expect((result as Response).status).toBe(302);
    expect(queueLogEvent).not.toHaveBeenCalled();
  });

  it('returns invite details and logs invite_landed for valid links', async () => {
    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { code: 'invite-1' },
        request: new Request('https://giftpool.app/groups/join/invite-1'),
      }),
    );
    expect(result).toEqual({
      giftGroupId: 'group-1',
      giftGroupName: 'Birthday Crew',
    });
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'invite_landed',
        visitorId: 'visitor-1',
        properties: {
          inviteType: 'group',
          valid: true,
          giftGroupId: 'group-1',
        },
      }),
    );
  });

  it('logs invite_landed with valid:false for dead links', async () => {
    requireInvitationNotExpired.mockRejectedValueOnce(
      new Response('Invalid or expired invite link.', { status: 400 }),
    );
    await expect(
      loader(
        toLoaderArgs({
          context: {} as never,
          params: { code: 'expired' },
          request: new Request('https://giftpool.app/groups/join/expired'),
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'invite_landed',
        properties: { inviteType: 'group', valid: false },
      }),
    );
  });

  it('joins the group and logs group_joined', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: { code: 'invite-1' },
        request: new Request('https://giftpool.app/groups/join/invite-1', {
          method: 'POST',
        }),
      }),
    );
    expect(addUserToGroup).toHaveBeenCalledWith(
      'viewer-1',
      'group-1',
      'MEMBER',
    );
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'group_joined',
        userId: 'viewer-1',
        properties: { giftGroupId: 'group-1', via: 'invite' },
      }),
    );
    expect(result).toBeInstanceOf(Response);
  });

  it('submits a join request without group_joined when approval is required', async () => {
    requireInvitationNotExpired.mockResolvedValue(
      createInvitation({ requireApproval: true }),
    );
    await action(
      toActionArgs({
        context: {} as never,
        params: { code: 'invite-1' },
        request: new Request('https://giftpool.app/groups/join/invite-1', {
          method: 'POST',
        }),
      }),
    );
    expect(submitJoinRequest).toHaveBeenCalledWith({
      invitationId: 'invitation-1',
      userId: 'viewer-1',
      groupId: 'group-1',
    });
    expect(addUserToGroup).not.toHaveBeenCalled();
    expect(queueLogEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'group_joined' }),
    );
  });
});
