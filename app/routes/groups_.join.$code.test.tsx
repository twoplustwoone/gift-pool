/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toActionArgs, toLoaderArgs } from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const getUserId = vi.fn();
const requireInvitationNotExpired = vi.fn();
const requireUserIdNotInGroup = vi.fn();
const addUserToGroup = vi.fn();
const submitJoinRequest = vi.fn();
const invitationUpdate = vi.fn();
const isUserInGroup = vi.fn();
const memberCount = vi.fn();
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
    usersInGiftGroups: {
      count: (...args: Array<unknown>) => memberCount(...args),
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
  isUserInGroup: (...args: Array<unknown>) => isUserInGroup(...args),
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

import JoinGroupPage, { action, loader } from './groups_.join.$code.tsx';

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
    isUserInGroup.mockReset().mockResolvedValue(false);
    memberCount.mockReset().mockResolvedValue(4);
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
      kind: 'ok',
      giftGroupName: 'Birthday Crew',
      memberCount: 4,
      requireApproval: false,
      isAuthenticated: true,
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

  it('returns the invalid state and logs invite_landed for dead links', async () => {
    requireInvitationNotExpired.mockRejectedValueOnce(
      new Response('Invalid or expired invite link.', { status: 400 }),
    );
    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { code: 'expired' },
        request: new Request('https://giftpool.app/groups/join/expired'),
      }),
    );
    expect(result).toEqual({ kind: 'invalid' });
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'invite_landed',
        properties: { inviteType: 'group', valid: false },
      }),
    );
  });

  it('returns context (not a login redirect) for anonymous visitors', async () => {
    getUserId.mockResolvedValue(null);
    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { code: 'invite-1' },
        request: new Request('https://giftpool.app/groups/join/invite-1'),
      }),
    );
    expect(result).toMatchObject({ kind: 'ok', isAuthenticated: false });
    expect(requireUserIdNotInGroup).not.toHaveBeenCalled();
  });

  it('redirects members straight to the group', async () => {
    isUserInGroup.mockResolvedValueOnce(true);
    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { code: 'invite-1' },
        request: new Request('https://giftpool.app/groups/join/invite-1'),
      }),
    );
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get('Location')).toBe(
      '/groups/group-1',
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

  it('renders signup-first CTAs for anonymous visitors', async () => {
    const App = createRoutesStub([
      {
        Component: JoinGroupPage,
        HydrateFallback: () => null,
        loader: async () => ({
          kind: 'ok',
          giftGroupName: 'Birthday Crew',
          memberCount: 4,
          requireApproval: false,
          isAuthenticated: false,
        }),
        path: '/groups/join/:code',
      },
    ]);

    render(<App initialEntries={['/groups/join/invite-1']} />);

    expect(await screen.findByText('Join Birthday Crew')).toBeInTheDocument();
    expect(screen.getByText(/4 members/)).toBeInTheDocument();
    const signup = screen.getByRole('link', {
      name: /create an account to continue/i,
    });
    expect(signup).toHaveAttribute(
      'href',
      '/signup?redirectTo=%2Fgroups%2Fjoin%2Finvite-1',
    );
  });

  it('renders the join button and approval note for authenticated visitors', async () => {
    const App = createRoutesStub([
      {
        Component: JoinGroupPage,
        HydrateFallback: () => null,
        loader: async () => ({
          kind: 'ok',
          giftGroupName: 'Birthday Crew',
          memberCount: 4,
          requireApproval: true,
          isAuthenticated: true,
        }),
        path: '/groups/join/:code',
      },
    ]);

    render(<App initialEntries={['/groups/join/invite-1']} />);

    expect(
      await screen.findByRole('button', { name: 'Request to join' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/approves new members before they join/),
    ).toBeInTheDocument();
  });

  it('renders the expired state for dead links', async () => {
    const App = createRoutesStub([
      {
        Component: JoinGroupPage,
        HydrateFallback: () => null,
        loader: async () => ({ kind: 'invalid' }),
        path: '/groups/join/:code',
      },
    ]);

    render(<App initialEntries={['/groups/join/dead']} />);

    expect(await screen.findByText('Invite link expired')).toBeInTheDocument();
  });
});
