/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { createRoutesStub } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRouteResultData, getRouteResultStatus, toActionArgs, toLoaderArgs } from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const acceptFriendInvite = vi.fn();
const requireFriendInvitationNotExpired = vi.fn();
const redirectWithToast = vi.fn();

vi.mock('#app/components/ui/dialog.tsx', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
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
} from './friends.accept.$code.tsx';

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('viewer-1');
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
  it('redirects when the code is missing or self-authored', async () => {
    const missingCode = await loader(
      toLoaderArgs({
        context: {} as never,
        params: {},
        request: new Request('https://giftpool.app/friends/accept'),
      }),
    );
    expect(missingCode).toBeInstanceOf(Response);
    expect((missingCode as Response).status).toBe(302);

    requireFriendInvitationNotExpired.mockResolvedValueOnce({
      createdBy: {
        id: 'viewer-1',
        image: null,
        name: 'Viewer',
        username: 'viewer',
      },
      createdById: 'viewer-1',
    });
    const selfInvite = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { code: 'abc' },
        request: new Request('https://giftpool.app/friends/accept/abc'),
      }),
    );
    expect(selfInvite).toBeInstanceOf(Response);
    expect((selfInvite as Response).status).toBe(302);
  });

  it('loads inviter data and accepts invites', async () => {
    const loadResult = await loader(
      toLoaderArgs({
        context: {} as never,
        params: { code: 'abc' },
        request: new Request('https://giftpool.app/friends/accept/abc'),
      }),
    );
    expect(getRouteResultStatus(loadResult)).toBe(200);
    expect(await getRouteResultData(loadResult)).toEqual({
      inviter: {
        id: 'creator-1',
        image: null,
        name: 'Taylor',
        username: 'taylor',
      },
    });

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

  it('renders the accept invite UI', async () => {
    const App = createRoutesStub([
      {
        Component: AcceptFriendInvitePage,
        HydrateFallback: () => null,
        loader: async () => ({
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

    (console.error as unknown as { mockImplementation: (fn: () => void) => void }).mockImplementation(
      () => {},
    );
    render(<App initialEntries={['/friends/accept/abc']} />);

    expect(await screen.findAllByText('Accept Friend Request')).toHaveLength(2);
    expect(screen.getAllByText('@taylor')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Accept' }).length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]!);
  });
});
