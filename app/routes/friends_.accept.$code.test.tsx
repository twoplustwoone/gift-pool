/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const getUserId = vi.fn();
const acceptFriendInvite = vi.fn();
const requireFriendInvitationNotExpired = vi.fn();
const redirectWithToast = vi.fn();
const queueLogEvent = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  getUserId: (...args: Array<unknown>) => getUserId(...args),
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
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

vi.mock('#app/utils/friend-invitations.server.ts', () => ({
  acceptFriendInvite: (...args: Array<unknown>) => acceptFriendInvite(...args),
  requireFriendInvitationNotExpired: (...args: Array<unknown>) =>
    requireFriendInvitationNotExpired(...args),
}));

vi.mock('#app/utils/toast.server.ts', () => ({
  redirectWithToast: (...args: Array<unknown>) => redirectWithToast(...args),
}));

import AcceptFriendInvitePage, {
  action,
  loader,
} from './friends_.accept.$code.tsx';

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('viewer-1');
  getUserId.mockReset().mockResolvedValue('viewer-1');
  queueLogEvent.mockReset().mockReturnValue({ eventId: 'evt-1' });
  acceptFriendInvite.mockReset().mockResolvedValue(undefined);
  requireFriendInvitationNotExpired.mockReset().mockResolvedValue({
    createdBy: {
      id: 'creator-1',
      image: null,
      name: 'Taylor',
      username: 'taylor',
    },
    createdById: 'creator-1',
  });
  redirectWithToast.mockReset().mockReturnValue(
    new Response(null, {
      headers: { Location: '/friends' },
      status: 302,
    }),
  );
});

describe('/friends/accept/:code route', () => {
  it('redirects when the code is missing', async () => {
    const missingCode = await loader(
      toLoaderArgs({
        context: {} as never,
        params: {},
        request: new Request('https://giftpool.app/friends/accept'),
      }),
    );
    expect(missingCode).toBeInstanceOf(Response);
    expect((missingCode as Response).status).toBe(302);
  });

  it('returns inviter context for authenticated recipients', async () => {
    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { code: 'abc' },
        request: new Request('https://giftpool.app/friends/accept/abc'),
      }),
    );
    expect(result).toEqual({
      kind: 'ok',
      isOwnInvite: false,
      isAuthenticated: true,
      inviter: {
        id: 'creator-1',
        image: null,
        name: 'Taylor',
        username: 'taylor',
      },
    });
  });

  it('returns context (not a login redirect) for anonymous recipients', async () => {
    getUserId.mockResolvedValue(null);
    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { code: 'abc' },
        request: new Request('https://giftpool.app/friends/accept/abc'),
      }),
    );
    expect(result).toMatchObject({ kind: 'ok', isAuthenticated: false });
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'invite_landed',
        visitorId: 'visitor-1',
        properties: {
          inviteType: 'friend',
          valid: true,
          inviterId: 'creator-1',
        },
      }),
    );
  });

  it('flags own-invite views instead of silently redirecting', async () => {
    requireFriendInvitationNotExpired.mockResolvedValueOnce({
      createdBy: {
        id: 'viewer-1',
        image: null,
        name: 'Viewer',
        username: 'viewer',
      },
      createdById: 'viewer-1',
    });
    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { code: 'abc' },
        request: new Request('https://giftpool.app/friends/accept/abc'),
      }),
    );
    expect(result).toMatchObject({ kind: 'ok', isOwnInvite: true });
  });

  it('returns the invalid state (not a throw) for dead links and logs it', async () => {
    requireFriendInvitationNotExpired.mockRejectedValueOnce(
      new Response('Invalid or expired invite link.', { status: 400 }),
    );
    const result = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { code: 'expired' },
        request: new Request('https://giftpool.app/friends/accept/expired'),
      }),
    );
    expect(result).toEqual({ kind: 'invalid' });
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'invite_landed',
        properties: { inviteType: 'friend', valid: false },
      }),
    );
  });

  it('accepts invites via the action', async () => {
    const actionResult = await action(
      toActionArgs({
        context: {} as never,
        params: { code: 'abc' },
        request: new Request('https://giftpool.app/friends/accept/abc', {
          method: 'POST',
        }),
      }),
    );
    expect(actionResult).toBeInstanceOf(Response);
    expect(acceptFriendInvite).toHaveBeenCalledWith('abc', 'viewer-1');
    expect(redirectWithToast).toHaveBeenCalledWith('/friends', {
      description: 'Friend added.',
      type: 'success',
    });
  });

  it('returns a 400 payload for an invalid invite action', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: {},
        request: new Request('https://giftpool.app/friends/accept', {
          method: 'POST',
        }),
      }),
    );
    expect(getRouteResultStatus(result)).toBe(400);
    expect(await getRouteResultData(result)).toEqual({
      error: 'Invalid invite.',
    });
  });

  it('renders signup-first CTAs for anonymous recipients', async () => {
    const App = createRoutesStub([
      {
        Component: AcceptFriendInvitePage,
        HydrateFallback: () => null,
        loader: async () => ({
          kind: 'ok',
          isOwnInvite: false,
          isAuthenticated: false,
          inviter: {
            id: 'creator-1',
            image: null,
            name: 'Taylor',
            username: 'taylor',
          },
        }),
        path: '/friends/accept/:code',
      },
    ]);

    render(<App initialEntries={['/friends/accept/abc']} />);

    expect(
      await screen.findByText('Taylor wants to be your friend'),
    ).toBeInTheDocument();
    const signup = screen.getByRole('link', {
      name: /create an account to continue/i,
    });
    expect(signup).toHaveAttribute(
      'href',
      '/signup?redirectTo=%2Ffriends%2Faccept%2Fabc',
    );
    expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
  });

  it('renders the accept button for authenticated recipients', async () => {
    const App = createRoutesStub([
      {
        Component: AcceptFriendInvitePage,
        HydrateFallback: () => null,
        loader: async () => ({
          kind: 'ok',
          isOwnInvite: false,
          isAuthenticated: true,
          inviter: {
            id: 'creator-1',
            image: null,
            name: 'Taylor',
            username: 'taylor',
          },
        }),
        path: '/friends/accept/:code',
      },
    ]);

    render(<App initialEntries={['/friends/accept/abc']} />);

    expect(
      await screen.findByRole('button', { name: 'Accept' }),
    ).toBeInTheDocument();
  });

  it('renders the expired state for dead links', async () => {
    const App = createRoutesStub([
      {
        Component: AcceptFriendInvitePage,
        HydrateFallback: () => null,
        loader: async () => ({ kind: 'invalid' }),
        path: '/friends/accept/:code',
      },
    ]);

    render(<App initialEntries={['/friends/accept/dead']} />);

    expect(await screen.findByText('Invite link expired')).toBeInTheDocument();
  });
});
