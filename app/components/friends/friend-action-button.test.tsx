/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchFriendshipUpdate } from '#app/utils/friendship-events.ts';
import { FriendActionButton } from './friend-action-button.tsx';

const toastSuccess = vi.fn();
const toastError = vi.fn();
const track = vi.fn();
const setUnreadCount = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args: Array<unknown>) => toastError(...args),
    success: (...args: Array<unknown>) => toastSuccess(...args),
  },
}));

vi.mock('#app/components/notifications/notifications-context.tsx', () => ({
  useNotificationsStore: () => ({
    setUnreadCount,
    unreadCount: 0,
  }),
}));

vi.mock('#app/utils/analytics.client.ts', () => ({
  track: (...args: Array<unknown>) => track(...args),
}));

vi.mock('#app/components/ui/dropdown-menu.tsx', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('#app/components/ui/dialog.tsx', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

beforeEach(() => {
  toastSuccess.mockReset();
  toastError.mockReset();
  track.mockReset();
  setUnreadCount.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/friends/requests')) {
        return new Response(
          JSON.stringify({
            relationship: {
              outgoing: { id: 'request-1' },
              state: 'PENDING_OUTGOING',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/cancel')) {
        return new Response(
          JSON.stringify({
            relationship: {
              state: 'NONE',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/accept')) {
        return new Response(
          JSON.stringify({
            relationship: {
              friendship: { id: 'friendship-1' },
              state: 'FRIENDS',
            },
            unreadCount: 4,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/reject')) {
        return new Response(
          JSON.stringify({
            relationship: {
              state: 'NONE',
            },
            unreadCount: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/api/friends/remove')) {
        return new Response(
          JSON.stringify({
            relationship: {
              state: 'NONE',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(null, { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderButton(relationship: {
  friendshipId: string | null;
  incomingRequestId: string | null;
  outgoingRequestId: string | null;
  state: 'NONE' | 'PENDING_INCOMING' | 'PENDING_OUTGOING' | 'FRIENDS';
}) {
  const onStateChange = vi.fn();

  render(
    <FriendActionButton
      relationship={relationship}
      targetUserId="target-user"
      targetUserName="@alex"
      onStateChange={onStateChange}
    />,
  );

  return { onStateChange };
}

describe('<FriendActionButton />', () => {
  it('sends a friend request from the NONE state', async () => {
    const { onStateChange } = renderButton({
      friendshipId: null,
      incomingRequestId: null,
      outgoingRequestId: null,
      state: 'NONE',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Add Friend' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/friends/requests', {
        body: JSON.stringify({ toUserId: 'target-user' }),
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });
    expect(toastSuccess).toHaveBeenCalledWith('Friend request sent.');
    expect(onStateChange).toHaveBeenCalledWith({
      friendshipId: null,
      incomingRequestId: null,
      outgoingRequestId: 'request-1',
      state: 'PENDING_OUTGOING',
    });
  });

  it('rolls back a failed request send', async () => {
    (
      console.error as unknown as {
        mockImplementation: (fn: () => void) => void;
      }
    ).mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 500 }),
    );

    const { onStateChange } = renderButton({
      friendshipId: null,
      incomingRequestId: null,
      outgoingRequestId: null,
      state: 'NONE',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Add Friend' }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'Something went wrong. Try again.',
      );
    });
    expect(onStateChange).toHaveBeenLastCalledWith({
      friendshipId: null,
      incomingRequestId: null,
      outgoingRequestId: null,
      state: 'NONE',
    });
  });

  it('cancels an outgoing request', async () => {
    const { onStateChange } = renderButton({
      friendshipId: null,
      incomingRequestId: null,
      outgoingRequestId: 'request-1',
      state: 'PENDING_OUTGOING',
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel request' }),
    );

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('Friend request cancelled.');
    });
    expect(onStateChange).toHaveBeenLastCalledWith({
      friendshipId: null,
      incomingRequestId: null,
      outgoingRequestId: null,
      state: 'NONE',
    });
  });

  it('accepts an incoming request and updates unread count', async () => {
    const { onStateChange } = renderButton({
      friendshipId: null,
      incomingRequestId: 'incoming-1',
      outgoingRequestId: null,
      state: 'PENDING_INCOMING',
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Accept friend request from @alex' }),
    );

    await waitFor(() => {
      expect(setUnreadCount).toHaveBeenCalledWith(4);
    });
    expect(toastSuccess).toHaveBeenCalledWith('Friend request accepted.');
    expect(onStateChange).toHaveBeenLastCalledWith({
      friendshipId: 'friendship-1',
      incomingRequestId: null,
      outgoingRequestId: null,
      state: 'FRIENDS',
    });
  });

  it('rejects an incoming request and rolls back on failure', async () => {
    (
      console.error as unknown as {
        mockImplementation: (fn: () => void) => void;
      }
    ).mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            relationship: {
              state: 'NONE',
            },
            unreadCount: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const { onStateChange } = renderButton({
      friendshipId: null,
      incomingRequestId: 'incoming-1',
      outgoingRequestId: null,
      state: 'PENDING_INCOMING',
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Reject friend request from @alex' }),
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'Something went wrong. Try again.',
      );
    });
    expect(onStateChange).toHaveBeenLastCalledWith({
      friendshipId: null,
      incomingRequestId: 'incoming-1',
      outgoingRequestId: null,
      state: 'PENDING_INCOMING',
    });
  });

  it('removes a friend from the FRIENDS state', async () => {
    const { onStateChange } = renderButton({
      friendshipId: 'friendship-1',
      incomingRequestId: null,
      outgoingRequestId: null,
      state: 'FRIENDS',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Friends' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('@alex removed from friends.');
    });
    expect(onStateChange).toHaveBeenLastCalledWith({
      friendshipId: null,
      incomingRequestId: null,
      outgoingRequestId: null,
      state: 'NONE',
    });
  });

  it('subscribes to friendship events for the target user', async () => {
    renderButton({
      friendshipId: null,
      incomingRequestId: null,
      outgoingRequestId: null,
      state: 'NONE',
    });

    dispatchFriendshipUpdate({
      incomingRequestId: 'incoming-9',
      state: 'PENDING_INCOMING',
      userId: 'target-user',
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: 'Accept friend request from @alex',
        }),
      ).toBeInTheDocument();
    });
  });
});
